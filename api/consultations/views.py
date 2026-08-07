import logging

from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.viewsets import ModelViewSet

from api.core.models import ClinicianProfile, PatientProfile, UserRole

from .models import (
    CareMessage,
    Consultation,
    ConsultationInitiator,
    ConsultationStatus,
    Escalation,
    MessageSender,
)
from .serializers import (
    CareMessageSerializer,
    ConsultationSerializer,
    EscalationSerializer,
)
from .drafting import (
    ConsultationDraftUnavailable,
    generate_consultation_draft,
)


logger = logging.getLogger(__name__)


class ConsultationViewSet(ModelViewSet):
    serializer_class = ConsultationSerializer

    def get_throttles(self):
        if getattr(self, 'action', None) == 'draft':
            self.throttle_scope = 'consultation_draft'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        user = self.request.user
        if user.role == UserRole.PATIENT:
            return Consultation.objects.filter(
                patient=user.patient_profile
            ).select_related('clinician__user', 'patient__user').order_by('-created_at')
        elif user.role == UserRole.CLINICIAN:
            return Consultation.objects.filter(
                clinician=user.clinician_profile
            ).select_related('patient__user', 'clinician__user').order_by('-created_at')
        return Consultation.objects.none()

    def _set_status(self, new_status):
        consultation = self.get_object()
        consultation.status = new_status
        consultation.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(consultation).data)

    @action(detail=False, methods=['post'])
    def draft(self, request):
        if (
            request.user.role != UserRole.PATIENT
            or not hasattr(request.user, 'patient_profile')
        ):
            raise PermissionDenied(
                'Only a patient can generate a consultation draft.'
            )
        locale = str(request.data.get('locale', 'en-SG')).strip()
        try:
            message = generate_consultation_draft(
                request.user.patient_profile,
                locale,
            )
        except ConsultationDraftUnavailable:
            logger.exception('AI consultation draft was unavailable')
            return Response(
                {
                    'detail': (
                        'The AI draft is unavailable right now. '
                        'You can still speak or type your message.'
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({
            'draft': message,
            'source': 'ai_record_summary',
            'requires_review': True,
        })

    @action(detail=False, methods=['post'])
    def initiate(self, request):
        """Clinician proposes a new consultation without waiting for a request."""
        if (
            request.user.role != UserRole.CLINICIAN
            or not hasattr(request.user, 'clinician_profile')
        ):
            raise PermissionDenied(
                'Only a clinician can initiate a consultation.'
            )
        clinician = request.user.clinician_profile
        patient = PatientProfile.objects.filter(
            pk=request.data.get('patient'),
            primary_clinician=clinician,
        ).select_related('user').first()
        if not patient:
            raise ValidationError({
                'patient': 'Select a patient linked to your clinician account.'
            })
        try:
            scheduled_at = timezone.datetime.fromisoformat(
                str(request.data.get('scheduled_at', '')).replace('Z', '+00:00')
            )
        except (TypeError, ValueError):
            scheduled_at = None
        if scheduled_at and timezone.is_naive(scheduled_at):
            scheduled_at = timezone.make_aware(
                scheduled_at,
                timezone.get_current_timezone(),
            )
        if not scheduled_at or scheduled_at <= timezone.now():
            raise ValidationError({
                'scheduled_at': 'Choose a future consultation time.'
            })
        try:
            duration = int(request.data.get('duration_minutes', 30))
        except (TypeError, ValueError):
            duration = 30
        if duration not in {30, 45, 60}:
            raise ValidationError({
                'duration_minutes': 'Choose 30, 45, or 60 minutes.'
            })
        consultation = Consultation.objects.create(
            patient=patient,
            clinician=clinician,
            scheduled_at=scheduled_at,
            duration_minutes=duration,
            status=ConsultationStatus.REQUESTED,
            initiated_by=ConsultationInitiator.CLINICIAN,
            clinician_notes=str(request.data.get('clinician_notes', '')).strip()[:2000],
        )
        return Response(
            self.get_serializer(consultation).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        # Retained for older patient-proposed consultation records.
        if request.user.role != UserRole.CLINICIAN:
            raise PermissionDenied('Only the clinician can confirm a consultation.')
        consultation = self.get_object()
        if (
            consultation.status != ConsultationStatus.REQUESTED
            or consultation.initiated_by != ConsultationInitiator.PATIENT
            or not consultation.scheduled_at
        ):
            raise ValidationError({
                'detail': 'This consultation does not have a patient-proposed time.'
            })
        return self._set_status(ConsultationStatus.CONFIRMED)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        # Patient accepts a time the clinician suggested.
        if request.user.role != UserRole.PATIENT:
            raise PermissionDenied('Only the patient can accept a suggested time.')
        consultation = self.get_object()
        if (
            consultation.status != ConsultationStatus.REQUESTED
            or consultation.initiated_by != ConsultationInitiator.CLINICIAN
            or not consultation.scheduled_at
        ):
            raise ValidationError({
                'detail': 'The physiotherapist has not proposed a time yet.'
            })
        return self._set_status(ConsultationStatus.CONFIRMED)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        # Either party may cancel their own consultation.
        return self._set_status(ConsultationStatus.CANCELLED)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        # Clinician marks a consultation as resolved once the session is done.
        if request.user.role != UserRole.CLINICIAN:
            raise PermissionDenied('Only the clinician can resolve a consultation.')
        consultation = self.get_object()
        if consultation.status != ConsultationStatus.CONFIRMED:
            raise ValidationError({
                'detail': 'Only a confirmed consultation can be resolved.'
            })
        return self._set_status(ConsultationStatus.COMPLETED)

    def perform_create(self, serializer):
        if (
            self.request.user.role != UserRole.PATIENT
            or not hasattr(self.request.user, 'patient_profile')
        ):
            raise PermissionDenied('Only a patient can request a consultation.')

        patient = self.request.user.patient_profile
        clinician = (
            patient.primary_clinician
            or ClinicianProfile.objects.filter(
                is_accepting_patients=True
            ).order_by('user__last_name', 'user__first_name').first()
        )
        if not clinician:
            raise ValidationError({
                'detail': (
                    'No physiotherapist is currently available. '
                    'Please try again later.'
                )
            })
        serializer.save(
            patient=patient,
            clinician=clinician,
            scheduled_at=None,
            duration_minutes=30,
            status=ConsultationStatus.REQUESTED,
            initiated_by=ConsultationInitiator.PATIENT,
        )

    def perform_update(self, serializer):
        if self.request.user.role != UserRole.CLINICIAN:
            raise PermissionDenied(
                'Only the physiotherapist can propose a consultation time.'
            )
        consultation = serializer.instance
        if consultation.status != ConsultationStatus.REQUESTED:
            raise ValidationError({
                'detail': 'Only a pending request can be scheduled.'
            })
        allowed_fields = {'scheduled_at', 'duration_minutes'}
        unexpected_fields = set(serializer.validated_data) - allowed_fields
        if unexpected_fields:
            raise ValidationError({
                'detail': 'Only the date, time and duration can be changed here.'
            })
        scheduled_at = serializer.validated_data.get(
            'scheduled_at', consultation.scheduled_at
        )
        if not scheduled_at or scheduled_at <= timezone.now():
            raise ValidationError({
                'scheduled_at': 'Choose a future consultation time.'
            })
        serializer.save(
            initiated_by=ConsultationInitiator.CLINICIAN,
            status=ConsultationStatus.REQUESTED,
        )


class CareMessageViewSet(ModelViewSet):
    """
    Async thread between a patient and their assigned physiotherapist.
    Patients see their own thread; clinicians must scope with ?patient=<id>.
    """
    serializer_class = CareMessageSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        if user.role == UserRole.PATIENT and hasattr(user, 'patient_profile'):
            qs = CareMessage.objects.filter(patient=user.patient_profile)
        elif user.role == UserRole.CLINICIAN and hasattr(user, 'clinician_profile'):
            patient_id = self.request.query_params.get('patient')
            if not patient_id:
                return CareMessage.objects.none()
            qs = CareMessage.objects.filter(
                clinician=user.clinician_profile, patient_id=patient_id
            )
        else:
            return CareMessage.objects.none()
        return qs.select_related('patient__user', 'clinician__user').order_by('created_at')

    def list(self, request, *args, **kwargs):
        # Opening the thread marks the other party's messages as read.
        inbound = (
            MessageSender.CLINICIAN if request.user.role == UserRole.PATIENT
            else MessageSender.PATIENT
        )
        self.get_queryset().filter(
            sender=inbound, read_at__isnull=True
        ).update(read_at=timezone.now())
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == UserRole.PATIENT and hasattr(user, 'patient_profile'):
            patient = user.patient_profile
            clinician = patient.primary_clinician
            if not clinician:
                raise ValidationError({
                    'detail': 'You are not linked to a physiotherapist yet.'
                })
            message = serializer.save(
                patient=patient, clinician=clinician, sender=MessageSender.PATIENT
            )
            self._notify_clinician(message)
        elif user.role == UserRole.CLINICIAN and hasattr(user, 'clinician_profile'):
            clinician = user.clinician_profile
            patient = PatientProfile.objects.filter(
                id=self.request.data.get('patient'), primary_clinician=clinician
            ).first()
            if not patient:
                raise ValidationError({'detail': 'That patient is not in your roster.'})
            serializer.save(
                patient=patient, clinician=clinician, sender=MessageSender.CLINICIAN
            )
        else:
            raise PermissionDenied('Only patients and clinicians can send messages.')

    def _notify_clinician(self, message):
        # A patient message pings the clinician in their private Slack DM thread.
        try:
            from api.slack_bot.services import notify_clinician_of_message
            notify_clinician_of_message(message)
        except Exception:  # Slack must never block the message API
            import logging
            logging.getLogger(__name__).exception(
                "Failed to notify clinician of care message via Slack"
            )

    @action(detail=False, methods=['get'])
    def threads(self, request):
        """One row per patient the clinician has a conversation with: latest
        message + unread (patient→clinician) count, newest first."""
        if (
            request.user.role != UserRole.CLINICIAN
            or not hasattr(request.user, 'clinician_profile')
        ):
            return Response([])
        clinician = request.user.clinician_profile
        by_patient = {}
        messages = (
            CareMessage.objects
            .filter(clinician=clinician)
            .select_related('patient__user')
            .order_by('created_at')
        )
        for message in messages:
            entry = by_patient.setdefault(message.patient_id, {
                'patient': str(message.patient_id),
                'patient_name': (
                    message.patient.user.get_full_name().strip()
                    or message.patient.user.email
                ),
                'unread': 0,
            })
            entry['last_body'] = message.body
            entry['last_at'] = message.created_at
            entry['last_sender'] = message.sender
            if message.sender == MessageSender.PATIENT and message.read_at is None:
                entry['unread'] += 1
        threads = sorted(
            by_patient.values(), key=lambda t: t['last_at'], reverse=True
        )
        return Response(threads)


class EscalationViewSet(ModelViewSet):
    serializer_class = EscalationSerializer
    http_method_names = ['get', 'patch', 'head', 'options']  # no POST/DELETE from API

    def get_queryset(self):
        user = self.request.user
        if user.role == UserRole.PATIENT:
            return Escalation.objects.filter(
                patient=user.patient_profile
            ).order_by('-created_at')
        elif user.role == UserRole.CLINICIAN:
            return Escalation.objects.filter(
                clinician=user.clinician_profile
            ).order_by('-created_at')
        return Escalation.objects.none()

    def perform_update(self, serializer):
        if self.request.user.role != UserRole.CLINICIAN:
            raise PermissionDenied(
                'Only the assigned clinician can review an escalation.'
            )
        serializer.save(
            reviewed_by=self.request.user.clinician_profile,
            reviewed_at=timezone.now(),
        )

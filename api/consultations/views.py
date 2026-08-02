from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
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


class ConsultationViewSet(ModelViewSet):
    serializer_class = ConsultationSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == UserRole.PATIENT:
            return Consultation.objects.filter(
                patient=user.patient_profile
            ).select_related('clinician__user', 'patient__user').order_by('-scheduled_at')
        elif user.role == UserRole.CLINICIAN:
            return Consultation.objects.filter(
                clinician=user.clinician_profile
            ).select_related('patient__user', 'clinician__user').order_by('-scheduled_at')
        return Consultation.objects.none()

    def _set_status(self, new_status):
        consultation = self.get_object()
        consultation.status = new_status
        consultation.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(consultation).data)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        # Clinician confirms a time the patient proposed/requested.
        if request.user.role != UserRole.CLINICIAN:
            raise PermissionDenied('Only the clinician can confirm a consultation.')
        return self._set_status(ConsultationStatus.CONFIRMED)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        # Patient accepts a time the clinician suggested.
        if request.user.role != UserRole.PATIENT:
            raise PermissionDenied('Only the patient can accept a suggested time.')
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
        if consultation.status not in (
            ConsultationStatus.REQUESTED,
            ConsultationStatus.CONFIRMED,
        ):
            raise ValidationError({
                'detail': 'Only an active consultation can be resolved.'
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
            initiated_by=ConsultationInitiator.PATIENT,
        )

    def perform_update(self, serializer):
        # A patient editing the time is proposing a new one — send it back to the
        # clinician to re-confirm (ping-pong), rather than booking it unilaterally.
        if self.request.user.role != UserRole.PATIENT:
            raise PermissionDenied('Use confirm/cancel to act on a consultation.')
        serializer.save(
            initiated_by=ConsultationInitiator.PATIENT,
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

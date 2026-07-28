from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from api.core.models import ClinicianProfile, UserRole

from .models import (
    Consultation,
    ConsultationInitiator,
    ConsultationStatus,
    Escalation,
)
from .serializers import ConsultationSerializer, EscalationSerializer


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

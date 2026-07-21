from rest_framework.viewsets import ModelViewSet

from api.core.models import UserRole

from .models import Consultation, Escalation
from .serializers import ConsultationSerializer, EscalationSerializer


class ConsultationViewSet(ModelViewSet):
    serializer_class = ConsultationSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == UserRole.PATIENT:
            return Consultation.objects.filter(
                patient=user.patient_profile
            ).select_related('clinician__user').order_by('-scheduled_at')
        elif user.role == UserRole.CLINICIAN:
            return Consultation.objects.filter(
                clinician=user.clinician_profile
            ).select_related('patient__user').order_by('-scheduled_at')
        return Consultation.objects.none()

    def perform_create(self, serializer):
        serializer.save(patient=self.request.user.patient_profile)


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

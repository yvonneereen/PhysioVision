from rest_framework.exceptions import PermissionDenied
from rest_framework.viewsets import ModelViewSet

from api.core.models import UserRole
from .models import PainCheckin, Session
from .serializers import PainCheckinSerializer, SessionSerializer


class SessionViewSet(ModelViewSet):
    serializer_class = SessionSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == UserRole.CLINICIAN:
            patient_id = self.request.query_params.get('patient')
            if not patient_id:
                return Session.objects.none()
            return (
                Session.objects
                .filter(patient__id=patient_id, patient__primary_clinician=user.clinician_profile)
                .select_related('exercise')
                .order_by('-started_at')
            )
        return (
            Session.objects
            .filter(patient=user.patient_profile)
            .select_related('exercise')
            .order_by('-started_at')
        )

    def perform_create(self, serializer):
        if self.request.user.role != UserRole.PATIENT:
            raise PermissionDenied('Only a patient can create a session.')
        serializer.save(patient=self.request.user.patient_profile)

    def perform_update(self, serializer):
        if self.request.user.role != UserRole.PATIENT:
            raise PermissionDenied('Only the patient can change a session.')
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role != UserRole.PATIENT:
            raise PermissionDenied('Only the patient can remove a session.')
        instance.delete()


class PainCheckinViewSet(ModelViewSet):
    serializer_class = PainCheckinSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == UserRole.CLINICIAN:
            patient_id = self.request.query_params.get('patient')
            if not patient_id:
                return PainCheckin.objects.none()
            return (
                PainCheckin.objects
                .filter(patient__id=patient_id, patient__primary_clinician=user.clinician_profile)
                .order_by('-checked_at')
            )
        return PainCheckin.objects.filter(patient=user.patient_profile).order_by('-checked_at')

    def perform_create(self, serializer):
        if self.request.user.role != UserRole.PATIENT:
            raise PermissionDenied('Only a patient can create a pain check-in.')
        serializer.save(patient=self.request.user.patient_profile)

    def perform_update(self, serializer):
        if self.request.user.role != UserRole.PATIENT:
            raise PermissionDenied('Only the patient can change a pain check-in.')
        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role != UserRole.PATIENT:
            raise PermissionDenied('Only the patient can remove a pain check-in.')
        instance.delete()

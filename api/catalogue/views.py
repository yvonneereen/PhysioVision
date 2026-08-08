from django.db import transaction
from rest_framework.exceptions import PermissionDenied
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from api.core.models import UserRole

from .models import Calibration, Exercise, Prescription
from .serializers import CalibrationSerializer, ExerciseSerializer, PrescriptionSerializer
from .services import (
    active_prescriptions_for,
    sync_patient_care_path,
)


class ExerciseViewSet(ReadOnlyModelViewSet):
    serializer_class = ExerciseSerializer
    queryset         = Exercise.objects.filter(is_active=True).order_by('sort_order', 'name')
    pagination_class = None


class PrescriptionViewSet(ModelViewSet):
    serializer_class = PrescriptionSerializer
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        base = Prescription.objects.select_related(
            'exercise', 'patient__user', 'clinician__user'
        ).prefetch_related('sessions')
        if user.role == UserRole.PATIENT and hasattr(user, 'patient_profile'):
            return active_prescriptions_for(user.patient_profile).select_related(
                'exercise', 'patient__user', 'clinician__user'
            ).order_by('exercise__name')
        if user.role == UserRole.CLINICIAN and hasattr(user, 'clinician_profile'):
            clinician = user.clinician_profile
            return base.filter(
                clinician=clinician,
                patient__primary_clinician=clinician,
                patient__user__role=UserRole.PATIENT,
            ).order_by('-valid_from', 'patient__user__last_name')
        return base.none()

    def perform_create(self, serializer):
        if (
            self.request.user.role != UserRole.CLINICIAN
            or not hasattr(self.request.user, 'clinician_profile')
        ):
            raise PermissionDenied('Only a clinician can create prescriptions.')

        clinician = self.request.user.clinician_profile
        patient = serializer.validated_data['patient']
        exercise = serializer.validated_data['exercise']
        with transaction.atomic():
            Prescription.objects.filter(
                patient=patient,
                exercise=exercise,
                is_active=True,
            ).update(is_active=False)
            serializer.save(clinician=clinician)
            sync_patient_care_path(patient)

    def perform_update(self, serializer):
        if (
            self.request.user.role != UserRole.CLINICIAN
            or not hasattr(self.request.user, 'clinician_profile')
        ):
            raise PermissionDenied('Only a clinician can change prescriptions.')

        previous_patient = serializer.instance.patient
        patient = serializer.validated_data.get('patient', previous_patient)
        exercise = serializer.validated_data.get(
            'exercise', serializer.instance.exercise
        )
        with transaction.atomic():
            Prescription.objects.filter(
                patient=patient,
                exercise=exercise,
                is_active=True,
            ).exclude(pk=serializer.instance.pk).update(is_active=False)
            serializer.save(clinician=self.request.user.clinician_profile)
            sync_patient_care_path(previous_patient)
            if patient.pk != previous_patient.pk:
                sync_patient_care_path(patient)

    def perform_destroy(self, instance):
        if (
            self.request.user.role != UserRole.CLINICIAN
            or not hasattr(self.request.user, 'clinician_profile')
        ):
            raise PermissionDenied('Only a clinician can remove prescriptions.')
        patient = instance.patient
        instance.delete()
        sync_patient_care_path(patient)


class CalibrationViewSet(ModelViewSet):
    serializer_class = CalibrationSerializer

    def get_queryset(self):
        return Calibration.objects.filter(
            patient=self.request.user.patient_profile
        ).select_related('exercise').order_by('-captured_at')

    def perform_create(self, serializer):
        patient  = self.request.user.patient_profile
        exercise = serializer.validated_data['exercise']
        affected_side = serializer.validated_data['affected_side']

        # Left and right movement baselines are stored independently.
        Calibration.objects.filter(
            patient=patient,
            exercise=exercise,
            affected_side=affected_side,
            is_active=True,
        ).update(is_active=False)

        version = Calibration.objects.filter(
            patient=patient,
            exercise=exercise,
            affected_side=affected_side,
        ).count() + 1
        serializer.save(patient=patient, version=version)

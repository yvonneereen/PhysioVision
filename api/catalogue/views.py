from rest_framework import status
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from .models import Calibration, Exercise, Prescription
from .serializers import CalibrationSerializer, ExerciseSerializer, PrescriptionSerializer


class ExerciseViewSet(ReadOnlyModelViewSet):
    serializer_class = ExerciseSerializer
    queryset         = Exercise.objects.filter(is_active=True).order_by('sort_order', 'name')


class PrescriptionViewSet(ModelViewSet):
    serializer_class = PrescriptionSerializer

    def get_queryset(self):
        return Prescription.objects.filter(
            patient=self.request.user.patient_profile
        ).select_related('exercise').order_by('-valid_from')

    def perform_create(self, serializer):
        serializer.save(patient=self.request.user.patient_profile)


class CalibrationViewSet(ModelViewSet):
    serializer_class = CalibrationSerializer

    def get_queryset(self):
        return Calibration.objects.filter(
            patient=self.request.user.patient_profile
        ).select_related('exercise').order_by('-captured_at')

    def perform_create(self, serializer):
        patient  = self.request.user.patient_profile
        exercise = serializer.validated_data['exercise']

        # Deactivate any existing active calibration for this patient+exercise
        Calibration.objects.filter(
            patient=patient, exercise=exercise, is_active=True
        ).update(is_active=False)

        version = Calibration.objects.filter(patient=patient, exercise=exercise).count() + 1
        serializer.save(patient=patient, version=version)

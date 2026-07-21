from rest_framework.viewsets import ModelViewSet

from .models import PainCheckin, Session
from .serializers import PainCheckinSerializer, SessionSerializer


class SessionViewSet(ModelViewSet):
    serializer_class = SessionSerializer

    def get_queryset(self):
        return Session.objects.filter(
            patient=self.request.user.patient_profile
        ).select_related('exercise').order_by('-started_at')

    def perform_create(self, serializer):
        serializer.save(patient=self.request.user.patient_profile)


class PainCheckinViewSet(ModelViewSet):
    serializer_class = PainCheckinSerializer

    def get_queryset(self):
        return PainCheckin.objects.filter(
            patient=self.request.user.patient_profile
        ).order_by('-checked_at')

    def perform_create(self, serializer):
        serializer.save(patient=self.request.user.patient_profile)

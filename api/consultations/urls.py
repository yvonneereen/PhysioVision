from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('consultations', views.ConsultationViewSet, basename='consultation')
router.register('escalations',   views.EscalationViewSet,   basename='escalation')

urlpatterns = router.urls

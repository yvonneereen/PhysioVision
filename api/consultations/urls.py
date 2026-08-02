from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('consultations', views.ConsultationViewSet, basename='consultation')
router.register('escalations',   views.EscalationViewSet,   basename='escalation')
router.register('care-messages', views.CareMessageViewSet,  basename='care-message')

urlpatterns = router.urls

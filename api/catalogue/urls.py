from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('exercises',     views.ExerciseViewSet,     basename='exercise')
router.register('prescriptions', views.PrescriptionViewSet, basename='prescription')
router.register('calibrations',  views.CalibrationViewSet,  basename='calibration')

urlpatterns = router.urls

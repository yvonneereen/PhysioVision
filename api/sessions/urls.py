from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('sessions',      views.SessionViewSet,      basename='session')
router.register('pain-checkins', views.PainCheckinViewSet,  basename='pain-checkin')

urlpatterns = router.urls

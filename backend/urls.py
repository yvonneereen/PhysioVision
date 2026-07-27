from django.contrib import admin
from django.urls import include, path

from .views import health_check

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health-check'),
    path('api/auth/', include('api.core.urls')),
    path('api/', include('api.core.api_urls')),
    path('api/', include('api.catalogue.urls')),
    path('api/', include('api.sessions.urls')),
    path('api/', include('api.consultations.urls')),
    path('api/', include('api.slack_bot.urls')),
]

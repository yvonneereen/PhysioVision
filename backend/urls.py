from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('api.core.urls')),
    path('api/', include('api.catalogue.urls')),
    path('api/', include('api.sessions.urls')),
    path('api/', include('api.consultations.urls')),
]

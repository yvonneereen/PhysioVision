from django.urls import path

from . import views

urlpatterns = [
    path('register/', views.RegisterView.as_view(), name='auth-register'),
    path('login/',    views.LoginView.as_view(),    name='auth-login'),
    path(
        'verify-email/',
        views.VerifyEmailView.as_view(),
        name='auth-verify-email',
    ),
    path(
        'resend-verification/',
        views.ResendEmailVerificationView.as_view(),
        name='auth-resend-verification',
    ),
    path('logout/',   views.LogoutView.as_view(),   name='auth-logout'),
    path('me/',       views.MeView.as_view(),       name='auth-me'),
    path(
        'wellness-screening/',
        views.WellnessScreeningView.as_view(),
        name='wellness-screening',
    ),
    path(
        'care-invitations/',
        views.CareInvitationListCreateView.as_view(),
        name='care-invitations',
    ),
    path(
        'care-invitations/accept/',
        views.CareInvitationAcceptView.as_view(),
        name='care-invitation-accept',
    ),
    path(
        'clinician/patients/',
        views.ClinicianPatientsView.as_view(),
        name='clinician-patients',
    ),
    path('agent/chat/', views.AgentChatView.as_view(), name='agent-chat'),
]

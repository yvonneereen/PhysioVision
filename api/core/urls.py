from django.urls import path

from . import views

urlpatterns = [
    path('register/', views.RegisterView.as_view(), name='auth-register'),
    path('login/',    views.LoginView.as_view(),    name='auth-login'),
    path(
        'verify-login/',
        views.VerifyLoginView.as_view(),
        name='auth-verify-login',
    ),
    path(
        'resend-login-verification/',
        views.ResendLoginVerificationView.as_view(),
        name='auth-resend-login-verification',
    ),
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
    path(
        'forgot-password/',
        views.ForgotPasswordView.as_view(),
        name='auth-forgot-password',
    ),
    path(
        'verify-reset-code/',
        views.VerifyPasswordResetCodeView.as_view(),
        name='auth-verify-reset-code',
    ),
    path(
        'reset-password/',
        views.ResetPasswordView.as_view(),
        name='auth-reset-password',
    ),
    path('logout/',   views.LogoutView.as_view(),   name='auth-logout'),
    path('me/',       views.MeView.as_view(),       name='auth-me'),
    path(
        'emergency-contact/verification/start/',
        views.EmergencyContactVerificationStartView.as_view(),
        name='emergency-contact-verification-start',
    ),
    path(
        'emergency-contact/verification/confirm/',
        views.EmergencyContactVerificationConfirmView.as_view(),
        name='emergency-contact-verification-confirm',
    ),
    path(
        'emergency-alerts/',
        views.EmergencyAlertCreateView.as_view(),
        name='emergency-alert-create',
    ),
    path(
        'emergency-alerts/<uuid:alert_id>/',
        views.EmergencyAlertDetailView.as_view(),
        name='emergency-alert-detail',
    ),
    path(
        'patient-pathway/',
        views.PatientPathwayChoiceView.as_view(),
        name='patient-pathway',
    ),
    path(
        'wellness-screening/',
        views.WellnessScreeningView.as_view(),
        name='wellness-screening',
    ),
    path(
        'agent/plan/',
        views.WellnessPlanDraftView.as_view(),
        name='agent-plan-draft',
    ),
    path(
        'agent/plan/accept/',
        views.WellnessPlanAcceptView.as_view(),
        name='agent-plan-accept',
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
    path(
        'slack/link-code/',
        views.SlackLinkCodeView.as_view(),
        name='auth-slack-link-code',
    ),
]

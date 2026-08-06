import hashlib
import logging
import secrets
import string
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from .ai import generate_agent_reply
from .clinician_assistant import dispatch_clinician_command
from .email_delivery import EmailDeliveryError
from .emergency_alerts import (
    EmergencyVerificationCooldown,
    EmergencyVerificationDeliveryError,
    dispatch_emergency_alert,
    emergency_contact_ready,
    issue_emergency_contact_verification,
    verify_emergency_contact_code,
)
from .email_verification import (
    VerificationCooldown,
    VerificationDeliveryError,
    issue_email_verification,
    verify_email_code,
)
from .login_verification import (
    LoginVerificationCooldown,
    LoginVerificationDeliveryError,
    issue_login_verification,
    verify_login_code,
)
from .models import (
    CareInvitation,
    CarePath,
    EmergencyAlert,
    EmergencyAlertResponse,
    EmergencyAlertStatus,
    EmergencyContactVerificationChallenge,
    LoginVerificationChallenge,
    PatientPathwayChoice,
    PatientProfile,
    SlackLinkCode,
    User,
    UserRole,
    WellnessScreeningStatus,
)
from .password_reset import (
    PasswordResetCooldown,
    issue_password_reset,
    reset_password,
    verify_password_reset_code,
)
from .safety_language import (
    SafetyLanguageUnavailable,
    available_safety_language_stage,
    interpret_safety_language,
)
from .serializers import (
    CareInvitationAcceptSerializer,
    CareInvitationSerializer,
    ClinicianProfileSerializer,
    EmergencyAlertCreateSerializer,
    EmergencyAlertResponseSerializer,
    EmergencyAlertSerializer,
    EmergencyContactVerificationCodeSerializer,
    ForgotPasswordSerializer,
    LoginSerializer,
    PatientListSerializer,
    PatientPathwayChoiceSerializer,
    PatientProfileSerializer,
    RegisterSerializer,
    ResendEmailVerificationSerializer,
    ResendLoginVerificationSerializer,
    ResetPasswordSerializer,
    VerifyEmailSerializer,
    VerifyLoginSerializer,
    VerifyPasswordResetCodeSerializer,
    WellnessScreeningSerializer,
    WellnessPlanAcceptSerializer,
    WellnessPlanDraftSerializer,
    WellnessPlanPreferencesSerializer,
)
from .wellness_agent import (
    WellnessPlanValidationError,
    generate_wellness_plan,
    normalize_wellness_plan,
)

logger = logging.getLogger(__name__)


def _rotate_token(user):
    Token.objects.filter(user=user).delete()
    return Token.objects.create(user=user)


class IsClinician(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == UserRole.CLINICIAN)


class PatientViewSet(ReadOnlyModelViewSet):
    serializer_class   = PatientListSerializer
    permission_classes = [IsAuthenticated, IsClinician]
    pagination_class   = None

    def get_queryset(self):
        return (
            PatientProfile.objects
            .filter(primary_clinician=self.request.user.clinician_profile)
            .select_related('user')
            .prefetch_related('sessions', 'escalations', 'prescriptions', 'prescriptions__exercise', 'pain_checkins')
        )


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_register'

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        existing_user = User.objects.filter(email__iexact=email).first()

        if existing_user and (
            existing_user.email_verified_at or existing_user.is_active
        ):
            return Response(
                {'email': ['A user with this email already exists.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            if existing_user:
                # An earlier delivery failure can leave an inactive account in
                # the database. Since it has never been verified, let the owner
                # restart registration. The new password only becomes useful
                # after the emailed code proves control of the address.
                user = existing_user
                user.set_password(serializer.validated_data['password'])
                user.first_name = serializer.validated_data['first_name']
                user.last_name = serializer.validated_data['last_name']
                user.save(update_fields=[
                    'password',
                    'first_name',
                    'last_name',
                    'updated_at',
                ])
            else:
                user = serializer.save()

        try:
            issue_email_verification(user)
        except VerificationDeliveryError:
            logger.exception("Could not deliver account verification email")
            return Response(
                {
                    'detail': (
                        'Your account was created, but the verification email '
                        'could not be sent. Please try resending the code.'
                    ),
                    'code': 'email_delivery_failed',
                    'verification_required': True,
                    'email': user.email,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        response_status = (
            status.HTTP_200_OK
            if existing_user
            else status.HTTP_201_CREATED
        )
        detail = (
            'Your unverified account was restarted. Check your email for the '
            'new 6-digit verification code.'
            if existing_user
            else 'Check your email for the 6-digit verification code.'
        )
        return Response(
            {
                'detail': detail,
                'verification_required': True,
                'email': user.email,
                'role': user.role,
            },
            status=response_status,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth_login'

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user  = serializer.validated_data['user']
        if serializer.validated_data.get('requires_email_verification'):
            return Response(
                {
                    'detail': 'Verify your email before signing in.',
                    'code': 'email_not_verified',
                    'verification_required': True,
                    'email': user.email,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            challenge, code_sent = issue_login_verification(
                user,
                reuse_recent=True,
            )
        except LoginVerificationDeliveryError:
            logger.exception("Could not deliver sign-in verification email")
            return Response(
                {
                    'detail': (
                        'Your password was accepted, but the sign-in code '
                        'could not be emailed. Please try again.'
                    ),
                    'code': 'login_verification_delivery_failed',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                'detail': (
                    'We emailed you a 6-digit sign-in code.'
                    if code_sent
                    else 'Use the sign-in code we just emailed you.'
                ),
                'verification_required': True,
                'verification_purpose': 'login',
                'challenge_id': challenge.id,
                'email': user.email,
                'role': user.role,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class VerifyLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login_verification'

    def post(self, request):
        serializer = VerifyLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, reason = verify_login_code(
            serializer.validated_data['challenge_id'],
            serializer.validated_data['code'],
        )
        if not user:
            messages = {
                'expired': 'This sign-in code has expired. Sign in again.',
                'attempts_exhausted': (
                    'Too many incorrect attempts. Sign in again.'
                ),
            }
            return Response(
                {
                    'detail': messages.get(
                        reason,
                        'Invalid or expired sign-in code.',
                    ),
                    'code': f'login_verification_{reason}',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = _rotate_token(user)
        return Response({
            'token': token.key,
            'role': user.role,
        })


class ResendLoginVerificationView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login_verification_resend'

    def post(self, request):
        serializer = ResendLoginVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        challenge = (
            LoginVerificationChallenge.objects.select_related('user')
            .filter(
                pk=serializer.validated_data['challenge_id'],
                consumed_at__isnull=True,
            )
            .first()
        )
        if not challenge or challenge.expires_at <= timezone.now():
            return Response(
                {'detail': 'This sign-in request has expired. Sign in again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            challenge, _ = issue_login_verification(
                challenge.user,
                challenge=challenge,
                enforce_cooldown=True,
            )
        except LoginVerificationCooldown as exc:
            return Response(
                {
                    'detail': (
                        f'Please wait {exc.retry_after} seconds before '
                        'requesting another sign-in code.'
                    ),
                    'retry_after': exc.retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except LoginVerificationDeliveryError:
            logger.exception("Could not resend sign-in verification email")
            return Response(
                {'detail': 'The sign-in code could not be sent. Try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not challenge:
            return Response(
                {'detail': 'This sign-in request has expired. Sign in again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({
            'detail': 'A new sign-in code has been sent.',
            'challenge_id': challenge.id,
        })


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'email_verification'

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data['email']
        ).first()

        if not user:
            return Response(
                {'detail': 'Invalid or expired verification code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        verified, reason = verify_email_code(
            user,
            serializer.validated_data['code'],
        )
        if not verified:
            messages = {
                'expired': 'This code has expired. Request a new one.',
                'attempts_exhausted': (
                    'Too many incorrect attempts. Request a new code.'
                ),
            }
            return Response(
                {
                    'detail': messages.get(
                        reason,
                        'Invalid or expired verification code.',
                    ),
                    'code': f'verification_{reason}',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = _rotate_token(user)
        return Response({
            'token': token.key,
            'role': user.role,
            'email_verified': True,
        })


class ResendEmailVerificationView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'email_verification_resend'

    def post(self, request):
        serializer = ResendEmailVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data['email']
        ).first()

        # Keep the response generic for unknown or already-verified addresses.
        if not user or user.email_verified_at:
            return Response({
                'detail': (
                    'If this address has an unverified account, a new code '
                    'has been sent.'
                ),
            })

        try:
            issue_email_verification(user, enforce_cooldown=True)
        except VerificationCooldown as exc:
            return Response(
                {
                    'detail': (
                        f'Please wait {exc.retry_after} seconds before '
                        'requesting another code.'
                    ),
                    'retry_after': exc.retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except VerificationDeliveryError:
            logger.exception("Could not resend account verification email")
            return Response(
                {'detail': 'The verification email could not be sent. Try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({'detail': 'A new verification code has been sent.'})


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset_request'

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data['email'],
            email_verified_at__isnull=False,
            is_active=True,
        ).first()

        # A generic response prevents attackers from discovering registered
        # addresses. Real delivery errors are recorded only in server logs.
        if user:
            try:
                issue_password_reset(user)
            except PasswordResetCooldown:
                pass
            except EmailDeliveryError:
                logger.exception("Could not deliver password reset email")

        return Response({
            'detail': (
                'If an active account exists for this email, a 6-digit '
                'password reset code has been sent.'
            ),
        })


class VerifyPasswordResetCodeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset_verify'

    def post(self, request):
        serializer = VerifyPasswordResetCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data['email'],
            email_verified_at__isnull=False,
            is_active=True,
        ).first()
        if not user:
            return Response(
                {'detail': 'Invalid or expired password reset code.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reset_token, reason = verify_password_reset_code(
            user,
            serializer.validated_data['code'],
        )
        if not reset_token:
            messages = {
                'expired': 'This code has expired. Request a new one.',
                'attempts_exhausted': (
                    'Too many incorrect attempts. Request a new code.'
                ),
            }
            return Response(
                {
                    'detail': messages.get(
                        reason,
                        'Invalid or expired password reset code.',
                    ),
                    'code': f'password_reset_{reason}',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({'reset_token': reset_token})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'password_reset_confirm'

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data['email'],
            email_verified_at__isnull=False,
            is_active=True,
        ).first()
        if not user:
            return Response(
                {'detail': 'Invalid or expired password reset session.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        changed, reason = reset_password(
            user,
            serializer.validated_data['reset_token'],
            serializer.validated_data['new_password'],
        )
        if not changed:
            if isinstance(reason, list):
                return Response(
                    {'new_password': reason},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {'detail': 'Invalid or expired password reset session.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            'detail': 'Your password has been changed. You can now sign in.',
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role == UserRole.PATIENT and hasattr(user, 'patient_profile'):
            from api.catalogue.services import sync_patient_care_path
            sync_patient_care_path(user.patient_profile)
        data = {
            'id':         str(user.id),
            'email':      user.email,
            'first_name': user.first_name,
            'last_name':  user.last_name,
            'role':       user.role,
        }
        if user.role == UserRole.PATIENT and hasattr(user, 'patient_profile'):
            data['profile'] = PatientProfileSerializer(user.patient_profile).data
        elif user.role == UserRole.CLINICIAN and hasattr(user, 'clinician_profile'):
            data['profile'] = ClinicianProfileSerializer(user.clinician_profile).data
        return Response(data)

    def patch(self, request):
        user = request.user
        if user.role == UserRole.PATIENT and hasattr(user, 'patient_profile'):
            previous_contact_phone = user.patient_profile.emergency_contact_phone
            serializer = PatientProfileSerializer(user.patient_profile, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            plan_inputs = {
                "goal",
                "custom_goal",
                "activity_level",
                "focus_side",
                "cue_style",
            }
            plan_inputs_changed = any(
                key in serializer.validated_data
                and getattr(user.patient_profile, key)
                != serializer.validated_data[key]
                for key in plan_inputs
            )
            if plan_inputs_changed:
                profile = serializer.save(
                    wellness_plan={},
                    wellness_plan_accepted_at=None,
                )
            else:
                profile = serializer.save()
            contact_changed = (
                previous_contact_phone != profile.emergency_contact_phone
                or not profile.emergency_contact_consent
            )
            if contact_changed:
                profile.emergency_contact_verified_at = None
                profile.save(update_fields=[
                    'emergency_contact_verified_at',
                    'updated_at',
                ])
                EmergencyContactVerificationChallenge.objects.filter(
                    patient=profile,
                ).delete()
            return Response(PatientProfileSerializer(profile).data)
        elif user.role == UserRole.CLINICIAN and hasattr(user, 'clinician_profile'):
            serializer = ClinicianProfileSerializer(user.clinician_profile, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)
        return Response({'detail': 'No profile found.'}, status=status.HTTP_404_NOT_FOUND)


class EmergencyContactVerificationStartView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'emergency_contact_verification'

    def post(self, request):
        if (
            request.user.role != UserRole.PATIENT
            or not hasattr(request.user, 'patient_profile')
        ):
            return Response(
                {'detail': 'A patient account is required.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        profile = request.user.patient_profile
        try:
            challenge = issue_emergency_contact_verification(profile)
        except ValueError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except EmergencyVerificationCooldown as exc:
            return Response(
                {
                    'detail': (
                        f'Please wait {exc.retry_after} seconds before '
                        'requesting another code.'
                    ),
                    'retry_after': exc.retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except EmergencyVerificationDeliveryError as exc:
            logger.exception('Could not send emergency-contact verification')
            return Response(
                {
                    'detail': str(exc),
                    'code': 'emergency_contact_delivery_unavailable',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({
            'detail': (
                'A verification code was texted to your emergency contact.'
            ),
            'expires_at': challenge.expires_at,
        })


class EmergencyContactVerificationConfirmView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'emergency_contact_verification'

    def post(self, request):
        if (
            request.user.role != UserRole.PATIENT
            or not hasattr(request.user, 'patient_profile')
        ):
            return Response(
                {'detail': 'A patient account is required.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = EmergencyContactVerificationCodeSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)
        profile = request.user.patient_profile
        verified, reason = verify_emergency_contact_code(
            profile,
            serializer.validated_data['code'],
        )
        if not verified:
            messages = {
                'expired': 'This verification code has expired.',
                'attempts_exhausted': (
                    'Too many incorrect attempts. Request a new code.'
                ),
                'contact_changed': (
                    'The contact number changed. Request a new code.'
                ),
            }
            return Response(
                {
                    'detail': messages.get(
                        reason,
                        'The verification code is incorrect.',
                    ),
                    'code': f'emergency_contact_verification_{reason}',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile.refresh_from_db()
        return Response({
            'detail': 'Emergency contact verified.',
            'profile': PatientProfileSerializer(profile).data,
        })


class EmergencyAlertCreateView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'emergency_alert_create'

    def post(self, request):
        if (
            request.user.role != UserRole.PATIENT
            or not hasattr(request.user, 'patient_profile')
        ):
            return Response(
                {'detail': 'A patient account is required.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = EmergencyAlertCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = request.user.patient_profile
        existing = EmergencyAlert.objects.filter(
            client_event_id=serializer.validated_data['client_event_id'],
            patient=profile,
        ).first()
        if existing:
            return Response(EmergencyAlertSerializer(existing).data)

        contact_is_ready = emergency_contact_ready(profile)
        delay_seconds = max(
            10,
            min(settings.EMERGENCY_ALERT_DELAY_SECONDS, 120),
        )
        alert = EmergencyAlert.objects.create(
            client_event_id=(
                serializer.validated_data['client_event_id']
            ),
            patient=profile,
            status=(
                EmergencyAlertStatus.PENDING
                if contact_is_ready
                else EmergencyAlertStatus.NOT_CONFIGURED
            ),
            exercise_id=serializer.validated_data.get('exercise_id', ''),
            monitoring_mode=serializer.validated_data.get(
                'monitoring_mode',
                '',
            ),
            signals=serializer.validated_data.get('signals', []),
            notify_after=timezone.now() + timedelta(seconds=delay_seconds),
            contact_name=(
                profile.emergency_contact_name if contact_is_ready else ''
            ),
            contact_phone=(
                profile.emergency_contact_phone if contact_is_ready else ''
            ),
            delivery_error=(
                ''
                if contact_is_ready
                else (
                    'No verified emergency contact or notification provider '
                    'is configured.'
                )
            ),
        )
        return Response(
            EmergencyAlertSerializer(alert).data,
            status=status.HTTP_201_CREATED,
        )


class EmergencyAlertDetailView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'emergency_alert_response'

    def get_alert(self, request, alert_id):
        if (
            request.user.role != UserRole.PATIENT
            or not hasattr(request.user, 'patient_profile')
        ):
            return None
        return EmergencyAlert.objects.filter(
            pk=alert_id,
            patient=request.user.patient_profile,
        ).first()

    def get(self, request, alert_id):
        alert = self.get_alert(request, alert_id)
        if not alert:
            return Response(
                {'detail': 'Emergency alert not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(EmergencyAlertSerializer(alert).data)

    def post(self, request, alert_id):
        if (
            request.user.role != UserRole.PATIENT
            or not hasattr(request.user, 'patient_profile')
        ):
            return Response(
                {'detail': 'A patient account is required.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        input_serializer = EmergencyAlertResponseSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        response_value = input_serializer.validated_data['response']
        with transaction.atomic():
            alert = (
                EmergencyAlert.objects.select_for_update()
                .filter(
                    pk=alert_id,
                    patient=request.user.patient_profile,
                )
                .first()
            )
            if not alert:
                return Response(
                    {'detail': 'Emergency alert not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if alert.status in {
                EmergencyAlertStatus.NOTIFYING,
                EmergencyAlertStatus.NOTIFIED,
                EmergencyAlertStatus.PARTIAL,
                EmergencyAlertStatus.FAILED,
            }:
                if not alert.response:
                    alert.response = response_value
                    alert.responded_at = timezone.now()
                    alert.save(update_fields=[
                        'response',
                        'responded_at',
                        'updated_at',
                    ])
                return Response(EmergencyAlertSerializer(alert).data)

            alert.response = response_value
            alert.responded_at = timezone.now()
            update_fields = ['response', 'responded_at', 'updated_at']
            if response_value == EmergencyAlertResponse.OKAY:
                alert.status = EmergencyAlertStatus.CANCELLED
                update_fields.append('status')
            elif alert.status == EmergencyAlertStatus.PENDING:
                alert.notify_after = timezone.now()
                update_fields.append('notify_after')
            alert.save(update_fields=update_fields)

        if (
            response_value != EmergencyAlertResponse.OKAY
            and alert.status == EmergencyAlertStatus.PENDING
        ):
            alert = dispatch_emergency_alert(alert.id)
        return Response(EmergencyAlertSerializer(alert).data)


class PatientPathwayChoiceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if (
            request.user.role != UserRole.PATIENT
            or not hasattr(request.user, "patient_profile")
        ):
            return Response(
                {"detail": "A patient account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PatientPathwayChoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        choice = serializer.validated_data["pathway"]
        profile = request.user.patient_profile

        if (
            choice == PatientPathwayChoice.WELLNESS
            and (
                profile.primary_clinician_id
                or profile.prescriptions.filter(is_active=True).exists()
            )
        ):
            return Response(
                {
                    "detail": (
                        "This account has clinician-managed rehabilitation. "
                        "The wellness pathway cannot replace that programme."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        # A wellness patient may self-refer up to the physiotherapist pathway
        # (this posts them to triage). Any other change after selection is
        # blocked and must go through support/a clinician.
        is_self_referral = (
            profile.pathway_choice == PatientPathwayChoice.WELLNESS
            and choice == PatientPathwayChoice.PHYSIOTHERAPIST
        )
        if (
            profile.pathway_choice != PatientPathwayChoice.UNSELECTED
            and profile.pathway_choice != choice
            and not is_self_referral
        ):
            return Response(
                {
                    "detail": (
                        "Your pathway has already been selected. Contact your "
                        "physiotherapist or support before changing it."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        profile.pathway_choice = choice
        profile.pathway_selected_at = profile.pathway_selected_at or timezone.now()
        profile.care_path = (
            CarePath.CLINICIAN
            if choice == PatientPathwayChoice.PHYSIOTHERAPIST
            else CarePath.WELLNESS
        )
        if choice == PatientPathwayChoice.PHYSIOTHERAPIST:
            profile.low_risk_acknowledged = False
            profile.wellness_plan = {}
            profile.wellness_plan_accepted_at = None
        profile.save(update_fields=[
            "pathway_choice",
            "pathway_selected_at",
            "care_path",
            "low_risk_acknowledged",
            "wellness_plan",
            "wellness_plan_accepted_at",
            "updated_at",
        ])

        # Opting in to physiotherapist help with no clinician yet — surface the
        # patient in the shared triage queue so any physio can pick them up.
        if (
            choice == PatientPathwayChoice.PHYSIOTHERAPIST
            and not profile.primary_clinician_id
        ):
            try:
                from api.slack_bot.services import post_self_referral_to_triage
                post_self_referral_to_triage(profile)
            except Exception:  # Slack must never block the pathway response
                logger.exception("Failed to post self-referral to Slack triage")

        return Response(PatientProfileSerializer(profile).data)


class AgentChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        message = str(request.data.get('message', '')).strip()

        if not message:
            return Response(
                {'detail': 'Message is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(message) > 2000:
            return Response(
                {'detail': 'Message is too long.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            command_result = (
                dispatch_clinician_command(request.user, message)
                if request.user.role == UserRole.CLINICIAN
                else None
            )
            reply = (
                command_result['reply']
                if command_result
                else generate_agent_reply(request.user, message)
            )
        except Exception:
            logger.exception('Gemini request failed')
            return Response(
                {'detail': 'The assistant is unavailable.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        response_data = {
            'reply': reply,
            'role': request.user.role,
        }
        if command_result:
            response_data.update({
                'command': command_result['command'],
                'changed': command_result.get('changed', False),
            })
            if 'data' in command_result:
                response_data['data'] = command_result['data']
        return Response(response_data)


class SafetyLanguageInterpretationView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'safety_language_interpretation'

    def post(self, request):
        if request.user.role != UserRole.PATIENT:
            return Response(
                {'detail': 'This language interpreter is available to patients only.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        stage = str(request.data.get('stage', '')).strip()
        transcript = ' '.join(
            str(request.data.get('transcript', '')).split()
        )
        locale = str(request.data.get('locale', 'en-SG')).strip()
        if not available_safety_language_stage(stage):
            return Response(
                {'detail': 'Unsupported safety-language stage.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not transcript or len(transcript) > 500:
            return Response(
                {'detail': 'Transcript must contain between 1 and 500 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            interpretation = interpret_safety_language(stage, transcript, locale)
        except SafetyLanguageUnavailable:
            logger.exception('Constrained safety-language interpretation failed')
            return Response(
                {'detail': 'The language interpreter is unavailable.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(interpretation)


class WellnessScreeningView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if (
            request.user.role != UserRole.PATIENT
            or not hasattr(request.user, 'patient_profile')
        ):
            return Response(
                {'detail': 'A patient profile is required.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = WellnessScreeningSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        answers = serializer.validated_data
        profile = request.user.patient_profile
        if (
            profile.pathway_choice
            == PatientPathwayChoice.PHYSIOTHERAPIST
        ):
            return Response(
                {
                    "detail": (
                        "This account uses a physiotherapist-assigned pathway. "
                        "A wellness screen cannot unlock self-guided exercises."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        if profile.primary_clinician_id:
            return Response(
                {
                    'detail': (
                        'This patient is linked to a clinician. The clinician '
                        'programme must be completed or removed before changing pathways.'
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        eligible = all(answers.values())
        screening_status = (
            WellnessScreeningStatus.ELIGIBLE
            if eligible
            else WellnessScreeningStatus.NEEDS_REVIEW
        )

        profile.wellness_screening_status = screening_status
        profile.wellness_screening_answers = answers
        profile.wellness_screened_at = timezone.now()
        profile.low_risk_acknowledged = eligible
        profile.care_path = (
            CarePath.WELLNESS if eligible else CarePath.NEEDS_REVIEW
        )
        profile.pathway_choice = PatientPathwayChoice.WELLNESS
        profile.pathway_selected_at = profile.pathway_selected_at or timezone.now()
        # Failing a new safety screen immediately locks an older wellness
        # plan. Passing still only permits planning and never creates a plan.
        if not eligible:
            profile.wellness_plan = {}
            profile.wellness_plan_accepted_at = None
        profile.save(update_fields=[
            'wellness_screening_status',
            'wellness_screening_answers',
            'wellness_screened_at',
            'low_risk_acknowledged',
            'care_path',
            'pathway_choice',
            'pathway_selected_at',
            'wellness_plan',
            'wellness_plan_accepted_at',
            'updated_at',
        ])

        return Response({
            'status': screening_status,
            'care_path': profile.care_path,
            'screened_at': profile.wellness_screened_at,
        })


def _wellness_planning_profile(request):
    if (
        request.user.role != UserRole.PATIENT
        or not hasattr(request.user, "patient_profile")
    ):
        return None, Response(
            {"detail": "A patient account is required."},
            status=status.HTTP_403_FORBIDDEN,
        )
    profile = request.user.patient_profile
    if (
        profile.pathway_choice == PatientPathwayChoice.PHYSIOTHERAPIST
        or profile.care_path == CarePath.CLINICIAN
        or profile.primary_clinician_id
    ):
        return None, Response(
            {
                "detail": (
                    "AI cannot change a physiotherapist-assigned programme."
                )
            },
            status=status.HTTP_409_CONFLICT,
        )
    if (
        profile.wellness_screening_status
        != WellnessScreeningStatus.ELIGIBLE
    ):
        return None, Response(
            {
                "detail": (
                    "Complete the general-wellness safety screen before "
                    "asking AI to draft a plan."
                )
            },
            status=status.HTTP_409_CONFLICT,
        )
    return profile, None


class WellnessPlanDraftView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "wellness_plan_draft"

    def post(self, request):
        _, error = _wellness_planning_profile(request)
        if error is not None:
            return error
        serializer = WellnessPlanDraftSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        preferences = dict(serializer.validated_data)
        previous_plan = preferences.pop("previous_plan", None)
        revision = preferences.pop("revision", "")
        try:
            plan = generate_wellness_plan(
                request.user,
                preferences,
                previous_plan=previous_plan,
                revision=revision,
            )
        except Exception:
            logger.exception("Gemini wellness planner failed")
            return Response(
                {
                    "detail": (
                        "The AI planner is unavailable right now. No plan "
                        "has been saved."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        token_preferences = {
            key: value
            for key, value in serializer.data.items()
            if key not in {"previous_plan", "revision"}
        }
        draft_token = signing.dumps(
            {
                "user_id": str(request.user.id),
                "plan": plan,
                "preferences": token_preferences,
            },
            salt="physiovision.wellness-plan-draft",
            compress=True,
        )
        return Response({
            "plan": plan,
            "draft_token": draft_token,
            "accepted": False,
        })


class WellnessPlanAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        _, error = _wellness_planning_profile(request)
        if error is not None:
            return error
        serializer = WellnessPlanAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            signed_draft = signing.loads(
                serializer.validated_data["draft_token"],
                salt="physiovision.wellness-plan-draft",
                max_age=30 * 60,
            )
        except signing.SignatureExpired:
            return Response(
                {"detail": "This AI draft has expired. Ask for a new draft."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except signing.BadSignature:
            return Response(
                {"detail": "This AI draft could not be verified."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if signed_draft.get("user_id") != str(request.user.id):
            return Response(
                {"detail": "This AI draft belongs to a different account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        preferences_serializer = WellnessPlanPreferencesSerializer(
            data=signed_draft.get("preferences"),
        )
        preferences_serializer.is_valid(raise_exception=True)
        data = dict(preferences_serializer.validated_data)
        try:
            plan = normalize_wellness_plan(signed_draft.get("plan"), data)
        except WellnessPlanValidationError as exc:
            return Response(
                {"detail": f"This draft cannot be accepted: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = PatientProfile.objects.select_for_update().get(
            pk=request.user.patient_profile.pk,
        )
        if (
            profile.wellness_screening_status
            != WellnessScreeningStatus.ELIGIBLE
            or profile.pathway_choice == PatientPathwayChoice.PHYSIOTHERAPIST
            or profile.primary_clinician_id
        ):
            return Response(
                {"detail": "The account is no longer eligible for this plan."},
                status=status.HTTP_409_CONFLICT,
            )

        profile.goal = data["goal"]
        profile.custom_goal = data["custom_goal"]
        profile.activity_level = data["activity_level"]
        profile.focus_side = data["focus_side"]
        profile.cue_style = data["cue_style"]
        profile.height_cm = data.get("height_cm")
        profile.weight_kg = data.get("weight_kg")
        profile.medical_history = data.get("medical_history", "")
        profile.wellness_plan = plan
        profile.wellness_plan_accepted_at = timezone.now()
        profile.save(update_fields=[
            "goal",
            "custom_goal",
            "activity_level",
            "focus_side",
            "cue_style",
            "height_cm",
            "weight_kg",
            "medical_history",
            "wellness_plan",
            "wellness_plan_accepted_at",
            "updated_at",
        ])
        return Response(PatientProfileSerializer(profile).data)


INVITE_ALPHABET = string.ascii_uppercase.replace("I", "").replace("O", "") + "23456789"


def _invitation_digest(code):
    return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()


class CareInvitationListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def _clinician(self, request):
        if (
            request.user.role != UserRole.CLINICIAN
            or not hasattr(request.user, "clinician_profile")
        ):
            return None
        return request.user.clinician_profile

    def get(self, request):
        clinician = self._clinician(request)
        if not clinician:
            return Response(
                {"detail": "A clinician account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        invitations = CareInvitation.objects.filter(
            clinician=clinician,
        ).select_related("clinician__user")[:20]
        return Response(CareInvitationSerializer(invitations, many=True).data)

    def post(self, request):
        clinician = self._clinician(request)
        if not clinician:
            return Response(
                {"detail": "A clinician account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        raw_code = None
        for _ in range(10):
            candidate = "".join(
                secrets.choice(INVITE_ALPHABET) for _ in range(8)
            )
            if not CareInvitation.objects.filter(
                code_digest=_invitation_digest(candidate)
            ).exists():
                raw_code = candidate
                break
        if not raw_code:
            return Response(
                {"detail": "Could not create an invitation code."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        invitation = CareInvitation.objects.create(
            clinician=clinician,
            code_digest=_invitation_digest(raw_code),
            code_hint=raw_code[-4:],
            expires_at=timezone.now() + timedelta(days=7),
        )
        data = CareInvitationSerializer(invitation).data
        data["code"] = raw_code
        return Response(data, status=status.HTTP_201_CREATED)


class CareInvitationAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if (
            request.user.role != UserRole.PATIENT
            or not hasattr(request.user, "patient_profile")
        ):
            return Response(
                {"detail": "A patient account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = CareInvitationAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        digest = _invitation_digest(serializer.validated_data["code"])

        with transaction.atomic():
            invitation = (
                CareInvitation.objects.select_for_update()
                .select_related("clinician__user")
                .filter(
                    code_digest=digest,
                    is_active=True,
                    accepted_by__isnull=True,
                    expires_at__gt=timezone.now(),
                )
                .first()
            )
            if not invitation:
                return Response(
                    {"detail": "This invitation is invalid, expired, or already used."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            patient = request.user.patient_profile
            if (
                patient.primary_clinician_id
                and patient.primary_clinician_id != invitation.clinician_id
            ):
                return Response(
                    {"detail": "This patient is already linked to another clinician."},
                    status=status.HTTP_409_CONFLICT,
                )

            patient.primary_clinician = invitation.clinician
            patient.care_path = CarePath.NEEDS_REVIEW
            patient.pathway_choice = PatientPathwayChoice.PHYSIOTHERAPIST
            patient.pathway_selected_at = (
                patient.pathway_selected_at or timezone.now()
            )
            patient.save(update_fields=[
                "primary_clinician", "care_path", "pathway_choice",
                "pathway_selected_at", "updated_at",
            ])
            invitation.accepted_by = patient
            invitation.accepted_at = timezone.now()
            invitation.is_active = False
            invitation.save(update_fields=[
                "accepted_by", "accepted_at", "is_active", "updated_at",
            ])

        return Response({
            "clinician": invitation.clinician.user.get_full_name().strip()
                or invitation.clinician.user.email,
            "care_path": patient.care_path,
            "detail": "Linked successfully. Your clinician can now assign a programme.",
        })


class SlackLinkCodeView(APIView):
    """Issue a one-time code the clinician redeems in Slack to link their account."""
    permission_classes = [IsAuthenticated]

    SLACK_CODE_TTL = timedelta(minutes=10)

    def post(self, request):
        if (
            request.user.role != UserRole.CLINICIAN
            or not hasattr(request.user, "clinician_profile")
        ):
            return Response(
                {"detail": "A clinician account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        from api.slack_bot.services import slack_link_code_digest

        clinician = request.user.clinician_profile
        # Retire any earlier unused codes so only the latest one works.
        SlackLinkCode.objects.filter(
            clinician=clinician, used_at__isnull=True,
        ).update(used_at=timezone.now())

        raw_code = None
        for _ in range(10):
            candidate = "".join(secrets.choice(string.digits) for _ in range(6))
            digest = slack_link_code_digest(candidate)
            if not SlackLinkCode.objects.filter(code_digest=digest).exists():
                raw_code = candidate
                break
        if not raw_code:
            return Response(
                {"detail": "Could not create a link code. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        link = SlackLinkCode.objects.create(
            clinician=clinician,
            code_digest=slack_link_code_digest(raw_code),
            expires_at=timezone.now() + self.SLACK_CODE_TTL,
        )
        return Response(
            {
                "code": raw_code,
                "expires_at": link.expires_at,
                "instructions": f"In Slack, send: @Physio Assistant link {raw_code}",
                "workspace_invite_url": getattr(
                    settings, "SLACK_WORKSPACE_INVITE_URL", ""
                ),
            },
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request):
        """Unlink the clinician's Slack account and retire any pending codes."""
        if (
            request.user.role != UserRole.CLINICIAN
            or not hasattr(request.user, "clinician_profile")
        ):
            return Response(
                {"detail": "A clinician account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        clinician = request.user.clinician_profile
        clinician.slack_user_id = ""
        clinician.save(update_fields=["slack_user_id", "updated_at"])
        SlackLinkCode.objects.filter(
            clinician=clinician, used_at__isnull=True,
        ).update(used_at=timezone.now())
        return Response({"slack_linked": False}, status=status.HTTP_200_OK)


class ClinicianPatientsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if (
            request.user.role != UserRole.CLINICIAN
            or not hasattr(request.user, "clinician_profile")
        ):
            return Response(
                {"detail": "A clinician account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        clinician = request.user.clinician_profile
        patients = (
            clinician.patients.select_related("user")
            .prefetch_related("prescriptions")
            .order_by("user__last_name", "user__first_name")
        )
        today = timezone.localdate()
        data = []
        for patient in patients:
            active_count = sum(
                1 for prescription in patient.prescriptions.all()
                if (
                    prescription.clinician_id == clinician.id
                    and prescription.is_active
                    and prescription.valid_from <= today
                    and (
                        prescription.valid_until is None
                        or prescription.valid_until >= today
                    )
                )
            )
            data.append({
                "id": str(patient.id),
                "name": patient.user.get_full_name().strip() or patient.user.email,
                "email": patient.user.email,
                "care_path": patient.care_path,
                "active_prescriptions": active_count,
            })
        return Response(data)


class ClinicianTriageQueueView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if (
            request.user.role != UserRole.CLINICIAN
            or not hasattr(request.user, "clinician_profile")
        ):
            return Response(
                {"detail": "A clinician account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        patients = (
            PatientProfile.objects.filter(
                primary_clinician__isnull=True,
                pathway_choice=PatientPathwayChoice.PHYSIOTHERAPIST,
            )
            .select_related("user")
            .order_by("pathway_selected_at", "created_at")
        )
        return Response([{
            "id": str(patient.id),
            "name": patient.user.get_full_name().strip() or "Patient",
            "goal": patient.goal,
            "custom_goal": patient.custom_goal,
            "activity_level": patient.activity_level,
            "mobility_status": patient.mobility_status,
            "focus_side": patient.focus_side,
            "requested_at": patient.pathway_selected_at,
        } for patient in patients])


class ClinicianTriageClaimView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, patient_id):
        if (
            request.user.role != UserRole.CLINICIAN
            or not hasattr(request.user, "clinician_profile")
        ):
            return Response(
                {"detail": "A clinician account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            patient = (
                PatientProfile.objects.select_for_update()
                .filter(pk=patient_id)
                .first()
            )
            if not patient:
                return Response(
                    {"detail": "This triage request no longer exists."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if patient.primary_clinician_id:
                return Response(
                    {"detail": "This patient has already been claimed."},
                    status=status.HTTP_409_CONFLICT,
                )
            if patient.pathway_choice != PatientPathwayChoice.PHYSIOTHERAPIST:
                return Response(
                    {"detail": "This patient is not in the physiotherapist triage queue."},
                    status=status.HTTP_409_CONFLICT,
                )

            patient.primary_clinician = request.user.clinician_profile
            patient.care_path = CarePath.NEEDS_REVIEW
            patient.slack_thread_ts = ""
            patient.save(update_fields=[
                "primary_clinician", "care_path", "slack_thread_ts", "updated_at",
            ])

        return Response({
            "id": str(patient.id),
            "name": patient.user.get_full_name().strip() or "Patient",
            "detail": "Patient added to your roster for review.",
        })

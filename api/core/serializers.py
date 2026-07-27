import re
from datetime import timedelta

from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from .models import (
    CareInvitation,
    ClinicianProfile,
    PatientProfile,
    User,
    UserRole,
)


def _parse_days_per_week(s):
    """Parse '4–5' or '4-5' or '4' → int lower bound."""
    try:
        return int(re.split(r'[–\-]', str(s))[0])
    except (ValueError, TypeError):
        return 1


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'role', 'date_of_birth', 'phone']
        read_only_fields = ['id', 'role']


class RegisterSerializer(serializers.Serializer):
    email      = serializers.EmailField()
    password   = serializers.CharField(
        write_only=True,
        validators=[validate_password],
    )
    first_name = serializers.CharField(max_length=150)
    last_name  = serializers.CharField(max_length=150)
    role       = serializers.ChoiceField(choices=[UserRole.PATIENT, UserRole.CLINICIAN])

    # Patient-only optional fields
    goal            = serializers.ChoiceField(choices=PatientProfile.goal.field.choices, required=False)  # type: ignore[attr-defined]
    activity_level  = serializers.ChoiceField(choices=PatientProfile.activity_level.field.choices, required=False)  # type: ignore[attr-defined]
    mobility_status = serializers.ChoiceField(choices=PatientProfile.mobility_status.field.choices, required=False)  # type: ignore[attr-defined]
    focus_side      = serializers.ChoiceField(choices=PatientProfile.focus_side.field.choices, required=False)  # type: ignore[attr-defined]
    cue_style       = serializers.ChoiceField(choices=PatientProfile.cue_style.field.choices, required=False)  # type: ignore[attr-defined]

    # Clinician-only optional fields
    license_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    specialty      = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_email(self, value):
        return value.strip().lower()

    def create(self, validated_data):
        role     = validated_data['role']
        password = validated_data.pop('password')

        # Pull out profile-specific fields before creating the User
        patient_fields   = {k: validated_data.pop(k) for k in ['goal', 'activity_level', 'mobility_status', 'focus_side', 'cue_style'] if k in validated_data}
        clinician_fields = {k: validated_data.pop(k) for k in ['license_number', 'specialty'] if k in validated_data}

        user = User.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            password=password,
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            role=role,
            is_active=False,
            email_verified_at=None,
        )

        if role == UserRole.PATIENT:
            PatientProfile.objects.create(user=user, **patient_fields)
        elif role == UserRole.CLINICIAN:
            ClinicianProfile.objects.create(user=user, **clinician_fields)

        return user


class LoginSerializer(serializers.Serializer):
    email    = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, data):
        user = User.objects.filter(email__iexact=data['email']).first()
        if not user or not user.check_password(data['password']):
            raise serializers.ValidationError("Invalid email or password.")
        if not user.email_verified_at:
            data['user'] = user
            data['requires_email_verification'] = True
            return data
        if not user.is_active:
            raise serializers.ValidationError("This account is disabled.")
        data['user'] = user
        return data


class VerifyEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.RegexField(r"^\d{6}$")

    def validate_email(self, value):
        return value.strip().lower()


class VerifyLoginSerializer(serializers.Serializer):
    challenge_id = serializers.UUIDField()
    code = serializers.RegexField(r"^\d{6}$")


class ResendLoginVerificationSerializer(serializers.Serializer):
    challenge_id = serializers.UUIDField()


class ResendEmailVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class VerifyPasswordResetCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.RegexField(r"^\d{6}$")

    def validate_email(self, value):
        return value.strip().lower()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    reset_token = serializers.CharField(min_length=32, max_length=256)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        return value.strip().lower()


class PatientProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model  = PatientProfile
        fields = [
            'id', 'user', 'goal', 'activity_level', 'mobility_status',
            'focus_side', 'cue_style', 'care_path',
            'height_cm', 'weight_kg', 'medical_history', 'low_risk_acknowledged',
            'wellness_screening_status', 'wellness_screening_answers',
            'wellness_screened_at',
            'primary_clinician', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'user', 'care_path', 'wellness_screening_status',
            'wellness_screening_answers', 'wellness_screened_at',
            'created_at', 'updated_at',
        ]



class WellnessScreeningSerializer(serializers.Serializer):
    not_treating_condition = serializers.BooleanField()
    no_clinician_restrictions = serializers.BooleanField()
    general_wellness_goal = serializers.BooleanField()
    no_concerning_symptoms = serializers.BooleanField()


class CareInvitationSerializer(serializers.ModelSerializer):
    clinician_name = serializers.CharField(
        source="clinician.user.get_full_name",
        read_only=True,
    )

    class Meta:
        model = CareInvitation
        fields = [
            "id", "clinician_name", "code_hint", "expires_at",
            "accepted_at", "is_active", "created_at",
        ]
        read_only_fields = fields


class CareInvitationAcceptSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=8, max_length=8, trim_whitespace=True)


class ClinicianProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model  = ClinicianProfile
        fields = [
            'id', 'user', 'license_number', 'specialty',
            'years_experience', 'bio', 'is_accepting_patients',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


class PatientListSerializer(serializers.ModelSerializer):
    full_name             = serializers.SerializerMethodField()
    age                   = serializers.SerializerMethodField()
    last_session_at       = serializers.SerializerMethodField()
    open_escalations_count = serializers.SerializerMethodField()
    trend                 = serializers.SerializerMethodField()
    adherence_pct         = serializers.SerializerMethodField()
    latest_pain_level     = serializers.SerializerMethodField()
    active_prescription   = serializers.SerializerMethodField()

    class Meta:
        model  = PatientProfile
        fields = [
            'id', 'full_name', 'age', 'goal', 'activity_level', 'mobility_status',
            'focus_side', 'care_path', 'last_session_at', 'open_escalations_count',
            'trend', 'adherence_pct', 'latest_pain_level', 'active_prescription',
        ]

    def get_full_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip()

    def get_age(self, obj):
        if not obj.user.date_of_birth:
            return None
        today = timezone.now().date()
        dob   = obj.user.date_of_birth
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    def get_last_session_at(self, obj):
        return obj.sessions.order_by('-started_at').values_list('started_at', flat=True).first()

    def get_open_escalations_count(self, obj):
        return obj.escalations.filter(status='open').count()

    def get_trend(self, obj):
        sessions = [
            s for s in obj.sessions.order_by('-started_at')[:3]
            if s.angle_summaries
        ]
        if len(sessions) < 2:
            return 'stable'
        # Compute per-session scalar: mean of all angle means
        def session_scalar(s):
            means = [v['mean'] for v in s.angle_summaries.values() if isinstance(v, dict) and 'mean' in v]
            return sum(means) / len(means) if means else 0
        scalars = [session_scalar(s) for s in reversed(sessions)]  # oldest → newest
        delta = scalars[-1] - scalars[0]
        if delta > 5:
            return 'improving'
        if delta < -5:
            return 'declining'
        return 'stable'

    def get_adherence_pct(self, obj):
        prescriptions = [p for p in obj.prescriptions.all() if p.is_active]
        if not prescriptions:
            return None
        week_ago = timezone.now() - timedelta(days=7)
        sessions_last_7d = obj.sessions.filter(started_at__gte=week_ago).count()
        target = max(_parse_days_per_week(p.days_per_week) for p in prescriptions)
        return min(100, round(sessions_last_7d / target * 100)) if target else None

    def get_latest_pain_level(self, obj):
        checkin = obj.pain_checkins.order_by('-checked_at').first()
        return checkin.pain_level if checkin else None

    def get_active_prescription(self, obj):
        rx = next((p for p in obj.prescriptions.all() if p.is_active), None)
        if not rx:
            return None
        return {
            'exercise_id':   rx.exercise_id,
            'exercise_name': rx.exercise.name,
            'sets':          rx.sets,
            'reps':          rx.reps,
            'days_per_week': rx.days_per_week,
        }

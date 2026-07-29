import re
from datetime import timedelta

from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from .analytics import adherence_pct, parse_days_per_week, session_quality_trend
from .models import (
    ActivityLevel,
    CareInvitation,
    ClinicianProfile,
    CueStyle,
    FocusSide,
    GoalChoice,
    PatientPathwayChoice,
    PatientProfile,
    User,
    UserRole,
)


# Backwards-compatible alias; canonical implementation now lives in analytics.py.
_parse_days_per_week = parse_days_per_week


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
    custom_goal     = serializers.CharField(max_length=120, required=False, allow_blank=True)
    activity_level  = serializers.ChoiceField(choices=PatientProfile.activity_level.field.choices, required=False)  # type: ignore[attr-defined]
    mobility_status = serializers.ChoiceField(choices=PatientProfile.mobility_status.field.choices, required=False)  # type: ignore[attr-defined]
    focus_side      = serializers.ChoiceField(choices=PatientProfile.focus_side.field.choices, required=False)  # type: ignore[attr-defined]
    cue_style       = serializers.ChoiceField(choices=PatientProfile.cue_style.field.choices, required=False)  # type: ignore[attr-defined]

    # Clinician-only optional fields
    license_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    specialty      = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, data):
        if data.get('role') != UserRole.PATIENT:
            data['custom_goal'] = ''
            return data

        goal = data.get('goal', GoalChoice.STRONGER_KNEES)
        custom_goal = data.get('custom_goal', '').strip()
        if goal == GoalChoice.OTHER and not custom_goal:
            raise serializers.ValidationError({
                'custom_goal': 'Describe what you would like to improve.',
            })
        data['custom_goal'] = custom_goal if goal == GoalChoice.OTHER else ''
        return data

    def create(self, validated_data):
        role     = validated_data['role']
        password = validated_data.pop('password')

        # Pull out profile-specific fields before creating the User
        patient_fields   = {k: validated_data.pop(k) for k in ['goal', 'custom_goal', 'activity_level', 'mobility_status', 'focus_side', 'cue_style'] if k in validated_data}
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
            'id', 'user', 'goal', 'custom_goal', 'activity_level', 'mobility_status',
            'focus_side', 'cue_style', 'care_path',
            'pathway_choice', 'pathway_selected_at',
            'height_cm', 'weight_kg', 'medical_history', 'low_risk_acknowledged',
            'wellness_screening_status', 'wellness_screening_answers',
            'wellness_screened_at',
            'wellness_plan', 'wellness_plan_accepted_at',
            'primary_clinician', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'user', 'care_path', 'pathway_choice',
            'pathway_selected_at', 'wellness_screening_status',
            'wellness_screening_answers', 'wellness_screened_at',
            'wellness_plan', 'wellness_plan_accepted_at',
            'created_at', 'updated_at',
        ]

    def validate(self, attrs):
        current_goal = getattr(
            self.instance,
            'goal',
            GoalChoice.STRONGER_KNEES,
        )
        current_custom_goal = getattr(self.instance, 'custom_goal', '')
        goal = attrs.get('goal', current_goal)
        custom_goal = attrs.get('custom_goal', current_custom_goal).strip()

        if goal == GoalChoice.OTHER and not custom_goal:
            raise serializers.ValidationError({
                'custom_goal': 'Describe what you would like to improve.',
            })

        attrs['custom_goal'] = (
            custom_goal if goal == GoalChoice.OTHER else ''
        )
        return attrs



class PatientPathwayChoiceSerializer(serializers.Serializer):
    pathway = serializers.ChoiceField(
        choices=[
            PatientPathwayChoice.PHYSIOTHERAPIST,
            PatientPathwayChoice.WELLNESS,
        ],
    )


class WellnessScreeningSerializer(serializers.Serializer):
    not_treating_condition = serializers.BooleanField()
    no_clinician_restrictions = serializers.BooleanField()
    general_wellness_goal = serializers.BooleanField()
    no_concerning_symptoms = serializers.BooleanField()


class WellnessPlanPreferencesSerializer(serializers.Serializer):
    goal = serializers.ChoiceField(choices=GoalChoice.choices)
    custom_goal = serializers.CharField(
        max_length=120,
        required=False,
        allow_blank=True,
    )
    activity_level = serializers.ChoiceField(choices=ActivityLevel.choices)
    focus_side = serializers.ChoiceField(choices=FocusSide.choices)
    cue_style = serializers.ChoiceField(choices=CueStyle.choices)
    days_per_week = serializers.IntegerField(min_value=2, max_value=4)
    minutes_per_session = serializers.IntegerField(min_value=5, max_value=20)
    equipment = serializers.ChoiceField(
        choices=["none", "chair", "chair_band"],
    )
    planning_notes = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
    )
    age = serializers.IntegerField(
        min_value=50,
        max_value=100,
        required=False,
        allow_null=True,
    )
    height_cm = serializers.IntegerField(
        min_value=120,
        max_value=220,
        required=False,
        allow_null=True,
    )
    weight_kg = serializers.DecimalField(
        max_digits=5,
        decimal_places=1,
        min_value=30,
        max_value=250,
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        custom_goal = attrs.get("custom_goal", "").strip()
        if attrs["goal"] == GoalChoice.OTHER and not custom_goal:
            raise serializers.ValidationError({
                "custom_goal": "Describe your general-wellness goal.",
            })
        attrs["custom_goal"] = (
            custom_goal if attrs["goal"] == GoalChoice.OTHER else ""
        )
        attrs["planning_notes"] = attrs.get("planning_notes", "").strip()
        return attrs


class WellnessPlanDraftSerializer(WellnessPlanPreferencesSerializer):
    previous_plan = serializers.JSONField(required=False, allow_null=True)
    revision = serializers.CharField(
        max_length=240,
        required=False,
        allow_blank=True,
    )


class WellnessPlanAcceptSerializer(serializers.Serializer):
    draft_token = serializers.CharField(max_length=12000)


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
            'slack_linked', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'slack_linked', 'created_at', 'updated_at']

    slack_linked = serializers.SerializerMethodField()

    def get_slack_linked(self, obj):
        return bool(obj.slack_user_id)


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
        return session_quality_trend(obj)

    def get_adherence_pct(self, obj):
        return adherence_pct(obj)

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

from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework.authtoken.models import Token

from .models import ClinicianProfile, PatientProfile, User, UserRole


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'role', 'date_of_birth', 'phone']
        read_only_fields = ['id', 'role']


class RegisterSerializer(serializers.Serializer):
    email      = serializers.EmailField()
    password   = serializers.CharField(write_only=True, min_length=6)
    first_name = serializers.CharField(max_length=150)
    last_name  = serializers.CharField(max_length=150)
    role       = serializers.ChoiceField(choices=[UserRole.PATIENT, UserRole.CLINICIAN])

    # Patient-only optional fields
    goal            = serializers.ChoiceField(choices=PatientProfile.goal.field.choices, required=False)  # type: ignore[attr-defined]
    activity_level  = serializers.ChoiceField(choices=PatientProfile.activity_level.field.choices, required=False)  # type: ignore[attr-defined]
    mobility_status = serializers.ChoiceField(choices=PatientProfile.mobility_status.field.choices, required=False)  # type: ignore[attr-defined]
    focus_side      = serializers.ChoiceField(choices=PatientProfile.focus_side.field.choices, required=False)  # type: ignore[attr-defined]
    cue_style       = serializers.ChoiceField(choices=PatientProfile.cue_style.field.choices, required=False)  # type: ignore[attr-defined]
    care_path       = serializers.ChoiceField(choices=PatientProfile.care_path.field.choices, required=False)  # type: ignore[attr-defined]

    # Clinician-only optional fields
    license_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    specialty      = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def create(self, validated_data):
        role     = validated_data['role']
        password = validated_data.pop('password')

        # Pull out profile-specific fields before creating the User
        patient_fields   = {k: validated_data.pop(k) for k in ['goal', 'activity_level', 'mobility_status', 'focus_side', 'cue_style', 'care_path'] if k in validated_data}
        clinician_fields = {k: validated_data.pop(k) for k in ['license_number', 'specialty'] if k in validated_data}

        user = User.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            password=password,
            first_name=validated_data['first_name'],
            last_name=validated_data['last_name'],
            role=role,
        )

        if role == UserRole.PATIENT:
            PatientProfile.objects.create(user=user, **patient_fields)
        elif role == UserRole.CLINICIAN:
            ClinicianProfile.objects.create(user=user, **clinician_fields)

        return user


class LoginSerializer(serializers.Serializer):
    email    = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(username=data['email'], password=data['password'])
        if not user:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account is disabled.")
        data['user'] = user
        return data


class PatientProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model  = PatientProfile
        fields = [
            'id', 'user', 'goal', 'activity_level', 'mobility_status',
            'focus_side', 'cue_style', 'care_path',
            'height_cm', 'weight_kg', 'medical_history', 'low_risk_acknowledged',
            'primary_clinician', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


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

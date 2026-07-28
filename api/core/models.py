import uuid

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.utils.translation import gettext_lazy as _


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# ── User ──────────────────────────────────────────────────────

class UserRole(models.TextChoices):
    PATIENT   = "patient",   _("Patient")
    CLINICIAN = "clinician", _("Clinician")
    ADMIN     = "admin",     _("Admin")


class User(AbstractUser, TimestampedModel):
    """Single auth model for all personas; role drives which companion profile exists."""
    id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(
        max_length=10,
        choices=UserRole.choices,
        default=UserRole.PATIENT,
        db_index=True,
    )
    email         = models.EmailField(_("email address"), unique=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    phone         = models.CharField(max_length=30, blank=True)

    EMAIL_FIELD    = "email"
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username", "first_name", "last_name"]

    objects = UserManager()

    class Meta:
        db_table            = "core_user"
        ordering            = ["last_name", "first_name"]
        verbose_name        = _("user")
        verbose_name_plural = _("users")

    def __str__(self) -> str:
        full = self.get_full_name()
        return full.strip() if full.strip() else self.email

    @property
    def is_patient(self) -> bool:
        return self.role == UserRole.PATIENT

    @property
    def is_clinician(self) -> bool:
        return self.role == UserRole.CLINICIAN


class EmailVerification(TimestampedModel):
    """Short-lived, single-use email challenge; the plaintext code is never stored."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="email_verification",
    )
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)
    attempts_remaining = models.PositiveSmallIntegerField(default=5)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_emailverification"

    def __str__(self) -> str:
        return f"Email verification for {self.user.email}"


class LoginVerificationChallenge(TimestampedModel):
    """Short-lived, single-use second factor for a password-authenticated login."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="login_verification_challenge",
    )
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)
    attempts_remaining = models.PositiveSmallIntegerField(default=5)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_loginverificationchallenge"

    def __str__(self) -> str:
        return f"Login verification for {self.user.email}"


class PasswordResetChallenge(TimestampedModel):
    """Short-lived reset code and one-time reset token; neither is stored raw."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="password_reset_challenge",
    )
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)
    attempts_remaining = models.PositiveSmallIntegerField(default=5)
    verified_at = models.DateTimeField(null=True, blank=True)
    reset_token_hash = models.CharField(max_length=64, blank=True)
    reset_token_expires_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "core_passwordresetchallenge"

    def __str__(self) -> str:
        return f"Password reset for {self.user.email}"


# ── Patient Profile ───────────────────────────────────────────

class GoalChoice(models.TextChoices):
    STRONGER_KNEES = "stronger_knees", _("Stronger knees")
    BETTER_BALANCE = "better_balance", _("Better balance")
    LESS_STIFFNESS = "less_stiffness", _("Move with less stiffness")
    STAY_ACTIVE    = "stay_active",    _("Stay active")
    STRONGER_HIPS  = "stronger_hips",  _("Stronger hips")
    ANKLE_MOBILITY = "ankle_mobility", _("Better ankle movement")
    WALKING_CONFIDENCE = "walking_confidence", _("Walk with confidence")
    OTHER          = "other",          _("Other")


class ActivityLevel(models.TextChoices):
    LIGHTLY_ACTIVE = "lightly_active",   _("Lightly active")
    MOSTLY_SEATED  = "mostly_seated",    _("Mostly seated")
    ACTIVE_MOST    = "active_most_days", _("Active most days")


class MobilityStatus(models.TextChoices):
    INDEPENDENT  = "independent",  _("Independent")
    WALKING_AID  = "walking_aid",  _("Use a walking aid")
    NEEDS_PERSON = "needs_person", _("Need another person nearby")


class FocusSide(models.TextChoices):
    LEFT  = "left",  _("Left")
    RIGHT = "right", _("Right")
    BOTH  = "both",  _("Both")


class CueStyle(models.TextChoices):
    GENTLE   = "gentle",   _("Gentle and encouraging")
    DIRECT   = "direct",   _("Short and direct")
    DETAILED = "detailed", _("Explain each correction")


class CarePath(models.TextChoices):
    WELLNESS     = "wellness",     _("General wellness")
    CLINICIAN    = "clinician",    _("Physiotherapist-prescribed rehabilitation")
    NEEDS_REVIEW = "needs_review", _("Professional review needed")


class PatientPathwayChoice(models.TextChoices):
    UNSELECTED = "unselected", _("Not selected")
    PHYSIOTHERAPIST = "physiotherapist", _("Physiotherapist-assigned plan")
    WELLNESS = "wellness", _("General wellness")


class WellnessScreeningStatus(models.TextChoices):
    PENDING = "pending", _("Not completed")
    ELIGIBLE = "eligible", _("Eligible for general wellness")
    NEEDS_REVIEW = "needs_review", _("Professional review needed")


class PatientProfile(TimestampedModel):
    """Extended profile for users with role=PATIENT; created on patient registration."""
    id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="patient_profile",
        limit_choices_to={"role": UserRole.PATIENT},
    )
    goal            = models.CharField(max_length=30, choices=GoalChoice.choices, default=GoalChoice.STRONGER_KNEES)
    custom_goal     = models.CharField(max_length=120, blank=True)
    activity_level  = models.CharField(max_length=20, choices=ActivityLevel.choices, default=ActivityLevel.LIGHTLY_ACTIVE)
    mobility_status = models.CharField(max_length=25, choices=MobilityStatus.choices, default=MobilityStatus.INDEPENDENT)
    focus_side      = models.CharField(max_length=5, choices=FocusSide.choices, default=FocusSide.RIGHT)
    cue_style       = models.CharField(max_length=10, choices=CueStyle.choices, default=CueStyle.GENTLE)
    care_path       = models.CharField(max_length=12, choices=CarePath.choices, default=CarePath.WELLNESS)
    pathway_choice  = models.CharField(
        max_length=20,
        choices=PatientPathwayChoice.choices,
        default=PatientPathwayChoice.UNSELECTED,
    )
    pathway_selected_at = models.DateTimeField(null=True, blank=True)

    height_cm             = models.PositiveSmallIntegerField(null=True, blank=True)
    weight_kg             = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    medical_history       = models.TextField(blank=True)
    low_risk_acknowledged = models.BooleanField(default=False)
    wellness_screening_status = models.CharField(
        max_length=12,
        choices=WellnessScreeningStatus.choices,
        default=WellnessScreeningStatus.PENDING,
    )
    wellness_screening_answers = models.JSONField(default=dict, blank=True)
    wellness_screened_at = models.DateTimeField(null=True, blank=True)
    wellness_plan = models.JSONField(default=dict, blank=True)
    wellness_plan_accepted_at = models.DateTimeField(null=True, blank=True)

    # Null for wellness-path users who have no assigned clinician
    primary_clinician = models.ForeignKey(
        "core.ClinicianProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patients",
    )

    # Slack message timestamp of this patient's parent thread in the alerts
    # channel, so all Slack activity about them stays grouped in one thread.
    slack_thread_ts = models.CharField(max_length=32, blank=True, default="")

    class Meta:
        db_table            = "core_patientprofile"
        ordering            = ["user__last_name", "user__first_name"]
        indexes             = [
            models.Index(fields=["care_path"]),
            models.Index(fields=["primary_clinician"]),
        ]
        verbose_name        = _("patient profile")
        verbose_name_plural = _("patient profiles")

    def __str__(self) -> str:
        return f"Patient: {self.user}"


# ── Clinician Profile ─────────────────────────────────────────

class ClinicianProfile(TimestampedModel):
    """Extended profile for users with role=CLINICIAN; created on clinician registration."""
    id   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="clinician_profile",
        limit_choices_to={"role": UserRole.CLINICIAN},
    )
    license_number        = models.CharField(max_length=50)
    specialty             = models.CharField(max_length=100, blank=True)
    years_experience      = models.PositiveSmallIntegerField(null=True, blank=True)
    bio                   = models.TextField(blank=True)
    is_accepting_patients = models.BooleanField(default=True)

    class Meta:
        db_table            = "core_clinicianprofile"
        ordering            = ["user__last_name"]
        verbose_name        = _("clinician profile")
        verbose_name_plural = _("clinician profiles")

    def __str__(self) -> str:
        return f"Clinician: {self.user}"


class CareInvitation(TimestampedModel):
    """
    One-time pairing token created by a platform clinician.

    Only a SHA-256 digest is stored. The raw code is returned once at creation
    and must be shared by the clinician with the intended patient.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinician = models.ForeignKey(
        ClinicianProfile,
        on_delete=models.CASCADE,
        related_name="care_invitations",
    )
    code_digest = models.CharField(max_length=64, unique=True, editable=False)
    code_hint = models.CharField(max_length=4, editable=False)
    expires_at = models.DateTimeField()
    accepted_by = models.ForeignKey(
        PatientProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accepted_care_invitations",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "core_careinvitation"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["clinician", "is_active"],
                name="core_carein_clinici_a85527_idx",
            ),
            models.Index(
                fields=["expires_at"],
                name="core_carein_expires_41daf4_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"Care invitation …{self.code_hint} from {self.clinician.user}"

import uuid

from django.db import models
from django.utils.translation import gettext_lazy as _

from api.core.models import TimestampedModel, PatientProfile, ClinicianProfile


# ── Exercise Catalogue ────────────────────────────────────────

class ExerciseCategory(models.TextChoices):
    STRENGTHENING = "strengthening", _("Strengthening")
    STRETCH       = "stretch",       _("Stretch")
    MOBILITY      = "mobility",      _("Mobility")


class CameraDirection(models.TextChoices):
    FRONT = "front", _("Front")
    SIDE  = "side",  _("Side")


class AffectedSide(models.TextChoices):
    LEFT  = "left",  _("Left")
    RIGHT = "right", _("Right")


class Exercise(TimestampedModel):
    """
    Shared exercise catalogue. Each row mirrors one entry from exercises/registry.js.
    JSON fields preserve the exact shape the frontend consumes so the API can return
    them verbatim during the transition period.

    id is a human-readable slug (e.g. 'half-squats') matching the JS registry.
    """
    id               = models.CharField(max_length=60, primary_key=True)
    name             = models.CharField(max_length=120)
    category         = models.CharField(max_length=15, choices=ExerciseCategory.choices, db_index=True)
    camera_direction = models.CharField(max_length=10, choices=CameraDirection.choices, default=CameraDirection.FRONT)
    rep_rule         = models.CharField(max_length=120, help_text="e.g. 'standing → squat → standing'")

    default_sets          = models.PositiveSmallIntegerField(default=3)
    default_reps          = models.PositiveSmallIntegerField(default=10)
    default_hold_seconds  = models.PositiveSmallIntegerField(null=True, blank=True)
    default_days_per_week = models.CharField(max_length=10, default="4–5")

    phase_confirmation_ms = models.PositiveSmallIntegerField(null=True, blank=True)
    max_cues              = models.PositiveSmallIntegerField(null=True, blank=True)

    tracking_notes   = models.TextField(blank=True)
    tracking_warning = models.TextField(blank=True)

    # JSON config blobs — mirror exercises/registry.js shapes exactly
    tracked_angles_config = models.JSONField(
        help_text="Map of angle names to {points, side?}"
    )
    phases_config = models.JSONField(
        help_text="List of phase objects {name, angleKey: [min, max], ...}"
    )
    cues_config = models.JSONField(
        help_text="Map of condition strings to cue text"
    )
    calibration_config = models.JSONField(
        null=True, blank=True,
        help_text="Calibration block: {startPhase, targetPhase, captureKeys, personalizedKeys, toleranceDegrees, safeRanges, captureErrors}",
    )
    symmetry_config = models.JSONField(
        null=True, blank=True,
        help_text="{joint: str, maxDiffDeg: int}",
    )
    stage_images = models.JSONField(
        null=True, blank=True,
        help_text="Ordered list of pose image keys for the pose strip",
    )

    is_active  = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0, db_index=True)

    class Meta:
        db_table            = "catalogue_exercise"
        ordering            = ["sort_order", "name"]
        indexes             = [
            models.Index(fields=["category", "is_active"]),
        ]
        verbose_name        = _("exercise")
        verbose_name_plural = _("exercises")

    def __str__(self) -> str:
        return self.name


# ── Prescription ──────────────────────────────────────────────

class Prescription(TimestampedModel):
    """
    A clinician (or the system, for wellness-path patients) assigns an exercise
    to a patient with specific dose parameters.

    Only one active prescription per (patient, exercise) at a time — enforced by
    a partial unique constraint. Historical prescriptions are retained.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    patient   = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name="prescriptions")
    clinician = models.ForeignKey(
        ClinicianProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prescriptions",
        help_text="Null for self-assigned wellness-path prescriptions",
    )
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="prescriptions")

    sets          = models.PositiveSmallIntegerField()
    reps          = models.PositiveSmallIntegerField()
    hold_seconds  = models.PositiveSmallIntegerField(null=True, blank=True)
    days_per_week = models.CharField(max_length=10)
    notes         = models.TextField(blank=True)

    is_active   = models.BooleanField(default=True, db_index=True)
    valid_from  = models.DateField()
    valid_until = models.DateField(null=True, blank=True)

    class Meta:
        db_table  = "catalogue_prescription"
        ordering  = ["-valid_from"]
        indexes   = [
            models.Index(fields=["patient", "exercise", "is_active"]),
            models.Index(fields=["clinician"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "exercise"],
                condition=models.Q(is_active=True),
                name="unique_active_prescription_per_patient_exercise",
            )
        ]
        verbose_name        = _("prescription")
        verbose_name_plural = _("prescriptions")

    def __str__(self) -> str:
        return f"{self.patient.user} — {self.exercise} ({self.sets}×{self.reps})"


# ── Calibration ───────────────────────────────────────────────

class Calibration(TimestampedModel):
    """
    Per-user, per-exercise personalisation data promoted from localStorage.

    start_measurements and target_measurements mirror personalization.js summariseFrames()
    output: {key: {median, variability, sampleCount/repetitions}}.
    phase_ranges mirrors createCalibration(): {phaseName: {key: [lo, hi]}}.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    patient       = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name="calibrations")
    exercise      = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="calibrations")
    version       = models.PositiveSmallIntegerField(default=1)
    affected_side = models.CharField(max_length=5, choices=AffectedSide.choices)
    captured_at   = models.DateTimeField()

    start_measurements  = models.JSONField(
        help_text="{key: {median: float, variability: float, sampleCount: int}}"
    )
    target_measurements = models.JSONField(
        help_text="{key: {median: float, variability: float, repetitions: int}}"
    )
    phase_ranges = models.JSONField(
        help_text="{phaseName: {key: [min_angle, max_angle]}}"
    )
    natural_knee_difference = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True,
    )

    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table  = "catalogue_calibration"
        ordering  = ["-captured_at"]
        indexes   = [
            models.Index(fields=["patient", "exercise", "is_active"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "exercise"],
                condition=models.Q(is_active=True),
                name="unique_active_calibration_per_patient_exercise",
            )
        ]
        verbose_name        = _("calibration")
        verbose_name_plural = _("calibrations")

    def __str__(self) -> str:
        return (
            f"Calibration: {self.patient.user} / {self.exercise} "
            f"({self.affected_side} side, {self.captured_at:%Y-%m-%d})"
        )

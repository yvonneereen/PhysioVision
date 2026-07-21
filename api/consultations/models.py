import uuid

from django.db import models
from django.utils.translation import gettext_lazy as _

from api.core.models import TimestampedModel, ClinicianProfile, PatientProfile
from api.sessions.models import Session


class ConsultationStatus(models.TextChoices):
    REQUESTED = "requested", _("Requested")
    CONFIRMED = "confirmed", _("Confirmed")
    COMPLETED = "completed", _("Completed")
    CANCELLED = "cancelled", _("Cancelled")
    NO_SHOW   = "no_show",   _("No show")


class Consultation(TimestampedModel):
    """
    Video consultation booking between a patient and their physiotherapist.
    Maps to the booking-modal flow in index.html.

    video_link is populated by an external scheduling service when the booking is confirmed.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    patient   = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name="consultations")
    clinician = models.ForeignKey(ClinicianProfile, on_delete=models.CASCADE, related_name="consultations")

    scheduled_at     = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=30)
    status           = models.CharField(
        max_length=15,
        choices=ConsultationStatus.choices,
        default=ConsultationStatus.REQUESTED,
        db_index=True,
    )

    patient_notes   = models.TextField(blank=True)
    clinician_notes = models.TextField(blank=True)
    video_link      = models.URLField(max_length=500, blank=True)

    class Meta:
        db_table  = "consultations_consultation"
        ordering  = ["-scheduled_at"]
        indexes   = [
            models.Index(fields=["patient", "scheduled_at"]),
            models.Index(fields=["clinician", "scheduled_at"]),
            models.Index(fields=["status"]),
        ]
        verbose_name        = _("consultation")
        verbose_name_plural = _("consultations")

    def __str__(self) -> str:
        return (
            f"{self.patient.user} ↔ {self.clinician.user} "
            f"@ {self.scheduled_at:%Y-%m-%d %H:%M} [{self.status}]"
        )


# ── Escalation ────────────────────────────────────────────────

class EscalationTrigger(models.TextChoices):
    QUALITY_DECLINE  = "quality_decline",  _("Movement quality declining")
    SYMMETRY_CONCERN = "symmetry_concern", _("Persistent symmetry imbalance")
    MISSED_SESSIONS  = "missed_sessions",  _("Repeated missed sessions")
    PAIN_INCREASE    = "pain_increase",    _("Pain level rising")
    MANUAL           = "manual",           _("Manually flagged by clinician")


class EscalationStatus(models.TextChoices):
    OPEN         = "open",         _("Open — awaiting review")
    REVIEWED     = "reviewed",     _("Reviewed")
    DISMISSED    = "dismissed",    _("Dismissed")
    ACTION_TAKEN = "action_taken", _("Action taken")


class Escalation(TimestampedModel):
    """
    Flags a patient for clinician review when the system detects a concerning trend
    or a clinician raises one manually. Maps to the 'Review suggested' dashboard widget.

    reviewed_by is a second FK to ClinicianProfile so a supervisor can review an
    escalation raised about a different clinician's patient.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    patient   = models.ForeignKey(PatientProfile, on_delete=models.CASCADE, related_name="escalations")
    clinician = models.ForeignKey(
        ClinicianProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="escalations_assigned",
        help_text="Clinician who should review; null means unassigned",
    )

    trigger_type = models.CharField(max_length=20, choices=EscalationTrigger.choices, db_index=True)
    description  = models.TextField()

    session = models.ForeignKey(
        Session,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="escalations",
    )

    status      = models.CharField(
        max_length=15,
        choices=EscalationStatus.choices,
        default=EscalationStatus.OPEN,
        db_index=True,
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        ClinicianProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="escalations_reviewed",
    )

    class Meta:
        db_table  = "consultations_escalation"
        ordering  = ["-created_at"]
        indexes   = [
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["clinician", "status"]),
        ]
        verbose_name        = _("escalation")
        verbose_name_plural = _("escalations")

    def __str__(self) -> str:
        return f"Escalation [{self.trigger_type}] for {self.patient.user} — {self.status}"

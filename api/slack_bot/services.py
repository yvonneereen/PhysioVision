import logging
from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)


def _get_slack_client():
    from slack_sdk import WebClient
    return WebClient(token=settings.SLACK_BOT_TOKEN)


def _gemini_generate(prompt):
    """Single Gemini call using the configured model (shared with core/ai.py)."""
    from google import genai
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    interaction = client.interactions.create(
        model=settings.GEMINI_MODEL,
        input=prompt,
    )
    return interaction.output_text


# Unicode blocks for compact inline trend sparklines (renders natively in Slack).
_SPARK_TICKS = "▁▂▃▄▅▆▇█"


def _sparkline(values, lo=0, hi=100):
    """Render a list of numbers as a unicode sparkline over a fixed [lo, hi] range."""
    nums = [float(v) for v in values if v is not None]
    if not nums:
        return "—"
    span = (hi - lo) or 1
    ticks = []
    for n in nums:
        idx = int((max(lo, min(hi, n)) - lo) / span * (len(_SPARK_TICKS) - 1))
        ticks.append(_SPARK_TICKS[idx])
    return "".join(ticks)


TRIGGER_LABELS = {
    'quality_decline':   'Quality decline',
    'symmetry_concern':  'Symmetry concern',
    'missed_sessions':   'Missed sessions',
    'pain_increase':     'Pain increase',
    'manual':            'Manual flag',
}


# ── Proactive alerts ──────────────────────────────────────────

def on_escalation_created(sender, instance, created, **kwargs):
    if not created or instance.status != 'open':
        return
    try:
        _post_escalation_alert(instance)
    except Exception:
        logger.exception("Slack alert failed for escalation %s", instance.id)


def _channel():
    return getattr(settings, 'SLACK_CHANNEL_ID', '#physiovision-alerts')


def _patient_name(patient):
    return f"{patient.user.first_name} {patient.user.last_name}".strip() or patient.user.email


def post_in_patient_thread(patient, *, text=None, blocks=None):
    """
    Post a message into the patient's dedicated thread in the single alerts
    channel. Lazily creates the parent thread message the first time and stores
    its timestamp on the profile, so all activity about a patient stays grouped.
    """
    if not getattr(settings, 'SLACK_BOT_TOKEN', ''):
        return None

    client = _get_slack_client()
    channel = _channel()

    if not patient.slack_thread_ts:
        parent = client.chat_postMessage(
            channel=channel,
            text=f":thread: Patient thread — {_patient_name(patient)}",
        )
        patient.slack_thread_ts = parent.get("ts", "")
        patient.save(update_fields=["slack_thread_ts", "updated_at"])

    return client.chat_postMessage(
        channel=channel,
        thread_ts=patient.slack_thread_ts or None,
        text=text,
        blocks=blocks,
    )


def _post_escalation_alert(escalation):
    if not getattr(settings, 'SLACK_BOT_TOKEN', ''):
        return

    patient    = escalation.patient
    name       = _patient_name(patient)
    trigger    = TRIGGER_LABELS.get(escalation.trigger_type, escalation.trigger_type)
    frontend   = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')

    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f":rotating_light: *New escalation — {name}*\n*Trigger:* {trigger}\n{escalation.description}",
            },
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Open dashboard"},
                    "url": frontend,
                    "style": "primary",
                }
            ],
        },
    ]

    post_in_patient_thread(
        patient,
        blocks=blocks,
        text=f"New escalation for {name}: {trigger}",
    )


# ── Daily digest ──────────────────────────────────────────────

def refresh_all_escalations():
    """
    Re-run the escalation rules for every patient. Catches the time-based rules
    (missed sessions) that have no save event to hang a signal off. Returns the
    count of newly created escalations.
    """
    from api.consultations.escalation_service import evaluate_patient_escalations
    from api.core.models import PatientProfile

    total = 0
    for patient in PatientProfile.objects.select_related('user').prefetch_related(
        'sessions', 'prescriptions', 'escalations', 'pain_checkins'
    ):
        total += len(evaluate_patient_escalations(patient))
    return total


def send_daily_digest():
    from api.consultations.models import Escalation
    from api.core.analytics import adherence_pct
    from api.core.models import PatientProfile
    from api.sessions.models import PainCheckin, Session

    # Detect time-based escalations (missed sessions) before summarising.
    refresh_all_escalations()

    if not getattr(settings, 'SLACK_BOT_TOKEN', ''):
        logger.warning("SLACK_BOT_TOKEN not configured — skipping digest")
        return

    yesterday = timezone.now() - timedelta(hours=24)

    open_escalations   = Escalation.objects.filter(status='open').select_related('patient__user')
    sessions_yesterday = Session.objects.filter(started_at__gte=yesterday).select_related('patient__user', 'exercise')
    high_pain          = PainCheckin.objects.filter(checked_at__gte=yesterday, pain_level__gte=7).select_related('patient__user')

    flagged_ids = set(open_escalations.values_list('patient_id', flat=True))
    all_patients = list(PatientProfile.objects.prefetch_related('sessions', 'prescriptions'))
    on_track = [p for p in all_patients if p.id not in flagged_ids]

    lines = [f":sun_with_face: *PhysioVision daily digest — {timezone.now().strftime('%A, %d %B')}*\n"]

    lines.append(f"*Open escalations:* {open_escalations.count()}")
    for esc in open_escalations[:5]:
        name = _patient_name(esc.patient)
        lines.append(f"  • {name} — {TRIGGER_LABELS.get(esc.trigger_type, esc.trigger_type)}")

    lines.append(f"\n*Sessions in last 24h:* {sessions_yesterday.count()}")
    for s in sessions_yesterday[:5]:
        name = _patient_name(s.patient)
        lines.append(f"  • {name} — {s.exercise.name} ({s.reps_completed}/{s.reps_target} reps)")

    if high_pain.exists():
        lines.append(f"\n*:warning: High pain reports (≥7):*")
        for pc in high_pain[:5]:
            name = _patient_name(pc.patient)
            lines.append(f"  • {name} — {pc.pain_level}/10{(' · ' + pc.location_notes) if pc.location_notes else ''}")

    # Adherence laggards (below 50%, excluding those already flagged).
    laggards = [
        (p, adherence_pct(p)) for p in on_track
        if (a := adherence_pct(p)) is not None and a < 50
    ]
    if laggards:
        lines.append("\n*:chart_with_downwards_trend: Adherence laggards:*")
        for p, a in laggards[:5]:
            lines.append(f"  • {_patient_name(p)} — {a}% of prescribed sessions")

    lines.append(f"\n:white_check_mark: *{len(on_track)} patient(s) on track* (no open flags).")

    client = _get_slack_client()
    client.chat_postMessage(channel=_channel(), text="\n".join(lines))
    logger.info("Daily digest sent")


# ── On-demand patient summary blocks ─────────────────────────

def build_patient_summary_blocks(patient):
    from api.core.analytics import adherence_pct
    from api.sessions.models import Session

    name       = _patient_name(patient)
    last_7d    = timezone.now() - timedelta(days=7)
    sessions   = Session.objects.filter(patient=patient, started_at__gte=last_7d).order_by('-started_at')[:5]
    pain_log   = patient.pain_checkins.order_by('-checked_at').first()

    # Trend sparklines over the last ~8 sessions (oldest → newest).
    recent = list(
        Session.objects.filter(patient=patient).order_by('-started_at')[:8]
    )[::-1]
    quality_spark = _sparkline([s.quality_score for s in recent], lo=0, hi=100)
    pain_spark    = _sparkline([s.pain_level for s in recent], lo=0, hi=10)
    adherence     = adherence_pct(patient)

    lines = [f"*Patient summary: {name}*"]
    lines.append(f"Goal: {patient.goal or '—'} | Care path: {patient.care_path or '—'}")
    lines.append(
        f"Quality `{quality_spark}` · Pain `{pain_spark}` · "
        f"Adherence {adherence if adherence is not None else '—'}%"
    )

    if sessions:
        lines.append(f"\n*Last {sessions.count()} session(s) this week:*")
        for s in sessions:
            lines.append(f"  • {s.exercise.name}: {s.reps_completed}/{s.reps_target} reps, quality {s.quality_score or '—'}/100")
    else:
        lines.append("\nNo sessions in the last 7 days.")

    if pain_log:
        lines.append(f"\n*Latest pain check-in:* {pain_log.pain_level}/10 ({pain_log.checked_at.strftime('%d %b')})")

    open_escs = patient.escalations.filter(status='open')
    if open_escs.exists():
        lines.append(f"\n:rotating_light: *{open_escs.count()} open escalation(s)*")

    return [{"type": "section", "text": {"type": "mrkdwn", "text": "\n".join(lines)}}]


def build_roster_summary_blocks():
    """
    Whole-roster scan — the 'check everyone at once' view. NOTE: Slack mentions are
    not authenticated to a specific clinician, so this covers all patients in the DB
    (fine for a single-clinic deployment).
    """
    from api.core.analytics import adherence_pct, session_quality_trend
    from api.core.models import PatientProfile

    patients = list(
        PatientProfile.objects.select_related('user').prefetch_related(
            'sessions', 'prescriptions', 'escalations'
        )
    )
    if not patients:
        return [{"type": "section", "text": {"type": "mrkdwn", "text": "No patients on record."}}]

    needs_attention = []
    on_track = 0
    adherences = []
    for p in patients:
        a = adherence_pct(p)
        if a is not None:
            adherences.append(a)
        open_count = p.escalations.filter(status='open').count()
        declining = session_quality_trend(p) == 'declining'
        if open_count or declining:
            reason = "open flag" if open_count else "declining trend"
            needs_attention.append(f"  • {_patient_name(p)} — {reason}")
        else:
            on_track += 1

    avg_adherence = round(sum(adherences) / len(adherences)) if adherences else None

    lines = [f":clipboard: *Roster summary — {len(patients)} patient(s)*"]
    lines.append(
        f"Needs attention: *{len(needs_attention)}* · On track: *{on_track}* · "
        f"Avg adherence: {avg_adherence if avg_adherence is not None else '—'}%"
    )
    if needs_attention:
        lines.append("\n*Needs attention:*")
        lines.extend(needs_attention[:10])
    else:
        lines.append("\n:white_check_mark: Everyone is on track.")

    return [{"type": "section", "text": {"type": "mrkdwn", "text": "\n".join(lines)}}]


def find_patient_by_name(name_query):
    from api.core.models import PatientProfile

    parts = name_query.strip().split()
    if not parts:
        return None
    name_filter = Q()
    for part in parts:
        name_filter |= Q(user__first_name__icontains=part) | Q(user__last_name__icontains=part)
    return (
        PatientProfile.objects
        .select_related('user')
        .prefetch_related('sessions', 'pain_checkins', 'escalations')
        .filter(name_filter)
        .first()
    )


# ── Draft a patient-facing message (draft-only for now) ───────

def generate_patient_message(patient):
    """
    Draft a short, warm message to the patient (e.g. an encouragement / adherence
    nudge). Draft-only: the therapist copies it out. A future version will email it.
    """
    if not getattr(settings, 'GEMINI_API_KEY', ''):
        return "GEMINI_API_KEY not configured — cannot draft a message."

    from api.core.analytics import adherence_pct, session_quality_trend

    name = patient.user.first_name or "there"
    trend = session_quality_trend(patient)
    adherence = adherence_pct(patient)
    prompt = (
        "You are a physiotherapist's assistant drafting a short, warm, encouraging "
        "message to an older-adult rehab patient. 2-4 sentences, plain language, no "
        "medical advice or prescription changes. Acknowledge their effort and gently "
        "encourage consistency.\n\n"
        f"Patient first name: {name}\n"
        f"Recent movement-quality trend: {trend}\n"
        f"Adherence to prescribed sessions: "
        f"{adherence if adherence is not None else 'unknown'}%\n"
    )
    return _gemini_generate(prompt)


# ── Schedule a consultation from Slack ────────────────────────

def schedule_consultation(patient, when_text):
    """
    Create a Consultation for the patient with their primary clinician.
    Runs server-side, so the patient-only API restriction does not apply.
    Returns (consultation, error_message).
    """
    from api.consultations.models import (
        Consultation,
        ConsultationInitiator,
        ConsultationStatus,
    )

    if patient.primary_clinician is None:
        return None, "This patient has no linked clinician to book with."

    scheduled_at = _parse_when(when_text)
    if scheduled_at is None:
        return None, f"Could not understand the time '{when_text}'. Try e.g. 'Thursday 3pm'."

    # Clinician suggests the time; it awaits the patient's acceptance.
    consultation = Consultation.objects.create(
        patient=patient,
        clinician=patient.primary_clinician,
        scheduled_at=scheduled_at,
        status=ConsultationStatus.REQUESTED,
        initiated_by=ConsultationInitiator.CLINICIAN,
    )
    return consultation, None


def _parse_when(when_text):
    """Best-effort natural-time parsing; returns an aware datetime or None."""
    try:
        from dateutil import parser as date_parser
    except ImportError:
        return None
    try:
        dt = date_parser.parse(when_text, fuzzy=True, default=timezone.localtime())
    except (ValueError, OverflowError):
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


# ── Draft clinical note via Gemini ────────────────────────────

def generate_clinical_note(session):
    if not getattr(settings, 'GEMINI_API_KEY', ''):
        return "GEMINI_API_KEY not configured — cannot generate note."

    prompt = f"""Draft a structured physiotherapy session note from this data.

Exercise: {session.exercise.name}
Date: {session.started_at.strftime('%Y-%m-%d')}
Sets completed: {session.sets_completed}/{session.sets_target}
Reps completed: {session.reps_completed}/{session.reps_target}
Quality score: {session.quality_score}/100
Pain level reported: {session.pain_level}/10
Movement angle summaries: {session.angle_summaries}
Coaching cues triggered: {session.cues_triggered}
Symmetry warnings: {session.symmetry_warnings_count}

Write a concise SOAP-format note (Subjective, Objective, Assessment, Plan) \
suitable for a clinical record. Be specific about angles and quality metrics. \
Keep it under 200 words."""

    return _gemini_generate(prompt)

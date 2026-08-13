"""Evidence summaries for unassigned physiotherapist requests.

The triage queue must help a clinician understand why a patient may need a
review without turning wellness measurements into a diagnosis.  Everything in
this module is deterministic and comes from records already saved for the
patient; missing data is reported as missing rather than inferred.
"""

from __future__ import annotations

from statistics import mean

from api.consultations.models import (
    EscalationStatus,
    EscalationTrigger,
)
from api.sessions.models import RecoveryStatus


LOW_MOVEMENT_QUALITY = 60.0
SIGNIFICANT_QUALITY_CHANGE = 5.0


def _number(value):
    if value is None:
        return None
    numeric = float(value)
    return int(numeric) if numeric.is_integer() else round(numeric, 1)


def _iso(value):
    return value.isoformat() if value else None


def _request_reason(patient):
    if patient.physiotherapist_requested_at:
        return (
            "The patient requested physiotherapist support while continuing "
            "their existing wellness plan."
        )
    return "The patient selected physiotherapist-guided care during setup."


def _pain_summary(checkins):
    if not checkins:
        return None

    latest = checkins[0]
    previous = checkins[1] if len(checkins) > 1 else None
    change = (
        latest.pain_level - previous.pain_level
        if previous is not None
        else None
    )
    if change is None:
        trend = "first_recording"
    elif change > 0:
        trend = "rising"
    elif change < 0:
        trend = "falling"
    else:
        trend = "unchanged"
    return {
        "value": latest.pain_level,
        "previous_value": previous.pain_level if previous else None,
        "change": change,
        "trend": trend,
        "location": latest.location_notes,
        "timing": latest.timing,
        "checked_at": _iso(latest.checked_at),
    }


def _recovery_summary(checkins):
    recorded = [checkin for checkin in checkins if checkin.recovery_status]
    if not recorded:
        return None
    latest = recorded[0]
    worse_count = sum(
        checkin.recovery_status == RecoveryStatus.WORSE
        for checkin in recorded
    )
    return {
        "status": latest.recovery_status,
        "worse_count": worse_count,
        "observations": len(recorded),
        "checked_at": _iso(latest.checked_at),
    }


def _quality_summary(sessions):
    measured = [
        session for session in sessions
        if session.ended_at is not None and session.quality_score is not None
    ]
    if not measured:
        return None

    grouped = {}
    for session in measured:
        grouped.setdefault(
            (session.exercise_id, session.affected_side),
            [],
        ).append(session)

    summaries = []
    for comparable in grouped.values():
        comparable = comparable[:5]
        latest = comparable[0]
        newest_value = float(latest.quality_score)
        oldest_value = (
            float(comparable[-1].quality_score)
            if len(comparable) > 1
            else None
        )
        change = newest_value - oldest_value if oldest_value is not None else None
        if change is None:
            trend = "not_enough_data"
        elif change <= -SIGNIFICANT_QUALITY_CHANGE:
            trend = "declining"
        elif change >= SIGNIFICANT_QUALITY_CHANGE:
            trend = "improving"
        else:
            trend = "stable"
        values = [float(session.quality_score) for session in comparable]
        summaries.append({
            "value": _number(latest.quality_score),
            "average": _number(mean(values)),
            "previous_value": _number(oldest_value),
            "change": _number(change),
            "trend": trend,
            "exercise": latest.exercise.name,
            "exercise_id": latest.exercise_id,
            "side": latest.affected_side,
            "comparable_sessions": len(comparable),
            "low_sessions": sum(
                value < LOW_MOVEMENT_QUALITY for value in values
            ),
            "measured_at": _iso(latest.started_at),
        })

    # A newer one-off measurement must not hide a repeated problem in another
    # exercise. Prefer the strongest comparable concern, then the latest group.
    declining = [item for item in summaries if item["trend"] == "declining"]
    if declining:
        return min(declining, key=lambda item: item["change"])
    repeatedly_low = [item for item in summaries if item["low_sessions"] >= 2]
    if repeatedly_low:
        return min(
            repeatedly_low,
            key=lambda item: (-item["low_sessions"], item["average"]),
        )
    return summaries[0]


def _safety_signal(checkins):
    review = next(
        (
            checkin for checkin in checkins
            if checkin.requires_review
            or (checkin.safety_follow_up or {}).get("outcome")
            in {"urgent", "professional"}
        ),
        None,
    )
    if review is None:
        return None
    safety = review.safety_follow_up or {}
    outcome = safety.get("outcome")
    outcome_label = {
        "urgent": "The saved safety check advised stopping and seeking urgent help.",
        "professional": "The saved safety check advised professional review before continuing.",
    }.get(outcome, "A saved pain check-in was marked for professional review.")
    location = review.location_notes.strip()
    return {
        "kind": "safety",
        "severity": "high",
        "label": "Safety follow-up needs review",
        "detail": f"{outcome_label}{f' Reported area: {location}.' if location else ''}",
        "recorded_at": _iso(review.checked_at),
    }


def _screening_signal(patient):
    if patient.wellness_screening_status != "needs_review":
        return None
    answers = patient.wellness_screening_answers or {}
    reason_by_key = {
        "not_treating_condition": "may be treating a condition, injury, or recent surgery",
        "no_clinician_restrictions": "may have clinician-provided exercise restrictions",
        "general_wellness_goal": "reported a goal that may need rehabilitation rather than general wellness",
        "no_concerning_symptoms": "reported possible new or concerning symptoms",
    }
    reasons = [
        description for key, description in reason_by_key.items()
        if answers.get(key) is False
    ]
    detail = (
        "The patient " + "; and ".join(reasons) + "."
        if reasons
        else "The saved wellness safety screen requires professional review."
    )
    return {
        "kind": "screening",
        "severity": (
            "high"
            if answers.get("no_concerning_symptoms") is False
            else "attention"
        ),
        "label": "Wellness safety screen needs review",
        "detail": detail,
        "recorded_at": _iso(patient.wellness_screened_at),
    }


def _pain_signal(pain):
    if not pain:
        return None
    latest = pain["value"]
    change = pain["change"]
    location = f" · {pain['location']}" if pain["location"] else ""
    if latest >= 7:
        change_text = (
            f", up {change} from the previous check-in"
            if change is not None and change > 0
            else ""
        )
        return {
            "kind": "pain",
            "severity": "high",
            "label": "High latest pain report",
            "detail": f"Latest pain is {latest}/10{change_text}{location}.",
            "recorded_at": pain["checked_at"],
        }
    if change is not None and change > 0:
        return {
            "kind": "pain",
            "severity": "attention" if change < 3 else "high",
            "label": "Pain increased",
            "detail": (
                f"Pain rose from {pain['previous_value']}/10 to "
                f"{latest}/10{location}."
            ),
            "recorded_at": pain["checked_at"],
        }
    return None


def _recovery_signal(recovery):
    if not recovery or recovery["worse_count"] == 0:
        return None
    repeated = recovery["worse_count"] >= 2
    return {
        "kind": "recovery",
        "severity": "high" if repeated else "attention",
        "label": (
            "Repeatedly reported feeling worse"
            if repeated
            else "Reported feeling worse"
        ),
        "detail": (
            f"The patient reported feeling worse in {recovery['worse_count']} "
            f"of {recovery['observations']} recent recovery check-ins."
        ),
        "recorded_at": recovery["checked_at"],
    }


def _quality_signal(quality):
    if not quality:
        return None
    declining = quality["trend"] == "declining"
    repeatedly_low = quality["low_sessions"] >= 2
    if not declining and not repeatedly_low:
        return None
    if declining:
        label = "Same-exercise movement quality declined"
        detail = (
            f"{quality['exercise']} ({quality['side']} side) changed from "
            f"{quality['previous_value']}/100 to {quality['value']}/100 across "
            f"{quality['comparable_sessions']} comparable sessions."
        )
    else:
        label = "Repeated low movement-quality measurements"
        detail = (
            f"{quality['low_sessions']} of {quality['comparable_sessions']} "
            f"comparable {quality['exercise']} sessions were below "
            f"{int(LOW_MOVEMENT_QUALITY)}/100."
        )
    return {
        "kind": "quality",
        "severity": "attention",
        "label": label,
        "detail": detail,
        "recorded_at": quality["measured_at"],
    }


def _open_escalation_signals(escalations, existing_kinds):
    kind_by_trigger = {
        EscalationTrigger.PAIN_INCREASE: "pain",
        EscalationTrigger.QUALITY_DECLINE: "quality",
        EscalationTrigger.SYMMETRY_CONCERN: "symmetry",
        EscalationTrigger.MISSED_SESSIONS: "attendance",
        EscalationTrigger.MANUAL: "clinician_flag",
    }
    signals = []
    for escalation in escalations:
        kind = kind_by_trigger.get(escalation.trigger_type, "review_flag")
        if kind in existing_kinds:
            continue
        signals.append({
            "kind": kind,
            "severity": "attention",
            "label": str(escalation.get_trigger_type_display()),
            "detail": escalation.description.strip() or "An open review flag is recorded.",
            "recorded_at": _iso(escalation.created_at),
        })
        existing_kinds.add(kind)
    return signals


def build_triage_review_summary(patient):
    """Return display-safe, recorded evidence for one triage request."""

    checkins = list(patient.pain_checkins.all()[:8])
    sessions = list(
        patient.sessions.select_related("exercise").all()[:20]
    )
    escalations = list(
        patient.escalations.filter(status=EscalationStatus.OPEN)[:6]
    )

    pain = _pain_summary(checkins)
    recovery = _recovery_summary(checkins)
    quality = _quality_summary(sessions)
    signals = [
        signal for signal in (
            _safety_signal(checkins),
            _screening_signal(patient),
            _pain_signal(pain),
            _recovery_signal(recovery),
            _quality_signal(quality),
        )
        if signal is not None
    ]
    existing_kinds = {signal["kind"] for signal in signals}
    signals.extend(_open_escalation_signals(escalations, existing_kinds))
    signals.sort(key=lambda signal: 0 if signal["severity"] == "high" else 1)

    has_measurements = bool(checkins or sessions or escalations)
    if signals:
        evidence_status = "recorded_concerns"
    elif has_measurements:
        evidence_status = "no_worsening_recorded"
    else:
        evidence_status = "limited_data"

    recorded_times = [
        item for item in (
            pain and pain["checked_at"],
            quality and quality["measured_at"],
            _iso(escalations[0].created_at) if escalations else None,
        )
        if item
    ]
    return {
        "evidence_status": evidence_status,
        "request_reason": _request_reason(patient),
        "concern_count": len(signals),
        "high_concern_count": sum(
            signal["severity"] == "high" for signal in signals
        ),
        "latest_recorded_at": max(recorded_times) if recorded_times else None,
        "pain": pain,
        "recovery": recovery,
        "movement_quality": quality,
        "patient_reported_background": patient.medical_history.strip(),
        "signals": signals,
    }

"""
Shared patient-analytics helpers.

These were originally inlined in PatientListSerializer. They are factored out here
so the escalation rule engine (api/consultations/escalation_service.py) and the
Slack digest can reuse the exact same trend/adherence definitions the dashboard shows.
"""
import re
from datetime import timedelta

from django.utils import timezone

# How much the mean-angle scalar must move between the oldest and newest of the
# last few sessions before we call it a real trend rather than noise.
TREND_DELTA = 5
ADHERENCE_LOOKBACK_DAYS = 7


def parse_days_per_week(value):
    """Parse '4–5' or '4-5' or '4' → int lower bound (defaults to 1)."""
    try:
        return int(re.split(r'[–\-]', str(value))[0])
    except (ValueError, TypeError):
        return 1


def session_quality_trend(patient):
    """
    Return 'improving' | 'stable' | 'declining' from the last 3 sessions'
    angle_summaries (mean of all per-angle means). Mirrors the dashboard trend.
    """
    sessions = [
        s for s in patient.sessions.order_by('-started_at')[:3]
        if s.angle_summaries
    ]
    if len(sessions) < 2:
        return 'stable'

    def session_scalar(s):
        means = [
            v['mean'] for v in s.angle_summaries.values()
            if isinstance(v, dict) and 'mean' in v
        ]
        return sum(means) / len(means) if means else 0

    scalars = [session_scalar(s) for s in reversed(sessions)]  # oldest → newest
    delta = scalars[-1] - scalars[0]
    if delta > TREND_DELTA:
        return 'improving'
    if delta < -TREND_DELTA:
        return 'declining'
    return 'stable'


def adherence_pct(patient):
    """
    Sessions in the last 7 days vs the highest prescribed days/week, capped at 100.
    Returns None when the patient has no active prescription.
    """
    prescriptions = [p for p in patient.prescriptions.all() if p.is_active]
    if not prescriptions:
        return None
    week_ago = timezone.now() - timedelta(days=ADHERENCE_LOOKBACK_DAYS)
    sessions_last_7d = patient.sessions.filter(started_at__gte=week_ago).count()
    target = max(parse_days_per_week(p.days_per_week) for p in prescriptions)
    return min(100, round(sessions_last_7d / target * 100)) if target else None

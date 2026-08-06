export const PROVISIONAL_TREND_THRESHOLDS = Object.freeze({
  qualityDeclinePoints: 8,
  painIncreasePoints: 2,
  minimumReadings: 3,
});

export function isClinicianGuidedProfile(profile = {}) {
  const pathwayChoice =
    profile.pathway_choice ?? profile.pathwayChoice ?? "unselected";
  const carePath = profile.care_path ?? profile.carePath;
  return Boolean(
    pathwayChoice === "physiotherapist"
      || carePath === "clinician"
      || profile.primary_clinician
      || profile.primaryClinician,
  );
}

export function isPhysiotherapistRequestPending(profile = {}) {
  const requestedAt =
    profile.physiotherapist_requested_at
    ?? profile.physiotherapistRequestedAt;
  return Boolean(requestedAt) && !isClinicianGuidedProfile(profile);
}

export function shouldShowPhysiotherapistRequest(profile = {}) {
  const medicalHistory =
    profile.medical_history
    ?? profile.medicalHistory
    ?? "";
  const hasMedicalCondition = Boolean(
    String(medicalHistory).trim()
      || profile.has_relevant_history
      || profile.hasRelevantHistory,
  );
  return !isClinicianGuidedProfile(profile) && !hasMedicalCondition;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function newestFirst(items, dateField) {
  return [...(Array.isArray(items) ? items : [])].sort(
    (a, b) => new Date(b?.[dateField] ?? 0) - new Date(a?.[dateField] ?? 0),
  );
}

function average(values) {
  const numeric = values.map(number).filter((value) => value !== null);
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function differenceNewestToOldest(values) {
  const numeric = values.map(number).filter((value) => value !== null);
  if (numeric.length < PROVISIONAL_TREND_THRESHOLDS.minimumReadings) return null;
  return numeric[0] - numeric[numeric.length - 1];
}

export function analysePatientTrend({
  sessions = [],
  painCheckins = [],
  escalations = [],
  now = new Date(),
} = {}) {
  const sortedSessions = newestFirst(sessions, "started_at");
  const recentSessions = sortedSessions.slice(0, 7);
  const recentPain = newestFirst(painCheckins, "checked_at").slice(0, 7);
  const qualityValues = recentSessions
    .map((session) => number(session.quality_score))
    .filter((value) => value !== null);
  const painValues = recentPain
    .map((checkin) => number(checkin.pain_level))
    .filter((value) => value !== null);
  const qualityDelta = differenceNewestToOldest(qualityValues.slice(0, 3));
  const painDelta = differenceNewestToOldest(painValues.slice(0, 3));
  const openEscalation = newestFirst(escalations, "created_at").find(
    (item) => item.status === "open",
  );
  const repeatedWorseRecovery =
    recentPain
      .slice(0, 3)
      .filter((checkin) => checkin.recovery_status === "worse").length >= 2;
  const qualityDeclining =
    qualityDelta !== null &&
    qualityDelta <= -PROVISIONAL_TREND_THRESHOLDS.qualityDeclinePoints;
  const painIncreasing =
    painDelta !== null &&
    painDelta >= PROVISIONAL_TREND_THRESHOLDS.painIncreasePoints;

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const sessionsThisWeek = sortedSessions.filter(
    (session) => new Date(session.started_at) >= weekAgo,
  ).length;

  let status = "building_baseline";
  let title = "Building your movement baseline";
  let message =
    "Complete a few guided sessions and pain check-ins to make this trend more meaningful.";
  let reason = null;

  if (openEscalation) {
    status = "review_suggested";
    title = "A physiotherapist review is suggested";
    message = openEscalation.description;
    reason = openEscalation.trigger_type;
  } else if (qualityDeclining || painIncreasing || repeatedWorseRecovery) {
    status = "review_suggested";
    title = "Your recent pattern may need a review";
    if (painIncreasing || repeatedWorseRecovery) {
      message =
        "Your recent pain or recovery check-ins are moving in an unfavourable direction.";
      reason = "pain_increase";
    } else {
      message =
        "Your recent measured movement-quality scores have decreased across several sessions.";
      reason = "quality_decline";
    }
  } else if (
    qualityValues.length >= PROVISIONAL_TREND_THRESHOLDS.minimumReadings ||
    painValues.length >= PROVISIONAL_TREND_THRESHOLDS.minimumReadings
  ) {
    status = qualityDelta > 0 ? "improving" : "stable";
    title =
      status === "improving"
        ? "Your recent movement trend is improving"
        : "Your recent movement trend is steady";
    message =
      "Keep following your current plan and continue recording pain before and after exercise.";
  }

  return {
    status,
    title,
    message,
    reason,
    sessionsThisWeek,
    averageQuality: average(qualityValues),
    latestPain: painValues[0] ?? null,
    qualityDelta,
    painDelta,
    qualitySeries: [...qualityValues].reverse(),
  };
}

export function isCurrentPrescription(prescription, today = new Date()) {
  const date = today.toISOString().slice(0, 10);
  return Boolean(
    prescription?.is_active &&
      prescription.valid_from <= date &&
      (!prescription.valid_until || prescription.valid_until >= date),
  );
}

export function findUpcomingConsultation(
  consultations,
  now = new Date(),
) {
  return [...(Array.isArray(consultations) ? consultations : [])]
    .filter((consultation) => {
      if (!["requested", "confirmed"].includes(consultation?.status)) {
        return false;
      }
      if (!consultation?.scheduled_at) {
        return consultation.status === "requested";
      }
      const scheduledAt = new Date(consultation.scheduled_at);
      return !Number.isNaN(scheduledAt.getTime()) && scheduledAt >= now;
    })
    .sort((a, b) => {
      const aUnscheduled = !a.scheduled_at;
      const bUnscheduled = !b.scheduled_at;
      if (aUnscheduled !== bUnscheduled) return aUnscheduled ? -1 : 1;
      if (aUnscheduled) {
        return new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0);
      }
      return new Date(a.scheduled_at) - new Date(b.scheduled_at);
    })[0] ?? null;
}

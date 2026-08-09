export const PRACTICE_VIEWS = Object.freeze({
  PUBLIC: "public",
  LOADING: "loading",
  PATIENT_GATE: "patient_gate",
  PATIENT_WORKSPACE: "patient_workspace",
  CLINICIAN: "clinician",
});

// auth.js publishes a role only after the backend confirms the current
// session. Keep accepting the legacy browser token so older sessions remain
// compatible while cookie-based authentication is in use.
export function hasAuthenticatedPracticeAccount({
  loggedIn = false,
  role = null,
} = {}) {
  return Boolean(loggedIn || role === "patient" || role === "clinician");
}

function profileValue(profile, apiName, browserName) {
  return profile?.[apiName] ?? profile?.[browserName];
}

export function resolvePatientCarePath(
  patientProfile,
  fallbackProfile = null,
) {
  // API fields are the authenticated source of truth. A browser profile can
  // still contain an older camelCase value from before the latest account
  // refresh, so never let that stale value override care_path.
  return profileValue(patientProfile, "care_path", "carePath")
    ?? profileValue(fallbackProfile, "care_path", "carePath")
    ?? null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.floor(number)
    : null;
}

function firstPositiveInteger(...values) {
  for (const value of values) {
    const number = positiveInteger(value);
    if (number !== null) return number;
  }
  return null;
}

export function acceptedWellnessPlan(profile) {
  const candidates = [profile?.wellness_plan, profile?.wellnessPlan];
  return candidates.find(
    (plan) => Array.isArray(plan?.days) && plan.days.length > 0
  ) ?? null;
}

export function wellnessPlanExerciseIds(plan) {
  if (!Array.isArray(plan?.days)) return [];
  return [...new Set(plan.days.flatMap((day) => {
    const exerciseIds = day?.exercise_ids ?? day?.exerciseIds;
    return Array.isArray(exerciseIds)
      ? exerciseIds.map((exerciseId) => String(exerciseId))
      : [];
  }))];
}

export function wellnessPlanSessionExerciseIds(plan, exerciseId) {
  if (!Array.isArray(plan?.days) || !exerciseId) return [];
  const normalizedExerciseId = String(exerciseId);
  const day = plan.days.find((candidate) => {
    const exerciseIds = candidate?.exercise_ids ?? candidate?.exerciseIds;
    return Array.isArray(exerciseIds)
      && exerciseIds.some((item) => String(item) === normalizedExerciseId);
  });
  if (!day) return [];
  const exerciseIds = day.exercise_ids ?? day.exerciseIds;
  return [...new Set(exerciseIds.map((item) => String(item)).filter(Boolean))];
}

export function wellnessPlanIncludesExercise(plan, exerciseId) {
  if (!exerciseId) return false;
  const normalizedExerciseId = String(exerciseId);
  return wellnessPlanExerciseIds(plan).includes(normalizedExerciseId);
}

function parseWellnessDosage(dosage) {
  const text = typeof dosage === "string" ? dosage.trim() : "";
  if (!text) return {};

  const setsMatch = text.match(/\b(\d+)\s*sets?\b/i);
  const repetitionsRangeMatch = text.match(
    /\b(\d+)\s*(?:[-–—]|to)\s*(\d+)\s*(?:repetitions?|reps?)\b/i
  );
  const exactRepetitionsMatch = repetitionsRangeMatch
    ? null
    : text.match(/\b(\d+)\s*(?:repetitions?|reps?)\b/i);

  return {
    sets: positiveInteger(setsMatch?.[1]),
    repetitionsMin: positiveInteger(
      repetitionsRangeMatch?.[1] ?? exactRepetitionsMatch?.[1]
    ),
    repetitionsMax: positiveInteger(
      repetitionsRangeMatch?.[2] ?? exactRepetitionsMatch?.[1]
    ),
  };
}

export function wellnessPlanDoseForExercise(plan, exerciseId) {
  if (!Array.isArray(plan?.days) || !exerciseId) return null;
  const normalizedExerciseId = String(exerciseId);
  const day = plan.days.find((candidate) => {
    const exerciseIds = candidate?.exercise_ids ?? candidate?.exerciseIds;
    return Array.isArray(exerciseIds)
      && exerciseIds.some((item) => String(item) === normalizedExerciseId);
  });
  if (!day) return null;

  const constraints = plan.constraints ?? {};
  const dosage = typeof day.dosage === "string" ? day.dosage.trim() : "";
  const parsedDosage = parseWellnessDosage(dosage);
  const sets = firstPositiveInteger(
    day.sets,
    parsedDosage.sets,
    constraints.sets_per_exercise,
    constraints.setsPerExercise,
  );
  const exactRepetitions = firstPositiveInteger(
    day.reps,
    day.repetitions,
  );
  const minimumRepetitions = firstPositiveInteger(
    day.repetitions_min,
    day.repetitionsMin,
    parsedDosage.repetitionsMin,
    constraints.repetitions_min,
    constraints.repetitionsMin,
    exactRepetitions,
  );
  const maximumRepetitions = firstPositiveInteger(
    day.repetitions_max,
    day.repetitionsMax,
    parsedDosage.repetitionsMax,
    constraints.repetitions_max,
    constraints.repetitionsMax,
    exactRepetitions,
  );
  const hasRepetitions = Boolean(minimumRepetitions || maximumRepetitions);
  const repetitionsMin = hasRepetitions
    ? Math.min(
      minimumRepetitions ?? maximumRepetitions,
      maximumRepetitions ?? minimumRepetitions,
    )
    : null;
  const repetitionsMax = hasRepetitions
    ? Math.max(
      minimumRepetitions ?? maximumRepetitions,
      maximumRepetitions ?? minimumRepetitions,
    )
    : null;
  const daysPerWeek = firstPositiveInteger(
    constraints.days_per_week,
    constraints.daysPerWeek,
    plan.days.length,
  );

  return {
    mode: "wellness_plan",
    source: plan.source ?? "accepted_wellness_plan",
    sets,
    reps: repetitionsMax,
    repsMin: repetitionsMin,
    repsMax: repetitionsMax,
    repetitionLabel: hasRepetitions
      ? repetitionsMin === repetitionsMax
        ? String(repetitionsMax)
        : `${repetitionsMin}–${repetitionsMax}`
      : "",
    daysPerWeek,
    dosage,
  };
}

export function resolvePracticeAccess({
  loggedIn,
  role = null,
  patientProfile = null,
  activePrescriptionCount = 0,
  prescriptionsLoaded = false,
}) {
  if (!loggedIn) {
    return {
      view: PRACTICE_VIEWS.PUBLIC,
      reason: "signed_out",
    };
  }

  if (!role) {
    return {
      view: PRACTICE_VIEWS.LOADING,
      reason: "checking_account",
    };
  }

  if (role === "clinician") {
    return {
      view: PRACTICE_VIEWS.CLINICIAN,
      reason: "clinician_account",
    };
  }

  if (role !== "patient" || !patientProfile) {
    return {
      view: PRACTICE_VIEWS.LOADING,
      reason: "checking_patient_profile",
    };
  }

  const carePath = resolvePatientCarePath(patientProfile);
  const primaryClinician = profileValue(
    patientProfile,
    "primary_clinician",
    "primaryClinician"
  );
  const wellnessPlan = acceptedWellnessPlan(patientProfile);

  if (carePath === "wellness") {
    if (!Array.isArray(wellnessPlan?.days) || wellnessPlan.days.length === 0) {
      return {
        view: PRACTICE_VIEWS.PATIENT_GATE,
        reason: "plan_required",
        action: "plan-modal",
      };
    }
    return {
      view: PRACTICE_VIEWS.PATIENT_WORKSPACE,
      reason: "wellness_plan",
    };
  }

  if (carePath === "clinician") {
    if (!prescriptionsLoaded) {
      return {
        view: PRACTICE_VIEWS.LOADING,
        reason: "loading_prescriptions",
      };
    }
    if (activePrescriptionCount > 0) {
      return {
        view: PRACTICE_VIEWS.PATIENT_WORKSPACE,
        reason: "active_prescription",
      };
    }
    return {
      view: PRACTICE_VIEWS.PATIENT_GATE,
      reason: "awaiting_prescription",
      action: "profile-modal",
    };
  }

  return {
    view: PRACTICE_VIEWS.PATIENT_GATE,
    reason: primaryClinician
      ? "awaiting_prescription"
      : "plan_required",
    action: primaryClinician ? "profile-modal" : "plan-modal",
  };
}

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
  const sets = firstPositiveInteger(
    day.sets,
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
    constraints.repetitions_min,
    constraints.repetitionsMin,
    exactRepetitions,
  );
  const maximumRepetitions = firstPositiveInteger(
    day.repetitions_max,
    day.repetitionsMax,
    constraints.repetitions_max,
    constraints.repetitionsMax,
    exactRepetitions,
  );
  if (!sets || (!minimumRepetitions && !maximumRepetitions)) return null;

  const repetitionsMin = Math.min(
    minimumRepetitions ?? maximumRepetitions,
    maximumRepetitions ?? minimumRepetitions,
  );
  const repetitionsMax = Math.max(
    minimumRepetitions ?? maximumRepetitions,
    maximumRepetitions ?? minimumRepetitions,
  );
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
    repetitionLabel: repetitionsMin === repetitionsMax
      ? String(repetitionsMax)
      : `${repetitionsMin}–${repetitionsMax}`,
    daysPerWeek,
    dosage: day.dosage ?? "",
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

  const carePath = profileValue(patientProfile, "care_path", "carePath");
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

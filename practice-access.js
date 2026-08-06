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
  const wellnessPlan = profileValue(
    patientProfile,
    "wellness_plan",
    "wellnessPlan"
  );

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

export const PRACTICE_VIEWS = Object.freeze({
  PUBLIC: "public",
  LOADING: "loading",
  PATIENT_GATE: "patient_gate",
  PATIENT_WORKSPACE: "patient_workspace",
  CLINICIAN: "clinician",
});

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
  const screeningStatus =
    profileValue(
      patientProfile,
      "wellness_screening_status",
      "wellnessScreening"
    )?.status ??
    profileValue(
      patientProfile,
      "wellness_screening_status",
      "wellnessScreeningStatus"
    );
  const primaryClinician = profileValue(
    patientProfile,
    "primary_clinician",
    "primaryClinician"
  );

  if (carePath === "wellness") {
    if (screeningStatus === "eligible") {
      return {
        view: PRACTICE_VIEWS.PATIENT_WORKSPACE,
        reason: "wellness_eligible",
      };
    }
    return {
      view: PRACTICE_VIEWS.PATIENT_GATE,
      reason:
        screeningStatus === "needs_review"
          ? "professional_review"
          : "screening_required",
      action: "plan-modal",
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
      : "professional_review",
    action: primaryClinician ? "profile-modal" : "plan-modal",
  };
}

function stableValue(value) {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function signature(value) {
  return JSON.stringify(stableValue(value));
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

export function buildCalibrationSafetyContext({
  profile = {},
  dose = {},
  painLevel = null,
} = {}) {
  const screening = profile.wellnessScreening ?? {};
  const medicalHistory = firstDefined(
    profile.medicalHistory,
    profile.medical_history,
    profile.wellnessPlan?.medicalHistory,
    profile.wellnessPlan?.medical_history
  );
  const restrictions = firstDefined(
    profile.clinicianRestrictions,
    profile.clinician_restrictions,
    profile.movementRestrictions,
    profile.movement_restrictions,
    profile.wellnessPlan?.restrictions
  );
  const normalizedPainLevel =
    painLevel !== null &&
    painLevel !== "" &&
    Number.isFinite(Number(painLevel))
      ? Number(painLevel)
      : null;

  return {
    carePath: profile.carePath ?? null,
    pathwayChoice: profile.pathwayChoice ?? null,
    activity: profile.activity ?? null,
    mobility: profile.mobility ?? null,
    painLevel: normalizedPainLevel,
    screeningStatus: screening.status ?? null,
    screeningSignature: signature(screening.answers ?? {}),
    medicalHistorySignature: signature(medicalHistory),
    restrictionsSignature: signature(restrictions),
    prescriptionSignature: signature({
      id: dose.id ?? null,
      updatedAt: dose.updatedAt ?? dose.updated_at ?? null,
      sets: dose.sets ?? null,
      reps: dose.reps ?? null,
      holdSeconds: dose.holdSeconds ?? dose.hold_seconds ?? null,
      daysPerWeek: dose.daysPerWeek ?? dose.days_per_week ?? null,
      notes: dose.notes ?? null,
    }),
  };
}

export function evaluateCalibrationReuse(calibration, currentContext) {
  if (!calibration) {
    return { action: "full-calibration", reason: "no-saved-calibration" };
  }

  const current = currentContext ?? {};
  if (current.carePath === "needs_review") {
    return { action: "professional-review", reason: "care-path-needs-review" };
  }
  if (["review", "blocked", "ineligible"].includes(current.screeningStatus)) {
    return { action: "professional-review", reason: "screening-needs-review" };
  }
  if (Number.isFinite(current.painLevel) && current.painLevel >= 7) {
    return { action: "professional-review", reason: "high-current-pain" };
  }

  const previous = calibration.safetyContext;
  if (!previous) {
    return { action: "position-check", reason: "legacy-calibration" };
  }

  const reviewFields = [
    "carePath",
    "pathwayChoice",
    "screeningStatus",
    "screeningSignature",
    "medicalHistorySignature",
    "restrictionsSignature",
  ];
  const changedReviewField = reviewFields.find(
    (field) => previous[field] !== current[field]
  );
  if (changedReviewField) {
    return {
      action: "professional-review",
      reason: `${changedReviewField}-changed`,
    };
  }

  const recalibrationFields = [
    "activity",
    "mobility",
    "painLevel",
    "prescriptionSignature",
  ];
  const changedCalibrationField = recalibrationFields.find(
    (field) => previous[field] !== current[field]
  );
  if (changedCalibrationField) {
    return {
      action: "full-calibration",
      reason: `${changedCalibrationField}-changed`,
    };
  }

  return { action: "position-check", reason: "saved-calibration-current" };
}

export const WELLNESS_SCREENING_VERSION = 1;

export const WELLNESS_SCREENING_KEYS = Object.freeze([
  "notTreatingCondition",
  "noClinicianRestrictions",
  "generalWellnessGoal",
  "noConcerningSymptoms",
]);

const REVIEW_MESSAGES = Object.freeze({
  notTreatingCondition:
    "You indicated that you may be treating a condition, injury, or recent surgery.",
  noClinicianRestrictions:
    "You indicated that a clinician may have given you exercise restrictions.",
  generalWellnessGoal:
    "Your goal may require rehabilitation rather than a general wellness plan.",
  noConcerningSymptoms:
    "You indicated that you may have new or concerning symptoms.",
});

export function evaluateWellnessScreening(answers) {
  const normalized = Object.fromEntries(
    WELLNESS_SCREENING_KEYS.map((key) => [key, answers?.[key] === true])
  );
  const reviewReasons = WELLNESS_SCREENING_KEYS
    .filter((key) => !normalized[key])
    .map((key) => REVIEW_MESSAGES[key]);

  return {
    version: WELLNESS_SCREENING_VERSION,
    status: reviewReasons.length ? "needs_review" : "eligible",
    answers: normalized,
    reviewReasons,
    screenedAt: new Date().toISOString(),
  };
}

export function isWellnessEligible(profile) {
  const screening = profile?.wellnessScreening;
  return (
    profile?.carePath === "wellness" &&
    screening?.version === WELLNESS_SCREENING_VERSION &&
    screening?.status === "eligible" &&
    WELLNESS_SCREENING_KEYS.every(
      (key) => screening.answers?.[key] === true
    )
  );
}

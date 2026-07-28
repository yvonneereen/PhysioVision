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

const PLAN_TEMPLATES = Object.freeze({
  "Stronger knees": [
    {
      day: "Mon",
      title: "Strength and control",
      exerciseIds: ["half-squats", "leg-extensions"],
      exercises: "Half squats · Leg extensions",
      duration: "10 min",
    },
    {
      day: "Wed",
      title: "Mobility and calf strength",
      exerciseIds: ["heel-cord-stretch", "calf-raises"],
      exercises: "Heel cord stretch · Calf raises",
      duration: "9 min",
    },
    {
      day: "Sat",
      title: "Leg strength",
      exerciseIds: ["hamstring-curls", "half-squats"],
      exercises: "Hamstring curls · Half squats",
      duration: "10 min",
    },
  ],
  "Better balance": [
    {
      day: "Mon",
      title: "Hip and ankle control",
      exerciseIds: ["hip-abduction", "calf-raises"],
      exercises: "Hip abduction · Calf raises",
      duration: "9 min",
    },
    {
      day: "Wed",
      title: "Leg control",
      exerciseIds: ["half-squats", "hamstring-curls"],
      exercises: "Half squats · Hamstring curls",
      duration: "10 min",
    },
    {
      day: "Sat",
      title: "Mobility and confidence",
      exerciseIds: ["heel-cord-stretch", "hip-abduction"],
      exercises: "Heel cord stretch · Hip abduction",
      duration: "9 min",
    },
  ],
  "Move with less stiffness": [
    {
      day: "Mon",
      title: "Lower-leg mobility",
      exerciseIds: ["heel-cord-stretch", "calf-raises"],
      exercises: "Heel cord stretch · Calf raises",
      duration: "8 min",
    },
    {
      day: "Wed",
      title: "Thigh mobility",
      exerciseIds: ["standing-quad-stretch", "supine-hamstring-stretch"],
      exercises: "Quadriceps stretch · Hamstring stretch",
      duration: "9 min",
    },
    {
      day: "Sat",
      title: "Comfortable movement",
      exerciseIds: ["hip-abduction", "heel-cord-stretch"],
      exercises: "Hip abduction · Heel cord stretch",
      duration: "9 min",
    },
  ],
  "Stay active": [
    {
      day: "Mon",
      title: "Whole-leg movement",
      exerciseIds: ["half-squats", "calf-raises"],
      exercises: "Half squats · Calf raises",
      duration: "9 min",
    },
    {
      day: "Wed",
      title: "Mobility",
      exerciseIds: ["heel-cord-stretch", "supine-hamstring-stretch"],
      exercises: "Heel cord stretch · Hamstring stretch",
      duration: "8 min",
    },
    {
      day: "Sat",
      title: "Strength and control",
      exerciseIds: ["hip-abduction", "hamstring-curls"],
      exercises: "Hip abduction · Hamstring curls",
      duration: "10 min",
    },
  ],
  "Stronger hips": [
    {
      day: "Mon",
      title: "Hip strength and control",
      exerciseIds: ["hip-abduction", "straight-leg-raises-supine"],
      exercises: "Hip abduction · Supine straight-leg raises",
      duration: "10 min",
    },
    {
      day: "Wed",
      title: "Inner-thigh and hamstring strength",
      exerciseIds: ["hip-adduction", "hamstring-curls"],
      exercises: "Hip adduction · Hamstring curls",
      duration: "10 min",
    },
    {
      day: "Sat",
      title: "Whole-leg support",
      exerciseIds: ["leg-presses", "hip-abduction"],
      exercises: "Elastic-band leg presses · Hip abduction",
      duration: "11 min",
    },
  ],
  "Better ankle movement": [
    {
      day: "Mon",
      title: "Calf mobility",
      exerciseIds: ["heel-cord-stretch", "calf-raises"],
      exercises: "Heel cord stretch · Calf raises",
      duration: "8 min",
    },
    {
      day: "Wed",
      title: "Ankle and leg control",
      exerciseIds: ["calf-raises", "half-squats"],
      exercises: "Calf raises · Half squats",
      duration: "9 min",
    },
    {
      day: "Sat",
      title: "Comfortable lower-leg movement",
      exerciseIds: ["heel-cord-stretch", "calf-raises"],
      exercises: "Heel cord stretch · Calf raises",
      duration: "8 min",
    },
  ],
  "Walk with confidence": [
    {
      day: "Mon",
      title: "Standing strength",
      exerciseIds: ["half-squats", "calf-raises"],
      exercises: "Half squats · Calf raises",
      duration: "9 min",
    },
    {
      day: "Wed",
      title: "Hip and leg control",
      exerciseIds: ["hip-abduction", "hamstring-curls"],
      exercises: "Hip abduction · Hamstring curls",
      duration: "10 min",
    },
    {
      day: "Sat",
      title: "Lower-body mobility",
      exerciseIds: ["leg-presses", "heel-cord-stretch"],
      exercises: "Elastic-band leg presses · Heel cord stretch",
      duration: "10 min",
    },
  ],
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

export function buildConservativeWellnessPlan(goal) {
  const selectedGoal = Object.hasOwn(PLAN_TEMPLATES, goal)
    ? goal
    : "Stay active";
  return {
    goal: selectedGoal,
    days: PLAN_TEMPLATES[selectedGoal].map((day) => ({ ...day })),
  };
}

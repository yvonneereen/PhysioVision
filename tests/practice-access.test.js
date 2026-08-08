import assert from "node:assert/strict";
import {
  PRACTICE_VIEWS,
  acceptedWellnessPlan,
  hasAuthenticatedPracticeAccount,
  resolvePracticeAccess,
  wellnessPlanDoseForExercise,
  wellnessPlanExerciseIds,
  wellnessPlanIncludesExercise,
  wellnessPlanSessionExerciseIds,
} from "../practice-access.js";

const acceptedPlan = {
  source: "gemini_wellness_agent",
  days: [
    {
      day: "Monday",
      exercise_ids: ["half-squats", "heel-raises"],
      sets: 1,
      repetitions_min: 6,
      repetitions_max: 10,
      dosage: "1 set × 6–10 repetitions",
    },
  ],
  constraints: {
    days_per_week: 3,
    sets_per_exercise: 1,
    repetitions_min: 6,
    repetitions_max: 10,
  },
};

assert.equal(
  acceptedWellnessPlan({ wellness_plan: acceptedPlan }),
  acceptedPlan,
  "the API's accepted plan should be preferred as the wellness source of truth",
);
assert.deepEqual(
  wellnessPlanExerciseIds(acceptedPlan),
  ["half-squats", "heel-raises"],
);
assert.deepEqual(
  wellnessPlanSessionExerciseIds(acceptedPlan, "half-squats"),
  ["half-squats", "heel-raises"],
  "completion guidance should retain the exercise order for the selected plan day",
);
assert.deepEqual(
  wellnessPlanSessionExerciseIds(acceptedPlan, "bridges"),
  [],
  "an exercise outside the accepted plan should have no planned next exercise",
);
assert.equal(wellnessPlanIncludesExercise(acceptedPlan, "half-squats"), true);
assert.equal(wellnessPlanIncludesExercise(acceptedPlan, "bridges"), false);
assert.deepEqual(
  wellnessPlanDoseForExercise(acceptedPlan, "half-squats"),
  {
    mode: "wellness_plan",
    source: "gemini_wellness_agent",
    sets: 1,
    reps: 10,
    repsMin: 6,
    repsMax: 10,
    repetitionLabel: "6–10",
    daysPerWeek: 3,
    dosage: "1 set × 6–10 repetitions",
  },
  "camera targets should be derived from the accepted plan rather than catalogue defaults",
);
assert.equal(
  wellnessPlanDoseForExercise(acceptedPlan, "bridges"),
  null,
  "an exercise outside the accepted plan must not inherit its catalogue dose",
);

const camelCasePlan = {
  days: [{ exerciseIds: ["bridges"] }],
  constraints: {
    setsPerExercise: 2,
    repetitionsMin: 4,
    repetitionsMax: 8,
    daysPerWeek: 2,
  },
};
assert.deepEqual(
  wellnessPlanDoseForExercise(camelCasePlan, "bridges"),
  {
    mode: "wellness_plan",
    source: "accepted_wellness_plan",
    sets: 2,
    reps: 8,
    repsMin: 4,
    repsMax: 8,
    repetitionLabel: "4–8",
    daysPerWeek: 2,
    dosage: "",
  },
  "cached camelCase plan fields should resolve to the same camera dose",
);

const legacyDosagePlan = {
  source: "accepted_legacy_plan",
  days: [
    {
      exercise_ids: ["half-squats", "calf-raises"],
      dosage: "1 set of 6–10 repetitions",
    },
  ],
};
assert.deepEqual(
  wellnessPlanDoseForExercise(legacyDosagePlan, "half-squats"),
  {
    mode: "wellness_plan",
    source: "accepted_legacy_plan",
    sets: 1,
    reps: 10,
    repsMin: 6,
    repsMax: 10,
    repetitionLabel: "6–10",
    daysPerWeek: 1,
    dosage: "1 set of 6–10 repetitions",
  },
  "older accepted plans should derive camera targets from their dosage text",
);

const unstructuredDosagePlan = {
  days: [{ exercise_ids: ["half-squats"], dosage: "Follow your gentle plan" }],
};
assert.equal(
  wellnessPlanDoseForExercise(unstructuredDosagePlan, "half-squats")?.mode,
  "wellness_plan",
  "a planned exercise must remain accessible when optional dosage details are incomplete",
);

assert.equal(hasAuthenticatedPracticeAccount(), false);
assert.equal(hasAuthenticatedPracticeAccount({ loggedIn: true }), true);
assert.equal(hasAuthenticatedPracticeAccount({ role: "patient" }), true);
assert.equal(hasAuthenticatedPracticeAccount({ role: "clinician" }), true);
assert.equal(
  hasAuthenticatedPracticeAccount({ role: "unexpected" }),
  false
);

assert.equal(
  resolvePracticeAccess({ loggedIn: false }).view,
  PRACTICE_VIEWS.PUBLIC
);

assert.equal(
  resolvePracticeAccess({ loggedIn: true }).view,
  PRACTICE_VIEWS.LOADING
);

assert.equal(
  resolvePracticeAccess({
    loggedIn: true,
    role: "clinician",
  }).view,
  PRACTICE_VIEWS.CLINICIAN
);

assert.deepEqual(
  resolvePracticeAccess({
    loggedIn: true,
    role: "patient",
    patientProfile: {
      care_path: "wellness",
      wellness_screening_status: "pending",
    },
  }),
  {
    view: PRACTICE_VIEWS.PATIENT_GATE,
    reason: "plan_required",
    action: "plan-modal",
  }
);

assert.deepEqual(
  resolvePracticeAccess({
    loggedIn: true,
    role: "patient",
    patientProfile: {
      care_path: "wellness",
      wellness_screening_status: "eligible",
    },
  }),
  {
    view: PRACTICE_VIEWS.PATIENT_GATE,
    reason: "plan_required",
    action: "plan-modal",
  },
  "the live guide should ask for a plan, not repeat the plan's safety screen"
);

assert.deepEqual(
  resolvePracticeAccess({
    loggedIn: true,
    role: "patient",
    patientProfile: {
      care_path: "wellness",
      wellness_screening_status: "pending",
      wellness_plan: { days: [{ day: 1, exercises: [] }] },
    },
  }),
  {
    view: PRACTICE_VIEWS.PATIENT_WORKSPACE,
    reason: "wellness_plan",
  },
  "an existing AI plan should open the live guide without re-checking screening status"
);

assert.deepEqual(
  resolvePracticeAccess({
    loggedIn: true,
    role: "patient",
    patientProfile: {
      care_path: "wellness",
      wellness_screening_status: "needs_review",
      wellness_plan: { days: [{ day: 1, exercises: [] }] },
    },
  }),
  {
    view: PRACTICE_VIEWS.PATIENT_WORKSPACE,
    reason: "wellness_plan",
  },
  "the exercise page must use the accepted plan rather than screening status"
);

assert.equal(
  resolvePracticeAccess({
    loggedIn: true,
    role: "patient",
    patientProfile: { care_path: "clinician" },
    prescriptionsLoaded: false,
  }).view,
  PRACTICE_VIEWS.LOADING
);

assert.equal(
  resolvePracticeAccess({
    loggedIn: true,
    role: "patient",
    patientProfile: { care_path: "clinician" },
    prescriptionsLoaded: true,
    activePrescriptionCount: 0,
  }).reason,
  "awaiting_prescription"
);

assert.equal(
  resolvePracticeAccess({
    loggedIn: true,
    role: "patient",
    patientProfile: { care_path: "clinician" },
    prescriptionsLoaded: true,
    activePrescriptionCount: 2,
  }).view,
  PRACTICE_VIEWS.PATIENT_WORKSPACE
);

console.log("practice access tests passed");

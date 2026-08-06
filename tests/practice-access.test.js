import assert from "node:assert/strict";
import {
  PRACTICE_VIEWS,
  hasAuthenticatedPracticeAccount,
  resolvePracticeAccess,
} from "../practice-access.js";

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

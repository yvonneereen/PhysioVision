import assert from "node:assert/strict";
import {
  PRACTICE_VIEWS,
  resolvePracticeAccess,
} from "../practice-access.js";

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
    reason: "screening_required",
    action: "plan-modal",
  }
);

assert.equal(
  resolvePracticeAccess({
    loggedIn: true,
    role: "patient",
    patientProfile: {
      care_path: "wellness",
      wellness_screening_status: "eligible",
    },
  }).view,
  PRACTICE_VIEWS.PATIENT_WORKSPACE
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

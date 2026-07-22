import assert from "node:assert/strict";

import { DRAFT_EXERCISE_MAP } from "../exercises/catalog.js";
import { EXERCISE_MAP } from "../exercises/registry.js";
import { POSES } from "../poses.js";

const promotedIds = ["ankle_pumps", "heel_slides", "hip_bridge"];

for (const id of promotedIds) {
  const catalogExercise = DRAFT_EXERCISE_MAP[id];
  const liveExercise = EXERCISE_MAP[id];

  assert.equal(catalogExercise.liveTracking, true);
  assert.ok(liveExercise);
  assert.equal(liveExercise.trackingMaturity, "prototype_primary_motion_only");
  assert.equal(liveExercise.requiresClinicianPlan, true);
  assert.equal(liveExercise.prescription.mode, "clinician_plan");
  assert.ok(liveExercise.trackingWarning.includes("Prototype tracking"));
  assert.ok(liveExercise.phaseConfirmationMs >= 300);
  assert.ok(liveExercise.phases.length >= 2);

  for (const poseKey of liveExercise.stageImages) {
    assert.ok(POSES[poseKey], `${id} is missing illustration ${poseKey}`);
  }
}

console.log("promoted exercise tests passed");

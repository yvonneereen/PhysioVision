import assert from "node:assert/strict";

import { DRAFT_EXERCISE_MAP } from "../exercises/catalog.js";
import { EXERCISE_MAP } from "../exercises/registry.js";
import { POSES } from "../poses.js";

const posePrototypeIds = ["ankle_pumps", "heel_slides", "hip_bridge"];
const handPrototypeIds = [
  "wrist_extension_stretch",
  "wrist_flexion_stretch",
  "tendon_glides",
];

for (const id of posePrototypeIds) {
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

for (const id of handPrototypeIds) {
  const catalogExercise = DRAFT_EXERCISE_MAP[id];
  const liveExercise = EXERCISE_MAP[id];

  assert.equal(catalogExercise.liveTracking, true);
  assert.ok(liveExercise);
  assert.equal(
    liveExercise.trackingMaturity,
    "engineering_prototype_requires_validation"
  );
  assert.equal(liveExercise.requiresClinicianPlan, true);
  assert.equal(liveExercise.prescription.mode, "clinician_plan");
  assert.ok(liveExercise.trackingWarning.includes("Engineering prototype"));
  assert.ok(liveExercise.phaseConfirmationMs >= 300);
  assert.ok(["hand", "pose_and_hand"].includes(liveExercise.trackingMode));
}

console.log("promoted exercise tests passed");

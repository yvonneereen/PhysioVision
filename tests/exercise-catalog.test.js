import assert from "node:assert/strict";

import {
  DRAFT_EXERCISES,
  DRAFT_EXERCISE_MAP,
  EXERCISE_TAGS,
  requiresClinicianPlan,
} from "../exercises/catalog.js";
import { EXERCISE_MAP } from "../exercises/registry.js";

assert.equal(DRAFT_EXERCISES.length, 23);
assert.equal(Object.keys(DRAFT_EXERCISE_MAP).length, DRAFT_EXERCISES.length);

const ids = DRAFT_EXERCISES.map((exercise) => exercise.id);
assert.equal(new Set(ids).size, ids.length, "draft exercise IDs must be unique");

for (const exercise of DRAFT_EXERCISES) {
  assert.ok(exercise.id);
  assert.ok(exercise.name);
  assert.ok(exercise.region);
  assert.ok(exercise.category);
  assert.ok(exercise.instruction);
  assert.ok(exercise.typicalUse.length > 0);
  assert.ok(exercise.tags.length > 0);
  assert.equal(exercise.liveTracking, false);
  assert.equal(exercise.reviewStatus, "pending_clinician_review");
  assert.equal(
    EXERCISE_MAP[exercise.id],
    undefined,
    `${exercise.id} must not enter the live pose registry before validation`
  );

  if (exercise.tags.includes(EXERCISE_TAGS.HAND_TRACKING_REQUIRED)) {
    assert.equal(exercise.trackingRequirement, "hand_landmarks");
  }

  const needsClinician = exercise.tags.some((tag) =>
    [EXERCISE_TAGS.CLINICIAN_GUIDED, EXERCISE_TAGS.POST_OP].includes(tag)
  );
  assert.equal(requiresClinicianPlan(exercise), needsClinician);
}

assert.deepEqual(DRAFT_EXERCISE_MAP.wrist_extension_stretch.typicalUse, [
  "carpal tunnel rehabilitation",
  "wrist stiffness",
  "forearm tendon irritation",
]);
assert.ok(
  DRAFT_EXERCISE_MAP.stress_ball_squeeze.tags.includes(EXERCISE_TAGS.POSE_LIMITED)
);
assert.ok(
  DRAFT_EXERCISE_MAP.supported_single_leg_balance.tags.includes(
    EXERCISE_TAGS.SUPPORT_REQUIRED
  )
);

console.log("exercise catalog tests passed");

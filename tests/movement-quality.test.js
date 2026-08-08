import assert from "node:assert/strict";

import {
  calculateMovementQuality,
  movementQualityFromSession,
} from "../movement-quality.js";

assert.equal(
  calculateMovementQuality({ repetitions: 0 }),
  null,
  "an unmeasured session must not receive a quality score",
);

assert.equal(
  calculateMovementQuality({ repetitions: 12 }),
  100,
  "a measured session without corrections should score 100",
);

assert.equal(
  calculateMovementQuality({
    repetitions: 12,
    cuesTriggered: [{ cue_text: "Keep your feet flat", trigger_count: 207 }],
  }),
  75,
  "a frame-level legacy cue count must be capped at once per repetition",
);

assert.equal(
  calculateMovementQuality({
    repetitions: 12,
    cuesTriggered: [
      { cue_text: "Keep your feet flat", trigger_count: 12 },
      { cue_text: "Keep your chest up", trigger_count: 12 },
    ],
  }),
  50,
  "two repeated correction types should reduce quality without forcing zero",
);

assert.equal(
  movementQualityFromSession({
    reps_completed: 12,
    quality_score: 0,
    cues_triggered: [{
      cue_text: "Make the squat a little shallower",
      trigger_count: 207,
    }],
    symmetry_warnings_count: 0,
  }),
  75,
  "previously saved frame-counted zeroes should be normalized for display",
);

assert.equal(
  movementQualityFromSession({
    reps_completed: 12,
    quality_score: null,
    cues_triggered: [],
    symmetry_warnings_count: 0,
  }),
  null,
  "missing correction evidence must not invent a historical score",
);

console.log("movement quality scoring tests passed");

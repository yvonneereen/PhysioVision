import assert from "node:assert/strict";

import { FeedbackEngine } from "../feedback/engine.js";
import { EXERCISE_MAP } from "../exercises/registry.js";

const visible = (value) => ({ value, lowConfidence: false, weakPoints: [] });

// Build a measurement set that sits in the MIDDLE of a phase's ranges.
function measurementsForPhase(exercise, phaseName) {
  const phase = exercise.phases.find((p) => p.name === phaseName);
  const out = {};
  for (const [key, cond] of Object.entries(phase)) {
    if (key === "name") continue;
    if (Array.isArray(cond)) out[key] = visible((cond[0] + cond[1]) / 2);
  }
  return out;
}

function driveReps(id, cycle, { frames = 4, dtMs = 100 } = {}) {
  const engine = new FeedbackEngine(id, "right");
  const exercise = EXERCISE_MAP[id];
  const phaseFrames = Math.max(
    frames,
    Math.ceil((exercise.phaseConfirmationMs ?? 0) / dtMs) + 1
  );
  let t = 0;
  const log = [];
  // Repeat the cycle 3 times
  for (let rep = 0; rep < 3; rep++) {
    for (const phaseName of cycle) {
      const m = measurementsForPhase(exercise, phaseName);
      // hold each phase for a few frames so phaseConfirmationMs can pass
      for (let f = 0; f < phaseFrames; f++) {
        t += dtMs;
        const fb = engine.update(m, t);
        log.push({ phaseName, detected: fb.detectedPhase, start: fb.startConfirmed, reps: fb.repCount, prog: +fb.progress.toFixed(2) });
      }
    }
  }
  return { reps: engine.repCount, log };
}

console.log("=== CLAMSHELL ===");
const clam = driveReps("clamshell", ["knees_together", "upper_knee_raised", "knees_together"]);
assert.equal(clam.reps, 3);
console.log("Final reps:", clam.reps, "(expected 3)");
console.log("sample transitions:", clam.log.filter((_, i) => i % 3 === 0).slice(0, 12));

console.log("\n=== ANKLE PUMPS ===");
const ankle = driveReps("ankle_pumps", ["toes_up", "toes_down", "toes_up"]);
assert.equal(ankle.reps, 3);
console.log("Final reps:", ankle.reps, "(expected 3)");

console.log("\n=== HIP BRIDGE ===");
const bridge = driveReps("hip_bridge", ["pelvis_down", "bridge", "pelvis_down"]);
assert.equal(bridge.reps, 3);
console.log("Final reps:", bridge.reps, "(expected 3)");

console.log("\n=== HEEL SLIDES ===");
const heel = driveReps("heel_slides", ["knee_bent", "leg_extended", "knee_bent"]);
assert.equal(heel.reps, 3);
console.log("Final reps:", heel.reps, "(expected 3)");

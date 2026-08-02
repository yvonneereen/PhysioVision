import assert from "node:assert/strict";
import {
  buildCalibrationSafetyContext,
  evaluateCalibrationReuse,
} from "../calibration-policy.js";

const baseProfile = {
  carePath: "wellness",
  pathwayChoice: "general_wellness",
  activity: "Lightly active",
  mobility: "Independent",
  wellnessScreening: {
    status: "eligible",
    answers: { noConcerningSymptoms: true },
  },
};
const baseDose = { sets: 3, reps: 10, updatedAt: "2026-07-31T00:00:00Z" };
const context = buildCalibrationSafetyContext({
  profile: baseProfile,
  dose: baseDose,
  painLevel: 2,
});

assert.equal(
  buildCalibrationSafetyContext({ profile: baseProfile, dose: baseDose }).painLevel,
  null
);

assert.deepEqual(evaluateCalibrationReuse(null, context), {
  action: "full-calibration",
  reason: "no-saved-calibration",
});

assert.equal(
  evaluateCalibrationReuse({ safetyContext: context }, context).action,
  "position-check"
);

const changedPain = buildCalibrationSafetyContext({
  profile: baseProfile,
  dose: baseDose,
  painLevel: 4,
});
assert.deepEqual(evaluateCalibrationReuse({ safetyContext: context }, changedPain), {
  action: "full-calibration",
  reason: "painLevel-changed",
});

const changedMobility = buildCalibrationSafetyContext({
  profile: { ...baseProfile, mobility: "Use a walking aid" },
  dose: baseDose,
  painLevel: 2,
});
assert.deepEqual(
  evaluateCalibrationReuse({ safetyContext: context }, changedMobility),
  { action: "full-calibration", reason: "mobility-changed" }
);

const changedPrescription = buildCalibrationSafetyContext({
  profile: baseProfile,
  dose: { ...baseDose, reps: 8 },
  painLevel: 2,
});
assert.equal(
  evaluateCalibrationReuse({ safetyContext: context }, changedPrescription).action,
  "full-calibration"
);

const changedHistory = buildCalibrationSafetyContext({
  profile: { ...baseProfile, medicalHistory: "Previous hip fracture" },
  dose: baseDose,
  painLevel: 2,
});
assert.equal(
  evaluateCalibrationReuse({ safetyContext: context }, changedHistory).action,
  "professional-review"
);

const highPain = buildCalibrationSafetyContext({
  profile: baseProfile,
  dose: baseDose,
  painLevel: 8,
});
assert.equal(
  evaluateCalibrationReuse({ safetyContext: context }, highPain).action,
  "professional-review"
);

assert.deepEqual(evaluateCalibrationReuse({}, context), {
  action: "position-check",
  reason: "legacy-calibration",
});

console.log("calibration policy tests passed");

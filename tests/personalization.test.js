import assert from "node:assert/strict";

import { EXERCISES, EXERCISE_MAP } from "../exercises/registry.js";
import {
  applyCalibration,
  clearCalibration,
  createCalibration,
  getCalibration,
  saveCalibration,
  validateCalibrationCapture,
} from "../personalization.js";

const halfSquat = EXERCISE_MAP["half-squats"];

function frames(values, count = 12) {
  return Array.from({ length: count }, (_, index) =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        value + ((index % 3) - 1) * 0.3,
      ])
    )
  );
}

const standing = frames({
  leftKnee: 172,
  rightKnee: 170,
  leftHip: 166,
  rightHip: 165,
  torsoLean: 8,
  leftKneeForwardRatio: 0,
  rightKneeForwardRatio: 0,
});

const targetCaptures = [
  frames({
    leftKnee: 132,
    rightKnee: 130,
    leftHip: 138,
    rightHip: 136,
    torsoLean: 22,
    leftKneeForwardRatio: 0.05,
    rightKneeForwardRatio: 0.04,
  }),
  frames({
    leftKnee: 128,
    rightKnee: 126,
    leftHip: 134,
    rightHip: 132,
    torsoLean: 23,
    leftKneeForwardRatio: 0.04,
    rightKneeForwardRatio: 0.03,
  }),
  frames({
    leftKnee: 130,
    rightKnee: 128,
    leftHip: 136,
    rightHip: 134,
    torsoLean: 21,
    leftKneeForwardRatio: 0.03,
    rightKneeForwardRatio: 0.04,
  }),
];

{
  const calibration = createCalibration(halfSquat, {
    affectedSide: "right",
    startFrames: standing,
    targetCaptures,
  });

  assert.equal(calibration.target.leftKnee.median, 130);
  assert.equal(calibration.target.rightKnee.median, 128);
  assert.deepEqual(calibration.phaseRanges.squat.leftKnee, [122, 138]);
  assert.deepEqual(calibration.phaseRanges.squat.rightKnee, [120, 136]);
  assert.equal(calibration.naturalKneeDifference, 2);

  const personalised = applyCalibration(halfSquat, calibration);
  const squat = personalised.phases.find((phase) => phase.name === "squat");
  assert.deepEqual(squat.leftKnee, [122, 138]);
  assert.deepEqual(squat.torsoLean, [0, 40]);
  assert.equal(personalised.symmetry.maxDiffDeg, 8);

  const tampered = applyCalibration(halfSquat, {
    ...calibration,
    phaseRanges: {
      squat: {
        leftKnee: [-100, 999],
        torsoLean: [-100, 999],
      },
    },
  });
  const tamperedSquat = tampered.phases.find((phase) => phase.name === "squat");
  assert.deepEqual(tamperedSquat.leftKnee, [90, 145]);
  assert.deepEqual(tamperedSquat.torsoLean, [0, 40]);
}

{
  const unsafeLean = frames({
    leftKnee: 130,
    rightKnee: 130,
    leftHip: 135,
    rightHip: 135,
    torsoLean: 45,
    leftKneeForwardRatio: 0,
    rightKneeForwardRatio: 0,
  });

  assert.throws(
    () => validateCalibrationCapture(halfSquat, unsafeLean, "target"),
    /Lift your chest/
  );
}

{
  for (const exercise of EXERCISES) {
    assert.ok(exercise.calibration, `${exercise.id} needs a calibration contract`);
    assert.ok(exercise.calibration.startPhase, exercise.id);
    assert.ok(exercise.calibration.targetPhase, exercise.id);
    assert.ok(exercise.calibration.captureKeys.length > 0, exercise.id);
    assert.ok(Array.isArray(exercise.calibration.personalizedKeys), exercise.id);
  }
}

function calibrationValue(condition) {
  if (Array.isArray(condition)) return (condition[0] + condition[1]) / 2;
  if (condition && Object.hasOwn(condition, "equals")) return condition.equals;
  if (condition && Array.isArray(condition.oneOf)) return condition.oneOf[0];
  throw new Error(`Unsupported calibration condition ${JSON.stringify(condition)}`);
}

function safeCalibrationFrames(config, captureType, count = 12) {
  const conditions = {
    ...(config.safeRanges?.[captureType] ?? {}),
    ...(config.safeConditions?.[captureType] ?? {}),
  };
  const frame = Object.fromEntries(config.captureKeys.map((key) => [
    key,
    calibrationValue(conditions[key]),
  ]));
  return Array.from({ length: count }, () => ({ ...frame }));
}

{
  for (const exercise of EXERCISES) {
    const config = exercise.calibration;
    const targetFrames = safeCalibrationFrames(config, "target");
    const calibration = createCalibration(exercise, {
      affectedSide: "right",
      startFrames: safeCalibrationFrames(config, "start"),
      targetCaptures: [targetFrames, targetFrames, targetFrames],
    });
    const personalised = applyCalibration(exercise, calibration);
    assert.equal(personalised.activeCalibration.exerciseId, exercise.id);

    for (const key of config.personalizedKeys) {
      const range = calibration.phaseRanges[config.targetPhase]?.[key];
      const safe = config.safeRanges.target[key];
      assert.ok(range, `${exercise.id}.${key} was not personalized`);
      assert.ok(range[0] >= safe[0], `${exercise.id}.${key} loosened its minimum`);
      assert.ok(range[1] <= safe[1], `${exercise.id}.${key} loosened its maximum`);
    }
  }
}

{
  const ankleMotion = EXERCISE_MAP.ankle_range_of_motion;
  const ratioFrames = (values, count = 12) =>
    Array.from({ length: count }, (_, index) =>
      Object.fromEntries(Object.entries(values).map(([key, value]) => [
        key,
        value + ((index % 3) - 1) * 0.003,
      ]))
    );
  const startFrames = ratioFrames({ toeMotion: 0.02, legMotion: 0.03 });
  const motionCaptures = [0.28, 0.3, 0.32].map((toeMotion) =>
    ratioFrames({ toeMotion, legMotion: 0.04 })
  );
  const calibration = createCalibration(ankleMotion, {
    affectedSide: "right",
    startFrames,
    targetCaptures: motionCaptures,
  });

  assert.equal(calibration.target.toeMotion.median, 0.3);
  assert.deepEqual(calibration.phaseRanges.letter_motion.toeMotion, [0.24, 0.36]);
  const personalised = applyCalibration(ankleMotion, calibration);
  assert.deepEqual(
    personalised.phases.find((phase) => phase.name === "letter_motion").toeMotion,
    [0.24, 0.36]
  );
  assert.deepEqual(
    personalised.phases.find((phase) => phase.name === "letter_motion").legMotion,
    [0, 0.12]
  );
}

function categoricalFrames(handShape, count = 12) {
  return Array.from({ length: count }, () => ({
    handShape,
    handShapeScore: 0.9,
    handFrameReady: 1,
  }));
}

{
  const tendonGlides = EXERCISE_MAP.tendon_glides;
  const calibration = createCalibration(tendonGlides, {
    affectedSide: "right",
    startFrames: categoricalFrames("open_hand"),
    targetCaptures: [
      categoricalFrames("hook_fist"),
      categoricalFrames("hook_fist"),
      categoricalFrames("hook_fist"),
    ],
  });

  assert.equal(calibration.start.handShape.value, "open_hand");
  assert.equal(calibration.target.handShape.value, "hook_fist");
  assert.deepEqual(calibration.phaseRanges.open_hand, {});
  assert.deepEqual(calibration.phaseRanges.hook_fist, {});
  assert.throws(
    () => validateCalibrationCapture(
      tendonGlides,
      categoricalFrames("full_fist"),
      "target"
    ),
    /Hand Shape/
  );
}

{
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    dispatchEvent: () => {},
  };
  if (typeof globalThis.CustomEvent === "undefined") {
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    };
  }
  const left = {
    version: 1,
    exerciseId: "ankle_pumps",
    affectedSide: "left",
  };
  const right = { ...left, affectedSide: "right" };
  saveCalibration(left);
  saveCalibration(right);
  assert.equal(getCalibration("ankle_pumps", "left").affectedSide, "left");
  assert.equal(getCalibration("ankle_pumps", "right").affectedSide, "right");
  clearCalibration("ankle_pumps", "left");
  assert.equal(getCalibration("ankle_pumps", "left"), null);
  assert.equal(getCalibration("ankle_pumps", "right").affectedSide, "right");
}

console.log("personal calibration tests passed");

import assert from "node:assert/strict";

import {
  bodyStillness,
  circularTrajectory,
  gaitPhaseSequence,
  landmarkDisplacement,
  measuredAngle,
  movementVelocity,
  normalizedDistance,
  wristJointAngle,
} from "../movement-measurements.js";

const point = (x, y, z = 0, visibility = 1) => ({ x, y, z, visibility });

function assertContract(measurement) {
  assert.ok(Object.hasOwn(measurement, "value"));
  assert.ok(Object.hasOwn(measurement, "confidence"));
  assert.ok(["usable", "low", "unavailable"].includes(measurement.confidence.status));
  assert.equal(typeof measurement.lowConfidence, "boolean");
  assert.ok(Array.isArray(measurement.weakPoints));
}

{
  const wrist = wristJointAngle(point(0, 1), point(0, 0), point(0, -1));
  assertContract(wrist);
  assert.equal(wrist.confidence.status, "usable");
  assert.ok(Math.abs(wrist.value - 180) < 0.001);

  const uncertain = measuredAngle(
    point(0, 1),
    point(0, 0, 0, 0.2),
    point(0, -1),
    { names: ["forearm", "wrist", "hand"] }
  );
  assertContract(uncertain);
  assert.equal(uncertain.confidence.status, "unavailable");
  assert.ok(uncertain.weakPoints.includes("wrist"));
}

{
  const ratio = normalizedDistance(
    point(0, 0), point(1, 0), point(0, 0), point(2, 0)
  );
  assertContract(ratio);
  assert.equal(ratio.value, 0.5);

  const displacement = landmarkDisplacement(
    point(0, 0), point(0.2, 0), { normalizer: 2 }
  );
  assertContract(displacement);
  assert.ok(Math.abs(displacement.value - 0.1) < 0.001);

  const velocity = movementVelocity(
    point(0, 0), point(0.2, 0), 500, { normalizer: 2 }
  );
  assertContract(velocity);
  assert.ok(Math.abs(velocity.value - 0.2) < 0.001);

  const invalidTime = movementVelocity(point(0, 0), point(1, 0), 0);
  assert.equal(invalidTime.confidence.status, "unavailable");
}

{
  const frames = [0, 150, 300, 450].map((timestampMs, index) => ({
    timestampMs,
    landmarks: {
      shoulder: point(0.5 + index * 0.001, 0.3),
      hip: point(0.5, 0.6),
      referenceA: point(0.4, 0.5),
      referenceB: point(0.6, 0.5),
    },
  }));
  const stillness = bodyStillness(frames, ["shoulder"], {
    referencePair: ["referenceA", "referenceB"],
    velocityThreshold: 0.08,
  });
  assertContract(stillness);
  assert.equal(stillness.confidence.status, "usable");
  assert.equal(stillness.value.stable, true);

  frames[2].landmarks.shoulder.visibility = 0.1;
  const uncertain = bodyStillness(frames, ["shoulder"], {
    referencePair: ["referenceA", "referenceB"],
  });
  assertContract(uncertain);
  assert.equal(uncertain.lowConfidence, true);
}

{
  const circle = Array.from({ length: 33 }, (_, index) => {
    const theta = (index / 32) * Math.PI * 2;
    return point(0.5 + 0.2 * Math.cos(theta), 0.5 + 0.2 * Math.sin(theta));
  });
  const trajectory = circularTrajectory(circle);
  assertContract(trajectory);
  assert.equal(trajectory.confidence.status, "usable");
  assert.ok(trajectory.value.angularSweepDegrees > 340);
  assert.ok(trajectory.value.circularity > 0.8);
}

function gaitFrames() {
  return Array.from({ length: 60 }, (_, frameIndex) => {
    const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
    const theta = frameIndex * Math.PI / 10;
    landmarks[23] = point(0.49, 0.5);
    landmarks[24] = point(0.51, 0.5);
    landmarks[27] = point(0.49, 0.8);
    landmarks[28] = point(0.51, 0.8);
    landmarks[31] = point(0.5 + 0.12 * Math.sin(theta), 0.82);
    landmarks[32] = point(0.5 + 0.12 * Math.sin(theta + Math.PI), 0.82);
    return { timestampMs: frameIndex * 50, landmarks };
  });
}

{
  const frames = gaitFrames();
  const gait = gaitPhaseSequence(frames, { directionSign: 1 });
  assertContract(gait);
  assert.equal(gait.confidence.status, "usable");
  assert.ok(gait.value.events.some((event) => event.type === "heel_contact"));
  assert.ok(gait.value.events.some((event) => event.type === "toe_off"));
  assert.ok(gait.value.samples.some((sample) => sample.leftPhase === "stance"));
  assert.ok(gait.value.samples.some((sample) => sample.leftPhase === "swing"));

  frames[20].landmarks[31].visibility = 0.1;
  const uncertain = gaitPhaseSequence(frames, { directionSign: 1 });
  assertContract(uncertain);
  assert.equal(uncertain.lowConfidence, true);
}

console.log("confidence-aware movement measurement tests passed");

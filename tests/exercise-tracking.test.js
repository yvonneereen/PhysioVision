import assert from "node:assert/strict";

import {
  matchHandToPoseWrist,
  measureCombinedWristFrame,
  measureHandSequenceFrame,
  signedWristBend,
} from "../exercise-tracking.js";

const point = (x, y, z = 0, visibility = 1) => ({ x, y, z, visibility });

function openHandAt(wristX, wristY, scale = 0.6) {
  const base = [
    [0.50, 0.82, 0.00],
    [0.39, 0.70, 0.00], [0.32, 0.60, 0.00], [0.26, 0.51, 0.00], [0.20, 0.43, 0.00],
    [0.40, 0.59, 0.00], [0.38, 0.43, 0.00], [0.36, 0.29, 0.00], [0.34, 0.16, 0.00],
    [0.50, 0.57, 0.00], [0.50, 0.39, 0.00], [0.50, 0.24, 0.00], [0.50, 0.10, 0.00],
    [0.59, 0.59, 0.00], [0.61, 0.43, 0.00], [0.63, 0.30, 0.00], [0.65, 0.18, 0.00],
    [0.67, 0.64, 0.00], [0.71, 0.51, 0.00], [0.74, 0.41, 0.00], [0.77, 0.32, 0.00],
  ];
  return base.map(([x, y, z]) => ({
    x: wristX + (x - 0.5) * scale,
    y: wristY + (y - 0.82) * scale,
    z: z * scale,
  }));
}

function handResult(landmarks) {
  return {
    landmarks: [landmarks],
    worldLandmarks: [landmarks],
    handedness: [[{ categoryName: "Right", score: 0.95 }]],
  };
}

function poseResult() {
  const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
  landmarks[11] = point(0.2, 0.65);
  landmarks[12] = point(0.2, 0.65);
  landmarks[13] = point(0.4, 0.65);
  landmarks[14] = point(0.4, 0.65);
  landmarks[15] = point(0.62, 0.65);
  landmarks[16] = point(0.62, 0.65);
  return {
    landmarks: [landmarks],
    worldLandmarks: [landmarks.map((landmark) => ({ ...landmark }))],
  };
}

{
  const upward = signedWristBend(
    point(0.3, 0.5), point(0.5, 0.5), point(0.5, 0.5), point(0.6, 0.4)
  );
  const downward = signedWristBend(
    point(0.3, 0.5), point(0.5, 0.5), point(0.5, 0.5), point(0.6, 0.6)
  );
  const leftFacingUpward = signedWristBend(
    point(0.7, 0.5), point(0.5, 0.5), point(0.5, 0.5), point(0.4, 0.4)
  );
  assert.equal(upward.confidence.status, "usable");
  assert.ok(upward.value < -40);
  assert.ok(downward.value > 40);
  assert.ok(leftFacingUpward.value < -40);
}

{
  const pose = poseResult();
  const closeHand = {
    landmarks: openHandAt(0.62, 0.65),
    framing: { ready: true },
  };
  const farHand = {
    landmarks: openHandAt(0.2, 0.65),
    framing: { ready: true },
  };
  const match = matchHandToPoseWrist(
    pose.landmarks[0],
    [farHand, closeHand],
    "right"
  );
  assert.equal(match.confidence.status, "usable");
  assert.equal(match.value.hand, closeHand);
  assert.ok(match.value.distance < 0.001);
}

{
  const pose = poseResult();
  const hand = handResult(openHandAt(0.62, 0.65));
  const poseHistory = [0, 100, 200, 300].map((timestampMs) => ({
    timestampMs,
    landmarks: pose.landmarks[0].map((landmark) => ({ ...landmark })),
  }));
  const measurements = measureCombinedWristFrame({
    poseResult: pose,
    handResult: hand,
    side: "right",
    frame: { width: 640, height: 480 },
    poseHistory,
  });
  for (const key of [
    "elbow",
    "wristBend",
    "palmDown",
    "forearmHorizontal",
    "forearmVelocity",
    "wristMatch",
  ]) {
    assert.ok(measurements[key], `${key} was not produced`);
    assert.equal(measurements[key].confidence.status, "usable", key);
  }
  assert.ok(measurements.elbow.value > 170);
  assert.ok(measurements.wristBend.value < -70);
  assert.ok(measurements.wristMatch.value < 0.001);
}

{
  const measurements = measureHandSequenceFrame({
    handResult: handResult(openHandAt(0.5, 0.82)),
    side: "right",
    frame: { width: 640, height: 480 },
  });
  assert.equal(measurements.handShape.confidence.status, "usable");
  assert.equal(measurements.handShape.value, "open_hand");
  assert.ok(measurements.handShapeScore.value >= 0.7);
  assert.equal(measurements.handFrameReady.value, 1);
}

console.log("exercise-level Pose and Hand fusion tests passed");

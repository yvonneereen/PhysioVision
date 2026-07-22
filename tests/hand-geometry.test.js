import assert from "node:assert/strict";

import {
  HAND_LM,
  classifyHandShape,
  fingerFlexionAngles,
  handWristAngle,
  handFrameCoverage,
  palmOrientation,
  selectTrackedHand,
  summarizeHandResult,
} from "../hand-geometry.js";

function openHand(scale = 1) {
  const centre = { x: 0.5, y: 0.5 };
  const base = [
    [0.50, 0.82, 0.00],
    [0.39, 0.70, 0.00], [0.32, 0.60, 0.00], [0.26, 0.51, 0.00], [0.20, 0.43, 0.00],
    [0.40, 0.59, 0.00], [0.38, 0.43, 0.00], [0.36, 0.29, 0.00], [0.34, 0.16, 0.00],
    [0.50, 0.57, 0.00], [0.50, 0.39, 0.00], [0.50, 0.24, 0.00], [0.50, 0.10, 0.00],
    [0.59, 0.59, 0.00], [0.61, 0.43, 0.00], [0.63, 0.30, 0.00], [0.65, 0.18, 0.00],
    [0.67, 0.64, 0.00], [0.71, 0.51, 0.00], [0.74, 0.41, 0.00], [0.77, 0.32, 0.00],
  ];
  return base.map(([x, y, z]) => ({
    x: centre.x + (x - centre.x) * scale,
    y: centre.y + (y - centre.y) * scale,
    z: z * scale,
  }));
}

function handWithFingerFlexion(mcpFlexion, pipFlexion, dipFlexion) {
  const landmarks = openHand();
  const wrist = landmarks[HAND_LM.wrist];
  const chains = [
    [HAND_LM.indexMcp, HAND_LM.indexPip, HAND_LM.indexDip, HAND_LM.indexTip],
    [HAND_LM.middleMcp, HAND_LM.middlePip, HAND_LM.middleDip, HAND_LM.middleTip],
    [HAND_LM.ringMcp, HAND_LM.ringPip, HAND_LM.ringDip, HAND_LM.ringTip],
    [HAND_LM.pinkyMcp, HAND_LM.pinkyPip, HAND_LM.pinkyDip, HAND_LM.pinkyTip],
  ];
  const toRadians = (degrees) => degrees * Math.PI / 180;
  chains.forEach(([mcpIndex, pipIndex, dipIndex, tipIndex]) => {
    const mcp = landmarks[mcpIndex];
    const baseDirection = Math.atan2(mcp.y - wrist.y, mcp.x - wrist.x);
    const directions = [
      baseDirection + toRadians(mcpFlexion),
      baseDirection + toRadians(mcpFlexion + pipFlexion),
      baseDirection + toRadians(mcpFlexion + pipFlexion + dipFlexion),
    ];
    const lengths = [0.12, 0.1, 0.08];
    let previous = mcp;
    [pipIndex, dipIndex, tipIndex].forEach((index, segment) => {
      landmarks[index] = {
        x: previous.x + Math.cos(directions[segment]) * lengths[segment],
        y: previous.y + Math.sin(directions[segment]) * lengths[segment],
        z: 0,
      };
      previous = landmarks[index];
    });
  });
  return landmarks;
}

assert.equal(Object.keys(HAND_LM).length, 21);
assert.equal(HAND_LM.wrist, 0);
assert.equal(HAND_LM.pinkyTip, 20);

{
  const framing = handFrameCoverage(openHand(), { width: 640, height: 480 });
  assert.equal(framing.complete, true);
  assert.equal(framing.inFrame, true);
  assert.equal(framing.largeEnough, true);
  assert.equal(framing.ready, true);
  assert.equal(framing.reason, "ready");
}

{
  const framing = handFrameCoverage(openHand(0.2), { width: 640, height: 480 });
  assert.equal(framing.inFrame, true);
  assert.equal(framing.largeEnough, false);
  assert.equal(framing.reason, "move_closer");
}

{
  const cropped = openHand().map((point) => ({ ...point, x: point.x - 0.25 }));
  const framing = handFrameCoverage(cropped, { width: 640, height: 480 });
  assert.equal(framing.inFrame, false);
  assert.equal(framing.reason, "move_to_centre");
}

{
  const flexion = fingerFlexionAngles(openHand());
  assert.equal(flexion.confidence.status, "usable");
  assert.ok(flexion.value.index.pip.value < 3);
  assert.ok(flexion.value.middle.dip.value < 1);

  const bent = openHand();
  bent[HAND_LM.indexPip] = { x: 0.48, y: 0.52, z: 0 };
  bent[HAND_LM.indexDip] = { x: 0.58, y: 0.57, z: 0 };
  bent[HAND_LM.indexTip] = { x: 0.65, y: 0.62, z: 0 };
  assert.ok(fingerFlexionAngles(bent).value.index.pip.value > 50);
}

{
  const orientation = palmOrientation(openHand(), "Right");
  assert.equal(orientation.confidence.status, "usable");
  assert.equal(orientation.value.direction, "toward_camera");
  assert.ok(orientation.value.directionStrength > 0.9);
}

{
  const wrist = handWristAngle({ x: 0.5, y: 1.2, z: 0 }, openHand());
  assert.equal(wrist.confidence.status, "usable");
  assert.ok(wrist.value > 165);
}

{
  const shape = classifyHandShape(openHand());
  assert.equal(shape.confidence.status, "usable");
  assert.equal(shape.value.label, "open_hand");

  assert.equal(
    classifyHandShape(handWithFingerFlexion(10, 75, 55)).value.label,
    "hook_fist"
  );
  assert.equal(
    classifyHandShape(handWithFingerFlexion(70, 10, 10)).value.label,
    "tabletop"
  );
  assert.equal(
    classifyHandShape(handWithFingerFlexion(65, 60, 10)).value.label,
    "straight_fist"
  );
  assert.equal(
    classifyHandShape(handWithFingerFlexion(65, 75, 55)).value.label,
    "full_fist"
  );
}

{
  const landmarks = openHand();
  const summaries = summarizeHandResult({
    landmarks: [landmarks],
    worldLandmarks: [landmarks],
    handedness: [[{ categoryName: "Right", score: 0.93 }]],
  }, { width: 640, height: 480 });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].handedness.label, "Right");
  assert.equal(summaries[0].handedness.score, 0.93);
  assert.equal(summaries[0].framing.ready, true);
  assert.equal(summaries[0].fingerFlexion.confidence.status, "usable");
  assert.equal(summaries[0].palm.confidence.status, "usable");
  assert.equal(selectTrackedHand(summaries, "right"), summaries[0]);
}

{
  const missing = handFrameCoverage([], { width: 640, height: 480 });
  assert.equal(missing.ready, false);
  assert.equal(missing.confidence.status, "unavailable");
}

console.log("hand geometry tests passed");

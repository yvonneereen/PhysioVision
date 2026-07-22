import assert from "node:assert/strict";

import { FeedbackEngine } from "../feedback/engine.js";

const visible = (value) => ({
  value,
  lowConfidence: false,
  weakPoints: [],
});

const handShapeFrame = (label, score = 0.9) => ({
  handShape: visible(label),
  handShapeScore: visible(score),
  handFrameReady: visible(1),
});

const wristFrame = (wristBend) => ({
  elbow: visible(170),
  wristBend: visible(wristBend),
  palmDown: visible(0.8),
  forearmHorizontal: visible(0.9),
  forearmVelocity: visible(0.05),
  wristMatch: visible(0.02),
});

const hidden = {
  value: Number.NaN,
  lowConfidence: true,
  weakPoints: ["rightKnee"],
};

const halfSquatPose = (overrides = {}) => ({
  leftKnee: visible(170),
  rightKnee: visible(170),
  leftHip: visible(165),
  rightHip: visible(165),
  torsoLean: visible(10),
  leftKneeForwardRatio: visible(0),
  rightKneeForwardRatio: visible(0),
  ...overrides,
});

const halfSquatBottom = (overrides = {}) =>
  halfSquatPose({
    leftKnee: visible(110),
    rightKnee: visible(110),
    leftHip: visible(115),
    rightHip: visible(115),
    torsoLean: visible(25),
    ...overrides,
  });

{
  const engine = new FeedbackEngine("half-squats", "right");
  const result = engine.update(halfSquatPose({ rightKnee: hidden }));

  assert.equal(result.trackingReady, false);
  assert.deepEqual(result.missingMeasurements, ["rightKnee"]);
  assert.equal(result.progress, 0);
  assert.deepEqual(result.cues, []);
}

{
  const engine = new FeedbackEngine("half-squats", "right");
  const result = engine.update(halfSquatPose());

  assert.equal(result.trackingReady, true);
  assert.deepEqual(result.missingMeasurements, []);
}

{
  const engine = new FeedbackEngine("half-squats", "right");
  engine.update(halfSquatPose({ leftKnee: hidden }));
  const result = engine.update(halfSquatBottom({ leftKnee: hidden }));

  assert.equal(result.trackingReady, false);
  assert.equal(result.phase, "standing");
  assert.equal(result.repCount, 0);
}

{
  const engine = new FeedbackEngine("half-squats", "right");
  engine.update(halfSquatPose(), 0);
  const ready = engine.update(halfSquatPose(), 300);

  assert.equal(ready.startConfirmed, true);
  assert.equal(engine.update(halfSquatBottom(), 400).phase, "standing");
  assert.equal(engine.update(halfSquatBottom(), 699).phase, "standing");
  assert.equal(engine.update(halfSquatBottom(), 700).phase, "squat");
  assert.equal(engine.update(halfSquatPose(), 800).repCount, 0);

  const completed = engine.update(halfSquatPose(), 1100);
  assert.equal(completed.phase, "standing");
  assert.equal(completed.repCount, 1);
}

{
  const engine = new FeedbackEngine("half-squats", "right");
  engine.update(halfSquatBottom(), 0);
  engine.update(halfSquatBottom(), 500);
  engine.update(halfSquatPose(), 600);
  const result = engine.update(halfSquatPose(), 900);

  assert.equal(result.startConfirmed, true);
  assert.equal(result.repCount, 0);
}

{
  const engine = new FeedbackEngine("half-squats", "right");
  const kneeForward = engine.update(
    halfSquatPose({ leftKneeForwardRatio: visible(0.2) })
  );
  const torsoLean = engine.update(halfSquatPose({ torsoLean: visible(45) }));
  const multipleProblems = engine.update(
    halfSquatBottom({
      leftKnee: visible(85),
      rightKnee: visible(85),
      torsoLean: visible(45),
    })
  );

  assert.ok(
    kneeForward.cues.includes(
      "Move your left knee back so it stays over your foot"
    )
  );
  assert.ok(
    torsoLean.cues.includes(
      "Lift your chest slightly — avoid leaning too far forward"
    )
  );
  assert.equal(multipleProblems.cues.length, 1);
}

{
  const engine = new FeedbackEngine("heel-cord-stretch", "right");
  const result = engine.update({
    rightAnkle: visible(100),
    rightKnee: hidden,
  });

  assert.equal(result.trackingReady, true);
}

{
  const engine = new FeedbackEngine("heel-cord-stretch", "right");
  engine.update({ rightAnkle: visible(100) });
  const holding = engine.update({ rightAnkle: visible(70) });
  const trackingLost = engine.update({ rightAnkle: hidden });

  assert.equal(holding.inHold, true);
  assert.equal(holding.trackingReady, true);
  assert.equal(trackingLost.inHold, true);
  assert.equal(trackingLost.trackingReady, false);
  assert.deepEqual(trackingLost.cues, []);
}

{
  const engine = new FeedbackEngine("ankle_pumps", "right");
  const toesUp = { rightAnkle: visible(75), rightKnee: visible(165) };
  const toesDown = { rightAnkle: visible(120), rightKnee: visible(165) };

  engine.update(toesUp, 0);
  assert.equal(engine.update(toesUp, 300).startConfirmed, true);
  engine.update(toesDown, 400);
  assert.equal(engine.update(toesDown, 700).phase, "toes_down");
  engine.update(toesUp, 800);
  const completed = engine.update(toesUp, 1100);

  assert.equal(completed.repCount, 1);
  assert.equal(completed.phase, "toes_up");
}

{
  const engine = new FeedbackEngine("ankle_pumps", "right");
  const transition = engine.update({
    rightAnkle: visible(93),
    rightKnee: visible(165),
  });

  assert.equal(transition.trackingReady, true);
  assert.equal(transition.positionRecognized, false);
  assert.equal(transition.detectedPhase, null);
}

{
  const engine = new FeedbackEngine("heel_slides", "left");
  const bent = { leftKnee: visible(90) };
  const extended = { leftKnee: visible(165) };

  engine.update(bent, 0);
  engine.update(bent, 300);
  engine.update(extended, 400);
  engine.update(extended, 700);
  engine.update(bent, 800);
  const completed = engine.update(bent, 1100);

  assert.equal(completed.repCount, 1);
}

{
  const engine = new FeedbackEngine("hip_bridge", "right");
  const down = { rightHip: visible(130), rightKnee: visible(90) };
  const raised = { rightHip: visible(168), rightKnee: visible(90) };

  engine.update(down, 0);
  engine.update(down, 300);
  engine.update(raised, 400);
  engine.update(raised, 700);
  engine.update(down, 800);
  const completed = engine.update(down, 1100);

  assert.equal(completed.repCount, 1);
}

{
  const engine = new FeedbackEngine("tendon_glides", "right");
  const sequence = [
    "open_hand",
    "hook_fist",
    "open_hand",
    "full_fist",
    "open_hand",
    "tabletop",
    "open_hand",
    "straight_fist",
    "open_hand",
  ];
  let timestamp = 0;
  engine.update(handShapeFrame(sequence[0]), timestamp);
  timestamp += 350;
  engine.update(handShapeFrame(sequence[0]), timestamp);
  for (const shape of sequence.slice(1)) {
    timestamp += 50;
    engine.update(handShapeFrame(shape), timestamp);
    timestamp += 350;
    engine.update(handShapeFrame(shape), timestamp);
  }
  assert.equal(engine.repCount, 1);
  assert.equal(engine.currentPhase, "open_hand");
}

{
  const engine = new FeedbackEngine("tendon_glides", "right");
  engine.update(handShapeFrame("open_hand"), 0);
  engine.update(handShapeFrame("open_hand"), 350);
  engine.update(handShapeFrame("full_fist"), 400);
  const outOfOrder = engine.update(handShapeFrame("full_fist"), 800);

  assert.equal(outOfOrder.repCount, 0);
  assert.equal(outOfOrder.phase, "open_hand");
  assert.equal(outOfOrder.sequenceOnTrack, false);
  assert.equal(outOfOrder.expectedNextPhase, "hook_fist");
}

{
  const engine = new FeedbackEngine("wrist_extension_stretch", "right");
  engine.update(wristFrame(0), 0);
  engine.update(wristFrame(0), 350);
  engine.update(wristFrame(-35), 400);
  const holding = engine.update(wristFrame(-35), 750);
  assert.equal(holding.inHold, true);
  assert.equal(holding.holdPositionMaintained, true);

  const betweenPhases = engine.update(wristFrame(-13.5), 800);
  assert.equal(betweenPhases.inHold, true);
  assert.equal(betweenPhases.holdPositionMaintained, false);

  engine.completeHold();
  assert.equal(engine.repCount, 1);
  assert.equal(engine.startConfirmed, false);

  engine.update(wristFrame(-35), 850);
  const cannotRepeatWithoutNeutral = engine.update(wristFrame(-35), 1250);
  assert.equal(cannotRepeatWithoutNeutral.inHold, false);

  engine.update(wristFrame(0), 1300);
  const returned = engine.update(wristFrame(0), 1650);
  assert.equal(returned.startConfirmed, true);
}

console.log("feedback engine tracking tests passed");

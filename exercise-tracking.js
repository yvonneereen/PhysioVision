// Exercise-level adapters that turn Pose/Hand Landmarker results into the
// confidence-aware measurements consumed by FeedbackEngine.

import { jointAngles, LM, VISIBILITY_THRESHOLD } from "./geometry.js";
import {
  HAND_LM,
  selectTrackedHand,
  summarizeHandResult,
} from "./hand-geometry.js";
import {
  isFinitePoint,
  landmarkQuality,
  limbStillness,
  measurementResult,
} from "./movement-measurements.js";

export const TRACKING_MODES = Object.freeze({
  POSE: "pose",
  HAND: "hand",
  POSE_AND_HAND: "pose_and_hand",
});

export function exerciseUsesHand(exercise) {
  return [TRACKING_MODES.HAND, TRACKING_MODES.POSE_AND_HAND]
    .includes(exercise?.trackingMode);
}

function imageDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function derivedMeasurement(source, value, reason = null) {
  return measurementResult(value, {
    score: source?.confidence?.score ?? 0,
    weakPoints: source?.weakPoints ?? [],
    forceLowConfidence: Boolean(source?.lowConfidence),
    unavailable: !source || source.confidence.status === "unavailable"
      || value === null || value === undefined
      || (typeof value === "number" && !Number.isFinite(value)),
    reason: reason ?? source?.confidence?.reason ?? null,
  });
}

/** Match a detected hand to the selected Pose wrist in the same image. */
export function matchHandToPoseWrist(
  poseLandmarks,
  hands,
  side,
  options = {}
) {
  const wristIndex = side === "left" ? LM.leftWrist : LM.rightWrist;
  const poseWrist = poseLandmarks?.[wristIndex];
  const poseQuality = landmarkQuality(
    [poseWrist],
    [`${side}_pose_wrist`],
    { threshold: options.visibilityThreshold ?? VISIBILITY_THRESHOLD }
  );
  if (!poseQuality.usable || !Array.isArray(hands) || hands.length === 0) {
    return measurementResult(null, {
      score: poseQuality.score,
      unavailable: true,
      reason: hands?.length ? "pose_wrist_unreliable" : "hand_not_detected",
      weakPoints: hands?.length ? poseQuality.weakPoints : ["hand_landmarks"],
    });
  }

  const candidates = hands
    .filter((hand) => isFinitePoint(hand.landmarks?.[HAND_LM.wrist]))
    .map((hand) => ({
      hand,
      distance: imageDistance(poseWrist, hand.landmarks[HAND_LM.wrist]),
    }))
    .sort((a, b) => a.distance - b.distance);
  if (!candidates.length) {
    return measurementResult(null, {
      unavailable: true,
      reason: "hand_wrist_unavailable",
      weakPoints: ["hand_wrist"],
    });
  }

  const match = candidates[0];
  const maximumDistance = options.maximumDistance ?? 0.14;
  const framingReady = match.hand.framing.ready;
  const usable = match.distance <= maximumDistance && framingReady;
  return measurementResult(match, {
    score: usable ? 1 : 0.25,
    forceLowConfidence: !usable,
    reason: !framingReady
      ? match.hand.framing.reason
      : match.distance > maximumDistance ? "pose_hand_wrist_mismatch" : null,
    weakPoints: usable
      ? []
      : [!framingReady ? match.hand.framing.reason : "pose_hand_wrist_match"],
  });
}

/**
 * Signed turn from the Pose forearm axis to the Hand Landmarker middle-finger
 * axis. Negative means fingers turn upward on an upright screen; positive means
 * downward. The forearm must be mostly horizontal for that interpretation.
 */
export function signedWristBend(
  poseElbow,
  poseWrist,
  handWrist,
  middleMcp,
  options = {}
) {
  const quality = landmarkQuality(
    [poseElbow, poseWrist, handWrist, middleMcp],
    ["pose_elbow", "pose_wrist", "hand_wrist", "middle_mcp"],
    options
  );
  if (!quality.usable) {
    return measurementResult(NaN, {
      score: quality.score,
      unavailable: true,
      reason: "wrist_landmark_unreliable",
      weakPoints: quality.weakPoints,
    });
  }

  const forearm = {
    x: poseWrist.x - poseElbow.x,
    y: poseWrist.y - poseElbow.y,
  };
  const handAxis = {
    x: middleMcp.x - handWrist.x,
    y: middleMcp.y - handWrist.y,
  };
  const forearmLength = Math.hypot(forearm.x, forearm.y);
  const handLength = Math.hypot(handAxis.x, handAxis.y);
  if (!forearmLength || !handLength) {
    return measurementResult(NaN, {
      unavailable: true,
      reason: "degenerate_wrist_axis",
      weakPoints: ["wrist_axis"],
    });
  }
  const horizontalRatio = Math.abs(forearm.x) / forearmLength;
  const cross = forearm.x * handAxis.y - forearm.y * handAxis.x;
  const dot = forearm.x * handAxis.x + forearm.y * handAxis.y;
  let value = Math.atan2(cross, dot) * 180 / Math.PI;
  // Canonicalize left- and right-facing arms: screen-up remains negative.
  value *= Math.sign(forearm.x) || 1;
  const minimumHorizontalRatio = options.minimumHorizontalRatio ?? 0.45;
  const orientationUsable = horizontalRatio >= minimumHorizontalRatio;

  return measurementResult(value, {
    score: quality.score,
    forceLowConfidence: !orientationUsable,
    reason: orientationUsable ? null : "forearm_not_horizontal_enough",
    weakPoints: orientationUsable ? [] : ["forearm_orientation"],
  });
}

function forearmHorizontalMeasurement(elbow, wrist) {
  const quality = landmarkQuality(
    [elbow, wrist],
    ["pose_elbow", "pose_wrist"]
  );
  if (!quality.usable) {
    return measurementResult(NaN, {
      score: quality.score,
      unavailable: true,
      reason: "forearm_landmark_unreliable",
      weakPoints: quality.weakPoints,
    });
  }
  const length = imageDistance(elbow, wrist);
  return measurementResult(length
    ? Math.abs(wrist.x - elbow.x) / length
    : NaN, {
    score: quality.score,
    unavailable: !length,
    reason: length ? null : "degenerate_forearm_axis",
    weakPoints: length ? [] : ["forearm_axis"],
  });
}

function forearmVelocityMeasurement(history, side, options = {}) {
  const elbowIndex = side === "left" ? LM.leftElbow : LM.rightElbow;
  const wristIndex = side === "left" ? LM.leftWrist : LM.rightWrist;
  const stillness = limbStillness(history, [elbowIndex, wristIndex], {
    referencePair: [elbowIndex, wristIndex],
    velocityThreshold: options.forearmVelocityThreshold ?? 0.3,
    minimumFrames: options.minimumStillnessFrames ?? 4,
    minimumDurationMs: options.minimumStillnessDurationMs ?? 250,
    threshold: options.visibilityThreshold ?? VISIBILITY_THRESHOLD,
  });
  return derivedMeasurement(
    stillness,
    stillness.value?.rmsVelocity ?? NaN,
    stillness.confidence.reason
  );
}

export function measureCombinedWristFrame({
  poseResult,
  handResult,
  side = "right",
  frame = {},
  poseHistory = [],
  options = {},
}) {
  const poseLandmarks = poseResult?.landmarks?.[0];
  const poseWorldLandmarks = poseResult?.worldLandmarks?.[0];
  if (!poseLandmarks || !poseWorldLandmarks) return {};

  const hands = summarizeHandResult(handResult, frame);
  const match = matchHandToPoseWrist(poseLandmarks, hands, side, options);
  if (match.confidence.status === "unavailable") return {};

  const hand = match.value.hand;
  const handLandmarks = hand.landmarks;
  const shoulderIndex = side === "left" ? LM.leftShoulder : LM.rightShoulder;
  const elbowIndex = side === "left" ? LM.leftElbow : LM.rightElbow;
  const wristIndex = side === "left" ? LM.leftWrist : LM.rightWrist;
  const elbow = poseLandmarks[elbowIndex];
  const wrist = poseLandmarks[wristIndex];
  const angles = jointAngles(poseWorldLandmarks, poseLandmarks);
  const rawElbowAngle = angles[`${side}Elbow`];
  const elbowQuality = landmarkQuality(
    [
      poseLandmarks[shoulderIndex],
      poseLandmarks[elbowIndex],
      poseLandmarks[wristIndex],
    ],
    [`${side}_shoulder`, `${side}_elbow`, `${side}_wrist`]
  );
  const elbowAngle = measurementResult(rawElbowAngle.value, {
    score: elbowQuality.score,
    weakPoints: [...elbowQuality.weakPoints, ...rawElbowAngle.weakPoints],
    unavailable: rawElbowAngle.lowConfidence || !Number.isFinite(rawElbowAngle.value),
    reason: rawElbowAngle.lowConfidence ? "elbow_landmark_unreliable" : null,
  });
  const wristBend = signedWristBend(
    elbow,
    wrist,
    handLandmarks[HAND_LM.wrist],
    handLandmarks[HAND_LM.middleMcp],
    options
  );
  if (match.lowConfidence) {
    wristBend.lowConfidence = true;
    wristBend.confidence.status = "low";
    wristBend.confidence.score = Math.min(
      wristBend.confidence.score,
      match.confidence.score
    );
    wristBend.confidence.reason = match.confidence.reason;
    wristBend.weakPoints = [...new Set([
      ...wristBend.weakPoints,
      ...match.weakPoints,
    ])];
  }

  return {
    elbow: elbowAngle,
    wristBend,
    palmDown: derivedMeasurement(hand.palm, hand.palm.value?.normal?.y ?? NaN),
    forearmHorizontal: forearmHorizontalMeasurement(elbow, wrist),
    forearmVelocity: forearmVelocityMeasurement(poseHistory, side, options),
    wristMatch: derivedMeasurement(match, match.value.distance),
  };
}

export function measureHandSequenceFrame({
  handResult,
  side = "right",
  frame = {},
}) {
  const hands = summarizeHandResult(handResult, frame);
  const hand = selectTrackedHand(hands, side);
  if (!hand) return {};
  const shape = hand.handShape;
  return {
    handShape: derivedMeasurement(shape, shape.value?.label ?? null),
    handShapeScore: derivedMeasurement(
      shape,
      shape.value?.classificationScore ?? NaN
    ),
    handFrameReady: derivedMeasurement(
      hand.framing,
      hand.framing.ready ? 1 : 0
    ),
  };
}

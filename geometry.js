// Pure geometry helpers for pose analysis.
// All functions operate on landmark objects shaped { x, y, z } (any consistent unit).
// Prefer MediaPipe worldLandmarks (metric, hip-centered) so angles are camera-invariant.

/** Vector from point b to point a. */
function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
}

function dot(u, v) {
  return u.x * v.x + u.y * v.y + u.z * v.z;
}

function norm(u) {
  return Math.sqrt(dot(u, u));
}

// Landmarks below this visibility score are treated as unreliable (occluded /
// off-frame / poorly inferred) and excluded from angle calculations.
export const VISIBILITY_THRESHOLD = 0.5;

/** True if a landmark exists and is confidently visible. */
export function isVisible(lm, threshold = VISIBILITY_THRESHOLD) {
  // visibility may be undefined on some builds; treat missing as unreliable.
  return !!lm && (lm.visibility ?? 0) >= threshold;
}

/**
 * Angle at vertex B formed by points A-B-C, in degrees (0–180).
 * e.g. knee flexion = angle(hip, knee, ankle).
 */
export function angle(a, b, c) {
  const ba = sub(a, b);
  const bc = sub(c, b);
  const denom = norm(ba) * norm(bc);
  if (denom === 0) return NaN;
  let cos = dot(ba, bc) / denom;
  cos = Math.min(1, Math.max(-1, cos)); // clamp for float safety
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Angle at B (A-B-C) that returns a NaN value and a low-confidence flag when
 * any of the three landmarks is not confidently visible.
 * @returns {{ value: number, lowConfidence: boolean, weakPoints: string[] }}
 */
export function angleWithConfidence(a, b, c, names = ["a", "b", "c"], threshold = VISIBILITY_THRESHOLD) {
  const points = [a, b, c];
  const weakPoints = [];
  points.forEach((p, i) => {
    if (!isVisible(p, threshold)) weakPoints.push(names[i]);
  });
  if (weakPoints.length > 0) {
    return { value: NaN, lowConfidence: true, weakPoints };
  }
  return { value: angle(a, b, c), lowConfidence: false, weakPoints };
}

/** Euclidean distance between two points. */
export function distance(a, b) {
  return norm(sub(a, b));
}

/** Absolute difference between two angles (left vs right symmetry), in degrees. */
export function symmetry(angleLeft, angleRight) {
  if (Number.isNaN(angleLeft) || Number.isNaN(angleRight)) return NaN;
  return Math.abs(angleLeft - angleRight);
}

// MediaPipe Pose landmark indices (BlazePose 33-point model).
export const LM = {
  nose: 0,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30,
  leftFootIndex: 31, rightFootIndex: 32,
};

// Joint definitions: [pointA, vertexB, pointC] as landmark index keys.
const JOINTS = {
  leftKnee:   ["leftHip",      "leftKnee",   "leftAnkle"],
  rightKnee:  ["rightHip",     "rightKnee",  "rightAnkle"],
  leftElbow:  ["leftShoulder", "leftElbow",  "leftWrist"],
  rightElbow: ["rightShoulder","rightElbow", "rightWrist"],
  leftHip:    ["leftShoulder", "leftHip",    "leftKnee"],
  rightHip:   ["rightShoulder","rightHip",   "rightKnee"],
  // ~90° neutral standing; >90° plantarflexed (tiptoe), <85° dorsiflexed (calf stretch)
  leftAnkle:  ["leftKnee",  "leftAnkle",  "leftFootIndex"],
  rightAnkle: ["rightKnee", "rightAnkle", "rightFootIndex"],
};

/**
 * Compute a standard set of joint angles from a landmark array.
 * Each entry is { value, lowConfidence, weakPoints }: value is NaN and
 * lowConfidence true when any contributing landmark is not confidently visible.
 * The `visibility` field must come from the normalized `landmarks` (worldLandmarks
 * do not carry it), so pass those in via `visLm`. If omitted, `lm` is used for both.
 */
export function jointAngles(lm, visLm = lm, threshold = VISIBILITY_THRESHOLD) {
  const result = {};
  for (const [name, [ka, kb, kc]] of Object.entries(JOINTS)) {
    const a = angleWithConfidence(
      lm[LM[ka]], lm[LM[kb]], lm[LM[kc]],
      [ka, kb, kc],
      threshold
    );
    // Re-check confidence against the landmarks that actually carry visibility.
    const weak = [ka, kb, kc].filter((k) => !isVisible(visLm[LM[k]], threshold));
    result[name] = weak.length > 0
      ? { value: NaN, lowConfidence: true, weakPoints: weak }
      : { value: angle(lm[LM[ka]], lm[LM[kb]], lm[LM[kc]]), lowConfidence: false, weakPoints: [] };
  }
  return result;
}

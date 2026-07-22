// Geometry derived from MediaPipe Hand Landmarker output.
// Image landmarks use normalized camera coordinates; world landmarks use metres.

import {
  landmarkQuality,
  measuredAngle,
  measurementResult,
  normalizedDistance,
  wristJointAngle,
} from "./movement-measurements.js";

export const HAND_LM = Object.freeze({
  wrist: 0,
  thumbCmc: 1,
  thumbMcp: 2,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  indexPip: 6,
  indexDip: 7,
  indexTip: 8,
  middleMcp: 9,
  middlePip: 10,
  middleDip: 11,
  middleTip: 12,
  ringMcp: 13,
  ringPip: 14,
  ringDip: 15,
  ringTip: 16,
  pinkyMcp: 17,
  pinkyPip: 18,
  pinkyDip: 19,
  pinkyTip: 20,
});

const FINGER_CHAINS = Object.freeze({
  thumb: ["wrist", "thumbCmc", "thumbMcp", "thumbIp", "thumbTip"],
  index: ["wrist", "indexMcp", "indexPip", "indexDip", "indexTip"],
  middle: ["wrist", "middleMcp", "middlePip", "middleDip", "middleTip"],
  ring: ["wrist", "ringMcp", "ringPip", "ringDip", "ringTip"],
  pinky: ["wrist", "pinkyMcp", "pinkyPip", "pinkyDip", "pinkyTip"],
});

const DEFAULT_FRAMING = Object.freeze({
  minimumNormalizedSpan: 0.22,
  minimumPixelSpan: 120,
  edgeMargin: 0.015,
});

function finitePoint(point) {
  return Boolean(
    point
      && Number.isFinite(point.x)
      && Number.isFinite(point.y)
      && Number.isFinite(point.z ?? 0)
  );
}

function subtract(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: (a.z ?? 0) - (b.z ?? 0),
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function magnitude(vector) {
  return Math.sqrt(dot(vector, vector));
}

function normalize(vector) {
  const length = magnitude(vector);
  if (!length) return null;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function flexionAt(a, b, c, names, options) {
  const interior = measuredAngle(a, b, c, { ...options, names });
  if (interior.lowConfidence) {
    return measurementResult(NaN, {
      score: interior.confidence.score,
      weakPoints: interior.weakPoints,
      reason: interior.confidence.reason,
      unavailable: true,
    });
  }
  return measurementResult(
    Math.max(0, Math.min(180, 180 - interior.value)),
    { score: interior.confidence.score }
  );
}

/**
 * Returns estimated flexion at each finger joint in degrees.
 * 0 degrees is geometrically straight; larger values mean more flexion.
 * These are camera estimates, not clinical goniometer measurements.
 */
export function fingerFlexionAngles(landmarks, options = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) {
    return measurementResult(null, {
      unavailable: true,
      reason: "missing_hand_landmarks",
      weakPoints: ["hand_landmarks"],
    });
  }

  const result = {};
  const measurements = [];
  Object.entries(FINGER_CHAINS).forEach(([finger, names]) => {
    const points = names.map((name) => landmarks[HAND_LM[name]]);
    const proximalName = finger === "thumb" ? "cmc" : "mcp";
    const middleName = finger === "thumb" ? "mcp" : "pip";
    const distalName = finger === "thumb" ? "ip" : "dip";
    result[finger] = {
      [proximalName]: flexionAt(
        points[0], points[1], points[2],
        [names[0], names[1], names[2]], options
      ),
      [middleName]: flexionAt(
        points[1], points[2], points[3],
        [names[1], names[2], names[3]], options
      ),
      [distalName]: flexionAt(
        points[2], points[3], points[4],
        [names[2], names[3], names[4]], options
      ),
    };
    measurements.push(...Object.values(result[finger]));
  });
  const weakPoints = measurements.flatMap((measurement) => measurement.weakPoints);
  const score = Math.min(...measurements.map((measurement) => measurement.confidence.score));
  return measurementResult(result, {
    score,
    weakPoints,
    forceLowConfidence: measurements.some((measurement) => measurement.lowConfidence),
    reason: weakPoints.length ? "finger_landmark_unreliable" : null,
  });
}

/** Wrist interior angle using a pose forearm point and Hand Landmarker MCP axis. */
export function handWristAngle(forearmPoint, landmarks, options = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) {
    return measurementResult(NaN, {
      unavailable: true,
      reason: "missing_hand_landmarks",
      weakPoints: ["hand_landmarks"],
    });
  }
  return wristJointAngle(
    forearmPoint,
    landmarks[HAND_LM.wrist],
    landmarks[HAND_LM.middleMcp],
    options
  );
}

/**
 * Estimates the palm normal from wrist, index MCP and pinky MCP landmarks.
 * The direction is camera-relative. "upward"/"downward" assumes the phone is
 * upright; it is not a gravity measurement.
 */
export function palmOrientation(landmarks, handedness = "Unknown", options = {}) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) {
    return measurementResult(null, {
      unavailable: true,
      reason: "missing_hand_landmarks",
      weakPoints: ["hand_landmarks"],
    });
  }
  const wrist = landmarks[HAND_LM.wrist];
  const indexMcp = landmarks[HAND_LM.indexMcp];
  const pinkyMcp = landmarks[HAND_LM.pinkyMcp];
  const quality = landmarkQuality(
    [wrist, indexMcp, pinkyMcp],
    ["wrist", "index_mcp", "pinky_mcp"],
    options
  );
  if (!quality.usable) {
    return measurementResult(null, {
      unavailable: true,
      score: quality.score,
      reason: "palm_landmark_unreliable",
      weakPoints: quality.weakPoints,
    });
  }

  let normal = normalize(
    cross(subtract(pinkyMcp, wrist), subtract(indexMcp, wrist))
  );
  if (!normal) {
    return measurementResult(null, {
      unavailable: true,
      reason: "degenerate_palm_plane",
      weakPoints: ["palm_plane"],
    });
  }

  // The anatomical landmark order is mirrored between hands. Flip the left
  // result so the normal has the same palm-side convention for both hands.
  if (String(handedness).toLowerCase() === "left") {
    normal = { x: -normal.x, y: -normal.y, z: -normal.z };
  }

  const axes = [
    ["right", normal.x],
    ["left", -normal.x],
    ["downward", normal.y],
    ["upward", -normal.y],
    ["away_from_camera", normal.z],
    ["toward_camera", -normal.z],
  ];
  const [direction, strength] = axes.reduce((best, candidate) =>
    candidate[1] > best[1] ? candidate : best
  );

  return measurementResult({
    normal,
    direction,
    directionStrength: strength,
  }, { score: quality.score });
}

/**
 * Checks whether a complete hand is centred and large enough to analyse.
 * At the default 640×480 stream, the hand must span at least 120 pixels and
 * roughly 22% of one image dimension.
 */
export function handFrameCoverage(
  landmarks,
  frame = {},
  thresholds = DEFAULT_FRAMING
) {
  const complete = Array.isArray(landmarks)
    && landmarks.length >= 21
    && landmarks.slice(0, 21).every(finitePoint);
  if (!complete) {
    const value = {
      complete: false,
      inFrame: false,
      largeEnough: false,
      ready: false,
      reason: "missing_landmarks",
    };
    return {
      ...value,
      ...measurementResult(value, {
        unavailable: true,
        reason: "missing_hand_landmarks",
        weakPoints: ["hand_landmarks"],
      }),
    };
  }

  const points = landmarks.slice(0, 21);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const bounds = {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const normalizedSpan = Math.max(width, height);
  const widthPixels = Number.isFinite(frame.width) ? width * frame.width : NaN;
  const heightPixels = Number.isFinite(frame.height) ? height * frame.height : NaN;
  const pixelSpan = Number.isFinite(widthPixels) && Number.isFinite(heightPixels)
    ? Math.max(widthPixels, heightPixels)
    : NaN;
  const inFrame = bounds.left >= thresholds.edgeMargin
    && bounds.right <= 1 - thresholds.edgeMargin
    && bounds.top >= thresholds.edgeMargin
    && bounds.bottom <= 1 - thresholds.edgeMargin;
  const enoughNormalizedSize = normalizedSpan >= thresholds.minimumNormalizedSpan;
  const enoughPixelSize = !Number.isFinite(pixelSpan)
    || pixelSpan >= thresholds.minimumPixelSpan;
  const largeEnough = enoughNormalizedSize && enoughPixelSize;
  const ready = inFrame && largeEnough;

  const value = {
    complete,
    bounds,
    width,
    height,
    normalizedSpan,
    pixelSpan,
    inFrame,
    largeEnough,
    ready,
    reason: ready ? "ready" : !inFrame ? "move_to_centre" : "move_closer",
  };
  return {
    ...value,
    ...measurementResult(value, {
      score: ready ? 1 : 0.25,
      forceLowConfidence: !ready,
      reason: ready ? null : value.reason,
      weakPoints: ready ? [] : [value.reason],
    }),
  };
}

function jointValue(measurement) {
  return measurement?.lowConfidence ? NaN : measurement.value;
}

/**
 * Rule-based tendon-glide hand-shape estimate. The label score is separate
 * from landmark confidence and must be validated with labelled user videos.
 */
export function classifyHandShape(landmarks, options = {}) {
  const flexion = fingerFlexionAngles(landmarks, options);
  if (flexion.lowConfidence) {
    return measurementResult(null, {
      unavailable: true,
      score: flexion.confidence.score,
      reason: "finger_angles_unreliable",
      weakPoints: flexion.weakPoints,
    });
  }

  const thresholds = {
    extendedMax: options.extendedMax ?? 35,
    flexedMin: options.flexedMin ?? 55,
    mcpFlexedMin: options.mcpFlexedMin ?? 45,
    pinchRatioMax: options.pinchRatioMax ?? 0.35,
  };
  const fingers = ["index", "middle", "ring", "pinky"];
  const values = Object.fromEntries(fingers.map((finger) => [finger, {
    mcp: jointValue(flexion.value[finger].mcp),
    pip: jointValue(flexion.value[finger].pip),
    dip: jointValue(flexion.value[finger].dip),
  }]));
  const every = (predicate) => fingers.every((finger) => predicate(values[finger]));
  const allExtended = every((joints) =>
    joints.mcp < thresholds.extendedMax
    && joints.pip < thresholds.extendedMax
    && joints.dip < thresholds.extendedMax
  );
  const fullFist = every((joints) =>
    joints.mcp > thresholds.mcpFlexedMin
    && joints.pip > thresholds.flexedMin
    && joints.dip > thresholds.extendedMax
  );
  const hookFist = every((joints) =>
    joints.mcp < thresholds.extendedMax
    && joints.pip > thresholds.flexedMin
    && joints.dip > thresholds.extendedMax
  );
  const tabletop = every((joints) =>
    joints.mcp > thresholds.mcpFlexedMin
    && joints.pip < thresholds.extendedMax
    && joints.dip < thresholds.extendedMax
  );
  const straightFist = every((joints) =>
    joints.mcp > thresholds.mcpFlexedMin
    && joints.pip > thresholds.mcpFlexedMin
    && joints.dip < thresholds.extendedMax
  );
  const pinch = normalizedDistance(
    landmarks[HAND_LM.thumbTip],
    landmarks[HAND_LM.indexTip],
    landmarks[HAND_LM.indexMcp],
    landmarks[HAND_LM.pinkyMcp],
    { ...options, names: ["thumb_tip", "index_tip", "index_mcp", "pinky_mcp"] }
  );

  let label = "unknown";
  let classificationScore = 0.25;
  if (!pinch.lowConfidence && pinch.value <= thresholds.pinchRatioMax) {
    label = "pinch";
    classificationScore = Math.min(1, 1 - pinch.value / thresholds.pinchRatioMax + 0.5);
  } else if (allExtended) {
    label = "open_hand";
    classificationScore = 0.9;
  } else if (hookFist) {
    label = "hook_fist";
    classificationScore = 0.85;
  } else if (tabletop) {
    label = "tabletop";
    classificationScore = 0.85;
  } else if (straightFist) {
    label = "straight_fist";
    classificationScore = 0.8;
  } else if (fullFist) {
    label = "full_fist";
    classificationScore = 0.85;
  }

  return measurementResult({
    label,
    classificationScore,
    features: { fingerFlexion: values, pinchRatio: pinch.value },
  }, {
    score: Math.min(flexion.confidence.score, pinch.confidence.score),
    weakPoints: pinch.weakPoints,
    forceLowConfidence: pinch.lowConfidence,
    reason: pinch.lowConfidence ? "shape_feature_unreliable" : null,
  });
}

function handednessCategory(result, index) {
  const groups = result?.handedness ?? result?.handednesses ?? [];
  const category = groups[index]?.[0];
  return {
    label: category?.categoryName ?? category?.displayName ?? "Unknown",
    score: Number.isFinite(category?.score) ? category.score : null,
  };
}

/** Converts a MediaPipe HandLandmarkerResult into analysis-ready hand objects. */
export function summarizeHandResult(result, frame = {}) {
  const imageHands = result?.landmarks ?? [];
  const worldHands = result?.worldLandmarks ?? [];

  return imageHands.map((imageLandmarks, index) => {
    const handedness = handednessCategory(result, index);
    const geometryLandmarks = worldHands[index]?.length >= 21
      ? worldHands[index]
      : imageLandmarks;
    const framing = handFrameCoverage(imageLandmarks, frame);
    const measurementOptions = {
      trackingConfidence: framing.ready ? 1 : 0,
    };
    return {
      landmarks: imageLandmarks,
      worldLandmarks: worldHands[index] ?? null,
      handedness,
      framing,
      palm: palmOrientation(geometryLandmarks, handedness.label, measurementOptions),
      fingerFlexion: fingerFlexionAngles(geometryLandmarks, measurementOptions),
      handShape: classifyHandShape(geometryLandmarks, measurementOptions),
    };
  });
}

export function selectTrackedHand(hands, preferredSide = "") {
  if (!Array.isArray(hands) || hands.length === 0) return null;
  const preferred = String(preferredSide).toLowerCase();
  return [...hands].sort((a, b) => {
    const aPreferred = a.handedness.label.toLowerCase() === preferred ? 1 : 0;
    const bPreferred = b.handedness.label.toLowerCase() === preferred ? 1 : 0;
    if (aPreferred !== bPreferred) return bPreferred - aPreferred;
    if (a.framing.ready !== b.framing.ready) return Number(b.framing.ready) - Number(a.framing.ready);
    return (b.framing.normalizedSpan ?? 0) - (a.framing.normalizedSpan ?? 0);
  })[0];
}

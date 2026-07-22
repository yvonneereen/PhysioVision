// Confidence-aware spatial and temporal measurements for pose/hand landmarks.
// These functions measure camera observations. Their thresholds are engineering
// defaults and must not be treated as clinically validated exercise limits.

import { angle, distance, LM, VISIBILITY_THRESHOLD } from "./geometry.js";

export const MEASUREMENT_CONFIDENCE_THRESHOLD = 0.5;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function isFinitePoint(point) {
  return Boolean(
    point
      && Number.isFinite(point.x)
      && Number.isFinite(point.y)
      && Number.isFinite(point.z ?? 0)
  );
}

function validMeasurementValue(value) {
  if (value === null || value === undefined) return false;
  return typeof value !== "number" || Number.isFinite(value);
}

/**
 * Common result contract used by every new measurement.
 * `confidence.status` describes technical measurement quality, not clinical
 * correctness or safety.
 */
export function measurementResult(value, options = {}) {
  const {
    score = 1,
    weakPoints = [],
    reason = null,
    forceLowConfidence = false,
    minimumConfidence = MEASUREMENT_CONFIDENCE_THRESHOLD,
    unavailable = false,
  } = options;
  const uniqueWeakPoints = [...new Set(weakPoints.filter(Boolean))];
  const normalizedScore = Number.isFinite(score) ? clamp01(score) : 0;
  const isUnavailable = unavailable || !validMeasurementValue(value);
  const lowConfidence = isUnavailable
    || forceLowConfidence
    || uniqueWeakPoints.length > 0
    || normalizedScore < minimumConfidence;
  const status = isUnavailable
    ? "unavailable"
    : lowConfidence
      ? "low"
      : "usable";

  return {
    value,
    confidence: {
      status,
      score: isUnavailable ? 0 : normalizedScore,
      reason: reason ?? (status === "usable" ? null : "measurement_quality_gate_failed"),
    },
    lowConfidence,
    weakPoints: uniqueWeakPoints,
  };
}

function pointScore(point) {
  if (!isFinitePoint(point)) return 0;
  const scores = [point.visibility, point.presence].filter(Number.isFinite);
  return scores.length ? Math.min(...scores.map(clamp01)) : 1;
}

export function landmarkQuality(points, names = [], options = {}) {
  const {
    threshold = VISIBILITY_THRESHOLD,
    trackingConfidence,
  } = options;
  const weakPoints = [];
  const scores = [];

  points.forEach((point, index) => {
    const name = names[index] ?? `landmark_${index}`;
    const score = pointScore(point);
    scores.push(score);
    if (!isFinitePoint(point) || score < threshold) weakPoints.push(name);
  });
  if (Number.isFinite(trackingConfidence)) scores.push(clamp01(trackingConfidence));

  return {
    score: scores.length ? Math.min(...scores) : 0,
    weakPoints,
    usable: weakPoints.length === 0,
  };
}

export function measuredAngle(a, b, c, options = {}) {
  const names = options.names ?? ["a", "vertex", "c"];
  const quality = landmarkQuality([a, b, c], names, options);
  const value = quality.usable ? angle(a, b, c) : NaN;
  return measurementResult(value, {
    score: quality.score,
    weakPoints: quality.weakPoints,
    reason: quality.usable ? null : "required_landmark_unreliable",
    unavailable: !quality.usable || !Number.isFinite(value),
  });
}

/** Interior angle at the wrist; a geometrically straight wrist is near 180°. */
export function wristJointAngle(forearmPoint, wrist, handAxisPoint, options = {}) {
  return measuredAngle(forearmPoint, wrist, handAxisPoint, {
    ...options,
    names: options.names ?? ["forearm", "wrist", "middle_mcp"],
  });
}

function normalizerValue(options = {}) {
  if (Number.isFinite(options.normalizer) && options.normalizer > 0) {
    return options.normalizer;
  }
  if (isFinitePoint(options.referenceA) && isFinitePoint(options.referenceB)) {
    return distance(options.referenceA, options.referenceB);
  }
  return 1;
}

/** Distance divided by a reference segment such as shoulder width or leg length. */
export function normalizedDistance(a, b, referenceA, referenceB, options = {}) {
  const names = options.names ?? ["a", "b", "reference_a", "reference_b"];
  const points = [a, b, referenceA, referenceB];
  const quality = landmarkQuality(points, names, options);
  const referenceLength = quality.usable ? distance(referenceA, referenceB) : NaN;
  const value = quality.usable && referenceLength > 0
    ? distance(a, b) / referenceLength
    : NaN;
  return measurementResult(value, {
    score: quality.score,
    weakPoints: quality.weakPoints,
    reason: referenceLength === 0
      ? "zero_reference_length"
      : quality.usable ? null : "required_landmark_unreliable",
    unavailable: !quality.usable || !Number.isFinite(value),
  });
}

export const normalisedDistance = normalizedDistance;

/** Point movement between two frames, optionally normalized to body size. */
export function landmarkDisplacement(previous, current, options = {}) {
  const points = [previous, current];
  const names = options.names ?? ["previous_landmark", "current_landmark"];
  if (options.referenceA || options.referenceB) {
    points.push(options.referenceA, options.referenceB);
    names.push("reference_a", "reference_b");
  }
  const quality = landmarkQuality(points, names, options);
  const scale = normalizerValue(options);
  const value = quality.usable && scale > 0
    ? distance(previous, current) / scale
    : NaN;
  return measurementResult(value, {
    score: quality.score,
    weakPoints: quality.weakPoints,
    reason: scale === 0
      ? "zero_reference_length"
      : quality.usable ? null : "required_landmark_unreliable",
    unavailable: !quality.usable || !Number.isFinite(value),
  });
}

/** Normalized landmark movement per second. */
export function movementVelocity(previous, current, elapsedMs, options = {}) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return measurementResult(NaN, {
      reason: "invalid_elapsed_time",
      unavailable: true,
      weakPoints: ["timestamp"],
    });
  }
  const displacement = landmarkDisplacement(previous, current, options);
  const value = displacement.lowConfidence
    ? NaN
    : displacement.value / (elapsedMs / 1000);
  return measurementResult(value, {
    score: displacement.confidence.score,
    weakPoints: displacement.weakPoints,
    reason: displacement.confidence.reason,
    unavailable: displacement.lowConfidence || !Number.isFinite(value),
  });
}

function resolveLandmark(landmarks, key) {
  return landmarks?.[key] ?? null;
}

function subtractPoint(point, anchor) {
  return {
    x: point.x - anchor.x,
    y: point.y - anchor.y,
    z: (point.z ?? 0) - (anchor.z ?? 0),
    visibility: Math.min(point.visibility ?? 1, anchor.visibility ?? 1),
    presence: Math.min(point.presence ?? 1, anchor.presence ?? 1),
  };
}

function frameScale(frame, options) {
  if (Number.isFinite(options.normalizer) && options.normalizer > 0) {
    return options.normalizer;
  }
  const pair = options.referencePair;
  if (!pair) return 1;
  const a = resolveLandmark(frame.landmarks, pair[0]);
  const b = resolveLandmark(frame.landmarks, pair[1]);
  return isFinitePoint(a) && isFinitePoint(b) ? distance(a, b) : NaN;
}

/**
 * Calculates RMS and maximum landmark velocity across a time window.
 * Missing/uncertain frames are never silently accepted: a partial result is
 * returned with low confidence.
 */
export function stillnessMeasurement(frames, landmarkKeys, options = {}) {
  const {
    anchorKey = null,
    velocityThreshold = 0.08,
    minimumFrames = 3,
    minimumDurationMs = 250,
  } = options;
  if (!Array.isArray(frames) || frames.length < minimumFrames) {
    return measurementResult(null, {
      reason: "insufficient_frames",
      unavailable: true,
      weakPoints: ["time_window"],
    });
  }

  const durationMs = frames.at(-1).timestampMs - frames[0].timestampMs;
  if (!Number.isFinite(durationMs) || durationMs < minimumDurationMs) {
    return measurementResult(null, {
      reason: "insufficient_duration",
      unavailable: true,
      weakPoints: ["time_window"],
    });
  }

  const speeds = [];
  const weakPoints = [];
  const scores = [];
  const expectedComparisons = (frames.length - 1) * landmarkKeys.length;

  for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
    const previousFrame = frames[frameIndex - 1];
    const currentFrame = frames[frameIndex];
    const elapsedMs = currentFrame.timestampMs - previousFrame.timestampMs;
    const previousScale = frameScale(previousFrame, options);
    const currentScale = frameScale(currentFrame, options);
    const scale = (previousScale + currentScale) / 2;

    for (const key of landmarkKeys) {
      let previous = resolveLandmark(previousFrame.landmarks, key);
      let current = resolveLandmark(currentFrame.landmarks, key);
      const previousAnchor = anchorKey === null
        ? null
        : resolveLandmark(previousFrame.landmarks, anchorKey);
      const currentAnchor = anchorKey === null
        ? null
        : resolveLandmark(currentFrame.landmarks, anchorKey);
      const qualityPoints = [previous, current];
      const qualityNames = [`${String(key)}_previous`, `${String(key)}_current`];
      if (anchorKey !== null) {
        qualityPoints.push(previousAnchor, currentAnchor);
        qualityNames.push(`${String(anchorKey)}_previous`, `${String(anchorKey)}_current`);
      }
      if (options.referencePair) {
        const [referenceAKey, referenceBKey] = options.referencePair;
        qualityPoints.push(
          resolveLandmark(previousFrame.landmarks, referenceAKey),
          resolveLandmark(previousFrame.landmarks, referenceBKey),
          resolveLandmark(currentFrame.landmarks, referenceAKey),
          resolveLandmark(currentFrame.landmarks, referenceBKey)
        );
        qualityNames.push(
          `${String(referenceAKey)}_previous`,
          `${String(referenceBKey)}_previous`,
          `${String(referenceAKey)}_current`,
          `${String(referenceBKey)}_current`
        );
      }
      const quality = landmarkQuality(qualityPoints, qualityNames, options);
      scores.push(quality.score);
      weakPoints.push(...quality.weakPoints);

      if (!quality.usable || !Number.isFinite(scale) || scale <= 0 || elapsedMs <= 0) {
        if (!Number.isFinite(scale) || scale <= 0) weakPoints.push("reference_scale");
        if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) weakPoints.push("timestamp");
        continue;
      }
      if (anchorKey !== null) {
        previous = subtractPoint(previous, previousAnchor);
        current = subtractPoint(current, currentAnchor);
      }
      speeds.push((distance(previous, current) / scale) / (elapsedMs / 1000));
    }
  }

  if (speeds.length === 0) {
    return measurementResult(null, {
      reason: "no_usable_frame_pairs",
      unavailable: true,
      weakPoints,
    });
  }

  const rmsVelocity = Math.sqrt(
    speeds.reduce((sum, speed) => sum + speed * speed, 0) / speeds.length
  );
  const maxVelocity = Math.max(...speeds);
  const validRatio = speeds.length / expectedComparisons;
  const score = Math.min(validRatio, scores.length ? Math.min(...scores) : 0);
  return measurementResult({
    rmsVelocity,
    maxVelocity,
    durationMs,
    sampleCount: speeds.length,
    stable: rmsVelocity <= velocityThreshold,
    threshold: velocityThreshold,
  }, {
    score,
    weakPoints,
    forceLowConfidence: validRatio < 1,
    reason: validRatio < 1 ? "incomplete_time_window" : null,
  });
}

export function bodyStillness(frames, landmarkKeys, options = {}) {
  return stillnessMeasurement(frames, landmarkKeys, options);
}

export function limbStillness(frames, landmarkKeys, options = {}) {
  return stillnessMeasurement(frames, landmarkKeys, options);
}

function pathPoint(sample) {
  return sample?.point ?? sample;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function wrappedAngleDifference(current, previous) {
  let difference = current - previous;
  while (difference > Math.PI) difference -= 2 * Math.PI;
  while (difference < -Math.PI) difference += 2 * Math.PI;
  return difference;
}

/** Describes a 2D circular path without deciding whether it is clinically correct. */
export function circularTrajectory(samples, options = {}) {
  const minimumPoints = options.minimumPoints ?? 8;
  if (!Array.isArray(samples) || samples.length < minimumPoints) {
    return measurementResult(null, {
      reason: "insufficient_trajectory_points",
      unavailable: true,
      weakPoints: ["trajectory"],
    });
  }

  const valid = [];
  const weakPoints = [];
  const scores = [];
  samples.forEach((sample, index) => {
    const point = pathPoint(sample);
    const quality = landmarkQuality([point], [`trajectory_${index}`], options);
    scores.push(quality.score);
    if (quality.usable) valid.push(point);
    else weakPoints.push(...quality.weakPoints);
  });
  if (options.referenceA || options.referenceB) {
    const referenceQuality = landmarkQuality(
      [options.referenceA, options.referenceB],
      ["reference_a", "reference_b"],
      options
    );
    scores.push(referenceQuality.score);
    weakPoints.push(...referenceQuality.weakPoints);
    if (!referenceQuality.usable) {
      return measurementResult(null, {
        reason: "reference_landmark_unreliable",
        unavailable: true,
        weakPoints,
      });
    }
  }
  if (valid.length < minimumPoints) {
    return measurementResult(null, {
      reason: "insufficient_usable_trajectory_points",
      unavailable: true,
      weakPoints,
    });
  }

  const scale = normalizerValue(options);
  if (!Number.isFinite(scale) || scale <= 0) {
    return measurementResult(null, {
      reason: "zero_reference_length",
      unavailable: true,
      weakPoints: ["reference_scale"],
    });
  }
  const centre = {
    x: mean(valid.map((point) => point.x)),
    y: mean(valid.map((point) => point.y)),
  };
  const radii = valid.map((point) =>
    Math.hypot(point.x - centre.x, point.y - centre.y) / scale
  );
  const meanRadius = mean(radii);
  if (!Number.isFinite(meanRadius) || meanRadius === 0) {
    return measurementResult(null, {
      reason: "zero_trajectory_radius",
      unavailable: true,
      weakPoints: ["trajectory"],
    });
  }
  const radiusDeviation = Math.sqrt(
    mean(radii.map((radius) => (radius - meanRadius) ** 2))
  );
  const radialVariation = radiusDeviation / meanRadius;
  const angles = valid.map((point) => Math.atan2(point.y - centre.y, point.x - centre.x));
  let signedSweepRadians = 0;
  for (let index = 1; index < angles.length; index += 1) {
    signedSweepRadians += wrappedAngleDifference(angles[index], angles[index - 1]);
  }
  const closureRatio = distance(valid[0], valid.at(-1)) / (2 * meanRadius * scale);
  const sweepCoverage = Math.min(1, Math.abs(signedSweepRadians) / (2 * Math.PI));
  const radialScore = Math.max(0, 1 - radialVariation * 2);
  const closureScore = Math.max(0, 1 - closureRatio);
  const circularity = radialScore * closureScore * sweepCoverage;
  const validRatio = valid.length / samples.length;
  const score = Math.min(validRatio, scores.length ? Math.min(...scores) : 0);

  return measurementResult({
    centre,
    meanRadius,
    radialVariation,
    closureRatio,
    angularSweepDegrees: Math.abs(signedSweepRadians) * 180 / Math.PI,
    direction: signedSweepRadians >= 0 ? "clockwise" : "counterclockwise",
    circularity,
    pointCount: valid.length,
  }, {
    score,
    weakPoints,
    forceLowConfidence: validRatio < 1,
    reason: validRatio < 1 ? "incomplete_trajectory" : null,
  });
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
    presence: Math.min(a.presence ?? 1, b.presence ?? 1),
  };
}

function smoothPositions(samples, radius = 2) {
  return samples.map((sample, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(samples.length, index + radius + 1);
    return mean(samples.slice(start, end).map((item) => item.position));
  });
}

function gaitEventsForSide(samples, side, options) {
  const smoothed = smoothPositions(samples, options.smoothingRadius ?? 2);
  const candidates = [];
  for (let index = 1; index < smoothed.length - 1; index += 1) {
    const previousSlope = smoothed[index] - smoothed[index - 1];
    const nextSlope = smoothed[index + 1] - smoothed[index];
    if (previousSlope > 0 && nextSlope <= 0) {
      candidates.push({ index, type: "heel_contact", position: smoothed[index] });
    } else if (previousSlope < 0 && nextSlope >= 0) {
      candidates.push({ index, type: "toe_off", position: smoothed[index] });
    }
  }

  const events = [];
  const minimumGapMs = options.minimumEventGapMs ?? 250;
  const minimumExcursion = options.minimumExcursion ?? 0.08;
  candidates.forEach((candidate) => {
    const last = events.at(-1);
    const timestampMs = samples[candidate.index].timestampMs;
    if (!last) {
      events.push({ ...candidate, side, timestampMs });
      return;
    }
    if (candidate.type === last.type) {
      const moreExtreme = candidate.type === "heel_contact"
        ? candidate.position > last.position
        : candidate.position < last.position;
      if (moreExtreme) events[events.length - 1] = { ...candidate, side, timestampMs };
      return;
    }
    if (
      timestampMs - last.timestampMs >= minimumGapMs
      && Math.abs(candidate.position - last.position) >= minimumExcursion
    ) {
      events.push({ ...candidate, side, timestampMs });
    }
  });
  return events;
}

/**
 * Builds heel-contact → stance → toe-off → swing sequences from a side-view
 * pose clip using each foot's position relative to the hip. This is a prototype
 * kinematic event detector and must be validated on the target population.
 */
export function gaitPhaseSequence(frames, options = {}) {
  const minimumFrames = options.minimumFrames ?? 12;
  if (!Array.isArray(frames) || frames.length < minimumFrames) {
    return measurementResult(null, {
      reason: "insufficient_gait_frames",
      unavailable: true,
      weakPoints: ["gait_window"],
    });
  }
  const indices = {
    leftHip: options.indices?.leftHip ?? LM.leftHip,
    rightHip: options.indices?.rightHip ?? LM.rightHip,
    leftAnkle: options.indices?.leftAnkle ?? LM.leftAnkle,
    rightAnkle: options.indices?.rightAnkle ?? LM.rightAnkle,
    leftFoot: options.indices?.leftFoot ?? LM.leftFootIndex,
    rightFoot: options.indices?.rightFoot ?? LM.rightFootIndex,
  };
  const axis = options.axis ?? "x";
  const rawSamples = [];
  const weakPoints = [];
  const scores = [];

  frames.forEach((frame, frameIndex) => {
    const points = Object.values(indices).map((index) => resolveLandmark(frame.landmarks, index));
    const names = Object.keys(indices).map((name) => `${name}_${frameIndex}`);
    const quality = landmarkQuality(points, names, options);
    scores.push(quality.score);
    if (!quality.usable || !Number.isFinite(frame.timestampMs)) {
      weakPoints.push(...quality.weakPoints);
      if (!Number.isFinite(frame.timestampMs)) weakPoints.push(`timestamp_${frameIndex}`);
      return;
    }
    const [leftHip, rightHip, leftAnkle, rightAnkle, leftFoot, rightFoot] = points;
    const hipMid = midpoint(leftHip, rightHip);
    const leftScale = distance(leftHip, leftAnkle);
    const rightScale = distance(rightHip, rightAnkle);
    if (leftScale === 0 || rightScale === 0) {
      weakPoints.push(`leg_scale_${frameIndex}`);
      return;
    }
    rawSamples.push({
      timestampMs: frame.timestampMs,
      hipPosition: hipMid[axis],
      leftPosition: (leftFoot[axis] - hipMid[axis]) / leftScale,
      rightPosition: (rightFoot[axis] - hipMid[axis]) / rightScale,
    });
  });

  if (rawSamples.length < minimumFrames) {
    return measurementResult(null, {
      reason: "insufficient_usable_gait_frames",
      unavailable: true,
      weakPoints,
    });
  }

  const hipTravel = rawSamples.at(-1).hipPosition - rawSamples[0].hipPosition;
  const suppliedDirection = Number.isFinite(options.directionSign)
    && Math.sign(options.directionSign) !== 0;
  const directionWasInferred = Math.abs(hipTravel) > (options.minimumDirectionTravel ?? 0.02);
  const directionAmbiguous = !suppliedDirection && !directionWasInferred;
  if (directionAmbiguous) weakPoints.push("walking_direction");
  const directionSign = suppliedDirection
    ? Math.sign(options.directionSign) || 1
    : directionWasInferred
      ? Math.sign(hipTravel)
      : 1;
  const left = rawSamples.map((sample) => ({
    timestampMs: sample.timestampMs,
    position: sample.leftPosition * directionSign,
  }));
  const right = rawSamples.map((sample) => ({
    timestampMs: sample.timestampMs,
    position: sample.rightPosition * directionSign,
  }));
  const events = [
    ...gaitEventsForSide(left, "left", options),
    ...gaitEventsForSide(right, "right", options),
  ].sort((a, b) => a.timestampMs - b.timestampMs);

  const phases = { left: "unknown", right: "unknown" };
  const eventsByTimestamp = new Map();
  events.forEach((event) => {
    const list = eventsByTimestamp.get(event.timestampMs) ?? [];
    list.push(event);
    eventsByTimestamp.set(event.timestampMs, list);
  });
  const samples = rawSamples.map((sample) => {
    (eventsByTimestamp.get(sample.timestampMs) ?? []).forEach((event) => {
      phases[event.side] = event.type === "heel_contact" ? "stance" : "swing";
    });
    return {
      timestampMs: sample.timestampMs,
      leftPhase: phases.left,
      rightPhase: phases.right,
    };
  });
  const heelContacts = events.filter((event) => event.type === "heel_contact");
  const alternatingHeelContacts = heelContacts.every(
    (event, index) => index === 0 || event.side !== heelContacts[index - 1].side
  );
  const validRatio = rawSamples.length / frames.length;
  const score = Math.min(validRatio, scores.length ? Math.min(...scores) : 0);
  const enoughEvents = events.length >= (options.minimumEvents ?? 2);

  return measurementResult({
    events: events.map(({ index: _index, position: _position, ...event }) => event),
    samples,
    directionSign,
    alternatingHeelContacts,
    cycles: {
      left: Math.max(0, heelContacts.filter((event) => event.side === "left").length - 1),
      right: Math.max(0, heelContacts.filter((event) => event.side === "right").length - 1),
    },
  }, {
    score,
    weakPoints,
    forceLowConfidence: validRatio < 1 || !enoughEvents || directionAmbiguous,
    reason: validRatio < 1
      ? "incomplete_gait_window"
      : !enoughEvents
        ? "insufficient_gait_transitions"
        : directionAmbiguous ? "walking_direction_ambiguous" : null,
  });
}

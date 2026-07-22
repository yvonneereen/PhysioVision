import { patchMe, isLoggedIn } from "./api.js";

const PROFILE_KEY = "physiovision.profile.v1";
const CALIBRATION_KEY = "physiovision.calibrations.v1";

const DEFAULT_PROFILE = Object.freeze({
  name: "",
  age: "",
  goal: "Stronger knees",
  activity: "Lightly active",
  mobility: "Independent",
  focusSide: "right",
  cueStyle: "gentle",
  carePath: "wellness",
});

function readJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadProfile() {
  return { ...DEFAULT_PROFILE, ...readJson(PROFILE_KEY, {}) };
}

export function hasSavedProfile() {
  try {
    return window.localStorage.getItem(PROFILE_KEY) !== null;
  } catch (_) {
    return false;
  }
}

export function saveProfile(profile) {
  const previous = loadProfile();
  const next = {
    ...previous,
    ...profile,
    name: String(profile.name ?? previous.name).trim().slice(0, 60),
    age: normaliseAge(profile.age ?? previous.age),
    updatedAt: new Date().toISOString(),
  };
  writeJson(PROFILE_KEY, next);
  window.dispatchEvent(
    new CustomEvent("physiovision:profile-updated", { detail: next })
  );

  // Sync to backend — fire and forget, localStorage is the source of truth locally
  if (isLoggedIn()) {
    patchMe({
      goal:            next.goal,
      activity_level:  next.activity,
      mobility_status: next.mobility,
      focus_side:      next.focusSide,
      cue_style:       next.cueStyle,
      care_path:       next.carePath,
    }).catch(() => {});
  }

  return next;
}

function normaliseAge(value) {
  if (value === "" || value === null || value === undefined) return "";
  const age = Math.round(Number(value));
  return Number.isFinite(age) ? Math.min(110, Math.max(18, age)) : "";
}

export function loadCalibrations() {
  return readJson(CALIBRATION_KEY, {});
}

function calibrationStorageKey(exerciseId, affectedSide) {
  return affectedSide ? `${exerciseId}:${affectedSide}` : exerciseId;
}

export function getCalibration(exerciseId, affectedSide = null) {
  const calibrations = loadCalibrations();
  const exact = calibrations[calibrationStorageKey(exerciseId, affectedSide)];
  if (exact) return exact;
  // Read pre-side-specific v1 data only when it belongs to the requested side.
  const legacy = calibrations[exerciseId];
  return legacy
    && (!affectedSide || legacy.affectedSide === affectedSide)
    ? legacy
    : null;
}

export function saveCalibration(calibration) {
  if (!calibration?.exerciseId) throw new Error("Calibration needs an exercise ID.");
  const calibrations = loadCalibrations();
  calibrations[calibrationStorageKey(
    calibration.exerciseId,
    calibration.affectedSide
  )] = calibration;
  writeJson(CALIBRATION_KEY, calibrations);
  window.dispatchEvent(
    new CustomEvent("physiovision:calibration-updated", {
      detail: calibration,
    })
  );
  return calibration;
}

export function clearCalibration(exerciseId, affectedSide = null) {
  const calibrations = loadCalibrations();
  if (affectedSide) {
    delete calibrations[calibrationStorageKey(exerciseId, affectedSide)];
  } else {
    Object.keys(calibrations)
      .filter((key) => key === exerciseId || key.startsWith(`${exerciseId}:`))
      .forEach((key) => delete calibrations[key]);
  }
  writeJson(CALIBRATION_KEY, calibrations);
  window.dispatchEvent(
    new CustomEvent("physiovision:calibration-updated", {
      detail: { exerciseId, affectedSide, removed: true },
    })
  );
}

export function resolveMeasurement(key, angles, affectedSide = "right") {
  if (key in angles) return angles[key];
  const sideKey = `${affectedSide}${key[0].toUpperCase()}${key.slice(1)}`;
  return angles[sideKey] ?? null;
}

export function extractCalibrationFrame(exercise, angles, affectedSide) {
  const calibration = exercise.calibration;
  if (!calibration) return null;

  const frame = {};
  for (const key of calibration.captureKeys) {
    const measurement = resolveMeasurement(key, angles, affectedSide);
    if (
      !measurement ||
      measurement.lowConfidence ||
      !isCalibrationValue(measurement.value)
    ) {
      return null;
    }
    frame[key] = measurement.value;
  }
  return frame;
}

export function summariseFrames(frames, keys) {
  if (!frames?.length) throw new Error("No visible movement samples were captured.");
  const summary = {};

  for (const key of keys) {
    const values = frames
      .map((frame) => frame[key])
      .filter(isCalibrationValue);
    if (values.length < 5) {
      throw new Error("Keep all required joints visible for the full measurement.");
    }
    if (values.every(Number.isFinite)) {
      values.sort((a, b) => a - b);
      const centre = median(values);
      const deviations = values.map((value) => Math.abs(value - centre));
      summary[key] = {
        median: round(centre),
        variability: round(median(deviations)),
        sampleCount: values.length,
      };
    } else if (values.every((value) => typeof value === "string")) {
      const value = mode(values);
      summary[key] = {
        value,
        consistency: round(
          values.filter((candidate) => candidate === value).length / values.length
        ),
        sampleCount: values.length,
      };
    } else {
      throw new Error("The movement measurement changed type during calibration.");
    }
  }
  return summary;
}

export function validateCalibrationCapture(exercise, frames, captureType) {
  const config = exercise.calibration;
  if (!config) throw new Error("This exercise does not support calibration yet.");
  const summary = summariseFrames(frames, config.captureKeys);
  const safeRanges = config.safeRanges?.[captureType] ?? {};

  for (const [key, range] of Object.entries(safeRanges)) {
    const value = summary[key]?.median;
    if (!Number.isFinite(value) || value < range[0] || value > range[1]) {
      const message = config.captureErrors?.[key];
      throw new Error(
        message ?? `Your ${friendlyMeasurement(key)} was outside the safe calibration range.`
      );
    }
  }
  const safeConditions = config.safeConditions?.[captureType] ?? {};
  for (const [key, condition] of Object.entries(safeConditions)) {
    const result = summary[key];
    const value = result?.value ?? result?.median;
    if (!conditionMatches(value, condition) || (result.consistency ?? 1) < 0.8) {
      const message = config.captureErrors?.[key];
      throw new Error(
        message ?? `Hold the ${friendlyMeasurement(key)} consistently and try again.`
      );
    }
  }
  return summary;
}

export function createCalibration(
  exercise,
  { affectedSide, startFrames, targetCaptures }
) {
  const config = exercise.calibration;
  if (!config) throw new Error("This exercise does not support calibration yet.");
  if (!Array.isArray(targetCaptures) || targetCaptures.length < 3) {
    throw new Error("Three comfortable movement samples are required.");
  }

  const start = validateCalibrationCapture(exercise, startFrames, "start");
  const targetSummaries = targetCaptures.map((frames) =>
    validateCalibrationCapture(exercise, frames, "target")
  );
  const target = {};

  for (const key of config.captureKeys) {
    const numericValues = targetSummaries
      .map((summary) => summary[key]?.median)
      .filter(Number.isFinite);
    if (numericValues.length === targetSummaries.length) {
      const centre = median(numericValues);
      target[key] = {
        median: round(centre),
        variability: round(median(
          numericValues.map((value) => Math.abs(value - centre))
        )),
        repetitions: numericValues.length,
      };
      continue;
    }
    const categoricalValues = targetSummaries
      .map((summary) => summary[key]?.value)
      .filter((value) => typeof value === "string");
    if (categoricalValues.length === targetSummaries.length) {
      const value = mode(categoricalValues);
      target[key] = {
        value,
        consistency: round(
          categoricalValues.filter((candidate) => candidate === value).length
            / categoricalValues.length
        ),
        repetitions: categoricalValues.length,
      };
    }
  }

  const phaseRanges = {
    [config.startPhase]: makePersonalRanges(
      config.personalizedKeys,
      start,
      config.safeRanges.start,
      config.tolerances ?? config.toleranceDegrees
    ),
    [config.targetPhase]: makePersonalRanges(
      config.personalizedKeys,
      target,
      config.safeRanges.target,
      config.tolerances ?? config.toleranceDegrees
    ),
  };

  const leftKnee = target.leftKnee?.median;
  const rightKnee = target.rightKnee?.median;
  const naturalKneeDifference =
    Number.isFinite(leftKnee) && Number.isFinite(rightKnee)
      ? Math.round(Math.abs(leftKnee - rightKnee) * 10) / 10
      : null;

  return {
    version: 1,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    affectedSide,
    capturedAt: new Date().toISOString(),
    start,
    target,
    phaseRanges,
    naturalKneeDifference,
  };
}

function makePersonalRanges(keys, summary, safetyRanges, tolerances = 8) {
  const ranges = {};
  for (const key of keys) {
    const centre = summary[key]?.median;
    const safe = safetyRanges[key];
    if (!Number.isFinite(centre) || !safe) continue;
    const variability = summary[key]?.variability ?? 0;
    const configuredTolerance = typeof tolerances === "number"
      ? tolerances
      : tolerances?.[key] ?? 8;
    const radius = Math.max(configuredTolerance, variability * 3);
    ranges[key] = [
      round(Math.max(safe[0], centre - radius)),
      round(Math.min(safe[1], centre + radius)),
    ];
  }
  return ranges;
}

export function applyCalibration(exercise, calibration) {
  const copy = {
    ...exercise,
    prescription: { ...exercise.prescription },
    phases: exercise.phases.map((phase) => ({ ...phase })),
    symmetry: exercise.symmetry ? { ...exercise.symmetry } : undefined,
  };

  if (
    !calibration ||
    calibration.version !== 1 ||
    calibration.exerciseId !== exercise.id
  ) {
    return copy;
  }

  const config = exercise.calibration;
  const safeByPhase = {
    [config?.startPhase]: config?.safeRanges?.start ?? {},
    [config?.targetPhase]: config?.safeRanges?.target ?? {},
  };
  const allowedKeys = new Set(config?.personalizedKeys ?? []);
  copy.phases = copy.phases.map((phase) => {
    const safeRanges = safeByPhase[phase.name] ?? {};
    const storedRanges = calibration.phaseRanges?.[phase.name] ?? {};
    const acceptedRanges = {};
    for (const [key, stored] of Object.entries(storedRanges)) {
      const safe = safeRanges[key];
      if (!allowedKeys.has(key) || !isNumericRange(stored) || !isNumericRange(safe)) {
        continue;
      }
      const clamped = [
        Math.max(stored[0], safe[0]),
        Math.min(stored[1], safe[1]),
      ];
      if (clamped[0] <= clamped[1]) acceptedRanges[key] = clamped;
    }
    return { ...phase, ...acceptedRanges };
  });
  copy.activeCalibration = calibration;

  // Natural asymmetry is recorded for trend comparisons, but calibration is
  // never allowed to loosen the exercise's existing safety limit.
  if (copy.symmetry && Number.isFinite(calibration.naturalKneeDifference)) {
    copy.symmetry.maxDiffDeg = Math.min(
      copy.symmetry.maxDiffDeg,
      Math.max(8, calibration.naturalKneeDifference + 5)
    );
  }
  return copy;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mode(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0];
}

function isCalibrationValue(value) {
  return Number.isFinite(value)
    || (typeof value === "string" && value.length > 0);
}

function conditionMatches(value, condition) {
  if (Array.isArray(condition)) {
    return Number.isFinite(value)
      && value >= condition[0]
      && value <= condition[1];
  }
  if (condition && Object.hasOwn(condition, "equals")) {
    return value === condition.equals;
  }
  if (condition && Array.isArray(condition.oneOf)) {
    return condition.oneOf.includes(value);
  }
  return false;
}

function isNumericRange(value) {
  return Array.isArray(value)
    && value.length === 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] <= value[1];
}

function round(value) {
  // Ratios such as foot clearance and trajectory size need more precision
  // than degree measurements; two decimals still keeps stored profiles small.
  return Math.round(value * 100) / 100;
}

function friendlyMeasurement(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

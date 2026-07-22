import { EXERCISES, EXERCISE_MAP } from "../exercises/registry.js";
import { applyCalibration } from "../personalization.js";

export { EXERCISES };

export class FeedbackEngine {
  constructor(
    exerciseId = "half-squats",
    affectedSide = "right",
    calibration = null
  ) {
    this._init(exerciseId, affectedSide, calibration);
  }

  _init(exerciseId, affectedSide, calibration = null) {
    const sideCalibration = calibration?.affectedSide
      && calibration.affectedSide !== affectedSide
      ? null
      : calibration;
    this.exercise = applyCalibration(EXERCISE_MAP[exerciseId], sideCalibration);
    this.side = affectedSide;
    // Parse "standing → squat → standing"; drop "hold" (handled by UI timer)
    this.stages = this.exercise.repRule
      .split("→")
      .map((s) => s.trim())
      .filter((s) => s !== "hold");
    this.stageIdx = 0;
    this.currentPhase = this.stages[0];
    this.repCount = 0;
    this.inHold = false; // true while user is holding a stretch position
    this.phaseCandidate = null;
    this.phaseCandidateSince = 0;
    this.startConfirmed = !this.exercise.phaseConfirmationMs;
  }

  changeExercise(exerciseId, affectedSide, calibration = null) {
    this._init(exerciseId, affectedSide ?? this.side, calibration);
  }

  update(angles, timestampMs = Date.now()) {
    const tracking = this._trackingStatus(angles);
    const detected = tracking.ready ? this._detectPhase(angles) : null;
    let canAdvance = tracking.ready;

    if (!tracking.ready) {
      this._resetPhaseCandidate();
      this.startConfirmed = !this.exercise.phaseConfirmationMs;
    } else if (!this.startConfirmed) {
      canAdvance = false;
      if (
        detected === this.stages[0] &&
        this._phaseConfirmed(`start:${detected}`, timestampMs)
      ) {
        this.startConfirmed = true;
        this._resetPhaseCandidate();
      } else if (detected !== this.stages[0]) {
        this._resetPhaseCandidate();
      }
    }

    if (!canAdvance) {
      // Start-position confirmation and tracking-loss handling above own the
      // phase candidate until it is safe to advance the exercise sequence.
    } else if (this.inHold) {
      // Only cancel if clearly in a different named phase — ignore null (low-confidence / mid-transition)
      if (detected !== null && detected !== this.currentPhase) {
        this.inHold = false;
        this.stageIdx = 0;
        this.currentPhase = this.stages[0];
      }
    } else if (detected !== null && detected !== this.currentPhase) {
      const nextStage = this.stages[this.stageIdx + 1];
      if (detected === nextStage) {
        if (this._phaseConfirmed(detected, timestampMs)) {
          this._advanceToPhase(detected);
        }
      } else {
        this._resetPhaseCandidate();
      }
    } else {
      this._resetPhaseCandidate();
    }

    const expectedNextPhase = this.stages[this.stageIdx + 1] ?? this.stages[0];
    return {
      exercise: this.exercise,
      stages: this.stages,
      stageIndex: this.stageIdx,
      phase: this.currentPhase,
      detectedPhase: detected,
      positionRecognized: detected !== null,
      expectedNextPhase,
      sequenceOnTrack:
        detected === null
          ? false
          : detected === this.currentPhase || detected === expectedNextPhase,
      repCount: this.repCount,
      inHold: this.inHold,
      holdPositionMaintained:
        this.inHold && tracking.ready && detected === this.currentPhase,
      trackingReady: tracking.ready,
      missingMeasurements: tracking.missingMeasurements,
      startConfirmed: this.startConfirmed,
      progress: tracking.ready ? this._progressToNext(angles) : 0,
      cues: tracking.ready ? this._evaluateCues(angles) : [],
      symmetryWarning: tracking.ready ? this._checkSymmetry(angles) : null,
    };
  }

  // Called by main.js when the hold countdown reaches zero
  completeHold() {
    this.repCount++;
    this.inHold = false;
    this.stageIdx = 0;
    this.currentPhase = this.stages[0];
    if (this.exercise.requiresReturnAfterHold) {
      // A second hold cannot be earned by remaining in the target position.
      // The stable starting phase must be observed again first.
      this.startConfirmed = false;
      this._resetPhaseCandidate();
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _detectPhase(angles) {
    for (const phase of this.exercise.phases) {
      if (this._phaseMatches(phase, angles)) return phase.name;
    }
    return null;
  }

  _phaseMatches(phase, angles) {
    for (const [key, condition] of Object.entries(phase)) {
      if (key === "name") continue;
      const measurement = this._resolve(key, angles);
      if (!measurement || measurement.lowConfidence) return false;
      if (!_conditionMatches(measurement.value, condition)) return false;
    }
    return true;
  }

  // Map generic key "knee" → "rightKnee" using affected side.
  _resolve(key, angles) {
    if (key in angles) return angles[key];
    const sideKey = `${this.side}${key[0].toUpperCase()}${key.slice(1)}`;
    return angles[sideKey] ?? null;
  }

  _trackingStatus(angles) {
    const requiredKeys = new Set(
      this.exercise.phases.flatMap((phase) =>
        Object.keys(phase).filter((key) => key !== "name")
      )
    );
    const missingMeasurements = new Set();

    for (const key of requiredKeys) {
      const measurement = this._resolve(key, angles);
      if (
        !measurement ||
        measurement.lowConfidence ||
        !_hasUsableValue(measurement.value)
      ) {
        missingMeasurements.add(this._resolvedKeyName(key, angles));
      }
    }

    // A symmetry check needs both sides. Do not report a bilateral movement as
    // good when only one side is visible enough to measure.
    if (this.exercise.symmetry) {
      const joint = this.exercise.symmetry.joint;
      const cap = joint[0].toUpperCase() + joint.slice(1);
      for (const side of ["left", "right"]) {
        const key = `${side}${cap}`;
        const measurement = angles[key];
        if (
          !measurement ||
          measurement.lowConfidence ||
          !Number.isFinite(measurement.value)
        ) {
          missingMeasurements.add(key);
        }
      }
    }

    return {
      ready: missingMeasurements.size === 0,
      missingMeasurements: [...missingMeasurements],
    };
  }

  _resolvedKeyName(key, angles) {
    if (key in angles) return key;
    return `${this.side}${key[0].toUpperCase()}${key.slice(1)}`;
  }

  _phaseConfirmed(phase, timestampMs) {
    const confirmationMs = this.exercise.phaseConfirmationMs ?? 0;
    if (confirmationMs <= 0) return true;

    if (this.phaseCandidate !== phase) {
      this.phaseCandidate = phase;
      this.phaseCandidateSince = timestampMs;
      return false;
    }

    return timestampMs - this.phaseCandidateSince >= confirmationMs;
  }

  _resetPhaseCandidate() {
    this.phaseCandidate = null;
    this.phaseCandidateSince = 0;
  }

  _advanceToPhase(phase) {
    this._resetPhaseCandidate();
    this.stageIdx++;
    this.currentPhase = phase;

    if (this.stageIdx < this.stages.length - 1) return;

    if (this.exercise.category === "stretch") {
      // Don't count yet — wait for the UI hold timer to complete.
      this.inHold = true;
    } else {
      this.repCount++;
      this.stageIdx = 0;
      this.currentPhase = this.stages[0];
    }
  }

  // scoring from 0 - 1, base on how well the stage is done, if 1 then can move on to the next stage
  _progressToNext(angles) {
    // if at the final stage of this distance and 
    if (this.stageIdx >= this.stages.length - 1) return 1;
    const nextName = this.stages[this.stageIdx + 1];
    const nextPhase = this.exercise.phases.find((p) => p.name === nextName);
    if (!nextPhase) return 0;
    let total = 0, score = 0;
    for (const [key, condition] of Object.entries(nextPhase)) {
      if (key === "name") continue;
      total++;
      const a = this._resolve(key, angles);
      if (!a || a.lowConfidence) continue;
      score += _conditionCloseness(a.value, condition);
    }
    return total === 0 ? 0 : score / total;
  }

  _evaluateCues(angles) {
    if (!this.exercise.cues) return [];
    const cues = [
      ...new Set(
        Object.entries(this.exercise.cues)
          .filter(([cond]) => this._evalCondition(cond, angles))
          .map(([, msg]) => msg)
      ),
    ];
    return cues.slice(0, this.exercise.maxCues ?? cues.length);
  }

  _evalCondition(cond, angles) {
    const m = cond.match(/^(\w+)([<>])(\d+(?:\.\d+)?)$/);
    if (!m) return false;
    const [, key, op, val] = m;
    const threshold = parseFloat(val);

    // "kneeDiff>15" → compare left vs right
    if (key.endsWith("Diff")) {
      const joint = key.slice(0, -4);
      const cap = joint[0].toUpperCase() + joint.slice(1);
      const l = angles[`left${cap}`], r = angles[`right${cap}`];
      if (!l || !r || l.lowConfidence || r.lowConfidence) return false;
      const diff = Math.abs(l.value - r.value);
      return op === "<" ? diff < threshold : diff > threshold;
    }

    const a = this._resolve(key, angles);
    if (!a || a.lowConfidence) return false;
    return op === "<" ? a.value < threshold : a.value > threshold;
  } // helper function used on evaluate cues to check if the cue is done well

  // check symmetry for bilateral exercises,
  _checkSymmetry(angles) {
    if (!this.exercise.symmetry) return null;
    const { joint, maxDiffDeg } = this.exercise.symmetry;
    const cap = joint[0].toUpperCase() + joint.slice(1);
    const l = angles[`left${cap}`], r = angles[`right${cap}`];
    if (!l || !r || l.lowConfidence || r.lowConfidence) return null;
    const diff = Math.abs(l.value - r.value);
    return diff > maxDiffDeg
      ? `${diff.toFixed(0)}° difference between knees — keep them even`
      : null;
  }
}

// How close is `value` to landing inside [min, max]? 0–1, which is defined in registry
function _angleCloseness(value, [min, max]) {
  if (value >= min && value <= max) return 1;
  const mid = (min + max) / 2;
  const halfWidth = (max - min) / 2;
  const outside = Math.abs(value - mid) - halfWidth;
  return Math.max(0, 1 - outside / 70); // 70° as normalising travel distance
}

function _hasUsableValue(value) {
  if (value === null || value === undefined) return false;
  return typeof value !== "number" || Number.isFinite(value);
}

function _conditionMatches(value, condition) {
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

function _conditionCloseness(value, condition) {
  if (Array.isArray(condition)) {
    return Number.isFinite(value) ? _angleCloseness(value, condition) : 0;
  }
  return _conditionMatches(value, condition) ? 1 : 0;
}

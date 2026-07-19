import { EXERCISES, EXERCISE_MAP } from "../exercises/registry.js";

export { EXERCISES };

export class FeedbackEngine {
  constructor(exerciseId = "half-squats", affectedSide = "right") {
    this._init(exerciseId, affectedSide);
  }

  _init(exerciseId, affectedSide) {
    this.exercise = EXERCISE_MAP[exerciseId];
    this.side = affectedSide;
    // Parse "standing → squat → standing"; drop "hold" (handled by UI timer)
    this.stages = this.exercise.repRule
      .split("→")
      .map((s) => s.trim())
      .filter((s) => s !== "hold");
    this.stageIdx = 0;
    this.currentPhase = this.stages[0];
    this.repCount = 0;
  }

  changeExercise(exerciseId, affectedSide) {
    this._init(exerciseId, affectedSide ?? this.side);
  }

  update(angles) {
    const detected = this._detectPhase(angles);

    // Advance state machine only to the next expected stage, in order.
    if (detected !== null && detected !== this.currentPhase) {
      const nextStage = this.stages[this.stageIdx + 1];
      if (detected === nextStage) {
        this.stageIdx++;
        this.currentPhase = detected;
        if (this.stageIdx >= this.stages.length - 1) {
          this.repCount++;
          this.stageIdx = 0;
          this.currentPhase = this.stages[0];
        }
      }
    }

    return {
      exercise: this.exercise,
      stages: this.stages,
      phase: this.currentPhase,
      repCount: this.repCount,
      progress: this._progressToNext(angles),
      cues: this._evaluateCues(angles),
      symmetryWarning: this._checkSymmetry(angles),
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _detectPhase(angles) {
    for (const phase of this.exercise.phases) {
      if (this._phaseMatches(phase, angles)) return phase.name;
    }
    return null;
  }

  _phaseMatches(phase, angles) {
    for (const [key, range] of Object.entries(phase)) {
      if (key === "name") continue;
      const a = this._resolve(key, angles);
      if (!a || a.lowConfidence) return false;
      if (a.value < range[0] || a.value > range[1]) return false;
    }
    return true;
  }

  // Map generic key "knee" → "rightKnee" using affected side.
  _resolve(key, angles) {
    if (key in angles) return angles[key];
    const sideKey = `${this.side}${key[0].toUpperCase()}${key.slice(1)}`;
    return angles[sideKey] ?? null;
  }

  _progressToNext(angles) {
    if (this.stageIdx >= this.stages.length - 1) return 1;
    const nextName = this.stages[this.stageIdx + 1];
    const nextPhase = this.exercise.phases.find((p) => p.name === nextName);
    if (!nextPhase) return 0;
    let total = 0, score = 0;
    for (const [key, range] of Object.entries(nextPhase)) {
      if (key === "name") continue;
      total++;
      const a = this._resolve(key, angles);
      if (!a || a.lowConfidence) continue;
      score += _angleCloseness(a.value, range);
    }
    return total === 0 ? 0 : score / total;
  }

  _evaluateCues(angles) {
    if (!this.exercise.cues) return [];
    return Object.entries(this.exercise.cues)
      .filter(([cond]) => this._evalCondition(cond, angles))
      .map(([, msg]) => msg);
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
  }

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

// How close is `value` to landing inside [min, max]? 0–1.
function _angleCloseness(value, [min, max]) {
  if (value >= min && value <= max) return 1;
  const mid = (min + max) / 2;
  const halfWidth = (max - min) / 2;
  const outside = Math.abs(value - mid) - halfWidth;
  return Math.max(0, 1 - outside / 70); // 70° as normalising travel distance
}

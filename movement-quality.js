function nonNegativeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function boundedCorrectionCount(value, repetitions) {
  const count = nonNegativeNumber(value) ?? 0;
  return Math.min(repetitions, Math.round(count));
}

/**
 * Produce a provisional 0–100 movement-quality indicator from corrections
 * detected during measured repetitions. Correction counts are capped at once
 * per repetition so a cue that remains visible for many video frames cannot
 * overwhelm the score.
 */
export function calculateMovementQuality({
  cuesTriggered = [],
  symmetryWarnings = 0,
  repetitions = 0,
} = {}) {
  const reps = Math.round(nonNegativeNumber(repetitions) ?? 0);
  if (reps < 1) return null;

  const cueEvents = (Array.isArray(cuesTriggered) ? cuesTriggered : [])
    .reduce(
      (total, cue) => total + boundedCorrectionCount(
        cue?.trigger_count,
        reps,
      ),
      0,
    );
  const symmetryEvents = boundedCorrectionCount(symmetryWarnings, reps);

  // One repeated correction across every repetition reduces the score by 25
  // points. Multiple types can reduce it further, but a measured session is
  // never reported as zero solely because cues persisted across video frames.
  const cuePenalty = Math.min(60, (cueEvents / reps) * 25);
  const symmetryPenalty = Math.min(20, (symmetryEvents / reps) * 15);
  return Math.round(Math.max(20, 100 - cuePenalty - symmetryPenalty));
}

/**
 * Recalculate sessions saved by the older frame-counting implementation when
 * correction evidence is available. This repairs previously displayed zeroes
 * without inventing measurements for sessions that contain no usable data.
 */
export function movementQualityFromSession(session = {}) {
  const reps = Math.round(nonNegativeNumber(session.reps_completed) ?? 0);
  const cues = Array.isArray(session.cues_triggered)
    ? session.cues_triggered
    : [];
  const symmetryWarnings = nonNegativeNumber(
    session.symmetry_warnings_count,
  ) ?? 0;
  const hasCorrectionEvidence = cues.some(
    (cue) => (nonNegativeNumber(cue?.trigger_count) ?? 0) > 0,
  ) || symmetryWarnings > 0;

  if (reps > 0 && hasCorrectionEvidence) {
    return calculateMovementQuality({
      cuesTriggered: cues,
      symmetryWarnings,
      repetitions: reps,
    });
  }

  return nonNegativeNumber(session.quality_score);
}

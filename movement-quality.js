const COACHING_SCORING_VERSION = 2;
const DEFAULT_GRACE_REPETITIONS = 2;
const DEFAULT_DEDUCTION = 5;
const DEFAULT_MAX_DEDUCTION = 30;

function nonNegativeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function boundedCorrectionCount(value, repetitions) {
  const count = nonNegativeNumber(value) ?? 0;
  return Math.min(repetitions, Math.round(count));
}

function normalizedCue(cue) {
  const text = String(cue?.message ?? cue?.cue_text ?? cue ?? "").trim();
  if (!text) return null;
  return {
    id: String(cue?.id ?? text),
    text,
    reliable: cue?.qualityReliable !== false && cue?.reliable !== false,
  };
}

function coachingRecords(cuesTriggered = []) {
  return (Array.isArray(cuesTriggered) ? cuesTriggered : []).filter(
    (cue) => Number(cue?.scoring_version) === COACHING_SCORING_VERSION,
  );
}

/**
 * Tracks whether a patient had a fair opportunity to respond to a correction.
 * A correction is scoreable only after it was stable, displayed, and either
 * spoken successfully or intentionally delivered in on-screen-only mode.
 */
export class CoachingQualitySession {
  constructor({
    stableForMs = 800,
    graceRepetitions = DEFAULT_GRACE_REPETITIONS,
    deductionPerIssue = DEFAULT_DEDUCTION,
    maxDeduction = DEFAULT_MAX_DEDUCTION,
  } = {}) {
    this.stableForMs = stableForMs;
    this.graceRepetitions = graceRepetitions;
    this.deductionPerIssue = deductionPerIssue;
    this.maxDeduction = maxDeduction;
    this.reset();
  }

  reset() {
    this.candidate = null;
    this.pending = null;
    this.active = null;
    this.records = [];
    this.assessedCueIds = new Set();
    this.nextReminderId = 1;
    this.activeObservationCandidate = null;
  }

  observe({ cue = null, timestampMs = Date.now(), repetitionNumber = 1 } = {}) {
    const now = Number.isFinite(Number(timestampMs))
      ? Number(timestampMs)
      : Date.now();
    const repetition = Math.max(1, Math.round(Number(repetitionNumber) || 1));
    const issue = normalizedCue(cue);

    this._assessActiveIfWindowComplete(repetition);

    if (this.active && repetition > this.active.reminder_rep) {
      if (issue?.reliable && issue.id === this.active.cue_id) {
        if (
          this.activeObservationCandidate?.cue_id !== issue.id
          || this.activeObservationCandidate?.repetition !== repetition
        ) {
          this.activeObservationCandidate = {
            cue_id: issue.id,
            repetition,
            first_seen_at: now,
          };
        } else if (
          now - this.activeObservationCandidate.first_seen_at >= this.stableForMs
        ) {
          this.active.observed_repetitions.add(repetition);
        }
      } else {
        this.activeObservationCandidate = null;
      }
    }

    // Only one clear correction is coached at a time. While its response
    // window is active, other measurements cannot silently affect the score.
    if (this.active) {
      return {
        handled: issue?.id === this.active.cue_id,
        stable: issue?.id === this.active.cue_id,
        adjusting: true,
        reminder: null,
      };
    }

    if (this.pending) {
      if (issue?.reliable && issue.id === this.pending.cue_id) {
        this.pending.last_seen_at = now;
        return { handled: true, stable: true, reminder: this.pending };
      }
      // Do not play a correction that has already disappeared while it was
      // waiting for another audio message to finish.
      if (now - this.pending.last_seen_at > 500) this.pending = null;
      else return { handled: false, stable: false, reminder: null };
    }

    if (!issue?.reliable) {
      this.candidate = null;
      return { handled: false, stable: false, reminder: null };
    }

    if (this.assessedCueIds.has(issue.id)) {
      return { handled: true, stable: true, reminder: null };
    }

    if (this.candidate?.cue_id !== issue.id) {
      this.candidate = {
        cue_id: issue.id,
        cue_text: issue.text,
        first_seen_at: now,
      };
      return { handled: true, stable: false, reminder: null };
    }

    if (now - this.candidate.first_seen_at < this.stableForMs) {
      return { handled: true, stable: false, reminder: null };
    }

    this.pending = {
      id: this.nextReminderId++,
      cue_id: issue.id,
      cue_text: issue.text,
      detected_rep: repetition,
      last_seen_at: now,
      displayed: false,
      speech_queued: false,
    };
    this.candidate = null;
    return { handled: true, stable: true, reminder: this.pending };
  }

  markDisplayed(reminderId) {
    if (this.pending?.id !== reminderId) return false;
    this.pending.displayed = true;
    return true;
  }

  markSpeechQueued(reminderId) {
    if (this.pending?.id !== reminderId || this.pending.speech_queued) {
      return false;
    }
    this.pending.speech_queued = true;
    return true;
  }

  releaseSpeech(reminderId) {
    if (this.pending?.id !== reminderId) return;
    this.pending.speech_queued = false;
  }

  confirmDelivery(reminderId, {
    repetitionNumber = 1,
    spoken = false,
    voiceRequired = true,
  } = {}) {
    if (this.pending?.id !== reminderId || !this.pending.displayed) return false;
    if (voiceRequired && !spoken) return false;

    const reminderRep = Math.max(
      1,
      Math.round(Number(repetitionNumber) || this.pending.detected_rep || 1),
    );
    const record = {
      kind: "coaching_reminder",
      scoring_version: COACHING_SCORING_VERSION,
      cue_id: this.pending.cue_id,
      cue_text: this.pending.cue_text,
      trigger_count: 1,
      reminder_rep: reminderRep,
      adjustment_reps: this.graceRepetitions,
      delivered: true,
      delivery_mode: spoken ? "shown_and_spoken" : "shown_on_screen",
      outcome: "adjusting",
      deduction: 0,
    };
    this.records.push(record);
    this.active = {
      ...record,
      record,
      observed_repetitions: new Set(),
    };
    this.activeObservationCandidate = null;
    this.pending = null;
    return true;
  }

  finish(totalRepetitions = 0) {
    const total = Math.max(0, Math.round(Number(totalRepetitions) || 0));
    this.pending = null;
    this.candidate = null;
    if (!this.active) return;

    const finalGraceRep = this.active.reminder_rep + this.graceRepetitions;
    if (total >= finalGraceRep) this._completeActiveAssessment();
    else {
      this.active.record.outcome = "not_assessed";
      this.active.record.deduction = 0;
      this.assessedCueIds.add(this.active.cue_id);
      this.active = null;
      this.activeObservationCandidate = null;
    }
  }

  cuesForPersistence() {
    return [
      {
        kind: "coaching_quality",
        scoring_version: COACHING_SCORING_VERSION,
        cue_text: "",
        trigger_count: 0,
        deduction: 0,
      },
      ...this.records.map((record) => ({ ...record })),
    ];
  }

  _assessActiveIfWindowComplete(currentRepetition) {
    if (
      this.active
      && currentRepetition > (
        this.active.reminder_rep + this.graceRepetitions
      )
    ) {
      this._completeActiveAssessment();
    }
  }

  _completeActiveAssessment() {
    if (!this.active) return;
    const requiredRepetitions = Array.from(
      { length: this.graceRepetitions },
      (_, index) => this.active.reminder_rep + index + 1,
    );
    // A deduction requires the same reliable issue in every grace repetition.
    // A single uncertain or corrected repetition therefore cannot lower score.
    const persisted = requiredRepetitions.every(
      (rep) => this.active.observed_repetitions.has(rep),
    );
    const usedDeduction = this.records.reduce(
      (sum, record) => sum + (nonNegativeNumber(record.deduction) ?? 0),
      0,
    );
    const availableDeduction = Math.max(0, this.maxDeduction - usedDeduction);
    this.active.record.outcome = persisted ? "persisted" : "improved";
    this.active.record.deduction = persisted
      ? Math.min(this.deductionPerIssue, availableDeduction)
      : 0;
    this.assessedCueIds.add(this.active.cue_id);
    this.active = null;
    this.activeObservationCandidate = null;
  }
}

/**
 * Produce a 0–100 coaching-response indicator. In version 2, only documented
 * deductions after delivered reminders affect the score. The legacy branch is
 * used only by direct callers; saved legacy sessions are reassessed below
 * because they contain no proof that their detected cues were delivered.
 */
export function calculateMovementQuality({
  cuesTriggered = [],
  symmetryWarnings = 0,
  repetitions = 0,
} = {}) {
  const reps = Math.round(nonNegativeNumber(repetitions) ?? 0);
  if (reps < 1) return null;

  const versionedRecords = coachingRecords(cuesTriggered);
  if (versionedRecords.length) {
    const deduction = versionedRecords.reduce(
      (sum, cue) => sum + (nonNegativeNumber(cue?.deduction) ?? 0),
      0,
    );
    return Math.round(Math.max(
      100 - DEFAULT_MAX_DEDUCTION,
      100 - Math.min(DEFAULT_MAX_DEDUCTION, deduction),
    ));
  }

  const cueEvents = (Array.isArray(cuesTriggered) ? cuesTriggered : [])
    .reduce(
      (total, cue) => total + boundedCorrectionCount(cue?.trigger_count, reps),
      0,
    );
  const symmetryEvents = boundedCorrectionCount(symmetryWarnings, reps);
  const cuePenalty = Math.min(60, (cueEvents / reps) * 25);
  const symmetryPenalty = Math.min(20, (symmetryEvents / reps) * 15);
  return Math.round(Math.max(20, 100 - cuePenalty - symmetryPenalty));
}

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

  if (reps > 0 && coachingRecords(cues).length) {
    return calculateMovementQuality({
      cuesTriggered: cues,
      symmetryWarnings,
      repetitions: reps,
    });
  }

  if (reps > 0 && hasCorrectionEvidence) {
    // Legacy sessions recorded camera detections, sometimes once per frame,
    // but did not record whether the user saw or heard a reminder or received
    // two repetitions to respond. Under the coaching-first rubric none of
    // those old detections is a justified deduction. The underlying cues and
    // angles remain saved; only their displayed coaching-response score is
    // reassessed.
    return 100;
  }

  return nonNegativeNumber(session.quality_score);
}

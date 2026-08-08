import assert from "node:assert/strict";

import {
  calculateMovementQuality,
  CoachingQualitySession,
  movementQualityFromSession,
} from "../movement-quality.js";

const metadata = {
  kind: "coaching_quality",
  scoring_version: 2,
  cue_text: "",
  trigger_count: 0,
  deduction: 0,
};

assert.equal(
  calculateMovementQuality({ repetitions: 0 }),
  null,
  "an unmeasured session must not receive a quality score",
);

assert.equal(
  calculateMovementQuality({ repetitions: 12, cuesTriggered: [metadata] }),
  100,
  "a measured coached session without deductions should score 100",
);

assert.equal(
  calculateMovementQuality({
    repetitions: 12,
    cuesTriggered: [
      metadata,
      { scoring_version: 2, delivered: true, outcome: "persisted", deduction: 5 },
    ],
  }),
  95,
  "only an issue that persisted after delivered coaching should deduct points",
);

assert.equal(
  calculateMovementQuality({
    repetitions: 12,
    cuesTriggered: [
      metadata,
      ...Array.from({ length: 10 }, () => ({
        scoring_version: 2,
        delivered: true,
        outcome: "persisted",
        deduction: 5,
      })),
    ],
  }),
  70,
  "deductions must be capped so corrections cannot destroy the score",
);

{
  const tracker = new CoachingQualitySession({ stableForMs: 800 });
  const cue = { id: "torso", message: "Bring your chest upright" };
  assert.equal(tracker.observe({ cue, timestampMs: 0, repetitionNumber: 1 }).reminder, null);
  assert.equal(tracker.observe({ cue, timestampMs: 799, repetitionNumber: 1 }).reminder, null);
  const reminder = tracker.observe({ cue, timestampMs: 800, repetitionNumber: 1 }).reminder;
  assert.ok(reminder, "a reliable issue should be reminded only after it is stable");
  tracker.markDisplayed(reminder.id);
  tracker.confirmDelivery(reminder.id, {
    repetitionNumber: 1,
    spoken: true,
    voiceRequired: true,
  });

  // The issue must itself remain stable during each of the two grace reps.
  tracker.observe({ cue, timestampMs: 1000, repetitionNumber: 2 });
  tracker.observe({ cue, timestampMs: 1800, repetitionNumber: 2 });
  tracker.observe({ cue, timestampMs: 2000, repetitionNumber: 3 });
  tracker.observe({ cue, timestampMs: 2800, repetitionNumber: 3 });
  tracker.observe({ cue: null, timestampMs: 3000, repetitionNumber: 4 });
  tracker.finish(3);

  const record = tracker.cuesForPersistence().find(
    (item) => item.kind === "coaching_reminder",
  );
  assert.equal(record.outcome, "persisted");
  assert.equal(record.deduction, 5);
  assert.equal(
    calculateMovementQuality({
      repetitions: 3,
      cuesTriggered: tracker.cuesForPersistence(),
    }),
    95,
  );

  assert.equal(
    tracker.observe({ cue, timestampMs: 4000, repetitionNumber: 4 }).reminder,
    null,
    "the same issue must not be counted twice in one session",
  );
}

{
  const tracker = new CoachingQualitySession({ stableForMs: 0 });
  const cue = { id: "knees", message: "Align your knees with your toes" };
  tracker.observe({ cue, timestampMs: 0, repetitionNumber: 1 });
  const reminder = tracker.observe({ cue, timestampMs: 1, repetitionNumber: 1 }).reminder;
  tracker.markDisplayed(reminder.id);
  tracker.confirmDelivery(reminder.id, {
    repetitionNumber: 1,
    spoken: true,
    voiceRequired: true,
  });
  tracker.observe({ cue: null, timestampMs: 100, repetitionNumber: 2 });
  tracker.observe({ cue: null, timestampMs: 200, repetitionNumber: 3 });
  tracker.finish(3);
  const record = tracker.cuesForPersistence().find(
    (item) => item.kind === "coaching_reminder",
  );
  assert.equal(record.outcome, "improved");
  assert.equal(record.deduction, 0, "responding to guidance must not lose points");
}

{
  const tracker = new CoachingQualitySession({ stableForMs: 0 });
  const unreliable = {
    id: "front-depth",
    message: "Keep your foot flat",
    qualityReliable: false,
  };
  tracker.observe({ cue: unreliable, timestampMs: 0, repetitionNumber: 1 });
  const observation = tracker.observe({
    cue: unreliable,
    timestampMs: 1000,
    repetitionNumber: 1,
  });
  assert.equal(observation.reminder, null);
  tracker.finish(3);
  assert.equal(tracker.cuesForPersistence().length, 1);
}

{
  const tracker = new CoachingQualitySession({ stableForMs: 0 });
  const cue = { id: "audio-wait", message: "Stand tall" };
  tracker.observe({ cue, timestampMs: 0, repetitionNumber: 1 });
  const reminder = tracker.observe({ cue, timestampMs: 1, repetitionNumber: 1 }).reminder;
  tracker.markDisplayed(reminder.id);
  assert.equal(
    tracker.confirmDelivery(reminder.id, {
      repetitionNumber: 1,
      spoken: false,
      voiceRequired: true,
    }),
    false,
    "a voice-mode reminder is not delivered until speech finishes",
  );
  // It was never confirmed because another sentence prevented speech.
  tracker.finish(3);
  assert.equal(
    calculateMovementQuality({
      repetitions: 3,
      cuesTriggered: tracker.cuesForPersistence(),
    }),
    100,
    "an undelivered reminder must never cause a deduction",
  );
}

assert.equal(
  movementQualityFromSession({
    reps_completed: 12,
    quality_score: 0,
    cues_triggered: [{
      cue_text: "Make the squat a little shallower",
      trigger_count: 207,
    }],
    symmetry_warnings_count: 0,
  }),
  75,
  "legacy frame-counted sessions should retain their normalized display",
);

console.log("movement quality coaching tests passed");

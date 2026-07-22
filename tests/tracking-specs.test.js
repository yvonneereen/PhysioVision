import assert from "node:assert/strict";

import { DRAFT_EXERCISES } from "../exercises/catalog.js";
import {
  DRAFT_TRACKING_SPECS,
  DRAFT_TRACKING_SPEC_MAP,
  PROTOTYPE_TRACKING_SPEC_STATUS,
  TRACKING_SPEC_STATUS,
} from "../exercises/tracking-specs.js";

const catalogIds = DRAFT_EXERCISES.map((exercise) => exercise.id).sort();
const specIds = DRAFT_TRACKING_SPECS.map((trackingSpec) => trackingSpec.exerciseId).sort();

assert.deepEqual(specIds, catalogIds, "every draft exercise must have exactly one tracking plan");
assert.equal(new Set(specIds).size, specIds.length, "tracking-plan IDs must be unique");
assert.equal(Object.keys(DRAFT_TRACKING_SPEC_MAP).length, specIds.length);

for (const trackingSpec of DRAFT_TRACKING_SPECS) {
  assert.equal(
    trackingSpec.status,
    trackingSpec.liveTracking
      ? PROTOTYPE_TRACKING_SPEC_STATUS
      : TRACKING_SPEC_STATUS
  );
  assert.ok(trackingSpec.readiness);
  assert.ok(trackingSpec.tracker);
  assert.ok(trackingSpec.camera);
  assert.ok(trackingSpec.phases.length >= 2);
  assert.ok(trackingSpec.rules.length >= 1);
  assert.equal(trackingSpec.qualityGates.onTrackingLoss, "pause_immediately_and_hide_positive_feedback");

  for (const measurementRule of trackingSpec.rules) {
    assert.ok(measurementRule.metric);
    assert.ok(measurementRule.type);
    assert.ok(measurementRule.landmarks.length > 0);
    assert.ok(measurementRule.cue);
    assert.equal(
      measurementRule.acceptance.requiresClinicianVideoValidation,
      true,
      `${trackingSpec.exerciseId}.${measurementRule.metric} must stay explicitly unvalidated`
    );

    if (measurementRule.acceptance.range) {
      const [minimum, maximum] = measurementRule.acceptance.range;
      assert.ok(Number.isFinite(minimum));
      assert.ok(Number.isFinite(maximum));
      assert.ok(minimum <= maximum);
    }
  }
}

console.log("draft tracking specification tests passed");

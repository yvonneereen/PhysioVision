import assert from "node:assert/strict";

import {
  evaluateWellnessScreening,
  isWellnessEligible,
  WELLNESS_SCREENING_KEYS,
} from "../wellness-screening.js";

const allClear = Object.fromEntries(
  WELLNESS_SCREENING_KEYS.map((key) => [key, true])
);
const eligible = evaluateWellnessScreening(allClear);
assert.equal(eligible.status, "eligible");
assert.equal(isWellnessEligible({
  carePath: "wellness",
  wellnessScreening: eligible,
}), true);

const needsReview = evaluateWellnessScreening({
  ...allClear,
  noConcerningSymptoms: false,
});
assert.equal(needsReview.status, "needs_review");
assert.equal(needsReview.reviewReasons.length, 1);
assert.equal(isWellnessEligible({
  carePath: "wellness",
  wellnessScreening: needsReview,
}), false);

assert.equal(evaluateWellnessScreening({}).status, "needs_review");

console.log("wellness screening tests passed");

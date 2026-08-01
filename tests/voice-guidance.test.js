import assert from "node:assert/strict";

import {
  parseConfirmationResponse,
  parsePainLevel,
  parseRecoveryStatus,
} from "../voice-guidance.js";

assert.equal(parsePainLevel("My pain is 7 out of 10"), 7);
assert.equal(parsePainLevel("I would say ten"), 10);
assert.equal(parsePainLevel("pain level four"), 4);
assert.equal(parsePainLevel("I feel fine"), null);
assert.equal(parsePainLevel("17"), null);

assert.equal(parseRecoveryStatus("I feel better this week"), "better");
assert.equal(parseRecoveryStatus("About the same"), "same");
assert.equal(parseRecoveryStatus("It feels worse today"), "worse");
assert.equal(parseRecoveryStatus("I am not sure"), "unsure");
assert.equal(parseRecoveryStatus("fine"), null);

assert.equal(parseConfirmationResponse("Yes, that is correct"), "confirm");
assert.equal(parseConfirmationResponse("Continue"), "confirm");
assert.equal(parseConfirmationResponse("No, change my answer"), "change");
assert.equal(parseConfirmationResponse("That is wrong"), "change");
assert.equal(parseConfirmationResponse("maybe"), null);

console.log("voice-guidance tests passed");

import assert from "node:assert/strict";

import {
  parseConfirmationResponse,
  parsePainLevel,
  parseRecoveryStatus,
  prepareGentleSpeech,
  selectGentleVoice,
  VoiceGuidance,
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

const noveltyVoice = {
  name: "Zarvox",
  lang: "en-US",
  default: true,
  localService: true,
};
const standardVoice = {
  name: "Standard English",
  lang: "en-US",
  default: false,
  localService: true,
};
const gentleVoice = {
  name: "Samantha (Enhanced)",
  lang: "en-US",
  default: false,
  localService: true,
};
assert.equal(
  selectGentleVoice([noveltyVoice, standardVoice, gentleVoice]),
  gentleVoice
);
assert.equal(
  prepareGentleSpeech("Set one complete — please rest; begin when ready."),
  "Set one complete. please rest. begin when ready."
);

class MockUtterance {
  constructor(text) {
    this.text = text;
    this.listeners = {};
  }

  addEventListener(event, callback) {
    this.listeners[event] = callback;
  }
}

const spoken = [];
const mockWindow = {
  document: { documentElement: { lang: "en-US" } },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  SpeechSynthesisUtterance: MockUtterance,
  speechSynthesis: {
    speaking: false,
    getVoices: () => [standardVoice, gentleVoice],
    addEventListener: () => {},
    speak: (utterance) => spoken.push(utterance),
    cancel: () => {},
  },
};
const guidance = new VoiceGuidance(mockWindow);
assert.equal(guidance.speak("You are ready — take your time."), true);
assert.equal(spoken[0].voice, gentleVoice);
assert.equal(spoken[0].text, "You are ready. take your time.");
assert.equal(spoken[0].rate, 0.84);
assert.equal(spoken[0].pitch, 1.04);
assert.equal(spoken[0].volume, 0.92);

console.log("voice-guidance tests passed");

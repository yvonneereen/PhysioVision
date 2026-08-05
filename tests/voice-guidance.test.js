import assert from "node:assert/strict";

import {
  describeMicrophoneAccessFailure,
  parseConfirmationResponse,
  parsePainLevel,
  parsePainSafetyResponse,
  parseRecoveryStatus,
  conversationalProsody,
  prepareGentleSpeech,
  readMicrophonePermissionState,
  selectGentleVoice,
  VoiceGuidance,
} from "../voice-guidance.js";

assert.equal(
  await readMicrophonePermissionState({
    permissions: { query: async () => ({ state: "denied" }) },
  }),
  "denied"
);
assert.equal(
  await readMicrophonePermissionState({
    permissions: { query: async () => { throw new TypeError("unsupported"); } },
  }),
  "unknown",
  "Safari without microphone Permissions API support should remain usable"
);
assert.match(
  describeMicrophoneAccessFailure(
    { name: "NotAllowedError" },
    { userAgent: "Mozilla/5.0 Version/18.0 Safari/605.1.15" }
  ),
  /Safari > Settings > Websites > Microphone/,
  "Safari denial should explain why no prompt appeared and how to recover"
);
assert.match(
  describeMicrophoneAccessFailure(
    { name: "NotAllowedError" },
    { userAgent: "Mozilla/5.0 Chrome/128.0 Safari/537.36" }
  ),
  /browser settings/,
  "non-Safari denial should use browser-neutral recovery guidance"
);
assert.match(
  describeMicrophoneAccessFailure({ name: "NotFoundError" }),
  /No microphone was found/,
  "a missing input device should not be misreported as permission denial"
);

assert.equal(parsePainLevel("My pain is 7 out of 10"), 7);
assert.equal(parsePainLevel("I would say ten"), 10);
assert.equal(parsePainLevel("pain level four"), 4);
assert.equal(parsePainLevel("I feel fine"), null);
assert.equal(parsePainLevel("17"), null);
assert.equal(parsePainLevel("我的疼痛是七分"), 7);
assert.equal(parsePainLevel("tahap sakit saya lapan"), 8);
assert.equal(parsePainLevel("என் வலி ஏழு"), 7);

assert.equal(parseRecoveryStatus("I feel better this week"), "better");
assert.equal(parseRecoveryStatus("About the same"), "same");
assert.equal(parseRecoveryStatus("It feels worse today"), "worse");
assert.equal(parseRecoveryStatus("I am not sure"), "unsure");
assert.equal(parseRecoveryStatus("fine"), null);
assert.equal(parseRecoveryStatus("越来越好"), "better");
assert.equal(parseRecoveryStatus("semakin teruk"), "worse");
assert.equal(parseRecoveryStatus("மாற்றமில்லை"), "same");

assert.equal(parseConfirmationResponse("Yes, that is correct"), "confirm");
assert.equal(parseConfirmationResponse("Continue"), "confirm");
assert.equal(parseConfirmationResponse("No, change my answer"), "change");
assert.equal(parseConfirmationResponse("That is wrong"), "change");
assert.equal(parseConfirmationResponse("maybe"), null);
assert.equal(parseConfirmationResponse("是的，正确"), "confirm");
assert.equal(parseConfirmationResponse("Ya, betul"), "confirm");
assert.equal(parseConfirmationResponse("இல்லை, மாற்று"), "change");

assert.equal(parsePainSafetyResponse("urgent", "No symptoms"), "no");
assert.equal(parsePainSafetyResponse("urgent", "None"), "no");
assert.equal(parsePainSafetyResponse("urgent", "I am not sure"), "unsure");
assert.equal(parsePainSafetyResponse("urgent", "I feel numb"), "yes");
assert.equal(
  parsePainSafetyResponse("urgent", "I don't have any of those"),
  "no"
);
assert.equal(parsePainSafetyResponse("urgent", "not really"), "");
assert.equal(parsePainSafetyResponse("urgent", "没有以上情况"), "no");
assert.equal(parsePainSafetyResponse("urgent", "Ya"), "yes");
assert.equal(parsePainSafetyResponse("urgent", "உறுதியாக தெரியவில்லை"), "unsure");
assert.equal(
  parsePainSafetyResponse("urgent-chest", "I have chest tightness"),
  "yes"
);
assert.equal(
  parsePainSafetyResponse("urgent-chest", "I don't have chest pressure"),
  "no"
);
assert.equal(
  parsePainSafetyResponse("urgent-breathing", "It is hard to breathe"),
  "yes"
);
assert.equal(
  parsePainSafetyResponse("urgent-neurologic", "My arm feels numb"),
  "yes"
);
assert.equal(parsePainSafetyResponse("location", "My right knee"), "knee");
assert.equal(parsePainSafetyResponse("location", "我的膝盖"), "knee");
assert.equal(parsePainSafetyResponse("location", "sakit di buku lali"), "ankle");
assert.equal(parsePainSafetyResponse("location", "முதுகு வலி"), "back");
assert.equal(parsePainSafetyResponse("side", "Both sides"), "both");
assert.equal(
  parsePainSafetyResponse("familiarity", "My usual pain is stronger"),
  "usual-stronger"
);
assert.equal(
  parsePainSafetyResponse("timing", "It started during this exercise"),
  "during"
);
assert.equal(parsePainSafetyResponse("rest", "It is getting worse"), "worse");
assert.equal(
  parsePainSafetyResponse("mobility", "I need someone nearby"),
  "nearby"
);
assert.equal(
  parsePainSafetyResponse("mobility", "It is too painful to stand"),
  "help"
);
assert.equal(
  parsePainSafetyResponse("mobility", "我不能站，需要帮助"),
  "help"
);

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
  "Set one complete, please rest; begin when ready."
);
assert.deepEqual(
  conversationalProsody("How is your pain right now?"),
  { rate: 0.91, pitch: 1.02 }
);
assert.deepEqual(
  conversationalProsody("Stop exercising and call 995 now."),
  { rate: 0.87, pitch: 0.98 }
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
assert.equal(spoken[0].text, "You are ready, take your time.");
assert.equal(spoken[0].rate, 0.94);
assert.equal(spoken[0].pitch, 1.01);
assert.equal(spoken[0].volume, 1);

guidance.speak("How is your pain right now?", {
  key: "conversational-question",
  interrupt: true,
});
assert.equal(spoken[1].rate, 0.91);
assert.equal(spoken[1].pitch, 1.02);

guidance.speak("Custom pace", {
  key: "custom-prosody",
  interrupt: true,
  rate: 1.05,
  pitch: 0.95,
});
assert.equal(spoken[2].rate, 1.05);
assert.equal(spoken[2].pitch, 0.95);

let delayedVoiceList = [];
let delayedVoicesChanged = null;
const delayedSpoken = [];
const delayedVoiceWindow = {
  ...mockWindow,
  speechSynthesis: {
    speaking: false,
    getVoices: () => delayedVoiceList,
    addEventListener: (event, callback) => {
      if (event === "voiceschanged") delayedVoicesChanged = callback;
    },
    speak: (utterance) => delayedSpoken.push(utterance),
    cancel: () => {},
  },
};
const preparedGuidance = new VoiceGuidance(delayedVoiceWindow);
globalThis.setTimeout(() => {
  delayedVoiceList = [gentleVoice];
}, 10);
assert.equal(
  await preparedGuidance.preparePreferredVoice({ timeoutMs: 100, pollMs: 5 }),
  gentleVoice
);
preparedGuidance.speak("First prompt", { interrupt: true });
assert.equal(delayedSpoken[0].voice, gentleVoice);
assert.equal(delayedSpoken[0].volume, 1);
delayedVoiceList = [standardVoice];
delayedVoicesChanged?.();
preparedGuidance.speak("Second prompt", { interrupt: true });
assert.equal(delayedSpoken[1].voice, gentleVoice);
assert.equal(delayedSpoken[1].volume, 1);

let microphoneReleaseDelay = null;
const safariAudioSession = { type: "play-and-record" };
const settlingWindow = {
  ...mockWindow,
  navigator: { audioSession: safariAudioSession },
  setTimeout: (callback, delay) => {
    microphoneReleaseDelay = delay;
    callback();
    return 1;
  },
};
const settlingGuidance = new VoiceGuidance(settlingWindow);
assert.equal(
  await settlingGuidance.prepareSpeechAfterMicrophoneRelease(),
  gentleVoice
);
assert.equal(
  microphoneReleaseDelay,
  1200,
  "the first prompt should wait for Safari to release microphone audio mode"
);
assert.equal(
  safariAudioSession.type,
  "playback",
  "spoken guidance should restore Safari's full-volume playback audio mode"
);
safariAudioSession.type = "play-and-record";
settlingGuidance.speak("Please give me a number from zero to ten.", {
  interrupt: true,
});
assert.equal(
  safariAudioSession.type,
  "playback",
  "every prompt should restore playback mode after Safari microphone use"
);

let activeRecognitionInstance = null;
const recognitionInstances = [];
class MockRecognition {
  constructor() {
    this.listeners = {};
    this.stopCalled = false;
    activeRecognitionInstance = this;
    recognitionInstances.push(this);
  }

  addEventListener(event, callback) {
    this.listeners[event] = callback;
  }

  start() {
    this.listeners.start?.();
  }

  stop() {
    this.stopCalled = true;
    this.listeners.end?.();
  }

  abort() {
    this.listeners.end?.();
  }

  emitResult(transcript) {
    this.listeners.result?.({
      results: [[{ transcript }]],
    });
  }

  emitInterimResult(transcript) {
    const result = [{ transcript }];
    result.isFinal = false;
    this.listeners.result?.({ results: [result] });
  }

  emitError(error) {
    this.listeners.error?.({ error });
  }
}

const listeningWindow = {
  ...mockWindow,
  navigator: { language: "en-SG" },
  SpeechRecognition: MockRecognition,
};
const listeningGuidance = new VoiceGuidance(listeningWindow);
let deliveredTranscript = "";
let recognitionAtDelivery = undefined;
assert.equal(
  listeningGuidance.listen({
    onResult: (transcript) => {
      deliveredTranscript = transcript;
      recognitionAtDelivery = listeningGuidance.activeRecognition;
      listeningGuidance.speak("Where are you feeling the pain?", {
        interrupt: true,
      });
    },
  }),
  true
);
assert.equal(activeRecognitionInstance.interimResults, true);
assert.equal(activeRecognitionInstance.maxAlternatives, 3);
assert.equal(activeRecognitionInstance.lang, "en-SG");
activeRecognitionInstance.emitResult("None");
assert.equal(activeRecognitionInstance.stopCalled, true);
assert.equal(deliveredTranscript, "None");
assert.equal(recognitionAtDelivery, null);
assert.equal(spoken.at(-1).text, "Where are you feeling the pain?");

let interimTranscript = "";
listeningGuidance.listen({
  onResult: (transcript) => {
    interimTranscript = transcript;
  },
});
activeRecognitionInstance.emitInterimResult("seven");
assert.equal(interimTranscript, "");
activeRecognitionInstance.listeners.end?.();
assert.equal(interimTranscript, "seven");

const retryStatuses = [];
let retryError = "";
let retryTranscript = "";
const instancesBeforeRetry = recognitionInstances.length;
listeningGuidance.listen({
  retryDelayMs: 0,
  onStatus: (status) => retryStatuses.push(status),
  onError: (message) => {
    retryError = message;
  },
  onResult: (transcript) => {
    retryTranscript = transcript;
  },
});
const firstRetryAttempt = activeRecognitionInstance;
firstRetryAttempt.emitError("no-speech");
await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
assert.equal(recognitionInstances.length, instancesBeforeRetry + 2);
assert.match(retryStatuses.join(" "), /Listening again/i);
assert.equal(retryError, "");
activeRecognitionInstance.emitResult("four");
assert.equal(retryTranscript, "four");

console.log("voice-guidance tests passed");

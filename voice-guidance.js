const VOICE_PREFERENCE_KEY = "physiovision.voice.enabled.v1";

const GENTLE_VOICE_NAME =
  /\b(samantha|karen|moira|tessa|serena|fiona|ava|aria|jenny|sonia)\b|google (us|uk) english/i;
const NATURAL_VOICE_NAME = /\b(natural|neural|enhanced|premium|siri)\b/i;
const NOVELTY_VOICE_NAME =
  /\b(albert|bad news|bells|boing|bubbles|cellos|deranged|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox)\b/i;

const NUMBER_WORDS = Object.freeze({
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  to: 2,
  too: 2,
  three: 3,
  four: 4,
  for: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ate: 8,
  nine: 9,
  ten: 10,
});

function normalizeSpeech(transcript) {
  return String(transcript ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ");
}

export function parsePainLevel(transcript) {
  const text = String(transcript ?? "").trim().toLowerCase();
  const digitMatch = text.match(/(?:^|\D)(10|[0-9])(?:\D|$)/);
  if (digitMatch) return Number(digitMatch[1]);

  const words = text.replace(/[^a-z\s]/g, " ").split(/\s+/);
  for (const word of words) {
    if (Object.hasOwn(NUMBER_WORDS, word)) return NUMBER_WORDS[word];
  }
  return null;
}

export function parseRecoveryStatus(transcript) {
  const text = String(transcript ?? "").trim().toLowerCase();
  if (/\b(better|improving|improved|stronger|recovering well)\b/.test(text)) {
    return "better";
  }
  if (/\b(worse|declining|more painful|not as good)\b/.test(text)) {
    return "worse";
  }
  if (/\b(same|similar|unchanged|no change|about the same)\b/.test(text)) {
    return "same";
  }
  if (/\b(unsure|not sure|don't know|do not know)\b/.test(text)) {
    return "unsure";
  }
  return null;
}

export function parseConfirmationResponse(transcript) {
  const text = String(transcript ?? "").trim().toLowerCase();
  if (
    /\b(change|incorrect|wrong|try again|start again|go back)\b/.test(text) ||
    /^(no|nope)\b/.test(text)
  ) {
    return "change";
  }
  if (
    /\b(yes|correct|confirm|continue|that's right|that is right|right answer)\b/.test(text)
  ) {
    return "confirm";
  }
  return null;
}

export function parsePainSafetyResponse(stage, transcript) {
  const normalized = normalizeSpeech(transcript);
  if (!normalized) return "";

  const includesAny = (...phrases) =>
    phrases.some((phrase) => normalized.includes(phrase));

  if (stage === "urgent") {
    if (
      includesAny(
        "not sure",
        "unsure",
        "i don't know",
        "i do not know",
        "maybe"
      )
    ) {
      return "unsure";
    }
    if (
      /^(no|none|nope)(\b|$)/.test(normalized) ||
      includesAny(
        "none of these",
        "i am okay",
        "i'm okay",
        "i feel okay",
        "no symptoms"
      )
    ) {
      return "no";
    }
    if (
      includesAny(
        "yes",
        "chest",
        "shortness of breath",
        "cannot breathe",
        "can't breathe",
        "dizzy",
        "dizziness",
        "faint",
        "weakness",
        "numb",
        "fell",
        "fallen",
        "fall"
      )
    ) {
      return "yes";
    }
    return "";
  }

  if (stage === "location") {
    if (includesAny("knee", "knees")) return "knee";
    if (includesAny("hip", "hips")) return "hip";
    if (includesAny("ankle", "ankles", "foot", "feet")) return "ankle";
    if (includesAny("back", "spine")) return "back";
    if (includesAny("shoulder", "shoulders", "arm", "arms")) return "shoulder";
    if (includesAny("other", "somewhere else")) return "other";
    return "";
  }

  if (stage === "side") {
    if (includesAny("both", "either side", "both sides")) return "both";
    if (includesAny("left")) return "left";
    if (includesAny("right")) return "right";
    if (includesAny("not sure", "unsure", "i don't know", "i do not know")) {
      return "unsure";
    }
    return "";
  }

  if (stage === "familiarity") {
    if (includesAny("usual", "familiar", "same pain", "stronger")) {
      return "usual-stronger";
    }
    if (includesAny("different", "not the same")) return "different";
    if (includesAny("new", "never felt")) return "new";
    if (includesAny("not sure", "unsure", "i don't know", "i do not know")) {
      return "unsure";
    }
    return "";
  }

  if (stage === "timing") {
    if (includesAny("before", "already hurting")) return "before";
    if (includesAny("during", "while exercising", "while moving")) return "during";
    if (includesAny("after", "when i finished", "when I finished")) return "after";
    if (includesAny("not sure", "unsure", "i don't know", "i do not know")) {
      return "unsure";
    }
    return "";
  }

  if (stage === "rest") {
    return parseRecoveryStatus(normalized);
  }

  if (stage === "mobility") {
    if (
      includesAny(
        "no i need help",
        "cannot move",
        "can't move",
        "need help",
        "unable"
      )
    ) {
      return "help";
    }
    if (includesAny("someone nearby", "need someone", "with assistance")) {
      return "nearby";
    }
    if (includesAny("yes", "safely", "i can move", "i am safe")) return "safe";
    return "";
  }

  return "";
}

function voiceScore(voice, requestedLanguage) {
  const language = String(voice?.lang ?? "").toLowerCase();
  const requested = String(requestedLanguage ?? "en-US").toLowerCase();
  const requestedBase = requested.split("-")[0];
  const name = String(voice?.name ?? "");

  if (language && !language.startsWith(requestedBase)) return -Infinity;

  let score = 0;
  if (language === requested) score += 80;
  else if (language.startsWith(requestedBase)) score += 55;
  if (NATURAL_VOICE_NAME.test(name)) score += 45;
  if (GENTLE_VOICE_NAME.test(name)) score += 35;
  if (voice?.default) score += 8;
  if (voice?.localService) score += 4;
  if (NOVELTY_VOICE_NAME.test(name)) score -= 200;
  return score;
}

export function selectGentleVoice(voices, requestedLanguage = "en-US") {
  const available = Array.from(voices ?? []);
  let selected = null;
  let selectedScore = -Infinity;

  available.forEach((voice) => {
    const score = voiceScore(voice, requestedLanguage);
    if (score > selectedScore) {
      selected = voice;
      selectedScore = score;
    }
  });

  return selectedScore === -Infinity ? null : selected;
}

export function prepareGentleSpeech(text) {
  return String(text ?? "")
    .replace(/\s*[—–]\s*/g, ". ")
    .replace(/;\s*/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function readStoredPreference(browserWindow) {
  try {
    return browserWindow.localStorage.getItem(VOICE_PREFERENCE_KEY) !== "false";
  } catch (_) {
    return true;
  }
}

export class VoiceGuidance {
  constructor(browserWindow = typeof window === "undefined" ? null : window) {
    this.window = browserWindow;
    this.synthesis = browserWindow?.speechSynthesis ?? null;
    this.Recognition =
      browserWindow?.SpeechRecognition ??
      browserWindow?.webkitSpeechRecognition ??
      null;
    this.enabled = browserWindow ? readStoredPreference(browserWindow) : false;
    this.lastSpoken = new Map();
    this.activeRecognition = null;
    this.preferredVoice = null;
    this.refreshPreferredVoice = () => {
      const language =
        this.window?.document?.documentElement?.lang || "en-US";
      this.preferredVoice = selectGentleVoice(
        this.synthesis?.getVoices?.() ?? [],
        language
      );
    };
    this.refreshPreferredVoice();
    this.synthesis?.addEventListener?.(
      "voiceschanged",
      this.refreshPreferredVoice
    );
  }

  get canSpeak() {
    return Boolean(this.synthesis && this.window?.SpeechSynthesisUtterance);
  }

  get canListen() {
    return Boolean(this.Recognition);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.cancel();
    try {
      this.window?.localStorage.setItem(
        VOICE_PREFERENCE_KEY,
        String(this.enabled)
      );
    } catch (_) {
      // Voice still works when storage is blocked.
    }
    this.renderToggle();
    return this.enabled;
  }

  renderToggle() {
    const button = this.toggleButton;
    if (!button) return;

    const active = this.enabled && this.canSpeak;
    button.setAttribute("aria-pressed", String(active));
    button.innerHTML = active
      ? '<span aria-hidden="true">◖))</span> Voice on'
      : '<span aria-hidden="true">◖×</span> Voice off';
    button.title = this.canSpeak
      ? "Turn spoken guidance on or off"
      : "Spoken guidance is unavailable in this browser";
    button.disabled = !this.canSpeak;
  }

  attachToggle(button) {
    if (!button) return;
    this.toggleButton = button;
    this.renderToggle();
    button.addEventListener("click", () => {
      this.setEnabled(!this.enabled);
    });
  }

  speak(text, {
    key = String(text),
    cooldownMs = 0,
    interrupt = false,
    onEnd = null,
    rate = 0.84,
    pitch = 1.04,
    volume = 0.92,
  } = {}) {
    const message = prepareGentleSpeech(text);
    if (!message || !this.enabled || !this.canSpeak) return false;

    const now = Date.now();
    if (now - (this.lastSpoken.get(key) ?? 0) < cooldownMs) return false;
    if (this.synthesis.speaking && !interrupt) return false;

    if (interrupt) this.synthesis.cancel();
    const utterance = new this.window.SpeechSynthesisUtterance(message);
    if (!this.preferredVoice) this.refreshPreferredVoice();
    if (this.preferredVoice) utterance.voice = this.preferredVoice;
    utterance.lang =
      this.preferredVoice?.lang ||
      this.window.document?.documentElement?.lang ||
      "en-US";
    utterance.rate = Math.min(Math.max(Number(rate) || 0.84, 0.5), 1.25);
    utterance.pitch = Math.min(Math.max(Number(pitch) || 1.04, 0.75), 1.3);
    utterance.volume = Math.min(Math.max(Number(volume) || 0.92, 0.2), 1);
    if (typeof onEnd === "function") utterance.addEventListener("end", onEnd);
    this.lastSpoken.set(key, now);
    this.synthesis.speak(utterance);
    return true;
  }

  cancel() {
    this.synthesis?.cancel();
    if (this.activeRecognition) {
      this.activeRecognition.abort();
      this.activeRecognition = null;
    }
  }

  listen({ onResult, onError, onStatus } = {}) {
    if (!this.canListen) {
      onError?.("Speech input is not supported in this browser. Use the buttons instead.");
      return false;
    }

    this.activeRecognition?.abort();
    this.synthesis?.cancel();
    const recognition = new this.Recognition();
    recognition.lang = this.window.document?.documentElement?.lang || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    this.activeRecognition = recognition;

    recognition.addEventListener("start", () => onStatus?.("Listening…"));
    recognition.addEventListener("result", (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? "";
      onResult?.(transcript);
    });
    recognition.addEventListener("nomatch", () => {
      onError?.("I did not understand that. Please try again or use the buttons.");
    });
    recognition.addEventListener("error", (event) => {
      const message = event.error === "not-allowed"
        ? "Microphone access was not allowed. Use the buttons or allow microphone access."
        : "I could not hear an answer. Please try again or use the buttons.";
      onError?.(message);
    });
    recognition.addEventListener("end", () => {
      if (this.activeRecognition === recognition) this.activeRecognition = null;
    });
    recognition.start();
    return true;
  }
}

export const voiceGuidance = new VoiceGuidance();

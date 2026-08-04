const VOICE_PREFERENCE_KEY = "physiovision.voice.enabled.v1";
const DEFAULT_SPEECH_VOLUME = 1;
const MICROPHONE_RELEASE_SETTLE_MS = 800;

const GENTLE_VOICE_NAME =
  /\b(samantha|karen|moira|tessa|serena|fiona|ava|aria|jenny|sonia|allison|zoe|jamie)\b|google (us|uk) english/i;
const NATURAL_VOICE_NAME =
  /\b(natural|neural|enhanced|premium|siri|personal voice)\b/i;
const SYNTHETIC_VOICE_NAME =
  /\b(compact|eloquence|espeak|festival|robot|classic)\b/i;
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

  if (stage === "urgent" || stage.startsWith("urgent-")) {
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

    if (stage !== "urgent") {
      const focusedNegative =
        /^(no|none|nope|not at all)(\b|$)/.test(normalized)
        || includesAny(
          "i do not have",
          "i don't have",
          "i am not experiencing",
          "i'm not experiencing",
          "breathing is normal"
        );
      if (focusedNegative) return "no";

      const focusedTerms = {
        "urgent-chest": [
          "yes",
          "chest pressure",
          "chest pain",
          "chest tightness",
          "tight chest",
          "squeezing",
          "heaviness",
        ],
        "urgent-breathing": [
          "yes",
          "shortness of breath",
          "short of breath",
          "breathless",
          "cannot breathe",
          "can't breathe",
          "hard to breathe",
          "difficulty breathing",
        ],
        "urgent-neurologic": [
          "yes",
          "dizzy",
          "dizziness",
          "faint",
          "lightheaded",
          "light headed",
          "weakness",
          "weak",
          "numb",
          "numbness",
        ],
      };
      if (includesAny(...(focusedTerms[stage] ?? []))) return "yes";
      return "";
    }

    if (
      /^(no|none|nope)(\b|$)/.test(normalized) ||
      includesAny(
        "none of these",
        "none of those",
        "i don't have any of these",
        "i do not have any of these",
        "i don't have any of those",
        "i do not have any of those",
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
        "cannot stand",
        "can't stand",
        "cannot get up",
        "can't get up",
        "too painful",
        "so painful",
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
  const name = `${voice?.name ?? ""} ${voice?.voiceURI ?? ""}`;

  if (language && !language.startsWith(requestedBase)) return -Infinity;

  let score = 0;
  if (language === requested) score += 80;
  else if (language.startsWith(requestedBase)) score += 55;
  if (NATURAL_VOICE_NAME.test(name)) score += 75;
  if (GENTLE_VOICE_NAME.test(name)) score += 40;
  if (voice?.default) score += 8;
  if (voice?.localService) score += 4;
  if (SYNTHETIC_VOICE_NAME.test(name)) score -= 80;
  if (NOVELTY_VOICE_NAME.test(name)) score -= 200;
  return score;
}

function isConversationalVoice(voice) {
  const name = `${voice?.name ?? ""} ${voice?.voiceURI ?? ""}`;
  return (
    (NATURAL_VOICE_NAME.test(name) || GENTLE_VOICE_NAME.test(name))
    && !SYNTHETIC_VOICE_NAME.test(name)
    && !NOVELTY_VOICE_NAME.test(name)
  );
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
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s+/g, " ")
    .trim();
}

export function conversationalProsody(text) {
  const message = String(text ?? "").trim();
  const wordCount = message ? message.split(/\s+/).length : 0;
  const isQuestion = /\?/.test(message);
  const isUrgent =
    /\b(stop exercising|get help now|call 995|emergency|cannot get up)\b/i
      .test(message);

  if (isUrgent) return { rate: 0.87, pitch: 0.98 };
  if (isQuestion) return { rate: 0.91, pitch: 1.02 };
  if (wordCount > 34) return { rate: 0.89, pitch: 1 };
  if (wordCount <= 8) return { rate: 0.94, pitch: 1.01 };
  return { rate: 0.92, pitch: 1 };
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
    this.listeningGeneration = 0;
    this.preferredVoice = null;
    this.voiceSelectionLocked = false;
    this.refreshPreferredVoice = () => {
      if (this.voiceSelectionLocked) return this.preferredVoice;
      const language =
        this.window?.document?.documentElement?.lang || "en-US";
      this.preferredVoice = selectGentleVoice(
        this.synthesis?.getVoices?.() ?? [],
        language
      );
      return this.preferredVoice;
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

  preparePreferredVoice({ timeoutMs = 1200, pollMs = 50 } = {}) {
    if (!this.canSpeak || this.voiceSelectionLocked) {
      return Promise.resolve(this.preferredVoice);
    }
    const selected = this.refreshPreferredVoice();
    if (selected && isConversationalVoice(selected)) {
      return Promise.resolve(selected);
    }

    const schedule = this.window?.setTimeout?.bind(this.window)
      ?? globalThis.setTimeout;
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const checkVoices = () => {
        const voice = this.refreshPreferredVoice();
        if (
          isConversationalVoice(voice)
          || Date.now() - startedAt >= timeoutMs
        ) {
          resolve(voice);
          return;
        }
        schedule(checkVoices, pollMs);
      };
      schedule(checkVoices, pollMs);
    });
  }

  async prepareSpeechAfterMicrophoneRelease({
    settleMs = MICROPHONE_RELEASE_SETTLE_MS,
  } = {}) {
    const schedule = this.window?.setTimeout?.bind(this.window)
      ?? globalThis.setTimeout;
    const safeSettleMs = Math.max(0, Number(settleMs) || 0);
    const [voice] = await Promise.all([
      this.preparePreferredVoice(),
      new Promise((resolve) => schedule(resolve, safeSettleMs)),
    ]);
    return voice;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.cancel();
      this.voiceSelectionLocked = false;
    }
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
    rate = null,
    pitch = null,
    volume = DEFAULT_SPEECH_VOLUME,
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
    this.voiceSelectionLocked = true;
    utterance.lang =
      this.preferredVoice?.lang ||
      this.window.document?.documentElement?.lang ||
      "en-US";
    const naturalProsody = conversationalProsody(message);
    const requestedRate = rate === null || rate === undefined
      ? naturalProsody.rate
      : Number(rate);
    const requestedPitch = pitch === null || pitch === undefined
      ? naturalProsody.pitch
      : Number(pitch);
    utterance.rate = Math.min(
      Math.max(Number.isFinite(requestedRate) ? requestedRate : naturalProsody.rate, 0.5),
      1.25
    );
    utterance.pitch = Math.min(
      Math.max(Number.isFinite(requestedPitch) ? requestedPitch : naturalProsody.pitch, 0.75),
      1.3
    );
    utterance.volume = Math.min(
      Math.max(Number(volume) || DEFAULT_SPEECH_VOLUME, 0.2),
      1
    );
    if (typeof onEnd === "function") utterance.addEventListener("end", onEnd);
    this.lastSpoken.set(key, now);
    this.synthesis.speak(utterance);
    return true;
  }

  cancel() {
    this.listeningGeneration += 1;
    this.synthesis?.cancel();
    if (this.activeRecognition) {
      this.activeRecognition.abort();
      this.activeRecognition = null;
    }
  }

  listen({
    onResult,
    onError,
    onStatus,
    maxNoSpeechRetries = 1,
    retryDelayMs = 350,
  } = {}) {
    if (!this.canListen) {
      onError?.("Speech input is not supported in this browser. Use the buttons instead.");
      return false;
    }

    this.listeningGeneration += 1;
    const listeningGeneration = this.listeningGeneration;
    this.activeRecognition?.abort();
    this.synthesis?.cancel();
    const schedule = this.window?.setTimeout?.bind(this.window)
      ?? globalThis.setTimeout;
    const browserLanguage = this.window?.navigator?.language ?? "";
    const documentLanguage =
      this.window?.document?.documentElement?.lang || "en-SG";
    const recognitionLanguage = /^en(?:-|$)/i.test(browserLanguage)
      ? browserLanguage
      : documentLanguage;
    const allowedRetries = Math.max(0, Number(maxNoSpeechRetries) || 0);
    let retryCount = 0;
    let sessionComplete = false;

    const isCurrentSession = () =>
      !sessionComplete && this.listeningGeneration === listeningGeneration;

    const startAttempt = () => {
      if (!isCurrentSession()) return;

      const recognition = new this.Recognition();
      recognition.lang = recognitionLanguage;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.continuous = false;
      this.activeRecognition = recognition;

      let pendingTranscript = "";
      let pendingAlternatives = [];
      let resultDelivered = false;
      let retryScheduled = false;
      let recognizerStoppedForResult = false;

      const extractResult = (event) => {
        const results = event?.results;
        if (!results?.length) {
          return { transcript: "", alternatives: [], isFinal: false };
        }

        const parts = [];
        const alternatives = [];
        let isFinal = false;
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index];
          const primary = result?.[0]?.transcript?.trim() ?? "";
          if (primary) parts.push(primary);
          isFinal ||= result?.isFinal !== false;
          for (let choice = 0; choice < (result?.length ?? 0); choice += 1) {
            const alternative = result[choice]?.transcript?.trim() ?? "";
            if (alternative && !alternatives.includes(alternative)) {
              alternatives.push(alternative);
            }
          }
        }
        const transcript = parts.join(" ").trim();
        if (transcript && !alternatives.includes(transcript)) {
          alternatives.unshift(transcript);
        }
        return { transcript, alternatives, isFinal };
      };

      const deliverRecognizedResult = () => {
        if (
          resultDelivered ||
          !pendingTranscript ||
          this.listeningGeneration !== listeningGeneration
        ) {
          return;
        }
        resultDelivered = true;
        sessionComplete = true;
        if (this.activeRecognition === recognition) {
          this.activeRecognition = null;
        }
        onResult?.(pendingTranscript, pendingAlternatives);
      };

      const retryOrFail = (message) => {
        if (!isCurrentSession() || retryScheduled || resultDelivered) return;
        if (pendingTranscript) {
          deliverRecognizedResult();
          return;
        }
        if (retryCount < allowedRetries) {
          retryCount += 1;
          retryScheduled = true;
          if (this.activeRecognition === recognition) {
            this.activeRecognition = null;
          }
          onStatus?.(
            "I didn’t hear an answer. Listening again — speak normally near your device."
          );
          schedule(startAttempt, Math.max(0, Number(retryDelayMs) || 0));
          return;
        }
        sessionComplete = true;
        if (this.activeRecognition === recognition) {
          this.activeRecognition = null;
        }
        onError?.(message);
      };

      recognition.addEventListener("start", () => {
        if (!isCurrentSession()) return;
        onStatus?.(
          retryCount > 0
            ? "Listening again… Speak normally near your device."
            : "Listening… Speak normally near your device."
        );
      });
      recognition.addEventListener("result", (event) => {
        if (!isCurrentSession()) return;
        const result = extractResult(event);
        if (result.transcript) {
          pendingTranscript = result.transcript;
          pendingAlternatives = result.alternatives;
        }
        if (!result.isFinal) {
          onStatus?.(
            pendingTranscript
              ? `I can hear you: “${pendingTranscript}” — keep speaking.`
              : "Listening… Speak normally near your device."
          );
          return;
        }

        recognizerStoppedForResult = true;
        try {
          recognition.stop();
        } catch (_) {
          deliverRecognizedResult();
        }
        // Safari may not always dispatch `end` promptly after a final result.
        schedule(deliverRecognizedResult, 450);
      });
      recognition.addEventListener("nomatch", () => {
        retryOrFail(
          "I did not understand that. Please try again or use the buttons."
        );
      });
      recognition.addEventListener("error", (event) => {
        if (
          this.listeningGeneration !== listeningGeneration ||
          (recognizerStoppedForResult && event.error === "aborted")
        ) {
          return;
        }
        if (event.error === "no-speech") {
          retryOrFail(
            "I could not hear an answer. Please try again or use the buttons."
          );
          return;
        }
        sessionComplete = true;
        if (this.activeRecognition === recognition) {
          this.activeRecognition = null;
        }
        const message = event.error === "not-allowed"
          ? "Microphone access was not allowed. Use the buttons or allow microphone access."
          : event.error === "audio-capture"
            ? "No working microphone was found. Check your microphone or use the buttons."
            : "Speech recognition stopped. Please try again or use the buttons.";
        onError?.(message);
      });
      recognition.addEventListener("end", () => {
        if (this.listeningGeneration !== listeningGeneration) return;
        if (this.activeRecognition === recognition) {
          this.activeRecognition = null;
        }
        if (pendingTranscript) {
          deliverRecognizedResult();
        } else if (!retryScheduled && !sessionComplete) {
          retryOrFail(
            "I could not hear an answer. Please try again or use the buttons."
          );
        }
      });

      try {
        recognition.start();
      } catch (_) {
        retryOrFail(
          "Speech recognition could not start. Please try again or use the buttons."
        );
      }
    };

    startAttempt();
    return true;
  }
}

export const voiceGuidance = new VoiceGuidance();

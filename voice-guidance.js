import {
  getSpeechLocale,
  translateText,
} from "./i18n.js?v=6";

const VOICE_PREFERENCE_KEY = "physiovision.voice.enabled.v1";
const DEFAULT_SPEECH_VOLUME = 1;
const MICROPHONE_RELEASE_SETTLE_MS = 1200;

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

const LOCALIZED_NUMBER_WORDS = Object.freeze({
  "零": 0,
  "〇": 0,
  "一": 1,
  "二": 2,
  "两": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9,
  "十": 10,
  kosong: 0,
  sifar: 0,
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  lapan: 8,
  sembilan: 9,
  sepuluh: 10,
  "பூஜ்ஜியம்": 0,
  "சுழியம்": 0,
  "ஒன்று": 1,
  "இரண்டு": 2,
  "மூன்று": 3,
  "நான்கு": 4,
  "ஐந்து": 5,
  "ஆறு": 6,
  "ஏழு": 7,
  "எட்டு": 8,
  "ஒன்பது": 9,
  "பத்து": 10,
});

function normalizeSpeech(transcript) {
  return String(transcript ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^\p{L}\p{M}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ");
}

function isSafariBrowser(userAgent) {
  const value = String(userAgent ?? "");
  return /safari/i.test(value)
    && !/(chrome|chromium|crios|android|edg|opr|firefox|fxios)/i.test(value);
}

export async function readMicrophonePermissionState(browserNavigator) {
  try {
    const status = await browserNavigator?.permissions?.query?.({
      name: "microphone",
    });
    return ["granted", "prompt", "denied"].includes(status?.state)
      ? status.state
      : "unknown";
  } catch (_) {
    // Safari versions that do not expose microphone through Permissions API
    // should still continue to the real getUserMedia request.
    return "unknown";
  }
}

export function describeMicrophoneAccessFailure(error, {
  userAgent = "",
  permissionState = "unknown",
} = {}) {
  const errorName = String(error?.name ?? "");
  const permissionBlocked = permissionState === "denied"
    || ["NotAllowedError", "PermissionDeniedError", "SecurityError"]
      .includes(errorName);

  if (permissionBlocked && isSafariBrowser(userAgent)) {
    return (
      "Safari did not show a permission prompt because microphone access is "
      + "blocked. Open Safari > Settings > Websites > Microphone, set this "
      + "website to Allow, then select Try microphone again. If needed, also "
      + "turn on Safari in System Settings > Privacy & Security > Microphone."
    );
  }
  if (permissionBlocked) {
    return (
      "Microphone access is blocked for this website. Allow microphone access "
      + "in your browser settings, then select Try microphone again."
    );
  }
  if (["NotFoundError", "DevicesNotFoundError"].includes(errorName)) {
    return (
      "No microphone was found. Connect or enable a microphone, then select "
      + "Try microphone again."
    );
  }
  if (["NotReadableError", "TrackStartError", "AbortError"].includes(errorName)) {
    return (
      "The microphone is unavailable or being used by another application. "
      + "Close the other application, then select Try microphone again."
    );
  }
  return (
    "The microphone could not start. Check your browser and system microphone "
    + "settings, then select Try microphone again."
  );
}

export function parsePainLevel(transcript) {
  const text = String(transcript ?? "").normalize("NFKC").trim().toLowerCase();
  const digitMatch = text.match(/(?:^|\D)(10|[0-9])(?:\D|$)/);
  if (digitMatch) return Number(digitMatch[1]);

  const words = text.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/);
  for (const word of words) {
    if (Object.hasOwn(NUMBER_WORDS, word)) return NUMBER_WORDS[word];
    if (Object.hasOwn(LOCALIZED_NUMBER_WORDS, word)) {
      return LOCALIZED_NUMBER_WORDS[word];
    }
  }
  const chineseNumber = text.match(/[零〇一二两三四五六七八九十]/)?.[0];
  if (chineseNumber && Object.hasOwn(LOCALIZED_NUMBER_WORDS, chineseNumber)) {
    return LOCALIZED_NUMBER_WORDS[chineseNumber];
  }
  return null;
}

export function parseRecoveryStatus(transcript) {
  const text = String(transcript ?? "").trim().toLowerCase();
  if (
    /\b(better|improving|improved|stronger|recovering well)\b/.test(text)
    || /(好转|好多了|改善|越来越好|semakin baik|lebih baik|pulih|மேம்பட்ட|நன்றாக)/u.test(text)
  ) {
    return "better";
  }
  if (
    /\b(worse|declining|more painful|not as good)\b/.test(text)
    || /(更糟|更痛|恶化|semakin teruk|lebih teruk|lebih sakit|மோச|அதிக வலி)/u.test(text)
  ) {
    return "worse";
  }
  if (
    /\b(same|similar|unchanged|no change|about the same)\b/.test(text)
    || /(一样|差不多|没变化|没有变化|sama|tiada perubahan|அதே|மாற்றமில்லை)/u.test(text)
  ) {
    return "same";
  }
  if (
    /\b(unsure|not sure|don't know|do not know)\b/.test(text)
    || /(不确定|不知道|tidak pasti|tak pasti|tidak tahu|tak tahu|தெரியவில்லை|உறுதியாகத் தெரியவில்லை)/u.test(text)
  ) {
    return "unsure";
  }
  return null;
}

export function parseConfirmationResponse(transcript) {
  const text = String(transcript ?? "").trim().toLowerCase();
  if (
    /\b(change|incorrect|wrong|try again|start again|go back)\b/.test(text) ||
    /^(no|nope)\b/.test(text) ||
    /(更改|修改|不对|错误|重来|不是|tukar|ubah|salah|tidak betul|cuba lagi|மாற்று|தவறு|மீண்டும்|இல்லை)/u.test(text)
  ) {
    return "change";
  }
  if (
    /\b(yes|correct|confirm|continue|that's right|that is right|right answer)\b/.test(text)
    || /(是的|正确|对的|没错|确认|ya|betul|tepat|sahkan|teruskan|ஆம்|சரி|உறுதி)/u.test(text)
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
        "maybe",
        "不确定",
        "不知道",
        "也许",
        "tidak pasti",
        "tak pasti",
        "tidak tahu",
        "mungkin",
        "தெரியவில்லை",
        "உறுதியாக தெரியவில்லை"
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
          "breathing is normal",
          "没有",
          "不是",
          "tiada",
          "tidak",
          "இல்லை"
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
          "胸口受压",
          "胸痛",
          "胸闷",
          "tekanan dada",
          "sakit dada",
          "மார்பு அழுத்தம்",
          "மார்பு வலி",
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
          "呼吸困难",
          "呼吸急促",
          "sesak nafas",
          "sukar bernafas",
          "மூச்சுத்திணறல்",
          "சுவாசிக்க சிரமம்",
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
          "头晕",
          "晕眩",
          "无力",
          "麻木",
          "pening",
          "hendak pitam",
          "lemah",
          "kebas",
          "தலைச்சுற்றல்",
          "மயக்கம்",
          "பலவீனம்",
          "உணர்வின்மை",
        ],
      };
      if (includesAny("是", "有", "ya", "ஆம்")) return "yes";
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
        "no symptoms",
        "没有",
        "没有以上情况",
        "都没有",
        "没有这些症状",
        "tiada satu pun",
        "tiada gejala",
        "tiada",
        "tidak",
        "எதுவுமில்லை",
        "இந்த அறிகுறிகள் இல்லை",
        "இல்லை"
      )
    ) {
      return "no";
    }
    if (
      includesAny(
        "yes",
        "是",
        "有",
        "ya",
        "ஆம்",
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
        "fall",
        "胸口",
        "胸痛",
        "呼吸困难",
        "头晕",
        "麻木",
        "跌倒",
        "tekanan dada",
        "sesak nafas",
        "pening",
        "kebas",
        "jatuh",
        "மார்பு",
        "மூச்சுத்திணறல்",
        "தலைச்சுற்றல்",
        "உணர்வின்மை",
        "விழுந்த"
      )
    ) {
      return "yes";
    }
    return "";
  }

  if (stage === "location") {
    if (includesAny("knee", "knees", "膝盖", "lutut", "முழங்கால்")) return "knee";
    if (includesAny("hip", "hips", "髋部", "pinggul", "இடுப்பு")) return "hip";
    if (includesAny("ankle", "ankles", "foot", "feet", "脚踝", "脚", "buku lali", "kaki", "கணுக்கால்", "பாதம்")) return "ankle";
    if (includesAny("back", "spine", "背部", "belakang", "முதுகு")) return "back";
    if (includesAny("shoulder", "shoulders", "arm", "arms", "肩膀", "手臂", "bahu", "lengan", "தோள்", "கை")) return "shoulder";
    if (includesAny("other", "somewhere else", "其他", "lain", "வேறு")) return "other";
    return "";
  }

  if (stage === "side") {
    if (includesAny("both", "either side", "both sides", "两侧", "两边", "kedua-dua", "இரு பக்க")) return "both";
    if (includesAny("left", "左", "kiri", "இடது")) return "left";
    if (includesAny("right", "右", "kanan", "வலது")) return "right";
    if (includesAny("not sure", "unsure", "i don't know", "i do not know", "不确定", "tidak pasti", "தெரியவில்லை")) {
      return "unsure";
    }
    return "";
  }

  if (stage === "familiarity") {
    if (includesAny("usual", "familiar", "same pain", "stronger", "平时", "更强", "biasa", "lebih kuat", "வழக்கமான", "அதிக")) {
      return "usual-stronger";
    }
    if (includesAny("different", "not the same", "不同", "berbeza", "வேறுபட்ட")) return "different";
    if (includesAny("new", "never felt", "新的", "baharu", "புதிய")) return "new";
    if (includesAny("not sure", "unsure", "i don't know", "i do not know", "不确定", "tidak pasti", "தெரியவில்லை")) {
      return "unsure";
    }
    return "";
  }

  if (stage === "timing") {
    if (includesAny("before", "already hurting", "开始前", "sebelum", "முன்")) return "before";
    if (includesAny("during", "while exercising", "while moving", "运动时", "semasa", "போது")) return "during";
    if (includesAny("after", "when i finished", "when I finished", "结束后", "selepas", "பிறகு")) return "after";
    if (includesAny("not sure", "unsure", "i don't know", "i do not know", "不确定", "tidak pasti", "தெரியவில்லை")) {
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
        "unable",
        "不能站",
        "无法移动",
        "需要帮助",
        "太痛",
        "tidak boleh berdiri",
        "tidak boleh bergerak",
        "perlukan bantuan",
        "terlalu sakit",
        "நிற்க முடியாது",
        "நகர முடியாது",
        "உதவி தேவை",
        "மிகவும் வலி"
      )
    ) {
      return "help";
    }
    if (includesAny("someone nearby", "need someone", "with assistance", "有人在旁边", "seseorang berdekatan", "அருகில் ஒருவர்")) {
      return "nearby";
    }
    if (includesAny("yes", "safely", "i can move", "i am safe", "可以", "安全", "ya", "selamat", "boleh bergerak", "ஆம்", "பாதுகாப்பாக", "நகர முடியும்")) return "safe";
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
      const language = getSpeechLocale();
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
    this.window?.addEventListener?.("physiovision:language-change", (event) => {
      this.voiceSelectionLocked = false;
      this.preferredVoice = selectGentleVoice(
        this.synthesis?.getVoices?.() ?? [],
        event.detail?.speechLocale || getSpeechLocale()
      );
    });
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

  usePlaybackAudioSession() {
    const audioSession = this.window?.navigator?.audioSession;
    if (!audioSession || !("type" in audioSession)) return false;
    try {
      // Safari can leave output ducked after microphone permission or speech
      // recognition. Explicit playback mode prevents the volume from changing
      // part-way through the following utterance.
      audioSession.type = "playback";
      return audioSession.type === "playback";
    } catch (_) {
      return false;
    }
  }

  async prepareSpeechAfterMicrophoneRelease({
    settleMs = MICROPHONE_RELEASE_SETTLE_MS,
  } = {}) {
    const schedule = this.window?.setTimeout?.bind(this.window)
      ?? globalThis.setTimeout;
    const safeSettleMs = Math.max(0, Number(settleMs) || 0);
    this.usePlaybackAudioSession();
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
    const message = prepareGentleSpeech(translateText(text));
    if (!message || !this.enabled || !this.canSpeak) return false;

    const now = Date.now();
    if (now - (this.lastSpoken.get(key) ?? 0) < cooldownMs) return false;
    if (this.synthesis.speaking && !interrupt) return false;

    this.usePlaybackAudioSession();
    if (interrupt) this.synthesis.cancel();
    const utterance = new this.window.SpeechSynthesisUtterance(message);
    if (!this.preferredVoice) this.refreshPreferredVoice();
    if (this.preferredVoice) utterance.voice = this.preferredVoice;
    this.voiceSelectionLocked = true;
    utterance.lang =
      this.preferredVoice?.lang ||
      getSpeechLocale();
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
    const recognitionLanguage = getSpeechLocale();
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

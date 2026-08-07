import {
  getSpeechLocale,
  translateText,
} from "./i18n.js?v=18";
import { generateGuidanceSpeech } from "./api.js?v=31";

const VOICE_PREFERENCE_KEY = "physiovision.voice.enabled.v1";
const DEFAULT_SPEECH_VOLUME = 1;
const MICROPHONE_RELEASE_SETTLE_MS = 1200;
const NEURAL_SPEECH_MIN_LENGTH = 18;
const NEURAL_SPEECH_CACHE_LIMIT = 24;

const GENTLE_VOICE_NAME =
  /\b(samantha|ava|jenny|aria|sonia|allison|susan|serena|karen|moira|tessa|fiona|zoe|kathy|amira|yasmin|tingting|meijia|sinji|xiaoxiao|vani|pallavi)\b|google (us|uk) english/i;
const NATURAL_VOICE_NAME =
  /\b(natural|neural|enhanced|premium|siri|personal voice)\b/i;
const SYNTHETIC_VOICE_NAME =
  /\b(compact|eloquence|espeak|festival|robot|classic)\b/i;
const NOVELTY_VOICE_NAME =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|eddy|fred|good news|grandma|grandpa|jester|junior|organ|ralph|reed|rocko|superstar|trinoids|whisper|wobble|zarvox)\b/i;

// Prefer familiar, clearly articulated voices before considering a browser or
// operating-system default. A user's default can be a novelty accessibility
// voice (including Apple's Grandpa voice), which is unsuitable for calm health
// guidance. Earlier entries receive the strongest preference.
const CLEAR_VOICE_PREFERENCES = Object.freeze({
  en: Object.freeze([
    /\bsamantha\b/i,
    /\bava\b/i,
    /\bjenny\b/i,
    /\baria\b/i,
    /\bsonia\b/i,
    /\ballison\b/i,
    /\bsusan\b/i,
    /\bserena\b/i,
    /\bkaren\b/i,
    /\bmoira\b/i,
    /\btessa\b/i,
    /\bfiona\b/i,
    /google uk english female/i,
    /google us english/i,
  ]),
  zh: Object.freeze([
    /\btingting\b/i,
    /\bxiaoxiao\b/i,
    /\bmeijia\b/i,
    /\bsinji\b/i,
  ]),
  ms: Object.freeze([/\bamira\b/i, /\byasmin\b/i]),
  ta: Object.freeze([/\bvani\b/i, /\bpallavi\b/i]),
});

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

export function isSafariBrowser(userAgent) {
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
    // should still continue to the browser's real audio-capture request.
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
      "Safari blocked microphone access for this website. Open Safari > "
      + "Settings > Websites > Microphone, change this website from Deny to "
      + "Ask or Allow, then select Try microphone again. If needed, also "
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
  if (isSafariBrowser(userAgent)) {
    return (
      "Safari could not start voice input. Keep this tab active and select "
      + "Try microphone again; the website can remain set to Ask, and Safari "
      + "should open its permission prompt. If it still fails, close any other "
      + "tab or application using the microphone and reload this tab."
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
  if (NOVELTY_VOICE_NAME.test(name)) return -Infinity;

  let score = 0;
  const clearPreferences = CLEAR_VOICE_PREFERENCES[requestedBase] ?? [];
  const clearPreferenceIndex = clearPreferences.findIndex((pattern) =>
    pattern.test(name)
  );
  if (clearPreferenceIndex >= 0) {
    score += 320 - clearPreferenceIndex * 10;
  }
  if (language === requested) score += 80;
  else if (language.startsWith(requestedBase)) score += 55;
  if (NATURAL_VOICE_NAME.test(name)) score += 75;
  if (GENTLE_VOICE_NAME.test(name)) score += 40;
  if (voice?.default) score += 8;
  if (voice?.localService) score += 4;
  if (SYNTHETIC_VOICE_NAME.test(name)) score -= 80;
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

  // Stay close to normal conversational speed. Rates below about 0.9 made the
  // browser voices sound old, drawn out and harder to understand. A slight
  // lift in pitch avoids a dull monotone without creating a cartoon voice.
  if (isUrgent) return { rate: 0.95, pitch: 1.02 };
  if (isQuestion) return { rate: 0.98, pitch: 1.04 };
  if (wordCount > 34) return { rate: 0.96, pitch: 1.02 };
  if (wordCount <= 8) return { rate: 1, pitch: 1.04 };
  return { rate: 0.98, pitch: 1.03 };
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
    this.browserVoiceGroups = new Map();
    this.neuralSpeechProvider = null;
    this.audioContext = null;
    this.activeAudioSource = null;
    this.neuralSpeaking = false;
    this.speechGeneration = 0;
    this.neuralAudioCache = new Map();
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
      this.browserVoiceGroups.clear();
      this.preferredVoice = selectGentleVoice(
        this.synthesis?.getVoices?.() ?? [],
        event.detail?.speechLocale || getSpeechLocale()
      );
    });
    this.window?.addEventListener?.("pagehide", () => {
      // Explicitly release Safari's speech-recognition capture before a
      // refresh or history navigation so the next page can use the microphone.
      this.cancel();
    });
  }

  get canSpeak() {
    return Boolean(this.synthesis && this.window?.SpeechSynthesisUtterance);
  }

  get canListen() {
    return Boolean(this.Recognition);
  }

  setNeuralSpeechProvider(provider) {
    this.neuralSpeechProvider = typeof provider === "function" ? provider : null;
  }

  async unlockNeuralAudio() {
    const AudioContext =
      this.window?.AudioContext ?? this.window?.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      if (!this.audioContext) this.audioContext = new AudioContext();
      const resumePromise = this.audioContext.state === "suspended"
        ? this.audioContext.resume()
        : Promise.resolve();
      // Start a silent one-frame buffer while the selection click still has
      // user activation. Safari then permits the generated guidance returned
      // by the asynchronous backend request to play through this context.
      const source = this.audioContext.createBufferSource();
      source.buffer = this.audioContext.createBuffer(1, 1, 24000);
      source.connect(this.audioContext.destination);
      source.start(0);
      await resumePromise;
      return true;
    } catch (_) {
      return false;
    }
  }

  async verifyListeningAccess({ timeoutMs = 20000 } = {}) {
    if (!this.canListen) {
      const error = new Error(
        "Speech recognition is unavailable in this browser."
      );
      error.name = "NotSupportedError";
      throw error;
    }

    // Safari has a dedicated SpeechRecognition permission flow. Checking the
    // API that hands-free mode actually uses avoids rejecting a valid `Ask`
    // setting because a separate getUserMedia preflight failed first.
    this.listeningGeneration += 1;
    this.activeRecognition?.abort();
    this.cancelSpokenOutput();

    const recognition = new this.Recognition();
    recognition.lang = getSpeechLocale();
    recognition.interimResults = false;
    recognition.continuous = false;
    const schedule = this.window?.setTimeout?.bind(this.window)
      ?? globalThis.setTimeout;
    const unschedule = this.window?.clearTimeout?.bind(this.window)
      ?? globalThis.clearTimeout;
    this.activeRecognition = recognition;

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout = null;
      let microphoneStarted = false;
      let releaseRequested = false;

      const cleanup = () => {
        if (timeout !== null) unschedule(timeout);
        if (this.activeRecognition === recognition) {
          this.activeRecognition = null;
        }
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(true);
      };
      const fail = (name, message) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          recognition.abort();
        } catch (_) {
          // The failed recognizer may already be inactive.
        }
        const error = new Error(message);
        error.name = name;
        reject(error);
      };

      // `audiostart` confirms permission, but Safari may keep its output in a
      // quiet play-and-record session until the recognizer emits `audioend` or
      // `end`. Resolving here made the first question start while the red
      // microphone indicator was still active, so its volume rose mid-sentence.
      recognition.addEventListener("audiostart", () => {
        if (settled || microphoneStarted) return;
        microphoneStarted = true;
        releaseRequested = true;
        try {
          recognition.abort();
        } catch (_) {
          fail(
            "UnknownError",
            "Safari could not release microphone audio after the permission check."
          );
        }
      });
      recognition.addEventListener("audioend", () => {
        if (microphoneStarted) succeed();
      });
      recognition.addEventListener("error", (event) => {
        if (releaseRequested && event?.error === "aborted") return;
        const errorName = event?.error === "not-allowed"
          ? "NotAllowedError"
          : event?.error === "audio-capture"
            ? "NotReadableError"
            : event?.error === "service-not-allowed"
              ? "NotSupportedError"
              : "UnknownError";
        fail(
          errorName,
          `Speech recognition could not capture audio (${event?.error ?? "unknown"}).`
        );
      });
      recognition.addEventListener("end", () => {
        if (microphoneStarted) {
          succeed();
          return;
        }
        fail(
          "UnknownError",
          "Speech recognition ended before microphone audio started."
        );
      });

      timeout = schedule(() => {
        fail(
          "UnknownError",
          microphoneStarted
            ? "Safari did not release microphone audio after the permission check."
            : "Safari did not start microphone audio before the permission check timed out."
        );
      }, Math.max(1000, Number(timeoutMs) || 20000));

      try {
        recognition.start();
      } catch (error) {
        fail(
          String(error?.name || "UnknownError"),
          String(error?.message || "Speech recognition could not start.")
        );
      }
    });
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
    preferImmediate = false,
    voiceGroup = "",
    onEnd = null,
    rate = null,
    pitch = null,
    volume = DEFAULT_SPEECH_VOLUME,
  } = {}) {
    const message = prepareGentleSpeech(translateText(text));
    if (!message || !this.enabled || !this.canSpeak) return false;

    const now = Date.now();
    if (now - (this.lastSpoken.get(key) ?? 0) < cooldownMs) return false;
    if ((this.synthesis.speaking || this.neuralSpeaking) && !interrupt) {
      return false;
    }

    this.usePlaybackAudioSession();
    if (interrupt) this.cancelSpokenOutput();
    this.lastSpoken.set(key, now);

    const useNeuralSpeech = Boolean(
      !preferImmediate
      && this.neuralSpeechProvider
      && message.length >= NEURAL_SPEECH_MIN_LENGTH
      && !/^Rep\s+\d+[.!]?$/i.test(message)
    );
    if (useNeuralSpeech) {
      const generation = ++this.speechGeneration;
      this.neuralSpeaking = true;
      this.speakNeural(message, {
        generation,
        onEnd,
        rate,
        pitch,
        volume,
        voiceGroup,
      });
      return true;
    }

    return this.speakBrowser(message, {
      onEnd,
      rate,
      pitch,
      volume,
      voiceGroup,
    });
  }

  speakBrowser(message, {
    onEnd = null,
    rate = null,
    pitch = null,
    volume = DEFAULT_SPEECH_VOLUME,
    voiceGroup = "",
  } = {}) {
    const utterance = new this.window.SpeechSynthesisUtterance(message);
    const normalizedVoiceGroup = String(voiceGroup ?? "").trim();
    const hasGroupedVoice = Boolean(
      normalizedVoiceGroup
      && this.browserVoiceGroups.has(normalizedVoiceGroup)
    );
    let selectedVoice = hasGroupedVoice
      ? this.browserVoiceGroups.get(normalizedVoiceGroup)
      : null;
    if (!hasGroupedVoice) {
      if (!this.preferredVoice) this.refreshPreferredVoice();
      selectedVoice = this.preferredVoice;
    }
    if (normalizedVoiceGroup && !hasGroupedVoice) {
      // Keep multi-step conversations on one exact system voice, even if the
      // browser publishes or reorders its voice list between utterances.
      this.browserVoiceGroups.set(normalizedVoiceGroup, selectedVoice ?? null);
    }
    if (selectedVoice) utterance.voice = selectedVoice;
    this.voiceSelectionLocked = true;
    utterance.lang =
      selectedVoice?.lang ||
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
    this.synthesis.speak(utterance);
    return true;
  }

  async decodeNeuralAudio(base64Audio) {
    const binary = this.window?.atob
      ? this.window.atob(base64Audio)
      : globalThis.atob(base64Audio);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const context = this.audioContext;
    if (!context) throw new Error("Audio context has not been unlocked.");
    return context.decodeAudioData(bytes.buffer.slice(0));
  }

  async speakNeural(message, {
    generation,
    onEnd,
    rate,
    pitch,
    volume,
    voiceGroup,
  }) {
    try {
      if (!this.audioContext) await this.unlockNeuralAudio();
      if (!this.audioContext) throw new Error("Generated-audio playback unavailable.");
      if (this.audioContext.state === "suspended") await this.audioContext.resume();

      const locale = getSpeechLocale();
      const cacheKey = `${locale}:${message}`;
      let base64Audio = this.neuralAudioCache.get(cacheKey);
      if (!base64Audio) {
        const response = await this.neuralSpeechProvider({
          text: message,
          locale,
        });
        base64Audio = response?.audio;
        if (!base64Audio) throw new Error("Generated guidance contained no audio.");
        this.neuralAudioCache.set(cacheKey, base64Audio);
        if (this.neuralAudioCache.size > NEURAL_SPEECH_CACHE_LIMIT) {
          this.neuralAudioCache.delete(this.neuralAudioCache.keys().next().value);
        }
      }
      const audioBuffer = await this.decodeNeuralAudio(base64Audio);
      if (generation !== this.speechGeneration || !this.enabled) return;

      const source = this.audioContext.createBufferSource();
      const gain = this.audioContext.createGain();
      gain.gain.value = Math.min(
        Math.max(Number(volume) || DEFAULT_SPEECH_VOLUME, 0.2),
        1
      );
      source.buffer = audioBuffer;
      source.connect(gain);
      gain.connect(this.audioContext.destination);
      this.activeAudioSource = source;
      source.addEventListener?.("ended", () => {
        if (generation !== this.speechGeneration) return;
        this.activeAudioSource = null;
        this.neuralSpeaking = false;
        onEnd?.();
      });
      // Older WebKit exposes onended but not addEventListener on audio sources.
      if (!source.addEventListener) {
        source.onended = () => {
          if (generation !== this.speechGeneration) return;
          this.activeAudioSource = null;
          this.neuralSpeaking = false;
          onEnd?.();
        };
      }
      source.start(0);
    } catch (error) {
      if (generation !== this.speechGeneration || !this.enabled) return;
      console.warn("Natural guidance audio unavailable; using browser voice.", error);
      this.neuralSpeaking = false;
      this.speakBrowser(message, {
        onEnd,
        rate,
        pitch,
        volume,
        voiceGroup,
      });
    }
  }

  cancelSpokenOutput() {
    this.speechGeneration += 1;
    this.neuralSpeaking = false;
    const activeSource = this.activeAudioSource;
    this.activeAudioSource = null;
    try {
      activeSource?.stop?.(0);
    } catch (_) {
      // The source may already have ended.
    }
    this.synthesis?.cancel();
  }

  cancelListening() {
    this.listeningGeneration += 1;
    if (this.activeRecognition) {
      this.activeRecognition.abort();
      this.activeRecognition = null;
    }
  }

  cancel() {
    this.cancelListening();
    this.cancelSpokenOutput();
  }

  listen({
    onResult,
    onError,
    onStatus,
    maxNoSpeechRetries = 1,
    retryDelayMs = 350,
  } = {}) {
    if (!this.canListen) {
      onError?.(
        "Speech input is not supported in this browser. Use the buttons instead.",
        "unsupported"
      );
      return false;
    }

    this.listeningGeneration += 1;
    const listeningGeneration = this.listeningGeneration;
    this.activeRecognition?.abort();
    this.cancelSpokenOutput();
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

      const retryOrFail = (message, errorCode = "unknown") => {
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
        onError?.(message, errorCode);
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
          "I did not understand that. Please try again or use the buttons.",
          "no-match"
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
            "I could not hear an answer. Please try again or use the buttons.",
            "no-speech"
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
        onError?.(message, event.error || "unknown");
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
            "I could not hear an answer. Please try again or use the buttons.",
            "no-speech"
          );
        }
      });

      try {
        recognition.start();
      } catch (_) {
        retryOrFail(
          "Speech recognition could not start. Please try again or use the buttons.",
          "start-failed"
        );
      }
    };

    startAttempt();
    return true;
  }
}

export const voiceGuidance = new VoiceGuidance();
voiceGuidance.setNeuralSpeechProvider(generateGuidanceSpeech);

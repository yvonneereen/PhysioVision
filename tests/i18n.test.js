import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getSpeechLocale,
  resolveInitialLocale,
  setLocale,
  SUPPORTED_LANGUAGES,
  translateText,
} from "../i18n.js";

const browserEntrySources = [
  "../index.html",
  "../patient-dashboard.js",
  "../voice-guidance.js",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const i18nCacheVersions = browserEntrySources.flatMap((source) =>
  [...source.matchAll(/i18n\.js\?v=(\d+)/g)].map((match) => match[1])
);
assert.ok(
  i18nCacheVersions.length >= 3,
  "the browser entry points should declare their shared i18n module"
);
assert.deepEqual(
  [...new Set(i18nCacheVersions)],
  ["7"],
  "all browser entry points must use one i18n URL so only one DOM observer is created"
);

const voiceConsumerSources = ["../main.js", "../agent-chat.js"]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const voiceCacheVersions = voiceConsumerSources.flatMap((source) =>
  [...source.matchAll(/voice-guidance\.js\?v=(\d+)/g)].map((match) => match[1])
);
assert.deepEqual(
  [...new Set(voiceCacheVersions)],
  ["17"],
  "all voice consumers must share one voice-guidance module instance"
);

assert.equal(
  resolveInitialLocale({ browserLocale: "zh-CN" }),
  "en-SG",
  "a phone's browser language must not silently change the website language"
);
assert.equal(
  resolveInitialLocale({ storedLocale: "zh-SG", explicitlyChosen: false }),
  "en-SG",
  "legacy or automatically derived preferences must reset to English"
);
assert.equal(
  resolveInitialLocale({ storedLocale: "zh-SG", explicitlyChosen: true }),
  "zh-SG",
  "an explicit language selection should still be remembered"
);

assert.deepEqual(
  SUPPORTED_LANGUAGES.map(({ code }) => code),
  ["en-SG", "zh-SG", "ms-SG", "ta-SG"],
  "the selector should prioritize Singapore's four official languages"
);

setLocale("zh-SG", { persist: false, announce: false });
assert.equal(getSpeechLocale(), "zh-CN");
assert.equal(translateText("Text size"), "文字大小");
assert.equal(translateText("Extra large"), "特大");
assert.equal(translateText("Start camera guide"), "开始摄像头指导");
assert.equal(
  translateText("A patient-specific note that has no bundled translation"),
  "A patient-specific note that has no bundled translation",
  "untranslated clinical or user-authored text must never disappear"
);
assert.equal(
  translateText("I heard that your pain is 7 out of 10. Is that correct?"),
  "我听到您的疼痛程度是10分中的7分。正确吗？"
);
assert.equal(
  translateText(
    "Thank you. I will ask a few short questions to help check whether it is safe for you to proceed. Please stop moving and rest somewhere safe. Where are you feeling the pain?"
  ),
  "谢谢。我会问几个简短的问题，以确认您是否适合继续。请停止动作，并在安全的地方休息。 您哪里感到疼痛？"
);

const dashboardSources = [
  "Review your physiotherapist-assigned plan, start approved exercises and follow your progress.",
  "Specialist-assigned programme",
  "Approved movement guidance",
  "Progress and pain trends",
  "Prototype sample",
  "Example: early rehabilitation after total knee replacement. These sample doses are interface data, not instructions for a real patient.",
  "Prototype display programme—not a personal prescription",
  "This sample shows an early total-knee-replacement rehabilitation pathway. A real patient must follow their own surgeon and physiotherapist’s instructions.",
  "Physiotherapist support",
  "Talk to a professional whenever you choose.",
  "Booking is always available—you do not need to wait for a warning from the AI.",
  "Book a consultation",
  "Consultation",
  "Request consultation",
  "No consultation currently scheduled.",
  "We are loading the exercises available for your care pathway.",
  "Complete guided sessions and pain check-ins to begin your trend.",
  "Early indicators only. The final clinical trend criteria are still being validated and will remain separate from AI interpretation.",
  "Which type of exercise support are you using?",
  "I have a physiotherapist-assigned plan",
  "I am here for general wellness",
  "No self-guided plan has been created. Review your safety-screen answers before using general-wellness exercises.",
  "Start with your AI movement companion",
  "Ready for an AI draft",
  "Create and review your AI plan",
  "Plan refresh needed",
  "Create a new AI wellness plan",
  "Your accepted AI wellness plan uses reviewed, camera-trackable exercises.",
  "Pause your wellness plan and seek professional advice",
  "Ask my physiotherapist to review",
  "Your physiotherapist suggested a consultation",
  "No messages yet. Say hello or ask a question.",
  "Request sent. The physiotherapist will confirm the appointment.",
  "Request a physiotherapist? This pauses your self-guided wellness plan and shares your recent history with the care team.",
];

for (const locale of ["zh-SG", "ms-SG", "ta-SG"]) {
  for (const source of dashboardSources) {
    assert.notEqual(
      translateText(source, locale),
      source,
      `${locale} is missing a patient-dashboard translation for: ${source}`
    );
  }
}

assert.equal(
  translateText("2 sets × 10 reps · 3 days/week", "zh-SG"),
  "2组 × 10次 · 每周3天"
);
assert.equal(
  translateText(
    "Detailed plan assigned by Dr Tan. Follow these doses and notes exactly.",
    "ms-SG"
  ),
  "Pelan terperinci ditetapkan oleh Dr Tan. Ikuti dos dan nota ini dengan tepat."
);

setLocale("ms-SG", { persist: false, announce: false });
assert.equal(getSpeechLocale(), "ms-MY");
assert.equal(translateText("Choose text size"), "Pilih saiz teks");
assert.equal(translateText("I need help"), "Saya perlukan bantuan");

setLocale("ta-SG", { persist: false, announce: false });
assert.equal(getSpeechLocale(), "ta-IN");
assert.equal(translateText("Large"), "பெரியது");
assert.equal(translateText("Call 995 now"), "இப்போது 995-ஐ அழைக்கவும்");

setLocale("en-SG", { persist: false, announce: false });
assert.equal(translateText("Start camera guide"), "Start camera guide");

console.log("internationalization tests passed");

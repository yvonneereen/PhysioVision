import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const markup = read("../index.html");
const dashboard = read("../patient-dashboard.js");
const api = read("../api.js");
const ui = read("../ui.js");
const styles = read("../style.css");

for (const id of [
  "bookingNotes",
  "generateBookingDraft",
  "bookingDraftStatus",
  "bookingVoiceInput",
  "bookingVoiceStatus",
]) {
  assert.match(markup, new RegExp(`id="${id}"`), `${id} should be rendered`);
}

assert.match(
  markup,
  /id="bookingNotes"[\s\S]*?maxlength="1000"/,
  "the editable patient message should retain a bounded length",
);
assert.match(
  markup,
  /not\s+a\s+diagnosis\s+and\s+is\s+never\s+sent\s+without\s+your\s+approval/i,
  "the AI draft should be clearly presented as editable, non-diagnostic content",
);
assert.match(
  api,
  /request\("POST", "\/consultations\/draft\/", \{ locale \}\)/,
  "draft facts should be requested through the authenticated API",
);
assert.match(
  dashboard,
  /window\.addEventListener\("physiovision:booking-opened"[\s\S]*?prepareConsultationDraft\(\)/,
  "opening an empty consultation form should prepare a draft automatically",
);
assert.match(
  dashboard,
  /bookingEditVersion !== editVersionAtStart/,
  "an AI response must not overwrite typing entered while it was loading",
);
assert.match(
  dashboard,
  /voiceGuidance\.listen\(\{[\s\S]*?mergeConsultationTranscript/,
  "speech recognition should append an editable transcript",
);
assert.match(
  dashboard,
  /bookingForm\?\.addEventListener\("submit"[\s\S]*?createConsultation\(/,
  "sending must remain an explicit form submission after user review",
);
assert.match(ui, /physiovision:booking-opened/);
assert.match(ui, /physiovision:booking-closed/);
assert.match(styles, /\.booking-ai-draft[\s\S]*?\.booking-voice-tools/);
assert.match(
  styles,
  /@media \(max-width: 640px\)[\s\S]*?\.booking-ai-draft[\s\S]*?\.booking-voice-button/,
  "AI and voice controls should stack on small screens",
);

console.log("patient consultation composition tests passed");

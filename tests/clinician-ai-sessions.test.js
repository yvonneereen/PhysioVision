import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const api = read("../api.js");
const therapist = read("../therapist.js");
const styles = read("../style.css");

assert.match(
  api,
  /getClinicianAiSessions[\s\S]*?\/auth\/agent\/sessions\//,
  "the clinician dashboard should load saved AI sessions from the authenticated API",
);
assert.match(
  api,
  /sendAgentMessage\(message, context = \{\}, history = \[\], sessionId = null\)[\s\S]*?payload\.session_id = sessionId/,
  "continued questions should be attached to the selected saved session",
);
assert.match(
  therapist,
  /Previous AI sessions[\s\S]*?contains_plan[\s\S]*?data-ai-session=/,
  "the sidebar should expose dated sessions and identify stored plans",
);
assert.match(
  therapist,
  /openClinicalAssistantSession[\s\S]*?session\.messages[\s\S]*?message\.data/,
  "opening a session should restore questions, replies, and structured plan data",
);
assert.match(
  therapist,
  /data-new-ai-session[\s\S]*?startNewClinicalAssistantSession/,
  "clinicians should be able to start a separate session without replacing history",
);
assert.match(styles, /\.ai-session-history[\s\S]*?\.ai-session-item\.is-active/);
assert.match(
  styles,
  /@media \(max-width: 780px\)[\s\S]*?\.messaging-layout \{ grid-template-columns: 1fr; \}/,
  "session history should remain usable on narrow screens",
);

console.log("clinician AI session history tests passed");

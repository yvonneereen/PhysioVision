import assert from "node:assert/strict";
import fs from "node:fs";

const markup = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../ui.js", import.meta.url), "utf8");
const personalization = fs.readFileSync(
  new URL("../personalization.js", import.meta.url),
  "utf8"
);
const dashboard = fs.readFileSync(
  new URL("../patient-dashboard.js", import.meta.url),
  "utf8"
);
const auth = fs.readFileSync(new URL("../auth.js", import.meta.url), "utf8");

assert.match(markup, /id="emergencyContactName"/);
assert.match(markup, /id="emergencyContactRelationship"/);
assert.match(markup, /id="emergencyContactPhone"/);
assert.match(markup, /id="emergencyContactConsent"/);
assert.match(markup, /does not notify or call them/i);
assert.match(markup, /life-threatening emergency in Singapore, call 995/i);
assert.doesNotMatch(markup, /Emergency contacts are not configured/i);

assert.match(ui, /function syncEmergencyContactRequirements\(\)/);
assert.match(ui, /emergencyContactName\.required = hasDetails/);
assert.match(ui, /emergencyContactRelationship\.required = hasDetails/);
assert.match(ui, /emergencyContactPhone\.required = hasDetails/);
assert.match(ui, /emergencyContactConsent\.required = hasDetails/);
assert.match(ui, /digitCount < 8 \|\| digitCount > 15/);
assert.match(ui, /formData\.get\("emergencyContactConsent"\) === "true"/);

assert.match(personalization, /emergency_contact_name: next\.emergencyContactName/);
assert.match(personalization, /emergency_contact_phone: next\.emergencyContactPhone/);
assert.match(
  personalization,
  /emergency_contact_consent: next\.emergencyContactConsent/
);
assert.match(dashboard, /profile\.emergency_contact_name \?\? ""/);
assert.match(dashboard, /profile\.emergency_contact_consent === true/);
assert.match(dashboard, /profile\.emergency_contact_verified_at \?\? null/);
assert.match(dashboard, /profile\.emergency_contact_alerts_ready === true/);
assert.match(auth, /p\.emergency_contact_name \?\? ""/);
assert.match(auth, /p\.emergency_contact_consent === true/);
assert.match(auth, /p\.emergency_contact_verified_at \?\? null/);
assert.match(styles, /\.emergency-contact-card\s*\{/);
assert.match(styles, /\.emergency-contact-grid\s*\{[\s\S]*grid-template-columns: 1fr/);

console.log("profile emergency contact tests passed");

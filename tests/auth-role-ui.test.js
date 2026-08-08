import assert from "node:assert/strict";
import fs from "node:fs";

import { getRoleNavigationState } from "../role-ui.js";

const authSource = fs.readFileSync(
  new URL("../auth.js", import.meta.url),
  "utf8",
);
const dashboardSource = fs.readFileSync(
  new URL("../patient-dashboard.js", import.meta.url),
  "utf8",
);

assert.deepEqual(getRoleNavigationState(false, null), {
  showSignIn: true,
  showSignOut: false,
  showPatientDashboard: false,
  showPatientProfile: false,
  showTherapistView: false,
  showPlan: true,
});

assert.deepEqual(getRoleNavigationState(true, "patient"), {
  showSignIn: false,
  showSignOut: true,
  showPatientDashboard: true,
  showPatientProfile: true,
  showTherapistView: false,
  showPlan: false,
});

assert.deepEqual(getRoleNavigationState(true, "clinician"), {
  showSignIn: false,
  showSignOut: true,
  showPatientDashboard: false,
  showPatientProfile: false,
  showTherapistView: true,
  showPlan: false,
});

assert.match(
  authSource,
  /pvShowPatientDashboard\(user\)[\s\S]*?physiovision:patient-dashboard-requested/,
  "patient routing should have an explicit event handoff if the dashboard module is still loading",
);
assert.match(
  dashboardSource,
  /async function activatePatientDashboard[\s\S]*?setView\("dashboard"\);[\s\S]*?saveProfile/,
  "an authenticated patient must be routed before optional profile caching runs",
);
assert.match(
  dashboardSource,
  /const initialAuthState = window\.physioVisionAuthState[\s\S]*?activatePatientDashboard\(initialAuthState\.user\)[\s\S]*?else if \(isLoggedIn\(\)\)[\s\S]*?showDashboard\(\)/,
  "refresh routing should work whether auth or dashboard initialization finishes first",
);
assert.match(
  dashboardSource,
  /physiovision:patient-dashboard-requested[\s\S]*?showDashboard\(event\.detail\?\.user/,
  "the dashboard should receive delayed post-sign-in routing requests",
);

console.log("Role-aware navigation tests passed");

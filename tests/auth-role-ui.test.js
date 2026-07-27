import assert from "node:assert/strict";

import { getRoleNavigationState } from "../role-ui.js";

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

console.log("Role-aware navigation tests passed");

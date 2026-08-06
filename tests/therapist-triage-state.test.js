import assert from "node:assert/strict";

import { excludeRosterPatientsFromTriage } from "../therapist-triage-state.js";

const queue = [
  { id: "patient-existing", name: "Existing Patient" },
  { id: "patient-waiting", name: "Waiting Patient" },
];
const roster = [{ id: "patient-existing", name: "Existing Patient" }];

assert.deepEqual(
  excludeRosterPatientsFromTriage(queue, roster),
  [{ id: "patient-waiting", name: "Waiting Patient" }],
  "patients already in the clinician roster must not remain in triage",
);

assert.deepEqual(
  excludeRosterPatientsFromTriage(
    [{ id: "different-account", name: "Existing Patient" }],
    roster,
  ),
  [{ id: "different-account", name: "Existing Patient" }],
  "matching names alone must not hide a different patient's request",
);

assert.deepEqual(excludeRosterPatientsFromTriage(null, null), []);

console.log("therapist triage state tests passed");

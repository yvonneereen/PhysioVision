import assert from "node:assert/strict";
import fs from "node:fs";

const dashboardSource = fs.readFileSync(
  new URL("../patient-dashboard.js", import.meta.url),
  "utf8",
);
const mainSource = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");

const startExerciseStart = dashboardSource.indexOf("function startExercise(");
assert.ok(startExerciseStart >= 0, "patient dashboard should define startExercise");

const startExerciseEnd = dashboardSource.indexOf(
  "\nfunction planRow(",
  startExerciseStart,
);
assert.ok(
  startExerciseEnd > startExerciseStart,
  "startExercise should have a detectable boundary",
);

const startExerciseSource = dashboardSource.slice(
  startExerciseStart,
  startExerciseEnd,
);
const handoffPosition = startExerciseSource.indexOf(
  'new CustomEvent("physiovision:practice-requested"',
);
const viewChangePosition = startExerciseSource.indexOf('setView("practice")');

assert.ok(
  handoffPosition >= 0,
  "starting an exercise should publish the patient practice context",
);
assert.ok(viewChangePosition >= 0, "starting an exercise should open the practice view");
assert.ok(
  handoffPosition < viewChangePosition,
  "patient context must be synchronized before the practice view becomes visible",
);

const listenerStart = mainSource.indexOf(
  'window.addEventListener("physiovision:practice-requested"',
);
assert.ok(
  listenerStart >= 0,
  "the exercise guide should listen for patient practice requests",
);

const listenerEnd = mainSource.indexOf("\n});", listenerStart);
assert.ok(
  listenerEnd > listenerStart,
  "the practice request listener should have a detectable boundary",
);

const listenerSource = mainSource.slice(listenerStart, listenerEnd);
assert.match(
  listenerSource,
  /authenticatedPatientProfile/,
  "the exercise guide should receive the authenticated patient profile",
);
assert.match(
  listenerSource,
  /syncPracticeAccess\(\)/,
  "the exercise guide should recalculate access before rendering",
);

console.log("patient practice handoff tests passed");

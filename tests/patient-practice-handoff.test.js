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
const durableHandoffPosition = startExerciseSource.indexOf(
  "window.physioVisionPendingPracticeRequest = practiceRequest",
);
const directBridgePosition = startExerciseSource.indexOf(
  'typeof window.physioVisionOpenPractice === "function"',
);
const fallbackEventPosition = startExerciseSource.indexOf(
  'new CustomEvent("physiovision:practice-requested"',
);
const viewChangePosition = startExerciseSource.indexOf('setView("practice")');

assert.ok(
  durableHandoffPosition >= 0,
  "starting an exercise should save a durable practice request",
);
assert.ok(
  directBridgePosition >= 0,
  "starting an exercise should use the direct practice bridge when available",
);
assert.ok(
  fallbackEventPosition >= 0,
  "starting an exercise should keep an event fallback",
);
assert.ok(viewChangePosition >= 0, "starting an exercise should open the practice view");
assert.ok(
  durableHandoffPosition < viewChangePosition,
  "patient context must be saved before the practice view becomes visible",
);

const handlerStart = mainSource.indexOf("function handlePracticeRequest(");
assert.ok(
  handlerStart >= 0,
  "the exercise guide should define a shared practice request handler",
);

const handlerEnd = mainSource.indexOf(
  "\n}\n\nwindow.physioVisionOpenPractice",
  handlerStart,
);
assert.ok(
  handlerEnd > handlerStart,
  "the practice request handler should have a detectable boundary",
);

const handlerSource = mainSource.slice(handlerStart, handlerEnd);
assert.match(
  handlerSource,
  /authenticatedPatientProfile/,
  "the exercise guide should receive the authenticated patient profile",
);
assert.match(
  handlerSource,
  /syncPracticeAccess\(\)/,
  "the exercise guide should recalculate access before rendering",
);
assert.match(
  mainSource,
  /window\.physioVisionOpenPractice = handlePracticeRequest/,
  "the dashboard should have a direct practice bridge",
);
assert.match(
  mainSource,
  /const pendingPracticeRequest = window\.physioVisionPendingPracticeRequest/,
  "the guide should replay a request saved before initialization",
);

const listenerStart = mainSource.indexOf(
  'window.addEventListener("physiovision:practice-requested"',
);
assert.ok(
  listenerStart >= 0,
  "the exercise guide should listen for event fallbacks",
);

const listenerEnd = mainSource.indexOf("\n});", listenerStart);
assert.ok(
  listenerEnd > listenerStart,
  "the fallback listener should have a detectable boundary",
);

const listenerSource = mainSource.slice(listenerStart, listenerEnd);
assert.match(
  listenerSource,
  /handlePracticeRequest\(event\.detail\)/,
  "the event fallback should use the shared practice handoff",
);

console.log("patient practice handoff tests passed");

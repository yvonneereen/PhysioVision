import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildPlannedSessionKey,
  completedExerciseIdsForPlannedSession,
  nextIncompleteExerciseId,
  parsePlannedSessionNote,
  planWeekKey,
  serializePlannedSessionNote,
  sessionReachedTarget,
  sessionsForPlannedSession,
} from "../planned-session-progress.js";

assert.equal(planWeekKey(new Date(2026, 7, 9)), "2026-08-03");
assert.equal(planWeekKey(new Date(2026, 7, 10)), "2026-08-10");

const sessionKey = buildPlannedSessionKey({
  acceptedAt: "2026-08-01T10:00:00Z",
  day: "Mon",
  dayIndex: 0,
  exerciseIds: ["half-squats", "calf-raises"],
  date: new Date(2026, 7, 9),
});
const notes = serializePlannedSessionNote({
  sessionKey,
  sessionDay: "Monday",
  sessionTitle: "Leg Strength & Ankle Balance",
});
assert.deepEqual(parsePlannedSessionNote(notes), {
  sessionKey,
  sessionDay: "Monday",
  sessionTitle: "Leg Strength & Ankle Balance",
});
assert.equal(parsePlannedSessionNote("ordinary clinician note"), null);

const sessions = [
  {
    exercise: "half-squats",
    reps_completed: 10,
    reps_target: 10,
    sets_completed: 1,
    sets_target: 1,
    quality_score: 90,
    notes,
  },
  {
    exercise: "calf-raises",
    reps_completed: 4,
    reps_target: 10,
    sets_completed: 1,
    sets_target: 1,
    notes,
  },
];
assert.equal(sessionReachedTarget(sessions[0]), true);
assert.equal(sessionReachedTarget(sessions[1]), false);
assert.deepEqual(
  completedExerciseIdsForPlannedSession(sessions, sessionKey),
  ["half-squats"],
);
assert.equal(
  nextIncompleteExerciseId(
    ["half-squats", "calf-raises"],
    ["half-squats"],
  ),
  "calf-raises",
);
assert.equal(
  nextIncompleteExerciseId(
    ["half-squats", "calf-raises"],
    ["half-squats", "calf-raises"],
  ),
  null,
);
assert.deepEqual(sessionsForPlannedSession(sessions, sessionKey), [sessions[0]]);

const mainSource = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
const dashboardSource = fs.readFileSync(
  new URL("../patient-dashboard.js", import.meta.url),
  "utf8",
);
const htmlSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(
  mainSource,
  /notes:\s*serializePlannedSessionNote\(\{[\s\S]*?sessionKey:\s*activeSessionKey/,
  "completed exercises should persist their exact weekly plan-session key",
);
assert.match(
  mainSource,
  /function showPostExerciseDestination[\s\S]*?openExerciseTransition\(progress\)[\s\S]*?openSessionSummary/,
  "an unfinished multi-exercise day should show the continuation screen before the report",
);
assert.match(
  mainSource,
  /exerciseTransitionContinueEl[\s\S]*?exSelect\.value = nextExerciseId[\s\S]*?dispatchEvent\(new Event\("change"/,
  "continuing should open the next exercise without returning home",
);
assert.match(
  dashboardSource,
  /completedExerciseIdsForPlannedSession\([\s\S]*?nextIncompleteExerciseId\(/,
  "the dashboard should resume the first unfinished exercise",
);
assert.match(
  htmlSource,
  /id="exercise-transition-modal"[\s\S]*?id="exerciseTransitionContinue"[\s\S]*?Finish for now/,
  "the intermediate completion screen should offer continue and finish-for-now actions",
);

console.log("planned session progress tests passed");

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
assert.ok(
  viewChangePosition < directBridgePosition,
  "practice access must be recalculated after the practice view becomes visible",
);
assert.match(
  startExerciseSource,
  /role:\s*"patient"/,
  "patient dashboard exercise handoffs should explicitly preserve the patient role",
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
  /authState\?\.role\s*\?\?\s*authenticatedRole/,
  "practice requests should fall back to the authenticated role",
);
assert.match(
  handlerSource,
  /authState\?\.user\?\.profile\s*\?\?\s*authenticatedPatientProfile/,
  "practice requests should retain the authenticated patient profile",
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

const identityStart = mainSource.indexOf("function currentPracticeIdentity(");
assert.ok(identityStart >= 0, "practice page should resolve current identity");
const identityEnd = mainSource.indexOf(
  "\n\nfunction isPracticeAccountAuthenticated",
  identityStart,
);
assert.ok(identityEnd > identityStart, "current identity helper should be complete");
const identitySource = mainSource.slice(identityStart, identityEnd);
assert.match(
  identitySource,
  /window\.physioVisionAuthState/,
  "current identity should read the latest global auth state",
);
assert.match(
  identitySource,
  /practiceIdentityOverride/,
  "current identity should honor the explicit dashboard handoff",
);
assert.match(
  identitySource,
  /Boolean\(authState\?\.user\)\s*\|\|\s*isLoggedIn\(\)/,
  "global signed-in user should be accepted even before cookie probing catches up",
);

const syncStart = mainSource.indexOf("function syncPracticeAccess(");
const syncEnd = mainSource.indexOf(
  "\n}\n\nfunction hasLivePracticeAccess",
  syncStart,
);
assert.ok(
  syncStart >= 0 && syncEnd > syncStart,
  "practice access synchronizer should exist",
);
const syncSource = mainSource.slice(syncStart, syncEnd);
assert.match(
  syncSource,
  /const identity = currentPracticeIdentity\(\)/,
  "practice access should refresh identity each time it synchronizes",
);
assert.match(
  syncSource,
  /role:\s*identity\.role/,
  "practice access should use the live role",
);
assert.match(
  syncSource,
  /patientProfile:\s*identity\.patientProfile/,
  "practice access should use the live patient profile",
);
assert.match(
  handlerSource,
  /practiceIdentityOverride\s*=\s*requestedRole/,
  "dashboard handoff should persist a live identity override",
);

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = Boolean(options.bubbles);
  }
}

class FakeCustomEvent extends FakeEvent {
  constructor(type, options = {}) {
    super(type, options);
    this.detail = options.detail;
  }
}

function makePracticeDocument() {
  const selectEvents = [];
  const scrollCalls = [];
  const exerciseSelect = {
    value: "",
    dispatchEvent(event) {
      selectEvents.push(event);
    },
  };

  return {
    document: {
      getElementById(id) {
        if (id === "exerciseSelect") return exerciseSelect;
        if (id === "practice") {
          return {
            scrollIntoView(options) {
              scrollCalls.push(options);
            },
          };
        }
        return null;
      },
    },
    exerciseSelect,
    selectEvents,
    scrollCalls,
  };
}

const makeStartExercise = new Function(
  "window",
  "currentUser",
  "firstExerciseId",
  "primaryAction",
  "setView",
  "openAiCompanion",
  "loadDashboardData",
  "openPlanModal",
  "CustomEvent",
  "document",
  "Event",
  `${startExerciseSource}; return startExercise;`,
);

{
  const bridgeCalls = [];
  const viewCalls = [];
  const practiceDocument = makePracticeDocument();
  const fakeWindow = {
    physioVisionAuthState: {
      role: "patient",
      user: {
        profile: {
          preferredName: "Auth",
          carePath: "general_wellness",
        },
      },
    },
    physioVisionOpenPractice(request) {
      bridgeCalls.push(request);
    },
  };
  const startExercise = makeStartExercise(
    fakeWindow,
    { profile: { focusSide: "right" } },
    "half-squats",
    "practice",
    (view) => viewCalls.push(view),
    () => {},
    () => {},
    () => {},
    FakeCustomEvent,
    practiceDocument.document,
    FakeEvent,
  );

  startExercise("half-squats");

  assert.deepEqual(viewCalls, ["practice"]);
  assert.equal(bridgeCalls.length, 1);
  assert.equal(fakeWindow.physioVisionPendingPracticeRequest, bridgeCalls[0]);
  assert.deepEqual(bridgeCalls[0], {
    role: "patient",
    profile: {
      preferredName: "Auth",
      carePath: "general_wellness",
      focusSide: "right",
    },
    exerciseId: "half-squats",
  });
  assert.equal(practiceDocument.exerciseSelect.value, "half-squats");
  assert.equal(practiceDocument.selectEvents.length, 1);
  assert.equal(practiceDocument.selectEvents[0].type, "change");
  assert.equal(practiceDocument.selectEvents[0].bubbles, true);
  assert.deepEqual(practiceDocument.scrollCalls, [{ behavior: "smooth" }]);
}

{
  const dispatchedEvents = [];
  const viewCalls = [];
  const practiceDocument = makePracticeDocument();
  const fakeWindow = {
    physioVisionAuthState: {
      role: "patient",
      user: { profile: { carePath: "general_wellness" } },
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    },
  };
  const startExercise = makeStartExercise(
    fakeWindow,
    { profile: { preferredName: "Yvonne" } },
    "calf-raises",
    "practice",
    (view) => viewCalls.push(view),
    () => {},
    () => {},
    () => {},
    FakeCustomEvent,
    practiceDocument.document,
    FakeEvent,
  );

  startExercise("calf-raises");

  assert.deepEqual(viewCalls, ["practice"]);
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, "physiovision:practice-requested");
  assert.equal(
    dispatchedEvents[0].detail,
    fakeWindow.physioVisionPendingPracticeRequest,
  );
  assert.equal(dispatchedEvents[0].detail.exerciseId, "calf-raises");
}

const makeCurrentPracticeIdentity = new Function(
  "window",
  "practiceIdentityOverride",
  "authenticatedPatientProfile",
  "authenticatedRole",
  "hasAuthenticatedPracticeAccount",
  "isLoggedIn",
  `${identitySource}; return currentPracticeIdentity;`,
);

{
  const currentPracticeIdentity = makeCurrentPracticeIdentity(
    {
      physioVisionAuthState: {
        role: "patient",
        user: { profile: { carePath: "general_wellness" } },
      },
    },
    null,
    { focusSide: "left" },
    null,
    ({ loggedIn, role }) => Boolean(loggedIn && role),
    () => false,
  );

  assert.deepEqual(currentPracticeIdentity(), {
    loggedIn: true,
    role: "patient",
    patientProfile: {
      focusSide: "left",
      carePath: "general_wellness",
    },
  });
}

{
  const currentPracticeIdentity = makeCurrentPracticeIdentity(
    {
      physioVisionAuthState: {
        role: "patient",
        user: { profile: { focusSide: "left" } },
      },
    },
    { role: "patient", profile: { focusSide: "right" } },
    null,
    null,
    ({ loggedIn, role }) => Boolean(loggedIn && role),
    () => false,
  );

  assert.equal(currentPracticeIdentity().patientProfile.focusSide, "right");
}

const authListenerStart = mainSource.indexOf(
  'window.addEventListener("physiovision:auth-role"',
);
assert.notEqual(
  authListenerStart,
  -1,
  "exercise guide should react to restored authentication",
);
const authListenerSource = mainSource.slice(authListenerStart, authListenerStart + 1800);
assert.match(
  authListenerSource,
  /const stillLoggedIn = Boolean\(event\.detail\?\.user\) \|\| isLoggedIn\(\);/,
  "auth refresh should distinguish a temporary empty role from a real logout",
);
assert.match(
  authListenerSource,
  /else if \(!stillLoggedIn\) \{\s*authenticatedRole = null;/,
  "patient identity should only be cleared after a real logout",
);
assert.match(
  authListenerSource,
  /practiceIdentityOverride\?\.profile/,
  "temporary auth refresh should keep the profile supplied by the dashboard handoff",
);

console.log("patient practice handoff tests passed");

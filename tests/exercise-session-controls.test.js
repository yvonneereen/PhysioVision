import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should follow ${name}`);
  return source.slice(start, end);
}

const deactivateSource = functionSource(
  "deactivateCameraGuide",
  "startHandPreview"
);

assert.doesNotMatch(
  deactivateSource,
  /showPainCheckin\("after"\)/,
  "pausing the camera must not show the after-exercise check-in"
);
assert.doesNotMatch(
  deactivateSource,
  /completeExerciseSession\(\)/,
  "pausing the camera must not complete or record the exercise"
);
assert.match(
  deactivateSource,
  /exercise not marked finished/,
  "the paused state should clearly say the exercise is unfinished"
);

const finishHandlerStart = source.indexOf(
  'finishExerciseBtn.addEventListener("click"'
);
const finishHandlerEnd = source.indexOf(
  'handTrackingToggle.addEventListener("click"',
  finishHandlerStart
);
assert.notEqual(finishHandlerStart, -1, "explicit finish handler should exist");
assert.notEqual(finishHandlerEnd, -1, "finish handler should have an end");
const finishHandlerSource = source.slice(finishHandlerStart, finishHandlerEnd);

assert.match(
  finishHandlerSource,
  /completeExerciseSession\(\)/,
  "only the explicit finish action should complete the exercise session"
);
assert.match(
  finishHandlerSource,
  /showPainCheckin\("after"\)/,
  "the after-exercise check-in should follow explicit completion"
);

const voiceChoiceStart = source.indexOf(
  'voiceSetupHandsFree.addEventListener("click"'
);
const voiceChoiceEnd = source.indexOf(
  'voiceSetupButtons.addEventListener("click"',
  voiceChoiceStart
);
assert.notEqual(
  voiceChoiceStart,
  -1,
  "the exercise flow should offer hands-free voice before setup"
);
const voiceChoiceSource = source.slice(voiceChoiceStart, voiceChoiceEnd);
assert.match(
  voiceChoiceSource,
  /getUserMedia\(\{\s*audio:\s*true,\s*\}\)/,
  "hands-free mode should request microphone permission while the user is near the device"
);
assert.match(
  voiceChoiceSource,
  /finishVoiceModeChoice\(true\)/,
  "successful microphone setup should enable hands-free responses"
);

const calibrationFlowStart = source.indexOf(
  "async function openCalibrationFlow("
);
const calibrationFlowEnd = source.indexOf(
  "async function startCalibrationFlow(",
  calibrationFlowStart
);
assert.notEqual(
  calibrationFlowStart,
  -1,
  "the camera setup entry point should exist"
);
const calibrationFlowSource = source.slice(
  calibrationFlowStart,
  calibrationFlowEnd
);
const voiceChoicePosition = calibrationFlowSource.indexOf(
  "ensureVoiceModeChosen()"
);
const preCheckPosition = calibrationFlowSource.indexOf(
  'showPainCheckin("before"'
);
const calibrationPosition = calibrationFlowSource.indexOf(
  "startCalibrationFlow(trigger)"
);
assert.ok(
  voiceChoicePosition >= 0 &&
    preCheckPosition > voiceChoicePosition &&
    calibrationPosition > preCheckPosition,
  "voice choice and the pre-exercise pain check should happen before calibration"
);

const speakPainSource = functionSource(
  "speakPainPrompt",
  "showPainCheckin"
);
assert.match(
  speakPainSource,
  /onEnd:\s*beginListening/,
  "hands-free listening should begin automatically after the spoken question"
);
assert.match(
  speakPainSource,
  /handsFreeVoiceEnabled/,
  "automatic listening should only run when the user selected hands-free mode"
);

assert.match(
  source,
  /painVoiceInputBtn\.addEventListener\("click",[\s\S]*?startPainVoiceListening/,
  "the manual voice button should remain available as a fallback"
);

console.log("exercise session control tests passed");

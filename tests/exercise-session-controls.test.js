import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
const markup = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");

assert.match(
  markup,
  /class="feedback-symbol" aria-hidden="true">●<\/span>[\s\S]*?class="feedback-title">Get into position<\/strong>[\s\S]*?class="feedback-detail">Live guidance appears here<\/span>/,
  "live guidance should use separately styled icon, title and detail elements"
);
assert.match(
  source,
  /querySelector\("\.feedback-title"\)[\s\S]*?querySelector\("\.feedback-detail"\)/,
  "live guidance updates should target the explicit copy elements"
);
assert.match(
  styles,
  /\.feedback-banner\s*\{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: 38px minmax\(0, 1fr\);[\s\S]*?overflow: hidden;/,
  "the guidance banner should isolate its badge from wrapping copy"
);
assert.match(
  styles,
  /\.feedback-detail\s*\{[\s\S]*?color: #3d6d53;[\s\S]*?overflow-wrap: break-word;/,
  "guidance detail should use readable dark text and safe word wrapping"
);

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

assert.match(
  markup,
  /id="primaryCalibrationLabel">Start camera guide<\/span>/,
  "the central camera action should be labelled Start camera guide"
);
const secondaryCameraButtonStart = markup.lastIndexOf(
  "<button",
  markup.indexOf('id="toggle"')
);
const secondaryCameraButtonEnd =
  markup.indexOf("</button>", secondaryCameraButtonStart) +
  "</button>".length;
const secondaryCameraButton = markup.slice(
  secondaryCameraButtonStart,
  secondaryCameraButtonEnd
);
assert.match(
  secondaryCameraButton,
  /class="[^"]*\bhidden\b[^"]*"/,
  "the secondary camera control should be hidden before the camera starts"
);
assert.doesNotMatch(
  secondaryCameraButton,
  />\s*Start camera guide/,
  "the secondary camera control must not duplicate the central start action"
);
assert.match(
  source,
  /toggleBtn\.classList\.remove\("hidden"\)[\s\S]*?Pause camera guide/,
  "the secondary control should appear only as a pause action while the camera is running"
);

const toggleHandlerStart = source.indexOf(
  'toggleBtn.addEventListener("click"'
);
const toggleHandlerEnd = source.indexOf(
  'finishExerciseBtn.addEventListener("click"',
  toggleHandlerStart
);
assert.notEqual(toggleHandlerStart, -1, "the pause handler should exist");
const toggleHandlerSource = source.slice(toggleHandlerStart, toggleHandlerEnd);
assert.match(
  toggleHandlerSource,
  /if \(running\) deactivateCameraGuide\(\)/,
  "the secondary camera control should pause an active guide"
);
assert.doesNotMatch(
  toggleHandlerSource,
  /showPainCheckin|(?:^|[^\w])activateCameraGuide/,
  "the secondary camera control must not provide another way to start the guide"
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

assert.match(
  markup,
  /id="painConfirmation"[\s\S]*?data-pain-confirmation="confirm"[\s\S]*?data-pain-confirmation="change"/,
  "the pain check-in should show explicit confirm and change actions"
);

assert.match(
  markup,
  /id="recordedPain"[\s\S]*?id="recordedPainMessage"[\s\S]*?id="recordedPainValue"/,
  "the right-side exercise panel should show the confirmed pain level"
);
assert.match(
  markup,
  /id="painSafetyInterview"[\s\S]*?id="painSafetyQuestion"[\s\S]*?id="painSafetyChoices"/,
  "the pain check-in should provide a step-by-step safety follow-up"
);

const acceptPainSource = functionSource(
  "acceptPainLevel",
  "beginPainConfirmation"
);
assert.match(
  acceptPainSource,
  /beginPainConfirmation\(\)/,
  "choosing a pain level should open confirmation before continuing"
);
assert.doesNotMatch(
  acceptPainSource,
  /beginRecoveryQuestion|finishPainCheckin/,
  "choosing a pain level must not automatically advance the check-in"
);

const acceptConfirmationSource = functionSource(
  "acceptPainConfirmation",
  "acceptRecoveryStatus"
);
assert.match(
  acceptConfirmationSource,
  /response === "change"[\s\S]*?returnToPainQuestion/,
  "patients should be able to correct a pain level"
);
assert.match(
  acceptConfirmationSource,
  /response !== "confirm"[\s\S]*?return/,
  "an unclear spoken answer must not advance the check-in"
);
assert.match(
  acceptConfirmationSource,
  /if \(requiresPainSafetyInterview\(\)\) beginPainSafetyInterview\(\);[\s\S]*?else if \(shouldAskRecovery\(\)\) beginRecoveryQuestion\(\);[\s\S]*?else finishPainCheckin\(\)/,
  "a confirmed concerning pain level should enter the safety interview"
);

const finishPainSource = functionSource(
  "finishPainCheckin",
  "requiresPainSafetyInterview"
);
assert.match(
  finishPainSource,
  /hidePainCheckin\(\);[\s\S]*?renderRecordedPain\(completed\)[\s\S]*?completed\.continuation \|\| completed\.startAfter[\s\S]*?continueAfterPainCheckin\(completed\)/,
  "a pre-exercise pain confirmation should immediately continue camera setup"
);
assert.match(
  finishPainSource,
  /else \{\s*acknowledgeRecordedPain\(completed\);\s*\}/,
  "a completed check-in with no pending camera action may still be acknowledged"
);

const acknowledgementSource = functionSource(
  "acknowledgeRecordedPain",
  "startPainVoiceListening"
);
assert.match(
  acknowledgementSource,
  /recorded your pain level as \$\{level\} out of 10/,
  "the acknowledgement should repeat the recorded pain level"
);
assert.doesNotMatch(
  acknowledgementSource,
  /onEnd|setTimeout|continueAfterPainCheckin/,
  "camera setup must not depend on Safari completing a speech callback"
);

const voiceVisibilitySource = functionSource(
  "updatePainCheckinPresentation",
  "continueAfterPainCheckin"
);
assert.match(
  voiceVisibilitySource,
  /classList\.toggle\([\s\S]*?"hands-free-checkin"[\s\S]*?handsFreeVoiceEnabled/,
  "hands-free mode should hide the repeated on-screen pain card"
);
assert.match(
  voiceVisibilitySource,
  /classList\.toggle\([\s\S]*?"hidden"[\s\S]*?handsFreeVoiceEnabled && !safetyActive[\s\S]*?safetyOutcome/,
  "hands-free mode should hide the redundant Answer by voice button"
);

const safetyThresholdSource = functionSource(
  "requiresPainSafetyInterview",
  "createPainSafetyAnswers"
);
assert.match(
  safetyThresholdSource,
  /level >= 7/,
  "a severe pain score should trigger the safety follow-up"
);
assert.match(
  safetyThresholdSource,
  /level - confirmedPreExercisePain[\s\S]*?increase >= 2/,
  "a two-point increase from the pre-exercise score should trigger the safety follow-up"
);

const beginSafetySource = functionSource(
  "beginPainSafetyInterview",
  "determinePainSafetyOutcome"
);
assert.match(
  beginSafetySource,
  /deactivateCameraGuide\(\{/,
  "the camera guide should pause before asking safety questions"
);
assert.match(
  beginSafetySource,
  /startAfter = false[\s\S]*?continuation = ""/,
  "a concerning pain report must cancel automatic exercise continuation"
);

const finishSafetySource = functionSource(
  "finishPainSafetyInterview",
  "acceptPainLevel"
);
assert.match(
  finishSafetySource,
  /safety_follow_up:[\s\S]*?requires_review:/,
  "the completed safety interview should be stored with its review flag"
);
assert.doesNotMatch(
  finishSafetySource,
  /activateCameraGuide|continueAfterPainCheckin/,
  "finishing a safety interview must not resume the exercise automatically"
);
assert.match(
  finishSafetySource,
  /not automatically notified/,
  "a therapist report must not falsely claim that a notification was sent"
);

assert.match(
  source,
  /onError:[\s\S]*?classList\.remove\("hands-free-checkin"\)[\s\S]*?large on-screen choices/,
  "the on-screen check-in should reappear if hands-free recognition fails"
);

console.log("exercise session control tests passed");

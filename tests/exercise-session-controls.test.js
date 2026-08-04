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
assert.doesNotMatch(
  finishHandlerSource,
  /confirmedPreExercisePain = null/,
  "the pre-exercise score must remain available for the after-exercise confirmation"
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
  /onEnd:\s*\(\)\s*=>\s*armVoiceListening\(beginListening\)/,
  "hands-free listening should arm automatically after the spoken question"
);
assert.match(
  source,
  /const VOICE_LISTENING_ARM_DELAY_MS = 400/,
  "recognition should wait briefly for spoken audio to release the microphone"
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
  /data-pain-confirmation="confirm">\s*Yes, that’s correct[\s\S]*?data-pain-confirmation="change">\s*Change my answer/,
  "pain confirmation should use the requested unambiguous actions"
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
assert.match(
  source,
  /"urgent-chest"[\s\S]*?"urgent-breathing"[\s\S]*?"urgent-neurologic"[\s\S]*?"urgent-fall"/,
  "an unsure combined warning-sign answer should be clarified symptom by symptom"
);
assert.match(
  source,
  /stageName === "urgent"[\s\S]*?response === "unsure"[\s\S]*?renderPainSafetyStage\("urgent-chest"\)/,
  "not sure must open clarification instead of immediately showing an urgent outcome"
);
assert.match(
  source,
  /answers\.urgentSymptoms === "yes" \|\| answers\.safeMovement === "help"/,
  "only a confirmed warning sign or inability to move safely should force the urgent outcome"
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

const painConfirmationQuestionSource = functionSource(
  "painConfirmationQuestion",
  "isPainSafetyStage"
);
assert.match(
  painConfirmationQuestionSource,
  /context === "after"[\s\S]*?Before it was \$\{confirmedPreExercisePain\}/,
  "after-exercise confirmation should compare the new score with the confirmed pre-exercise score"
);

const countdownSource = functionSource(
  "continueAfterPainCheckin",
  "renderRecordedPain"
);
assert.match(
  countdownSource,
  /secondsRemaining: 3[\s\S]*?setInterval[\s\S]*?startCameraSetupAfterCountdown/,
  "a safe confirmed score should start camera setup automatically after a visible three-second countdown"
);
assert.match(
  countdownSource,
  /Pain level confirmed\. Camera setup will begin in three seconds\. Step back so your full body is visible\./,
  "the countdown should announce what will happen before the camera permission step"
);
const cancelCountdownSource = functionSource(
  "cancelCameraSetupCountdown",
  "startCameraSetupAfterCountdown"
);
assert.match(
  cancelCountdownSource,
  /clearInterval[\s\S]*?Camera setup cancelled/,
  "patients should be able to cancel pending automatic camera setup"
);

const recoveryRuleSource = functionSource(
  "shouldAskRecovery",
  "beginRecoveryQuestion"
);
assert.match(
  recoveryRuleSource,
  /context === "after"/,
  "a safe pre-exercise confirmation should not stall on an extra recovery question"
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
  /classList\.toggle\([\s\S]*?"hidden"[\s\S]*?handsFreeVoiceEnabled && !painVoiceFallbackNeeded[\s\S]*?safetyOutcome/,
  "hands-free mode should hide the redundant Answer by voice button during every automatically listened question"
);
assert.match(
  source,
  /Answer aloud after the question\. You do not need to press a button\./,
  "the safety interview should clearly explain that hands-free answers require no button press"
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
assert.match(
  beginSafetySource,
  /cancelCameraSetupCountdown/,
  "the high-pain branch should clear any pending camera countdown"
);

assert.match(
  source,
  /classList\.toggle\("is-body-map", stageName === "location"\)[\s\S]*?appendPainBodyDiagram/,
  "the pain-location step should include a simple body diagram with selectable regions"
);
assert.match(
  styles,
  /\.pain-body-diagram\s*\{[\s\S]*?\.pain-body-head[\s\S]*?\.pain-body-torso/,
  "the body-location selector should render a clear figure"
);
assert.match(
  source,
  /stage === "location" && !parsedResponse[\s\S]*?painLocationDescription[\s\S]*?acceptPainSafetyResponse\("other"\)/,
  "an unmatched spoken body-area description should be recorded as Other"
);
assert.match(
  source,
  /Recorded during \$\{movement\}, set \$\{answers\.setNumber\}, after \$\{answers\.repsCompleted\} completed repetitions/,
  "the safety interview should record known exercise, set and repetition details without asking again"
);
const restPauseSource = functionSource(
  "beginPainSafetyRestPause",
  "appendPainBodyDiagram"
);
assert.match(
  restPauseSource,
  /secondsRemaining = 5[\s\S]*?setInterval[\s\S]*?renderPainSafetyStage\("rest"\)/,
  "the pain-trend question should follow a short visible rest pause"
);

const outcomeSource = functionSource(
  "renderPainSafetyOutcome",
  "acceptPainSafetyResponse"
);
assert.match(
  outcomeSource,
  /Do not continue exercising[\s\S]*?call local emergency services now/,
  "urgent warning signs should end the exercise and show emergency instructions"
);
assert.match(
  outcomeSource,
  /recommend ending this exercise for today and monitoring how you feel/,
  "improving pain should still end the current exercise for the day"
);
assert.match(
  outcomeSource,
  /Would you like me to prepare this report for your physiotherapist\?[\s\S]*?does not notify them or change your prescribed plan/,
  "a connected patient should be offered a report without implying plan changes or notification"
);
assert.doesNotMatch(
  outcomeSource,
  /continue exercise|resume exercise|activateCameraGuide/,
  "the safety outcome must never offer or trigger continued exercise"
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
  /onError:[\s\S]*?showPainVoiceFallback\(\)[\s\S]*?large on-screen choices/,
  "the manual voice fallback should reappear if hands-free recognition fails"
);

console.log("exercise session control tests passed");

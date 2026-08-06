import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
const markup = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../style.css", import.meta.url), "utf8");
const therapistSource = fs.readFileSync(
  new URL("../therapist.js", import.meta.url),
  "utf8"
);

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
assert.match(
  styles,
  /\.patient-practice-active #practice > \.practice-guide-heading\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1\.56fr\) minmax\(320px, 0\.6fr\);[\s\S]*?\.practice-guide-heading > span:last-child\s*\{[\s\S]*?grid-column: 1;[\s\S]*?justify-self: center;/,
  "the live-guide heading should be centered over the camera column"
);
assert.doesNotMatch(
  markup,
  /patientBackToDashboard|Back to my home/,
  "the exercise workspace should not render a redundant back-to-home control"
);
assert.match(
  styles,
  /\.modal-shell\s*\{[\s\S]*?visibility: hidden;[\s\S]*?pointer-events: none;/,
  "closed full-screen modal shells must not intercept page clicks"
);
assert.match(
  styles,
  /\.modal-shell\.is-open\s*\{[\s\S]*?visibility: visible;[\s\S]*?pointer-events: auto;/,
  "only an open modal shell should accept pointer input"
);
assert.match(
  styles,
  /\.voice-setup-overlay\s*\{[\s\S]*?display: flex;[\s\S]*?align-items: flex-start;[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/,
  "the response-mode dialog should remain vertically scrollable at enlarged text sizes"
);
assert.match(
  styles,
  /\.voice-setup-dialog\s*\{[\s\S]*?flex: 0 0 auto;[\s\S]*?margin: auto 0;[\s\S]*?overflow-wrap: anywhere;/,
  "the response-mode dialog should safely center without clipping oversized content"
);
assert.match(
  styles,
  /\.stage:not\(\.camera-active\) > \.setup-tip\s*\{[\s\S]*?visibility: hidden;[\s\S]*?opacity: 0;/,
  "the live camera tip must not cover setup instructions before the camera starts"
);
assert.match(
  source,
  /voiceSetupOverlay\.classList\.remove\("hidden"\);\s*voiceSetupOverlay\.scrollTop = 0;/,
  "each response-mode choice should open at the start of its scrollable content"
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

const practiceAccessSource = functionSource(
  "syncPracticeAccess",
  "hasLivePracticeAccess"
);
assert.doesNotMatch(
  practiceAccessSource,
  /ensureMovementModels\(\)/,
  "opening an eligible dashboard must not initialize the movement models"
);

const activateGuideSource = functionSource(
  "activateCameraGuide",
  "deactivateCameraGuide"
);
assert.match(
  activateGuideSource,
  /await ensureMovementModels\(\)/,
  "the movement models should load lazily from the explicit camera action"
);
assert.match(
  source,
  /visibilitychange[\s\S]*?document\.hidden[\s\S]*?deactivateCameraGuide/,
  "an active camera guide should pause when its browser tab becomes hidden"
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
  "async function requestHandsFreeMicrophone()"
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
  "non-Safari hands-free mode should request microphone permission while the user is near the device"
);
assert.match(
  voiceChoiceSource,
  /isSafariBrowser\(navigator\.userAgent\)[\s\S]*?await voiceGuidance\.verifyListeningAccess\(\)/,
  "Safari should verify the SpeechRecognition microphone directly so Ask can open its native prompt"
);
assert.doesNotMatch(
  voiceChoiceSource,
  /sessionStorage|hasConfirmedMicrophoneAccess|canReuseConfirmedAccess/,
  "a refresh must perform a real microphone check instead of trusting a stored hint"
);
assert.ok(
  voiceChoiceSource.indexOf("navigator.mediaDevices.getUserMedia")
    < voiceChoiceSource.indexOf("voiceGuidance.unlockNeuralAudio"),
  "the microphone permission request should be issued before unlocking audio output"
);
assert.ok(
  voiceChoiceSource.indexOf("await microphoneRequest")
    < voiceChoiceSource.indexOf("await voiceGuidance.unlockNeuralAudio"),
  "Safari must finish its native microphone decision before audio output is initialized"
);
assert.ok(
  voiceChoiceSource.indexOf("await microphoneRequest")
    < voiceChoiceSource.indexOf("await readMicrophonePermissionState(navigator)"),
  "the browser permission request should start before any awaited permission query"
);
const microphoneFailureBranch = voiceChoiceSource.slice(
  voiceChoiceSource.lastIndexOf("  } catch (error) {")
);
assert.doesNotMatch(
  microphoneFailureBranch,
  /finishVoiceModeChoice\(true\)/,
  "a failed microphone request must never enable hands-free mode"
);
assert.doesNotMatch(
  voiceChoiceSource,
  /if \(!isExplicitDenial && voiceGuidance\.canListen\)/,
  "the Safari fallback must not bypass known denial or hardware failures"
);
assert.match(
  voiceChoiceSource,
  /finishVoiceModeChoice\(true\)/,
  "successful microphone setup should enable hands-free responses"
);
assert.match(
  voiceChoiceSource,
  /permissionStream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)[\s\S]*?prepareSpeechAfterMicrophoneRelease\(\)[\s\S]*?finishVoiceModeChoice\(true\)/,
  "the first spoken prompt should wait for Safari to leave microphone-capture mode"
);
assert.match(
  voiceChoiceSource,
  /describeMicrophoneAccessFailure\(error/,
  "microphone failures should show an accurate browser-specific recovery path"
);
assert.match(
  voiceChoiceSource,
  /voiceSetupRetry\.addEventListener\("click", requestHandsFreeMicrophone\)/,
  "a denied permission should provide a direct user-triggered retry"
);
assert.match(
  source,
  /function resetVoiceModeChoice\(\)[\s\S]*?handsFreeVoiceEnabled = false[\s\S]*?voiceModeChosenThisSession = false[\s\S]*?voiceGuidance\.setEnabled\(false\)/,
  "a new page or account session should clear the previous response-mode choice"
);
assert.match(
  source,
  /addEventListener\("physiovision:auth-role"[\s\S]*?resetVoiceModeChoice\(\)[\s\S]*?if \(painCheckinState\) hidePainCheckin\(\)/,
  "sign-out and subsequent sign-in should close stale check-ins and offer the mode choice again"
);
assert.match(
  source,
  /addEventListener\("pagehide", resetVoiceModeChoice\)[\s\S]*?event\.persisted[\s\S]*?resetVoiceModeChoice\(\)/,
  "Safari page restoration should require a fresh response-mode choice"
);
assert.match(
  source,
  /function showPainCheckin[\s\S]*?if \(!voiceModeChosenThisSession\)[\s\S]*?ensureVoiceModeChosen\(\)[\s\S]*?showPainCheckin\(context/,
  "a pain question must not appear before the response-mode choice"
);

const showPainCheckinSource = functionSource(
  "showPainCheckin",
  "hidePainCheckin"
);
assert.ok(
  showPainCheckinSource.indexOf('painCheckinEl.classList.remove("hidden")')
    < showPainCheckinSource.indexOf("speakPainPrompt("),
  "the pain question should be visible before spoken guidance begins"
);
assert.match(
  showPainCheckinSource,
  /statusEl\.textContent = context === "before"[\s\S]*?Pain check ready/,
  "the status indicator should immediately confirm that the pain check is ready"
);
assert.match(
  showPainCheckinSource,
  /painCheckinEl\.scrollIntoView\(\{ behavior: "auto", block: "start" \}\)/,
  "the pain question should appear without waiting for a scroll animation"
);
assert.doesNotMatch(
  styles,
  /\.pain-checkin\.hands-free-checkin:not\(\.safety-interview-active\)\s*\{\s*display:\s*none/,
  "hands-free mode must not hide the visible pain question while audio starts"
);
assert.match(
  source,
  /function speakPainPrompt[\s\S]*?preferImmediate:\s*true/,
  "pain and safety prompts should bypass network speech latency"
);
assert.match(
  source,
  /function speakPainPrompt[\s\S]*?voiceGroup:\s*PAIN_PROMPT_VOICE_GROUP[\s\S]*?rate:[\s\S]*?pitch:/,
  "the pain question and confirmation should retain one voice and speaking style"
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
const pathwayAccessPosition = calibrationFlowSource.indexOf(
  "hasPathwayAccess()"
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
  pathwayAccessPosition >= 0 &&
    voiceChoicePosition > pathwayAccessPosition &&
    preCheckPosition > voiceChoicePosition &&
    calibrationPosition > preCheckPosition,
  "pathway access, voice choice, and the pain check should be resolved before calibration"
);

const pathwayAccessSource = functionSource(
  "hasPathwayAccess",
  "announceExerciseInstruction"
);
assert.match(
  pathwayAccessSource,
  /practiceDecision\.reason === "active_prescription"/,
  "camera access should use the authenticated practice decision"
);
assert.doesNotMatch(
  pathwayAccessSource,
  /isWellnessEligible|Complete the general wellness safety screen first|profile\.carePath/,
  "camera access must not re-check a stale browser screening profile after admission"
);
assert.doesNotMatch(
  source,
  /wellness safety screen|Complete safety screening|Review screening|screening_required/,
  "the live guide must not contain or display the AI plan's screening gate"
);
assert.match(
  source,
  /const CALIBRATION_TARGET_MOVEMENTS = 1/,
  "personal calibration should require only one comfortable movement"
);
assert.match(
  source,
  /const CALIBRATION_STALL_REMINDER_MS = 5000;[\s\S]*?const CALIBRATION_STALL_REPEAT_MS = 12000;/,
  "a stalled calibration should prompt after a short delay without repeating continuously"
);
const calibrationSpeechSource = functionSource(
  "speakCalibrationGuidance",
  "startHoldTimer"
);
assert.match(
  calibrationSpeechSource,
  /preferImmediate:\s*true[\s\S]*?voiceGroup:\s*CALIBRATION_VOICE_GROUP/,
  "calibration speech should start immediately and keep one consistent voice"
);
const finishCalibrationSource = functionSource(
  "finishCalibrationCapture",
  "resetCalibrationPositionTimer"
);
assert.match(
  finishCalibrationSource,
  /renderCalibrationStep\(\);[\s\S]*?speakCalibrationGuidance\([\s\S]*?Personal movement setup complete\. Review and save your range\./,
  "the visible personal-range result should be followed immediately by its spoken announcement"
);
assert.doesNotMatch(
  finishCalibrationSource,
  /voiceGuidance\.speak/,
  "calibration completion must not use delayed generated speech"
);
assert.match(
  source,
  /inspectCalibrationFrame\([\s\S]*?calibrationVisibilityGuidance\(inspection\)[\s\S]*?presentCalibrationIssue/,
  "calibration should turn missing measurement diagnostics into visible and spoken positioning guidance"
);
assert.match(
  source,
  /I cannot measure either knee angle\.[\s\S]*?both hips, knees, ankles, and feet are visible/,
  "a blocked squat measurement should name the missing knee angles and required landmarks"
);
assert.match(
  source,
  /Choose your pain level in the exercise panel to continue\.[\s\S]*?painCheckinEl\.scrollIntoView[\s\S]*?if \(!handsFreeVoiceEnabled\)[\s\S]*?focus\(\{ preventScroll: true \}\)/,
  "the pain question should be revealed immediately and focused in on-screen mode"
);
assert.doesNotMatch(
  source,
  /sample \$\{[^}]+\} of 3|Comfortable sample \$\{[^}]+\} of 3/,
  "calibration instructions should not ask an elderly patient for three movements"
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
const armListeningSource = functionSource(
  "armVoiceListening",
  "finishVoiceModeChoice"
);
assert.match(
  armListeningSource,
  /callback\(\)/,
  "recognition should start immediately when spoken guidance ends"
);
assert.doesNotMatch(
  armListeningSource,
  /setTimeout/,
  "hands-free answers should not be delayed after a question"
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
  /"urgent-chest"[\s\S]*?"urgent-breathing"[\s\S]*?"urgent-neurologic"/,
  "an unsure combined warning-sign answer should be clarified symptom by symptom"
);
assert.doesNotMatch(
  source,
  /Have you fallen, fainted, or become unable to get up safely\?/,
  "the removed fall follow-up question should not be shown or spoken"
);
assert.match(
  source,
  /stageName === "urgent"[\s\S]*?response === "unsure"[\s\S]*?renderPainSafetyStage\("urgent-chest"\)/,
  "not sure must open clarification instead of immediately showing an urgent outcome"
);
assert.match(
  source,
  /parsePainSafetyResponse\(stage, transcript\)[\s\S]*?if \(parsedResponse\)[\s\S]*?acceptPainSafetyResponse\(parsedResponse\)[\s\S]*?interpretPainSafetyTranscript\(stage, transcript\)/,
  "fixed safety-language rules should run before the constrained AI fallback"
);
assert.match(
  source,
  /interpretSafetyLanguage\(\{[\s\S]*?stage,[\s\S]*?transcript,[\s\S]*?interpretation\?\.matched[\s\S]*?acceptPainSafetyResponse\(interpretation\.response\)/,
  "AI language output should be validated before entering the fixed safety pathway"
);
assert.match(
  source,
  /language_interpretations: answers\.languageInterpretations/,
  "constrained AI language notes should be recorded with the safety check"
);
assert.match(
  source,
  /stageName === "familiarity"[\s\S]*?painCheckinState\.context === "before"[\s\S]*?onsetTiming = "before"[\s\S]*?renderPainSafetyStage\("mobility"\)/,
  "a pre-exercise safety check should skip redundant timing and five-second rest questions"
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
assert.match(
  countdownSource,
  /preferImmediate:\s*true[\s\S]*?voiceGroup:\s*PAIN_PROMPT_VOICE_GROUP/,
  "the post-confirmation handoff should speak immediately in the same voice"
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
  /stage === "location" && transcript\.trim\(\)[\s\S]*?painLocationDescription[\s\S]*?if \(parsedResponse\)[\s\S]*?acceptPainSafetyResponse\(parsedResponse\)[\s\S]*?interpretPainSafetyTranscript\(stage, transcript\)/,
  "an unmatched spoken body-area description should be preserved and interpreted before advancing"
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
  /Do not continue exercising[\s\S]*?call 995 now/,
  "urgent warning signs should end the exercise and show emergency instructions"
);
assert.match(
  outcomeSource,
  /recommend ending this exercise for today and monitoring how you feel/,
  "improving pain should still end the current exercise for the day"
);
assert.match(
  outcomeSource,
  /being saved and flagged for \$\{connection\.name\} to review[\s\S]*?not monitoring this in real time[\s\S]*?will not be changed automatically/,
  "a linked patient should be told that a severe report is flagged without implying real-time monitoring or plan changes"
);
assert.match(
  outcomeSource,
  /not currently linked to a physiotherapist[\s\S]*?Do not continue this programme[\s\S]*?qualified physiotherapist/,
  "a wellness patient should be told to stop and obtain professional advice before restarting"
);
assert.match(
  outcomeSource,
  /call 995 now[\s\S]*?emergency contact[\s\S]*?Do not use an emergency contact instead of 995/,
  "urgent guidance should distinguish emergency help from contact-person support"
);
assert.match(
  outcomeSource,
  /needsProfessionalReview[\s\S]*?persistPainSafetyInterview/,
  "a concerning safety outcome should be saved even if the patient leaves to seek help"
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
  /persistPainSafetyInterview/,
  "finishing the safety interview should retry or complete persistence"
);
assert.doesNotMatch(
  finishSafetySource,
  /activateCameraGuide|continueAfterPainCheckin/,
  "finishing a safety interview must not resume the exercise automatically"
);

assert.match(
  therapistSource,
  /function painSafetyReview\([\s\S]*?safety_follow_up[\s\S]*?requires_review/,
  "the physiotherapist view should identify safety check-ins requiring review"
);
assert.match(
  therapistSource,
  /painSafetyReview\(p\)/,
  "the physiotherapist pain diary should show the recorded safety outcome"
);
assert.match(
  finishSafetySource,
  /does not confirm that they have seen it[\s\S]*?do not wait for a reply/,
  "a therapist report must not imply real-time review or a response"
);

assert.match(
  source,
  /onError:[\s\S]*?showPainVoiceFallback\(\)[\s\S]*?large on-screen choices/,
  "the manual voice fallback should reappear if hands-free recognition fails"
);

console.log("exercise session control tests passed");

import { symmetry, VISIBILITY_THRESHOLD } from "./geometry.js";
import { selectTrackedHand, summarizeHandResult } from "./hand-geometry.js";
import {
  TRACKING_MODES,
  exerciseUsesHand,
  measureCombinedExerciseFrame,
  measureHandExerciseFrame,
  measurePoseExerciseFrame,
} from "./exercise-tracking.js";
import { FeedbackEngine, EXERCISES } from "./feedback/engine.js?v=41";
import { POSES } from "./poses.js";
import {
  calibrationFrameMatchesPhase,
  createCalibration,
  extractCalibrationFrame,
  getCalibration,
  hasSavedProfile,
  loadProfile,
  saveCalibration,
  validateCalibrationCapture,
} from "./personalization.js";
import {
  buildCalibrationSafetyContext,
  evaluateCalibrationReuse,
} from "./calibration-policy.js";
import { postSession, postPainCheckin, postCalibration, isLoggedIn } from "./api.js";
import { DRAFT_EXERCISES } from "./exercises/catalog.js";
import {
  parseConfirmationResponse,
  parsePainLevel,
  parsePainSafetyResponse,
  parseRecoveryStatus,
  voiceGuidance,
} from "./voice-guidance.js";
import { isWellnessEligible } from "./wellness-screening.js";
import {
  PRACTICE_VIEWS,
  resolvePracticeAccess,
} from "./practice-access.js";
import {
  FallMonitor,
  fallMonitoringReadiness,
  parseWellbeingResponse,
} from "./fall-monitoring.js";

let PoseLandmarker;
let HandLandmarker;
let FilesetResolver;
let DrawingUtils;

// ── EMA smoother ─────────────────────────────────────────────────────────────

const EMA_ALPHA = 0.3;

class AngleSmoother {
  constructor(alpha = EMA_ALPHA) {
    this.alpha = alpha;
    this.state = {};
  }

  smooth(name, raw) {
    if (raw.lowConfidence) {
      delete this.state[name];
      return raw;
    }
    // Categorical phase measurements (for example palm direction and hand
    // shape) must pass through unchanged; arithmetic smoothing only applies
    // to finite numeric measurements.
    if (typeof raw.value !== "number" || !Number.isFinite(raw.value)) {
      delete this.state[name];
      return raw;
    }
    const prev = this.state[name];
    const next =
      prev === undefined ? raw.value : prev + this.alpha * (raw.value - prev);
    this.state[name] = next;
    return { value: next, lowConfidence: false, weakPoints: [] };
  }
}

const smoother = new AngleSmoother();

// ── DOM refs ──────────────────────────────────────────────────────────────────

const video       = document.getElementById("webcam");
const canvas      = document.getElementById("overlay");
const ctx         = canvas.getContext("2d");
const synchronizedFrame = document.createElement("canvas");
const synchronizedFrameContext = synchronizedFrame.getContext("2d", {
  alpha: false,
});
const statusEl    = document.getElementById("status");
const toggleBtn   = document.getElementById("toggle");
const finishExerciseBtn = document.getElementById("finishExercise");
const cameraSessionHintEl = document.getElementById("cameraSessionHint");
const fpsEl       = document.getElementById("fps");
const exSelect    = document.getElementById("exerciseSelect");
const sideSelect  = document.getElementById("sideSelect");
const poseStripEl        = document.getElementById("poseStrip");
const repCountEl         = document.getElementById("repCount");
const phaseFlowEl        = document.getElementById("phaseFlow");
const progressEl         = document.getElementById("progressFill");
const progressLbl        = document.getElementById("progressLabel");
const progressSection    = document.getElementById("progressSection");
const holdTimerSection   = document.getElementById("holdTimerSection");
const holdProgressEl     = document.getElementById("holdProgressFill");
const holdInlineEl       = document.getElementById("holdInline");
const holdInlineCountEl  = document.getElementById("holdInlineCountdown");
const cueListEl          = document.getElementById("cueList");
const symWarnEl          = document.getElementById("symWarning");
const trackWarnEl        = document.getElementById("trackingWarning");
const prescEl            = document.getElementById("prescription");
const repTargetEl        = document.getElementById("repTarget");
const repLabelEl         = document.getElementById("repLabel");
const setCompleteBadgeEl = document.getElementById("setCompleteBadge");
const feedbackEl         = document.getElementById("feedbackBanner");
const cameraStage        = document.getElementById("cameraStage");
const personalizationTitle  = document.getElementById("personalizationTitle");
const personalizationDetail = document.getElementById("personalizationDetail");
const exerciseImageWrap     = document.getElementById("exerciseImageWrap");
const exerciseImageEl       = document.getElementById("exerciseImage");

const EXERCISE_IMAGES = {
  "heel-cord-stretch":     "img/exercises/heel-cord-stretch.jpg",
  "standing-quad-stretch": "img/exercises/standing-quad-stretch.jpg",
  "half-squats":               "img/exercises/half-squats.jpg",
  "supine-hamstring-stretch":  "img/exercises/supine-hamstring-stretch.jpg",
  "hamstring-curls":           "img/exercises/standing-quad-stretch.jpg",
  "calf-raises":               "img/exercises/calf-raises.jpg",
  "leg-extensions":            "img/exercises/leg-extensions.jpg",
  "supine-leg-raise":              "img/exercises/supine-leg-raise.jpg",
  "straight-leg-raises-supine":    "img/exercises/straight-leg-raises-supine.jpg",
  "straight-leg-raises-prone":     "img/exercises/straight-leg-raises-prone.jpg",
  "hip-abduction":             "img/exercises/hip-abduction.jpg",
  "leg-presses":               "img/exercises/leg-presses.jpg",
  "hip-adduction":             "img/exercises/hip-adduction.jpg",
  "wrist_extension_stretch":   "img/exercises/wrist_extension_stretch.jpg",
  "wrist_flexion_stretch":     "img/exercises/wrist_flexion_stretch.jpg",
  "ankle_pumps":               "img/exercises/ankle_pumps.jpg",
  "heel_slides":               "img/exercises/heel_slides.jpg",
  "hip_bridge":                "img/exercises/hip_bridge.jpg",
  "forearm_supination_pronation_strengthening": "img/exercises/forearm_supination_pronation_strengthening.jpg",
  "supported_single_leg_balance": "img/exercises/supported_single_leg_balance.jpg",
  "clamshell":                 "img/exercises/clamshell.jpg",
  "supported_forward_step_up": "img/exercises/supported_forward_step_up.jpg",
  "hip_flexor_stretch":        "img/exercises/hip_flexor_stretch.jpg",
  "single_knee_to_chest_stretch": "img/exercises/single_knee_to_chest_stretch.jpg",
  "pendulum":                  "img/exercises/pendulum.jpg",
  "crossover_arm_stretch":     "img/exercises/crossover_arm_stretch.jpg",
  "shoulder_forward_elevation_assisted": "img/exercises/shoulder_forward_elevation_assisted.jpg",
};

function renderExerciseImage(exercise) {
  const src = EXERCISE_IMAGES[exercise.id];
  if (!exerciseImageWrap) return;
  if (src && exerciseImageEl) {
    exerciseImageEl.onload  = () => { exerciseImageWrap.style.display = ""; };
    exerciseImageEl.onerror = () => { exerciseImageWrap.style.display = "none"; };
    exerciseImageEl.alt = exercise.name;
    exerciseImageEl.src = src;
    exerciseImageWrap.style.display = "";
  } else {
    exerciseImageWrap.style.display = "none";
  }
}
const calibrationBadge      = document.getElementById("calibrationBadge");
const calibrationDetail     = document.getElementById("calibrationDetail");
const openCalibrationBtn    = document.getElementById("openCalibration");
const openCalibrationPrimary =
  document.getElementById("openCalibrationPrimary");
const primaryCalibrationLabel =
  document.getElementById("primaryCalibrationLabel");
const primaryCameraInstruction =
  document.getElementById("primaryCameraInstruction");
const cameraSetupStatus =
  document.getElementById("cameraSetupStatus");
const calibrationOverlay    = document.getElementById("calibrationOverlay");
const calibrationStepLabel  = document.getElementById("calibrationStepLabel");
const calibrationTitle      = document.getElementById("calibrationTitle");
const calibrationInstructions = document.getElementById("calibrationInstructions");
const calibrationStatus     = document.getElementById("calibrationStatus");
const calibrationResult     = document.getElementById("calibrationResult");
const calibrationAction     = document.getElementById("calibrationAction");
const calibrationCancel     = document.getElementById("calibrationCancel");
const setupTip              = document.getElementById("setupTip");
const handFrameGuide        = document.getElementById("handFrameGuide");
const handTrackingToggle    = document.getElementById("handTrackingToggle");
const handTrackingReadout   = document.getElementById("handTrackingReadout");
const handModelStatus       = document.getElementById("handModelStatus");
const handGuideText         = handFrameGuide?.querySelector(":scope > span");
const soundToggle           = document.getElementById("soundToggle");
const voiceSetupOverlay     = document.getElementById("voiceSetupOverlay");
const voiceSetupHandsFree   = document.getElementById("voiceSetupHandsFree");
const voiceSetupButtons     = document.getElementById("voiceSetupButtons");
const voiceSetupStatus      = document.getElementById("voiceSetupStatus");
const publicPracticePreview = document.getElementById("publicPracticePreview");
const patientPracticeGate   = document.getElementById("patientPracticeGate");
const patientPracticeGateTitle =
  document.getElementById("patientPracticeGateTitle");
const patientPracticeGateMessage =
  document.getElementById("patientPracticeGateMessage");
const patientPracticeGateAction =
  document.getElementById("patientPracticeGateAction");
const patientPracticeWorkspace =
  document.getElementById("patientPracticeWorkspace");
const clinicianPracticeGate =
  document.getElementById("clinicianPracticeGate");
const fallReadinessEl = document.getElementById("fallReadiness");
const fallReadinessTitleEl = document.getElementById("fallReadinessTitle");
const fallReadinessDetailEl = document.getElementById("fallReadinessDetail");
const fallSafetyOverlay = document.getElementById("fallSafetyOverlay");
const fallSafetyQuestion = document.getElementById("fallSafetyQuestion");
const fallSafetyResult = document.getElementById("fallSafetyResult");
const fallSafetyCountdown = document.getElementById("fallSafetyCountdown");
const fallSafetyOkay = document.getElementById("fallSafetyOkay");
const fallSafetyHelp = document.getElementById("fallSafetyHelp");
const fallSafetyVoice = document.getElementById("fallSafetyVoice");
const fallSafetyVoiceStatus = document.getElementById("fallSafetyVoiceStatus");
const fallSafetyResultTitle = document.getElementById("fallSafetyResultTitle");
const fallSafetyResultMessage = document.getElementById("fallSafetyResultMessage");
const fallSafetyResultIcon = document.getElementById("fallSafetyResultIcon");
const fallSafetyNoAlert = document.getElementById("fallSafetyNoAlert");
const fallSafetyClose = document.getElementById("fallSafetyClose");

// Keep the full-screen wellbeing dialog outside the camera grid so ancestor
// overflow rules cannot crop its viewport-sized accessible controls.
document.body.appendChild(fallSafetyOverlay);

let profile = loadProfile();
let poseLandmarker = null;
let handLandmarker = null;
let sessionStartedAt = null;
let exerciseSessionActive = false;
let activePrescriptions = loadActivePrescriptions();
const initialAuthState = window.physioVisionAuthState ?? null;
let authenticatedRole = initialAuthState?.role ?? null;
let authenticatedPatientProfile =
  authenticatedRole === "patient"
    ? initialAuthState?.user?.profile ?? null
    : null;
let prescriptionsLoaded =
  authenticatedRole !== "patient" ||
  window.sessionStorage.getItem("physiovision.prescriptions.v1") !== null;
let practiceDecision = resolvePracticeAccess({
  loggedIn: isLoggedIn(),
});
let movementModelsPromise = null;
const fallMonitor = new FallMonitor();
let safetyCheckActive = false;
let fallSafetyTimer = null;
let fallSafetySecondsRemaining = 30;
let fallSafetyPreviousFocus = null;
let activeFallEvent = null;
let handsFreeVoiceEnabled = false;
let voiceModeChosenThisSession = false;
let voiceModeChoicePromise = null;
let resolveVoiceModeChoice = null;
let preExerciseCheckinCompleted = false;
let confirmedPreExercisePain = null;
const exerciseContent = new Map(
  DRAFT_EXERCISES.map((exercise) => [exercise.id, exercise])
);

voiceGuidance.attachToggle(soundToggle);

function finishVoiceModeChoice(handsFree) {
  handsFreeVoiceEnabled = Boolean(handsFree);
  voiceModeChosenThisSession = true;
  voiceGuidance.setEnabled(handsFreeVoiceEnabled);
  voiceSetupOverlay.classList.add("hidden");
  voiceSetupHandsFree.disabled = false;
  voiceSetupButtons.disabled = false;
  voiceSetupStatus.textContent = "";
  const resolve = resolveVoiceModeChoice;
  resolveVoiceModeChoice = null;
  voiceModeChoicePromise = null;
  resolve?.(true);
}

function ensureVoiceModeChosen() {
  if (voiceModeChosenThisSession) return Promise.resolve(true);
  if (voiceModeChoicePromise) return voiceModeChoicePromise;

  voiceSetupOverlay.classList.remove("hidden");
  voiceSetupHandsFree.disabled =
    !voiceGuidance.canSpeak || !voiceGuidance.canListen;
  voiceSetupStatus.textContent = voiceSetupHandsFree.disabled
    ? (
      "Hands-free voice is unavailable in this browser. "
      + "Choose on-screen buttons to continue."
    )
    : (
      "Choose once before setup. No AI speech or microphone listening "
      + "starts until you select an option."
    );
  (voiceSetupHandsFree.disabled
    ? voiceSetupButtons
    : voiceSetupHandsFree
  ).focus({ preventScroll: true });

  voiceModeChoicePromise = new Promise((resolve) => {
    resolveVoiceModeChoice = resolve;
  });
  return voiceModeChoicePromise;
}

voiceSetupHandsFree.addEventListener("click", async () => {
  if (!voiceGuidance.canSpeak || !voiceGuidance.canListen) return;

  voiceSetupHandsFree.disabled = true;
  voiceSetupButtons.disabled = true;
  voiceSetupStatus.textContent = "Checking microphone permission…";

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is unavailable in this browser.");
    }
    const permissionStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    permissionStream.getTracks().forEach((track) => track.stop());
    finishVoiceModeChoice(true);
  } catch (_) {
    voiceSetupHandsFree.disabled = false;
    voiceSetupButtons.disabled = false;
    voiceSetupStatus.textContent =
      "Microphone access was not allowed. Allow it and try again, "
      + "or choose on-screen buttons.";
    voiceSetupButtons.focus({ preventScroll: true });
  }
});

voiceSetupButtons.addEventListener("click", () => {
  finishVoiceModeChoice(false);
});

soundToggle?.addEventListener("click", () => {
  if (!voiceGuidance.enabled) {
    handsFreeVoiceEnabled = false;
    if (painCheckinState) updatePainCheckinPresentation();
  }
});

function loadActivePrescriptions() {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem("physiovision.prescriptions.v1") ?? "[]"
    );
    const today = new Date().toISOString().slice(0, 10);
    return new Map(
      (Array.isArray(stored) ? stored : [])
        .filter((prescription) => (
          prescription.is_active &&
          prescription.valid_from <= today &&
          (!prescription.valid_until || prescription.valid_until >= today)
        ))
        .map((prescription) => [prescription.exercise, prescription])
    );
  } catch (_) {
    return new Map();
  }
}

function renderFallReadiness(exercise = engine?.exercise) {
  const readiness = fallMonitoringReadiness(exercise);
  fallReadinessEl.dataset.state = readiness.state;
  fallReadinessTitleEl.textContent = readiness.title;
  fallReadinessDetailEl.textContent = readiness.detail;
  const icon = fallReadinessEl.querySelector(".fall-readiness-icon");
  if (icon) {
    icon.textContent = readiness.state === "ready"
      ? "✓"
      : readiness.state === "limited"
        ? "!"
        : "—";
  }
}

function configureFallMonitoring(exercise = engine?.exercise) {
  fallMonitor.configure(exercise);
  renderFallReadiness(exercise);
}

function recordLocalSafetyIncident(response, event = {}) {
  const storageKey = "physiovision.local-safety-incidents.v1";
  try {
    const previous = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]");
    const incidents = Array.isArray(previous) ? previous : [];
    incidents.push({
      recordedAt: new Date().toISOString(),
      exerciseId: engine?.exercise?.id ?? null,
      monitoringMode: event.mode ?? fallMonitor.mode,
      response,
      signals: Array.isArray(event.signals) ? event.signals : [],
    });
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify(incidents.slice(-20))
    );
  } catch (_) {
    // A private-browsing storage failure must not block the on-screen check.
  }
}

function clearFallSafetyTimer() {
  window.clearInterval(fallSafetyTimer);
  fallSafetyTimer = null;
}

function showFallSafetyResult(response, event = {}) {
  clearFallSafetyTimer();
  recordLocalSafetyIncident(response, event);
  deactivateCameraGuide({
    statusMessage: "Exercise stopped for a safety check",
  });

  fallSafetyQuestion.classList.add("hidden");
  fallSafetyResult.classList.remove("hidden");
  fallSafetyResult.classList.toggle(
    "fall-safety-result-safe",
    response === "okay"
  );
  fallSafetyNoAlert.classList.toggle("hidden", response === "okay");

  if (response === "okay") {
    fallSafetyResultIcon.textContent = "✓";
    fallSafetyResultTitle.textContent = "Thank you. The exercise has stopped.";
    fallSafetyResultMessage.textContent =
      "The possible fall was marked as a false alarm. Take a moment before deciding whether to exercise again.";
  } else if (response === "help") {
    fallSafetyResultIcon.textContent = "!";
    fallSafetyResultTitle.textContent = "You said that you need help.";
    fallSafetyResultMessage.textContent =
      "Stay where you are if moving may be unsafe. Use your phone or call out to someone nearby.";
  } else {
    fallSafetyResultIcon.textContent = "!";
    fallSafetyResultTitle.textContent = "We did not receive a response.";
    fallSafetyResultMessage.textContent =
      "The exercise and camera have stopped. Use your phone or call out to someone nearby if you need help.";
  }

  voiceGuidance.speak(
    `${fallSafetyResultTitle.textContent} ${fallSafetyResultMessage.textContent}` +
      (response === "okay"
        ? ""
        : " No emergency alert was sent because emergency contacts are not configured in this version."),
    {
      key: `fall-safety-result:${response}`,
      interrupt: true,
    }
  );
  fallSafetyClose.focus({ preventScroll: true });
}

function startFallSafetyVoiceListening() {
  if (!safetyCheckActive || fallSafetyQuestion.classList.contains("hidden")) {
    return false;
  }
  return voiceGuidance.listen({
    onStatus: (status) => {
      fallSafetyVoiceStatus.textContent = status;
    },
    onError: (message) => {
      fallSafetyVoiceStatus.textContent =
        `${message} You can also use one of the two large buttons.`;
    },
    onResult: (transcript) => {
      const response = parseWellbeingResponse(transcript);
      fallSafetyVoiceStatus.textContent = `I heard: “${transcript}”`;
      if (response) {
        showFallSafetyResult(response, activeFallEvent ?? {});
      } else {
        fallSafetyVoiceStatus.textContent =
          `I heard: “${transcript}”. Please say “I’m okay” or “I need help”, or use a large button.`;
      }
    },
  });
}

function beginFallSafetyCheck(event) {
  if (safetyCheckActive) return;
  safetyCheckActive = true;
  activeFallEvent = event;
  fallSafetyPreviousFocus = document.activeElement;
  clearHoldTimer(activeDose(engine.exercise).holdSeconds);
  resetSpokenCoaching();
  voiceGuidance.cancel();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  fallSafetyQuestion.classList.remove("hidden");
  fallSafetyResult.classList.add("hidden");
  fallSafetyResult.classList.remove("fall-safety-result-safe");
  fallSafetyNoAlert.classList.add("hidden");
  fallSafetyVoiceStatus.textContent = handsFreeVoiceEnabled
    ? "Hands-free voice is on. Listening will start after the question."
    : voiceGuidance.canListen
      ? "Use a large button, or choose Answer by voice as a fallback."
    : "Voice input is unavailable in this browser. Use a large button.";
  fallSafetyVoice.disabled = !voiceGuidance.canListen;
  fallSafetySecondsRemaining = 30;
  fallSafetyCountdown.textContent = String(fallSafetySecondsRemaining);
  fallSafetyOverlay.classList.remove("hidden");
  document.body.classList.add("fall-safety-open");
  fallSafetyOkay.focus({ preventScroll: true });

  const spoken = voiceGuidance.speak(
    "We noticed a possible fall and stopped the exercise. Are you okay? Select I’m okay or I need help.",
    {
      key: "possible-fall-check",
      interrupt: true,
      onEnd: () => {
        if (handsFreeVoiceEnabled && safetyCheckActive) {
          startFallSafetyVoiceListening();
        }
      },
    }
  );
  if (!spoken && handsFreeVoiceEnabled) {
    window.setTimeout(() => {
      if (safetyCheckActive) startFallSafetyVoiceListening();
    }, 200);
  }

  clearFallSafetyTimer();
  fallSafetyTimer = window.setInterval(() => {
    fallSafetySecondsRemaining -= 1;
    fallSafetyCountdown.textContent = String(
      Math.max(fallSafetySecondsRemaining, 0)
    );
    if (fallSafetySecondsRemaining === 10) {
      voiceGuidance.speak("Ten seconds left to answer.", {
        key: "possible-fall-countdown-10",
      });
    } else if (fallSafetySecondsRemaining === 5) {
      voiceGuidance.speak("Five seconds left to answer.", {
        key: "possible-fall-countdown-5",
      });
    } else if (fallSafetySecondsRemaining <= 0) {
      showFallSafetyResult("no_response", event);
    }
  }, 1000);
}

function closeFallSafetyCheck() {
  clearFallSafetyTimer();
  voiceGuidance.cancel();
  safetyCheckActive = false;
  fallMonitor.resumeAfterCheck();
  fallSafetyOverlay.classList.add("hidden");
  document.body.classList.remove("fall-safety-open");
  const homeButton = document.querySelector("[data-patient-dashboard]");
  if (homeButton instanceof HTMLElement) {
    homeButton.click();
  } else if (fallSafetyPreviousFocus instanceof HTMLElement) {
    fallSafetyPreviousFocus.focus({ preventScroll: true });
  }
  fallSafetyPreviousFocus = null;
  activeFallEvent = null;
}

function processFallMonitoring(landmarks, timestampMs) {
  if (safetyCheckActive || calibrationSession || handPreviewMode) return null;
  const event = fallMonitor.update({ landmarks, timestampMs });
  if (event.type === "candidate") {
    statusEl.textContent = "Checking an unexpected movement…";
  } else if (event.type === "possible_fall" && !event.repeated) {
    beginFallSafetyCheck(event);
  }
  return event;
}

const PRACTICE_GATE_COPY = Object.freeze({
  checking_account: {
    title: "Checking your account…",
    message: "We’re confirming your role and exercise pathway.",
  },
  checking_patient_profile: {
    title: "Checking your patient profile…",
    message: "Your live guide will open when your profile is available.",
  },
  loading_prescriptions: {
    title: "Loading your prescribed movements…",
    message: "Only exercises in your current clinician plan will be available.",
  },
  screening_required: {
    title: "Complete the wellness safety screen first.",
    message:
      "Confirm that you are seeking general wellness exercise and do not have clinician restrictions or concerning symptoms.",
    actionLabel: "Complete safety screening",
  },
  professional_review: {
    title: "Professional review is recommended.",
    message:
      "Your screening did not unlock self-guided wellness exercise. Review your answers or connect with a qualified professional.",
    actionLabel: "Review screening",
  },
  awaiting_prescription: {
    title: "Your clinician-guided programme is not ready yet.",
    message:
      "You are linked for rehabilitation, but the live guide will remain locked until an active exercise prescription is assigned.",
    actionLabel: "View clinician connection",
  },
});

function ensureMovementModels() {
  if (poseLandmarker) return Promise.resolve();
  if (movementModelsPromise) return movementModelsPromise;

  statusEl.textContent = "Preparing movement guide…";
  movementModelsPromise = createLandmarker().catch((error) => {
    movementModelsPromise = null;
    statusEl.textContent = "Movement model unavailable — check your connection";
    console.error("Movement model initialization failed", error);
  });
  return movementModelsPromise;
}

function syncPracticeAccess() {
  practiceDecision = resolvePracticeAccess({
    loggedIn: isLoggedIn(),
    role: authenticatedRole,
    patientProfile: authenticatedPatientProfile,
    activePrescriptionCount: activePrescriptions.size,
    prescriptionsLoaded,
  });

  const showPublic = practiceDecision.view === PRACTICE_VIEWS.PUBLIC;
  const showPatient =
    practiceDecision.view === PRACTICE_VIEWS.PATIENT_WORKSPACE;
  const showClinician = practiceDecision.view === PRACTICE_VIEWS.CLINICIAN;
  const showPatientGate =
    practiceDecision.view === PRACTICE_VIEWS.PATIENT_GATE ||
    practiceDecision.view === PRACTICE_VIEWS.LOADING;

  publicPracticePreview?.classList.toggle("hidden", !showPublic);
  patientPracticeWorkspace?.classList.toggle("hidden", !showPatient);
  clinicianPracticeGate?.classList.toggle("hidden", !showClinician);
  patientPracticeGate?.classList.toggle("hidden", !showPatientGate);

  exSelect.disabled = !showPatient;
  sideSelect.disabled = !showPatient;
  if (!showPatient) {
    toggleBtn.disabled = true;
    openCalibrationBtn.disabled = true;
    handTrackingToggle.disabled = true;
  }

  if (showPatientGate) {
    const copy =
      PRACTICE_GATE_COPY[practiceDecision.reason] ??
      PRACTICE_GATE_COPY.checking_account;
    patientPracticeGateTitle.textContent = copy.title;
    patientPracticeGateMessage.textContent = copy.message;
    patientPracticeGateAction.classList.toggle(
      "hidden",
      !copy.actionLabel || !practiceDecision.action
    );
    if (copy.actionLabel && practiceDecision.action) {
      patientPracticeGateAction.innerHTML =
        `${copy.actionLabel} <span aria-hidden="true">→</span>`;
      patientPracticeGateAction.dataset.open = practiceDecision.action;
    }
  }

  if (showPatient) {
    refreshExerciseAccess();
    ensureMovementModels();
  } else {
    if (running) deactivateCameraGuide();
    discardExerciseSession();
    hidePainCheckin();
  }
}

function hasLivePracticeAccess() {
  if (
    !isLoggedIn() ||
    authenticatedRole !== "patient" ||
    practiceDecision.view !== PRACTICE_VIEWS.PATIENT_WORKSPACE
  ) {
    statusEl.textContent = !isLoggedIn()
      ? "Sign in with a patient account to use the camera guide"
      : "The camera guide is not available for this account or pathway";
    return false;
  }
  return true;
}

// Hold-based exercises (stretches, balance holds) are measured in seconds held,
// not repetitions. Rep-based exercises count repetitions. Both cap at their goal.
function isHoldExercise(exercise) {
  return exercise?.category === "stretch" || exercise?.category === "balance";
}

function goalMetric(exercise = engine?.exercise) {
  const dose = activeDose(exercise);
  const reps = Number(dose.reps);
  const hold = dose.holdSeconds ?? exercise?.trackingHoldSeconds ?? 0;
  const isHold = isHoldExercise(exercise);
  const hasReps = Number.isFinite(reps) && reps > 0;
  if (isHold && hold > 0) {
    return { isHold: true, unit: "sec held", perHold: hold, goal: hasReps ? reps * hold : null };
  }
  return { isHold: false, unit: "reps", perHold: 0, goal: hasReps ? reps : null };
}

function activeDose(exercise = engine?.exercise) {
  if (profile.carePath !== "clinician") return exercise?.prescription ?? {};
  const prescription = activePrescriptions.get(exercise?.id);
  if (!prescription) return {};
  return {
    id: prescription.id,
    sets: prescription.sets,
    reps: prescription.reps,
    holdSeconds: prescription.hold_seconds ?? 0,
    daysPerWeek: prescription.days_per_week,
    notes: prescription.notes,
    clinicianName: prescription.clinician_name,
    updatedAt: prescription.updated_at ?? prescription.updatedAt ?? null,
  };
}

// Accumulated per-session stats (reset on each camera start)
const sessionCueCounts = {};
let sessionSymmetryWarnings = 0;
const sessionAngleStats = {}; // {angleName: {min, max, sum, count}}
let spokenCoachingCandidate = null;
let spokenRepCount = 0;
let completedSetCount = 0;
let completedSessionReps = 0;
let pendingSetStartCheck = null;
let sessionAllSetsComplete = false;
let lastFeedbackResult = null;

function exerciseSpokenInstruction(exercise) {
  const reviewedContent = exerciseContent.get(exercise.id);
  if (reviewedContent?.instruction) {
    return `${exercise.name}. ${reviewedContent.instruction}`;
  }

  const phases = (exercise.stages ?? [])
    .map((stage) => stage.replaceAll("_", " "))
    .join(", then ");
  return [
    `${exercise.name}.`,
    phases ? `Move slowly through ${phases}.` : "",
    exercise.trackingWarning ?? cameraSetupTip(exercise),
  ].filter(Boolean).join(" ");
}

function resetSpokenCoaching() {
  spokenCoachingCandidate = null;
  spokenRepCount = 0;
}

function queueSpokenMovementCue(state, cue, timestampMs) {
  if (!running || calibrationSession || !cue) {
    spokenCoachingCandidate = null;
    return;
  }
  if (!["adjust", "tracking", "position"].includes(state)) {
    spokenCoachingCandidate = null;
    return;
  }

  const identity = `${state}:${cue}`;
  if (spokenCoachingCandidate?.identity !== identity) {
    spokenCoachingCandidate = {
      identity,
      firstSeenAt: timestampMs,
      lastRequestedAt: -Infinity,
    };
    return;
  }

  const stableForMs = state === "adjust" ? 800 : 1400;
  const repeatAfterMs = state === "adjust" ? 8000 : 10000;
  if (
    timestampMs - spokenCoachingCandidate.firstSeenAt < stableForMs ||
    timestampMs - spokenCoachingCandidate.lastRequestedAt < repeatAfterMs
  ) {
    return;
  }

  spokenCoachingCandidate.lastRequestedAt = timestampMs;
  voiceGuidance.speak(cue, {
    key: `movement:${engine.exercise.id}:${identity}`,
    cooldownMs: repeatAfterMs,
  });
}

// ── Hold timer state ──────────────────────────────────────────────────────────
let holdInterval  = null;
let holdRemaining = 0;
let holdTotal     = 0;

// ── Personal calibration state ───────────────────────────────────────────────
const CALIBRATION_CAPTURE_MS = 1200;
const CALIBRATION_POSITION_STABLE_MS = 500;
const CALIBRATION_RETURN_STABLE_MS = 350;
const SESSION_POSITION_CAPTURE_MS = 1700;
const SET_POSITION_STABLE_MS = 750;
let calibrationSession = null;
let calibrationDraft = null;

function startHoldTimer(seconds) {
  if (holdInterval) return; // already running
  holdTotal     = seconds;
  holdRemaining = seconds;
  holdInlineEl.classList.add("active");
  holdInlineCountEl.textContent = holdRemaining;
  holdProgressEl.style.width    = "0%";

  holdInterval = setInterval(() => {
    holdRemaining--;
    holdInlineCountEl.textContent = holdRemaining;
    holdProgressEl.style.width    = `${((holdTotal - holdRemaining) / holdTotal) * 100}%`;
    if (holdRemaining <= 0) {
      clearHoldTimer();
      engine.completeHold();
    }
  }, 1000);
}

function clearHoldTimer(resetSeconds) {
  clearInterval(holdInterval);
  holdInterval  = null;
  holdRemaining = 0;
  holdInlineEl.classList.remove("active");
  if (Number.isFinite(resetSeconds)) {
    holdTotal = resetSeconds;
    holdInlineCountEl.textContent = resetSeconds;
    holdProgressEl.style.width = "0%";
  }
}

// ── Exercise selector ─────────────────────────────────────────────────────────

EXERCISES.forEach((ex) => {
  const opt = document.createElement("option");
  opt.value = ex.id;
  opt.textContent = ex.comingSoon
    ? `${ex.name} · coming soon`
    : ex.requiresClinicianPlan
      ? `${ex.name} · clinician plan`
      : ex.name;
  if (ex.comingSoon) opt.disabled = true;
  exSelect.appendChild(opt);
});

function refreshExerciseAccess() {
  EXERCISES.forEach((exercise) => {
    const option = [...exSelect.options].find((item) => item.value === exercise.id);
    if (!option) return;
    if (profile.carePath === "clinician") {
      option.disabled = !activePrescriptions.has(exercise.id);
    } else if (profile.carePath === "needs_review") {
      option.disabled = true;
    } else {
      option.disabled = Boolean(exercise.comingSoon || exercise.requiresClinicianPlan);
    }
  });
}

function firstAccessibleExercise() {
  return EXERCISES.find((exercise) => {
    const option = [...exSelect.options].find(
      (candidate) => candidate.value === exercise.id
    );
    return option && !option.disabled;
  });
}

refreshExerciseAccess();

sideSelect.value = profile.focusSide;
const initialExercise = firstAccessibleExercise() ?? EXERCISES[0];
exSelect.value = initialExercise.id;
let engine = new FeedbackEngine(
  initialExercise.id,
  profile.focusSide,
  getCalibration(initialExercise.id, profile.focusSide)
);
renderPrescription(engine.exercise);
renderTrackingWarning(engine.exercise);
renderPoseStrip(engine.exercise, engine.stages[0]);
renderStaticPhaseFlow(engine);
renderPersonalization();
renderExerciseImage(engine.exercise);
configureFallMonitoring(engine.exercise);

exSelect.addEventListener("change", () => {
  if (running) {
    deactivateCameraGuide({
      statusMessage: "Camera paused because the exercise changed",
    });
  }
  preExerciseCheckinCompleted = false;
  confirmedPreExercisePain = null;
  clearRecordedPain();
  discardExerciseSession();
  cancelCalibration();
  engine.changeExercise(
    exSelect.value,
    sideSelect.value,
    getCalibration(exSelect.value, sideSelect.value)
  );
  smoother.state = {};
  combinedPoseHistory = [];
  clearHoldTimer(activeDose(engine.exercise).holdSeconds);
  holdTimerSection.classList.add("hidden");
  progressSection.classList.remove("hidden");
  renderPrescription(engine.exercise);
  renderTrackingWarning(engine.exercise);
  renderPoseStrip(engine.exercise, engine.stages[0]);
  renderStaticPhaseFlow(engine);
  renderExerciseImage(engine.exercise);
  repCountEl.textContent = "0";
  resetSpokenCoaching();
  cueListEl.innerHTML = "";
  symWarnEl.classList.add("hidden");
  progressEl.style.width = "0%";
  progressLbl.textContent = "Position yourself to start";
  setFeedbackBanner("ready");
  renderPersonalization();
  configureFallMonitoring(engine.exercise);
});

sideSelect.addEventListener("change", () => {
  if (running) {
    deactivateCameraGuide({
      statusMessage: "Camera paused because the focus side changed",
    });
  }
  preExerciseCheckinCompleted = false;
  confirmedPreExercisePain = null;
  clearRecordedPain();
  discardExerciseSession();
  cancelCalibration();
  engine.changeExercise(
    exSelect.value,
    sideSelect.value,
    getCalibration(exSelect.value, sideSelect.value)
  );
  smoother.state = {};
  combinedPoseHistory = [];
  repCountEl.textContent = "0";
  resetSpokenCoaching();
  progressEl.style.width = "0%";
  setFeedbackBanner("ready");
  renderPersonalization();
  configureFallMonitoring(engine.exercise);
});

window.addEventListener("physiovision:profile-updated", (event) => {
  cancelCalibration();
  preExerciseCheckinCompleted = false;
  confirmedPreExercisePain = null;
  clearRecordedPain();
  profile = event.detail;
  if (authenticatedRole === "patient") {
    authenticatedPatientProfile = event.detail;
  }
  refreshExerciseAccess();
  syncPracticeAccess();
  if (exSelect.selectedOptions[0]?.disabled) {
    const accessible = firstAccessibleExercise();
    if (accessible) {
      exSelect.value = accessible.id;
      exSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return;
  }
  sideSelect.value = profile.focusSide;
  engine.changeExercise(
    exSelect.value,
    sideSelect.value,
    getCalibration(exSelect.value, sideSelect.value)
  );
  smoother.state = {};
  repCountEl.textContent = "0";
  resetSpokenCoaching();
  progressEl.style.width = "0%";
  setFeedbackBanner("ready");
  renderPersonalization();
  configureFallMonitoring(engine.exercise);
});

window.addEventListener("physiovision:practice-requested", (event) => {
  const requestedRole = event.detail?.role ?? null;
  const requestedProfile = event.detail?.profile ?? null;

  if (requestedRole) {
    authenticatedRole = requestedRole;
  }

  if (requestedRole === "patient" && requestedProfile) {
    profile = { ...profile, ...requestedProfile };
    authenticatedPatientProfile = profile;
  }

  syncPracticeAccess();
});

window.addEventListener("physiovision:prescriptions-updated", (event) => {
  preExerciseCheckinCompleted = false;
  confirmedPreExercisePain = null;
  clearRecordedPain();
  const prescriptions = Array.isArray(event.detail) ? event.detail : [];
  window.sessionStorage.setItem(
    "physiovision.prescriptions.v1",
    JSON.stringify(prescriptions)
  );
  activePrescriptions = loadActivePrescriptions();
  prescriptionsLoaded = true;
  refreshExerciseAccess();
  syncPracticeAccess();

  const selectedOption = exSelect.selectedOptions[0];
  const accessible = firstAccessibleExercise();
  if ((!selectedOption || selectedOption.disabled) && accessible) {
    exSelect.value = accessible.id;
    exSelect.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    renderPrescription(engine.exercise);
  }
});

window.addEventListener("physiovision:auth-role", (event) => {
  authenticatedRole = event.detail?.role ?? null;
  authenticatedPatientProfile =
    authenticatedRole === "patient"
      ? event.detail?.user?.profile ?? null
      : null;
  prescriptionsLoaded =
    authenticatedRole !== "patient" ||
    window.sessionStorage.getItem("physiovision.prescriptions.v1") !== null;
  syncPracticeAccess();
});

// ── MediaPipe setup ───────────────────────────────────────────────────────────

async function createLandmarker() {
  const visionTasks = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14"
  );
  ({
    PoseLandmarker,
    HandLandmarker,
    FilesetResolver,
    DrawingUtils,
  } = visionTasks);
  drawingUtils = new DrawingUtils(ctx);

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  const poseOptions = {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      ...poseOptions,
      baseOptions: { ...poseOptions.baseOptions, delegate: "GPU" },
    });
  } catch (gpuError) {
    console.info("GPU pose tracking unavailable; using CPU", gpuError);
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, poseOptions);
  }

  try {
    const handOptions = {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    };
    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        ...handOptions,
        baseOptions: { ...handOptions.baseOptions, delegate: "GPU" },
      });
    } catch (gpuError) {
      console.info("GPU hand tracking unavailable; using CPU", gpuError);
      handLandmarker = await HandLandmarker.createFromOptions(vision, handOptions);
    }
    handModelStatus.textContent = "Ready";
    handModelStatus.classList.add("is-ready");
    handTrackingToggle.disabled = false;
  } catch (error) {
    console.warn("Hand Landmarker could not be loaded", error);
    handModelStatus.textContent = "Unavailable";
    handModelStatus.classList.add("is-error");
  }

  statusEl.textContent = "Movement guide ready";
  toggleBtn.disabled = false;
  renderPersonalization();
}

// ── Camera ────────────────────────────────────────────────────────────────────

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      // "none" requests raw sensor output — prevents OS-level crop/pan (Center Stage)
      resizeMode: "none",
    },
    audio: false,
  });

  // Try to lock zoom to minimum so Center Stage auto-zoom can't fire
  const track = stream.getVideoTracks()[0];
  const capabilities = track.getCapabilities?.() ?? {};
  if (capabilities.zoom) {
    try {
      await track.applyConstraints({
        advanced: [{ zoom: capabilities.zoom.min }],
      });
    } catch (_) {
      // Device doesn't support zoom constraint — silently ignore
    }
  }

  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

function stopCamera() {
  video.srcObject?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

function captureSynchronizedFrame() {
  if (
    synchronizedFrame.width !== video.videoWidth
    || synchronizedFrame.height !== video.videoHeight
  ) {
    synchronizedFrame.width = video.videoWidth;
    synchronizedFrame.height = video.videoHeight;
  }
  synchronizedFrameContext.drawImage(
    video,
    0,
    0,
    synchronizedFrame.width,
    synchronizedFrame.height
  );
  return synchronizedFrame;
}

// ── Render loop ───────────────────────────────────────────────────────────────

let drawingUtils;
let running = false;
let rafId;
let lastVideoTime = -1;
let lastFrameStamp = performance.now();
let handPreviewMode = false;
let combinedPoseHistory = [];

function handMetric(name) {
  return handTrackingReadout?.querySelector(`[data-hand-metric="${name}"]`);
}

function formatFlexion(joints, names) {
  if (!joints) return "—";
  return names
    .map((name) => {
      const measurement = joints[name];
      return measurement
        && !measurement.lowConfidence
        && Number.isFinite(measurement.value)
        ? `${Math.round(measurement.value)}°`
        : "—";
    })
    .join(" / ");
}

function resetHandReadout() {
  handTrackingReadout?.querySelectorAll("[data-hand-metric]")
    .forEach((element) => { element.textContent = "—"; });
}

function drawHandResult(result) {
  (result?.landmarks ?? []).forEach((landmarks) => {
    drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
      color: "#dff2e6",
      lineWidth: 3,
    });
    drawingUtils.drawLandmarks(landmarks, {
      color: "#76d89b",
      fillColor: "#173f40",
      radius: 4,
    });
  });
}

function drawPoseResult(result) {
  const landmarks = result?.landmarks?.[0];
  if (!landmarks) return;
  drawingUtils.drawLandmarks(landmarks, {
    radius: 4,
    color: (data) =>
      (data?.from?.visibility ?? 1) < VISIBILITY_THRESHOLD
        ? "#f3d77d"
        : "#76d89b",
  });
  drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
    color: "#dff2e6",
    lineWidth: 3,
  });
}

function rememberCombinedPose(result, timestampMs) {
  const landmarks = result?.landmarks?.[0];
  if (!landmarks) {
    combinedPoseHistory = [];
    return;
  }
  combinedPoseHistory.push({ timestampMs, landmarks });
  combinedPoseHistory = combinedPoseHistory.filter(
    // Long enough for an ankle circle, pendulum swing, gait step, or mobility
    // aid movement while still discarding stale motion from an earlier rep.
    (frame) => timestampMs - frame.timestampMs <= 2500
  );
}

function renderHandPreview(result) {
  drawHandResult(result);

  const hands = summarizeHandResult(result, {
    width: video.videoWidth,
    height: video.videoHeight,
  });
  const hand = selectTrackedHand(hands, profile.focusSide);
  if (!hand) {
    resetHandReadout();
    statusEl.textContent = "Show one complete hand to the camera";
    setFeedbackBanner("position", "Place one open hand inside the close-up guide");
    return;
  }

  const score = hand.handedness.score;
  handMetric("handedness").textContent = score === null
    ? hand.handedness.label
    : `${hand.handedness.label} · ${Math.round(score * 100)}%`;
  handMetric("coverage").textContent = Number.isFinite(hand.framing.pixelSpan)
    ? `${Math.round(hand.framing.normalizedSpan * 100)}% · ${Math.round(hand.framing.pixelSpan)} px`
    : `${Math.round(hand.framing.normalizedSpan * 100)}%`;

  if (hand.framing.ready) {
    const palmDirection = hand.palm?.value?.direction?.replaceAll("_", " ") ?? "—";
    handMetric("palm").textContent = palmDirection;
    handMetric("thumb").textContent = formatFlexion(
      hand.fingerFlexion?.value?.thumb,
      ["cmc", "mcp", "ip"]
    );
    for (const finger of ["index", "middle", "ring", "pinky"]) {
      handMetric(finger).textContent = formatFlexion(
        hand.fingerFlexion?.value?.[finger],
        ["mcp", "pip", "dip"]
      );
    }
    statusEl.textContent = "Hand landmarks are clear";
    setFeedbackBanner("hand-ready");
  } else {
    handMetric("palm").textContent = "Waiting for clear framing";
    ["thumb", "index", "middle", "ring", "pinky"].forEach((finger) => {
      handMetric(finger).textContent = "—";
    });
    const needsCentre = hand.framing.reason === "move_to_centre";
    statusEl.textContent = needsCentre
      ? "Move your whole hand toward the centre"
      : "Move your hand closer to the camera";
    setFeedbackBanner(
      "position",
      needsCentre
        ? "Keep the wrist and every fingertip inside the guide"
        : "Move closer until your hand fills more of the guide"
    );
  }
}

function renderFrame() {
  if (!running) return;
  if (safetyCheckActive) {
    rafId = requestAnimationFrame(renderFrame);
    return;
  }

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const frameTimestamp = performance.now();

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (handPreviewMode) {
      const result = handLandmarker.detectForVideo(video, frameTimestamp);
      renderHandPreview(result);
    } else {
      const trackingMode = engine.exercise.trackingMode ?? TRACKING_MODES.POSE;
      if (trackingMode === TRACKING_MODES.HAND) {
        const handResult = handLandmarker.detectForVideo(video, frameTimestamp);
        drawHandResult(handResult);
        const measurements = measureHandExerciseFrame({
          handResult,
          exercise: engine.exercise,
          side: sideSelect.value,
          frame: { width: video.videoWidth, height: video.videoHeight },
        });
        if (calibrationSession) {
          updateCalibrationCapture(measurements, frameTimestamp);
          statusEl.textContent = "Personal calibration in progress";
        } else if (pendingSetStartCheck) {
          updateSetStartingPositionCheck(measurements, frameTimestamp);
        } else {
          const feedback = updateFeedbackPanel(measurements, frameTimestamp);
          statusEl.textContent = feedback.trackingReady
            ? "Tracking the hand-shape sequence"
            : "Keep one complete hand close and fully visible";
        }
      } else if (trackingMode === TRACKING_MODES.POSE_AND_HAND) {
        // Freeze one image so both models receive identical pixels and the same
        // timestamp. Do not combine their world landmarks: cross-model wrist
        // geometry uses normalized image coordinates.
        const frame = captureSynchronizedFrame();
        const poseResult = poseLandmarker.detectForVideo(frame, frameTimestamp);
        const handResult = handLandmarker.detectForVideo(frame, frameTimestamp);
        drawPoseResult(poseResult);
        drawHandResult(handResult);
        rememberCombinedPose(poseResult, frameTimestamp);
        const measurements = measureCombinedExerciseFrame({
          poseResult,
          handResult,
          exercise: engine.exercise,
          side: sideSelect.value,
          frame: { width: video.videoWidth, height: video.videoHeight },
          poseHistory: combinedPoseHistory,
        });
        updateDebugPanel(measurements);
        if (calibrationSession) {
          updateCalibrationCapture(measurements, frameTimestamp);
          statusEl.textContent = "Personal calibration in progress";
        } else if (pendingSetStartCheck) {
          updateSetStartingPositionCheck(measurements, frameTimestamp);
        } else {
          const feedback = updateFeedbackPanel(measurements, frameTimestamp);
          statusEl.textContent = feedback.trackingReady
            ? "Tracking your elbow, wrist and hand together"
            : "Keep the working elbow and complete hand visible";
        }
      } else {
        const result = poseLandmarker.detectForVideo(video, frameTimestamp);
        if (result.landmarks.length > 0) {
          const landmarks = result.landmarks[0];
          drawPoseResult(result);
          rememberCombinedPose(result, frameTimestamp);

          // Standard angles plus the selected exercise's body-normalised and
          // temporal features. Visibility gates still use image landmarks.
          const raw = measurePoseExerciseFrame({
            poseResult: result,
            exercise: engine.exercise,
            side: sideSelect.value,
            poseHistory: combinedPoseHistory,
          });
          const angles = Object.fromEntries(
            Object.entries(raw).map(([k, a]) => [k, smoother.smooth(k, a)])
          );

          updateDebugPanel(angles);
          if (calibrationSession) {
            updateCalibrationCapture(angles, frameTimestamp);
            statusEl.textContent = "Personal calibration in progress";
          } else if (pendingSetStartCheck) {
            updateSetStartingPositionCheck(angles, frameTimestamp);
            processFallMonitoring(landmarks, frameTimestamp);
          } else {
            updateFeedbackPanel(angles, frameTimestamp);
            statusEl.textContent = "Tracking your movement";
            processFallMonitoring(landmarks, frameTimestamp);
          }
        } else {
          const fallEvent = fallMonitor.notePoseUnavailable(frameTimestamp);
          combinedPoseHistory = [];
          updateCalibrationCapture(null, frameTimestamp);
          updateSetStartingPositionCheck(null, frameTimestamp);
          const interruptedHold = engine.inHold;
          if (holdInterval) {
            clearHoldTimer(activeDose(engine.exercise).holdSeconds);
          }
          statusEl.textContent = fallEvent.type === "visibility_lost"
            ? "I can’t see you — please return to the marked area"
            : "Step back so your full body is visible";
          setFeedbackBanner(
            "position",
            interruptedHold
              ? "Hold reset — return to the stretch to restart"
              : ""
          );
          queueSpokenMovementCue(
            "position",
            interruptedHold
              ? "Your hold was reset because tracking was lost. Return to the stretch and keep your full body visible."
              : fallEvent.type === "visibility_lost"
                ? "I can’t see you. Please return to the marked area."
                : "Step back and keep your full body visible.",
            frameTimestamp
          );
        }
      }
    }

    ctx.restore();

    const now = performance.now();
    fpsEl.textContent = (1000 / (now - lastFrameStamp)).toFixed(0);
    lastFrameStamp = now;
  }

  rafId = requestAnimationFrame(renderFrame);
}

// ── Panel updates ─────────────────────────────────────────────────────────────

const angleDebugEl = document.getElementById("angleDebug");

function plannedSetCount(exercise = engine?.exercise) {
  const sets = Number(activeDose(exercise).sets);
  return Number.isFinite(sets) && sets > 0 ? Math.floor(sets) : 1;
}

function updateSetStartingPositionCheck(measurements, timestampMs) {
  if (!pendingSetStartCheck) return false;
  const frame = measurements
    ? extractCalibrationFrame(engine.exercise, measurements, sideSelect.value)
    : null;
  const matchesStart = frame && calibrationFrameMatchesPhase(
    engine.exercise,
    frame,
    "start"
  );

  if (
    !matchesStart ||
    !calibrationFrameIsStable(pendingSetStartCheck.previousFrame, frame)
  ) {
    pendingSetStartCheck.stableSince = null;
    pendingSetStartCheck.previousFrame = frame;
    statusEl.textContent = `Return to the starting position for set ${pendingSetStartCheck.setNumber}`;
    setFeedbackBanner(
      "position",
      `Hold the starting position so set ${pendingSetStartCheck.setNumber} can begin automatically`
    );
    return false;
  }

  pendingSetStartCheck.previousFrame = frame;
  if (pendingSetStartCheck.stableSince === null) {
    pendingSetStartCheck.stableSince = timestampMs;
  }
  if (
    timestampMs - pendingSetStartCheck.stableSince < SET_POSITION_STABLE_MS
  ) {
    statusEl.textContent = "Starting position found — hold still";
    setFeedbackBanner("position", "Hold still for a moment");
    return false;
  }

  const setNumber = pendingSetStartCheck.setNumber;
  pendingSetStartCheck = null;
  statusEl.textContent = `Set ${setNumber} starting position confirmed — begin`;
  setFeedbackBanner("good", `Set ${setNumber} is ready. Begin when comfortable.`);
  voiceGuidance.speak(
    `Starting position confirmed. Begin set ${setNumber} when you are comfortable.`,
    {
      key: `set:${engine.exercise.id}:${setNumber}:ready`,
      interrupt: true,
    }
  );
  return true;
}

function handleCompletedSet(feedback) {
  const setNumber = completedSetCount + 1;
  completedSessionReps += feedback.repCount;
  completedSetCount = setNumber;

  if (setNumber >= plannedSetCount(feedback.exercise)) {
    sessionAllSetsComplete = true;
    lastFeedbackResult = feedback;
    statusEl.textContent = `All ${setNumber} planned sets complete`;
    setFeedbackBanner(
      "good",
      "All planned sets are complete. Choose Finish exercise when you are ready."
    );
    voiceGuidance.speak(
      "All planned sets are complete. Choose Finish exercise when you are ready.",
      {
        key: `sets:${engine.exercise.id}:complete`,
        interrupt: true,
      }
    );
    return;
  }

  engine.changeExercise(
    exSelect.value,
    sideSelect.value,
    getCalibration(exSelect.value, sideSelect.value)
  );
  smoother.state = {};
  combinedPoseHistory = [];
  if (holdInterval) {
    clearHoldTimer(activeDose(engine.exercise).holdSeconds);
  }
  lastFeedbackResult = null;
  pendingSetStartCheck = {
    setNumber: setNumber + 1,
    stableSince: null,
    previousFrame: null,
  };
  repCountEl.textContent = "0";
  setCompleteBadgeEl?.classList.add("hidden");
  progressEl.style.width = "0%";
  progressLbl.textContent = "Return to your starting position";
  renderPoseStrip(engine.exercise, engine.stages[0]);
  renderStaticPhaseFlow(engine);
  resetSpokenCoaching();
  statusEl.textContent = `Set ${setNumber} complete — checking the next starting position`;
  setFeedbackBanner(
    "position",
    `Return to the starting position for set ${setNumber + 1}`
  );
  voiceGuidance.speak(
    `Set ${setNumber} complete. Return to your starting position for an automatic check before set ${setNumber + 1}.`,
    {
      key: `set:${engine.exercise.id}:${setNumber}:complete`,
      interrupt: true,
    }
  );
}

function updateFeedbackPanel(angles, timestampMs) {
  if (sessionAllSetsComplete && lastFeedbackResult) {
    return lastFeedbackResult;
  }
  const fb = engine.update(angles, timestampMs);

  // ── Debug logging (remove before release) ────────────────────────────────
  if (window._pvDebug) {
    const relevantKeys = ["kneeSeparation", "ankleSeparation", "workingFootClearance",
      "ankle", "knee", "hip", "torsoLean", "standingKnee"];
    const vals = {};
    for (const k of relevantKeys) {
      const m = angles[k] ?? angles[`${engine.side}${k[0].toUpperCase()}${k.slice(1)}`];
      if (m) vals[k] = m.lowConfidence ? "low-conf" : +m.value.toFixed(3);
    }
    console.log("[PV]", engine.exercise.id,
      "| phase:", fb.phase,
      "| detected:", fb.detectedPhase,
      "| startConfirmed:", fb.startConfirmed,
      "| stageIdx:", fb.stageIndex,
      "| progress:", fb.progress.toFixed(2),
      "| reps:", fb.repCount,
      "| measurements:", vals
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Live angle debug overlay
  if (angleDebugEl) {
    const tracked = Object.entries(engine.exercise.trackedAngles ?? {});
    const lines = tracked.map(([key]) => {
      const side = engine.side;
      const sideKey = `${side}${key[0].toUpperCase()}${key.slice(1)}`;
      const a = angles[key] ?? angles[sideKey];
      if (!a) return `${key}: —`;
      return `${key}: ${a.lowConfidence ? "hidden" : a.value.toFixed(0) + "°"}`;
    });
    angleDebugEl.textContent = lines.join(" | ") + ` | phase: ${fb.phase}`;
  }
  const holdSeconds = fb.exercise.trackingHoldSeconds
    ?? activeDose(fb.exercise).holdSeconds
    ?? 3;

  // Accumulate session stats for backend POST
  fb.cues.forEach(cue => { sessionCueCounts[cue] = (sessionCueCounts[cue] ?? 0) + 1; });
  if (fb.symmetryWarning) sessionSymmetryWarnings++;
  Object.entries(angles).forEach(([key, a]) => {
    if (a.lowConfidence || !Number.isFinite(a.value)) return;
    const s = sessionAngleStats[key] ?? (sessionAngleStats[key] = { min: Infinity, max: -Infinity, sum: 0, count: 0 });
    s.min = Math.min(s.min, a.value);
    s.max = Math.max(s.max, a.value);
    s.sum += a.value;
    s.count++;
  });

  // Rep / hold-seconds counter — hold exercises show seconds held, and both
  // cap at their goal with a "Set complete" badge once reached.
  const metric = goalMetric(fb.exercise);
  let shown = metric.isHold ? fb.repCount * metric.perHold : fb.repCount;
  const setComplete = metric.goal !== null && shown >= metric.goal;
  if (metric.goal !== null) shown = Math.min(shown, metric.goal);
  repCountEl.textContent = shown;
  if (repLabelEl) repLabelEl.textContent = metric.unit;
  if (setCompleteBadgeEl) setCompleteBadgeEl.classList.toggle("hidden", !setComplete);

  // Highlight active pose card without re-rendering the whole strip
  poseStripEl.querySelectorAll(".pose-card").forEach((card, i) => {
    card.classList.toggle("active", i === fb.stageIndex);
  });

  // Phase flow chips
  phaseFlowEl.innerHTML = fb.stages
    .map((s, i) => {
      // Sequence stages may repeat (for example open hand between every tendon
      // glide shape), so phase name alone cannot identify the active chip.
      const active = i === fb.stageIndex ? " active" : "";
      const arrow =
        i < fb.stages.length - 1
          ? '<span class="phase-arrow">→</span>'
          : "";
      return `<span class="phase-chip${active}">${s}</span>${arrow}`;
    })
    .join("");

  // Hold timer vs progress bar — mutually exclusive
  if (fb.inHold) {
    // Switch to hold timer view
    progressSection.classList.add("hidden");
    holdTimerSection.classList.remove("hidden");
    if (fb.trackingReady && fb.holdPositionMaintained) {
      startHoldTimer(holdSeconds);
    } else if (holdInterval) {
      // Fail safely: an uncertain pose cannot earn hold time. Reset so the
      // complete prescribed duration must be tracked after visibility returns.
      clearHoldTimer(holdSeconds);
    }
  } else {
    // Cancel timer if user broke position — reset inline display to full hold seconds
    if (holdInterval) clearHoldTimer(holdSeconds);
    progressSection.classList.remove("hidden");
    holdTimerSection.classList.add("hidden");

    // Progress bar
    const pct = Math.round(fb.progress * 100);
    progressEl.style.width = `${pct}%`;
    const nextIdx = fb.stageIndex + 1;
    const nextPhase = fb.stages[nextIdx] ?? fb.stages[0];
    progressLbl.textContent =
      pct >= 100
        ? `Get into ${fb.phase} position`
        : `Moving to ${nextPhase}… ${pct}%`;
  }

  // Coaching cues
  const personalizedCues = fb.cues.map(personalizeCue);
  cueListEl.innerHTML = personalizedCues
    .map((c) => `<li>${escapeHtml(c)}</li>`)
    .join("");
  let bannerState;
  let bannerCue;
  if (fb.inHold && !fb.holdPositionMaintained) {
    bannerState = fb.trackingReady ? "adjust" : "tracking";
    bannerCue = "Hold reset — return to the target position to restart";
  } else if (!fb.trackingReady) {
    bannerState = "tracking";
    bannerCue = fb.inHold
      ? "Hold reset — keep the required joints visible to restart"
      : "Keep every required joint visible so I can guide you safely";
  } else if (!fb.sequenceOnTrack && fb.positionRecognized) {
    bannerState = "adjust";
    bannerCue =
      `Follow the order — move to ${fb.expectedNextPhase.replaceAll("_", " ")} next`;
  } else if (!fb.positionRecognized && !personalizedCues.length) {
    const nextIdx = fb.stageIndex + 1;
    const nextPhase = fb.stages[nextIdx] ?? fb.stages[0];
    bannerState = "adjust";
    bannerCue =
      `Move slowly toward the ${nextPhase.replaceAll("_", " ")} position`;
  } else {
    bannerState = personalizedCues.length ? "adjust" : "good";
    bannerCue = personalizedCues[0] ?? "";
  }
  setFeedbackBanner(bannerState, bannerCue);
  queueSpokenMovementCue(bannerState, bannerCue, timestampMs);

  if (fb.repCount > spokenRepCount) {
    spokenRepCount = fb.repCount;
    voiceGuidance.speak(`Rep ${fb.repCount}.`, {
      key: `rep:${engine.exercise.id}:${fb.repCount}`,
    });
  }

  // Symmetry warning
  if (fb.symmetryWarning) {
    symWarnEl.textContent = fb.symmetryWarning;
    symWarnEl.classList.remove("hidden");
  } else {
    symWarnEl.classList.add("hidden");
  }

  lastFeedbackResult = fb;
  if (setComplete && !sessionAllSetsComplete) {
    handleCompletedSet(fb);
  }
  return fb;
}

function updateDebugPanel(angles) {
  for (const [name, a] of Object.entries(angles)) {
    const el = document.querySelector(`[data-angle="${name}"]`);
    if (!el) continue;
    if (a.lowConfidence) {
      el.textContent = "hidden";
      el.classList.add("low-conf");
      el.title = `Low visibility: ${a.weakPoints.join(", ")}`;
    } else {
      el.textContent = `${a.value.toFixed(0)}°`;
      el.classList.remove("low-conf");
      el.title = "";
    }
  }

  setSymRow("knee",  angles.leftKnee,  angles.rightKnee);
  setSymRow("elbow", angles.leftElbow, angles.rightElbow);
}

function setSymRow(key, left, right) {
  const el = document.querySelector(`[data-sym="${key}"]`);
  if (!el) return;
  if (!left || !right || left.lowConfidence || right.lowConfidence) {
    el.textContent = "—";
    el.classList.add("low-conf");
    el.title = "Needs both sides visible";
    return;
  }
  el.textContent = `${symmetry(left.value, right.value).toFixed(0)}°`;
  el.classList.remove("low-conf");
  el.title = "";
}

// ── Personal profile and calibration ─────────────────────────────────────────

function renderPersonalization() {
  const savedProfile = hasSavedProfile();
  const calibration = getCalibration(exSelect.value, sideSelect.value);
  const supportsCalibration = Boolean(engine.exercise.calibration);

  personalizationTitle.textContent = savedProfile
    ? `Guidance for ${profile.name || "you"}`
    : "Set up your profile";
  personalizationDetail.textContent = savedProfile
    ? `${profile.goal} · ${cueStyleLabel(profile.cueStyle)} coaching`
    : "Save your goals, preferences, and comfortable range.";

  if (calibration) {
    const personalRange = engine.exercise.calibration?.personalizedKeys?.length;
    calibrationBadge.textContent = personalRange
      ? "Personal range active"
      : "Personal tracking baseline active";
    calibrationDetail.textContent = `${calibrationSummary(
      calibration,
      engine.exercise.calibration
    )} · safety limits unchanged`;
    openCalibrationBtn.textContent = "Recalibrate";
  } else if (supportsCalibration) {
    calibrationBadge.textContent = "Standard range";
    calibrationDetail.textContent =
      `Calibrate ${engine.exercise.name} to your movement.`;
    openCalibrationBtn.textContent = "Calibrate";
  } else {
    calibrationBadge.textContent = "Standard range";
    calibrationDetail.textContent = "Personal calibration is unavailable for this exercise.";
    openCalibrationBtn.textContent = "Unavailable";
  }

  renderPrimaryCameraAction({ supportsCalibration });

  const requiredModelsReady = Boolean(
    poseLandmarker && (!exerciseUsesHand(engine.exercise) || handLandmarker)
  );
  openCalibrationBtn.disabled = !requiredModelsReady || !supportsCalibration;
  openCalibrationPrimary.disabled =
    !requiredModelsReady || !supportsCalibration;
}

function renderPrimaryCameraAction({
  supportsCalibration = Boolean(engine.exercise.calibration),
} = {}) {
  if (!supportsCalibration) {
    primaryCalibrationLabel.textContent = "Camera guide unavailable";
    primaryCameraInstruction.innerHTML =
      "<strong>Camera guide unavailable</strong>"
      + "Choose another exercise to use camera guidance.";
    return;
  }

  if (exerciseSessionActive && !running) {
    primaryCalibrationLabel.textContent = "Resume camera guide";
    primaryCameraInstruction.innerHTML =
      "<strong>Your camera guide is paused</strong>"
      + "Press Resume camera guide when you are ready to continue.";
    return;
  }

  primaryCalibrationLabel.textContent = "Start camera guide";
  primaryCameraInstruction.innerHTML =
    "<strong>Stand where your full body fits</strong>"
    + "Press Start camera guide below. We’ll ask about your pain level "
    + "before turning on the camera.";
}

function calibrationSummary(calibration, config) {
  const keys = config?.personalizedKeys ?? [];
  const summaries = keys
    .map((key) => {
      const value = calibration.target?.[key]?.median;
      if (!Number.isFinite(value)) return null;
      const angleLike = /(knee|hip|ankle|shoulder|elbow|wrist|inclination)/i
        .test(key);
      return `${friendlyMeasurement(key)} ${angleLike
        ? `${Math.round(value)}°`
        : value.toFixed(2)}`;
    })
    .filter(Boolean);
  return summaries.slice(0, 2).join(" · ") || "personal tracking baseline saved";
}

function friendlyMeasurement(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function cueStyleLabel(style) {
  if (style === "direct") return "short, direct";
  if (style === "detailed") return "detailed";
  return "gentle";
}

function personalizeCue(cue) {
  if (!cue) return cue;
  if (profile.cueStyle === "direct") return cue;
  if (profile.cueStyle === "detailed") {
    return `${cue}. Move slowly, then use the guide to check your position again.`;
  }
  return `When you’re ready, ${cue[0].toLowerCase()}${cue.slice(1)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let calibrationReturnFocus = openCalibrationBtn;

async function openCalibrationFlow(event) {
  const trigger = event.currentTarget;
  if (!(await ensureVoiceModeChosen())) return;
  if (trigger === openCalibrationPrimary && exerciseSessionActive) {
    await activateCameraGuide();
    return;
  }
  if (isLoggedIn() && !exerciseSessionActive && !preExerciseCheckinCompleted) {
    showPainCheckin("before", {
      continuation: "calibration",
      calibrationTrigger: trigger,
    });
    return;
  }
  await startCalibrationFlow(trigger);
}

async function startCalibrationFlow(
  trigger,
  { forceFull = trigger === openCalibrationBtn } = {}
) {
  cameraSetupStatus.hidden = true;
  cameraSetupStatus.textContent = "";
  if (!engine.exercise.calibration) {
    cameraSetupStatus.textContent =
      "Camera setup is unavailable for this exercise.";
    cameraSetupStatus.hidden = false;
    return;
  }

  const safetyContext = buildCalibrationSafetyContext({
    profile,
    dose: activeDose(engine.exercise),
    painLevel: confirmedPreExercisePain,
  });
  const savedCalibration = getCalibration(
    engine.exercise.id,
    sideSelect.value
  );
  const reuseDecision = evaluateCalibrationReuse(
    savedCalibration,
    safetyContext
  );
  if (reuseDecision.action === "professional-review") {
    const message =
      "Your safety information has changed. Please get professional review before using this saved movement setup.";
    cameraSetupStatus.textContent = message;
    cameraSetupStatus.hidden = false;
    statusEl.textContent = "Professional review recommended before exercise";
    setFeedbackBanner("tracking", message);
    voiceGuidance.speak(message, {
      key: `calibration:${engine.exercise.id}:professional-review`,
      interrupt: true,
    });
    return;
  }

  const calibrationMode = forceFull
    ? "full-calibration"
    : reuseDecision.action;
  if (!running && !(await activateCameraGuide({ announceInstruction: false }))) {
    cameraSetupStatus.textContent = engine.exercise.requiresClinicianPlan
      && profile.carePath !== "clinician"
      ? (
        "This movement requires a physiotherapist-approved care plan. "
        + "Return to My home and create a new general-wellness AI plan."
      )
      : (
        statusEl.textContent
        || "Camera setup could not start. Check the message above and try again."
      );
    cameraSetupStatus.hidden = false;
    return;
  }

  calibrationReturnFocus = trigger;
  calibrationDraft = null;
  calibrationSession = {
    exerciseId: engine.exercise.id,
    mode: calibrationMode,
    savedCalibration,
    safetyContext,
    step: "start",
    startFrames: null,
    targetCaptures: [],
    capture: null,
  };
  calibrationOverlay.classList.remove("hidden");
  renderCalibrationStep();
  beginCalibrationCapture("start", {
    durationMs: calibrationMode === "position-check"
      ? SESSION_POSITION_CAPTURE_MS
      : CALIBRATION_CAPTURE_MS,
  });
  announceCalibrationStage("start");
  calibrationCancel.focus();
}

openCalibrationBtn.addEventListener("click", openCalibrationFlow);
openCalibrationPrimary.addEventListener("click", openCalibrationFlow);

calibrationCancel.addEventListener("click", () => {
  const setupWasActive = Boolean(calibrationSession);
  cancelCalibration();
  if (setupWasActive && running) {
    deactivateCameraGuide({
      statusMessage: "Camera setup cancelled — exercise not started",
    });
    discardExerciseSession();
  }
});

calibrationAction.addEventListener("click", () => {
  if (!calibrationSession) return;

  if (calibrationSession.step === "result" && calibrationDraft) {
    saveCalibration(calibrationDraft);
    if (isLoggedIn()) {
      postCalibration({
        exercise:             calibrationDraft.exerciseId,
        affected_side:        calibrationDraft.affectedSide,
        captured_at:          calibrationDraft.capturedAt,
        start_measurements:   calibrationDraft.start,
        target_measurements:  calibrationDraft.target,
        phase_ranges:         calibrationDraft.phaseRanges,
        natural_knee_difference: calibrationDraft.naturalKneeDifference,
      }).catch(() => {});
    }
    engine.changeExercise(
      exSelect.value,
      sideSelect.value,
      calibrationDraft
    );
    smoother.state = {};
    combinedPoseHistory = [];
    renderPersonalization();
    setFeedbackBanner("ready");
    cancelCalibration();
    statusEl.textContent = engine.exercise.calibration.personalizedKeys.length
      ? "Personal range saved — movement guide ready"
      : "Personal tracking baseline saved — movement guide ready";
    announceExerciseInstruction("Personal movement setup saved.");
  }
});

function renderCalibrationStep() {
  if (!calibrationSession) return;
  const dots = [...calibrationOverlay.querySelectorAll(".calibration-dots span")];
  const stepIndex = { start: 0, target: 1, result: 2 }[
    calibrationSession.step
  ];
  dots.forEach((dot, index) => dot.classList.toggle("active", index <= stepIndex));
  calibrationStatus.textContent = "";
  calibrationResult.classList.add("hidden");
  calibrationAction.hidden = true;
  calibrationAction.disabled = false;

  if (calibrationSession.step === "start") {
    const isPositionCheck = calibrationSession.mode === "position-check";
    calibrationStepLabel.textContent = isPositionCheck
      ? "Automatic session position check"
      : "Step 1 · Automatic starting-position check";
    calibrationTitle.textContent = isPositionCheck
      ? "Confirm your starting position"
      : `Personalize ${engine.exercise.name} detection`;
    const startInstruction = engine.exercise.calibration.startInstruction
      ?? `Hold ${engine.exercise.calibration.startPhase.replaceAll("_", " ")} with every required joint visible.`;
    calibrationInstructions.textContent = isPositionCheck
      ? (
        "Your saved personalized movement range will be reused. This quick "
        + "2–3 second check confirms that you are visible and in the correct "
        + `starting position. ${startInstruction} Measurement starts automatically.`
      )
      : (
        "This short spoken setup measures your comfortable positions so "
        + "PhysioVision can recognize your movement more accurately. It does "
        + "not change safety limits. "
        + `${startInstruction} No extra button is needed—measurement starts `
        + "automatically when you hold the position."
      );
  } else if (calibrationSession.step === "target") {
    const nextRep = calibrationSession.targetCaptures.length + 1;
    calibrationStepLabel.textContent = `Step 2 · Comfortable sample ${nextRep} of 3`;
    calibrationTitle.textContent = engine.exercise.calibration.targetTitle
      ?? `Move to ${engine.exercise.calibration.targetPhase.replaceAll("_", " ")}`;
    calibrationInstructions.textContent =
      (
        engine.exercise.calibration.targetInstruction
        ?? "Move only as far as is comfortable, then hold the position."
      )
      + " Spoken guidance will lead you, and measurement starts automatically.";
  } else {
    calibrationStepLabel.textContent = "Step 3 · Review";
    calibrationTitle.textContent = engine.exercise.calibration.personalizedKeys.length
      ? "Your personal range is ready"
      : "Your personal tracking baseline is ready";
    calibrationInstructions.textContent =
      engine.exercise.calibration.safetyStatement
      ?? "This adjusts recognition around your movement. Safety limits are not relaxed.";
    const summaryKeys = engine.exercise.calibration.personalizedKeys.slice(0, 2);
    const resultItems = summaryKeys.map((key) => {
      const value = calibrationDraft?.target?.[key]?.median;
      const angleLike = /(knee|hip|ankle|shoulder|elbow|wrist|inclination)/i
        .test(key);
      const display = Number.isFinite(value)
        ? angleLike ? `${Math.round(value)}°` : value.toFixed(2)
        : "—";
      return `<span><strong>${display}</strong>${escapeHtml(friendlyMeasurement(key))}</span>`;
    });
    if (!resultItems.length) {
      resultItems.push("<span><strong>✓</strong>tracking baseline captured</span>");
    }
    if (Number.isFinite(calibrationDraft?.naturalKneeDifference)) {
      resultItems.push(`<span><strong>${calibrationDraft.naturalKneeDifference}°</strong>natural left/right difference</span>`);
    }
    calibrationResult.innerHTML = resultItems.join("");
    calibrationResult.classList.remove("hidden");
    calibrationAction.hidden = false;
    calibrationAction.textContent = engine.exercise.calibration.personalizedKeys.length
      ? "Save personal range"
      : "Save tracking baseline";
    calibrationAction.focus();
  }
}

function beginCalibrationCapture(
  type,
  {
    awaitingReturn = false,
    retryAfter = 0,
    durationMs = CALIBRATION_CAPTURE_MS,
  } = {}
) {
  calibrationSession.capture = {
    type,
    durationMs,
    frames: [],
    awaitingReturn,
    phaseDetectedAt: null,
    measuringStartedAt: null,
    previousFrame: null,
    retryAfter,
  };
  calibrationAction.hidden = true;
  calibrationStatus.textContent = awaitingReturn
    ? "Sample saved. Return to your starting position; the next sample will begin automatically."
    : calibrationWaitingMessage(type);
}

function updateCalibrationCapture(angles, timestampMs) {
  const capture = calibrationSession?.capture;
  if (!capture) return;

  if (capture.retryAfter && timestampMs < capture.retryAfter) return;
  capture.retryAfter = 0;

  const frame = angles
    ? extractCalibrationFrame(engine.exercise, angles, sideSelect.value)
    : null;
  if (!frame) {
    resetCalibrationPositionTimer(capture);
    calibrationStatus.textContent =
      "Keep your full body and every required joint visible. I will measure automatically.";
    return;
  }

  if (capture.awaitingReturn) {
    if (!calibrationFrameMatchesPhase(engine.exercise, frame, "start")) {
      capture.phaseDetectedAt = null;
      capture.previousFrame = frame;
      calibrationStatus.textContent =
        "Return to your comfortable starting position. I will tell you when to move again.";
      return;
    }
    if (!calibrationFrameIsStable(capture.previousFrame, frame)) {
      capture.phaseDetectedAt = timestampMs;
      capture.previousFrame = frame;
      calibrationStatus.textContent =
        "Starting position found—hold still for a moment.";
      return;
    }
    capture.previousFrame = frame;
    capture.phaseDetectedAt ??= timestampMs;
    if (
      timestampMs - capture.phaseDetectedAt
      < CALIBRATION_RETURN_STABLE_MS
    ) {
      calibrationStatus.textContent =
        "Starting position found—hold still for a moment.";
      return;
    }

    capture.awaitingReturn = false;
    resetCalibrationPositionTimer(capture);
    calibrationStatus.textContent = calibrationWaitingMessage("target");
    announceCalibrationStage("target", { afterReturn: true });
    return;
  }

  if (!calibrationFrameMatchesPhase(engine.exercise, frame, capture.type)) {
    resetCalibrationPositionTimer(capture);
    calibrationStatus.textContent = calibrationWaitingMessage(capture.type);
    return;
  }

  if (!calibrationFrameIsStable(capture.previousFrame, frame)) {
    capture.frames = [];
    capture.phaseDetectedAt = timestampMs;
    capture.measuringStartedAt = null;
    capture.previousFrame = frame;
    calibrationStatus.textContent =
      "Position found—finish moving, then hold still. Measurement will start automatically.";
    return;
  }

  capture.previousFrame = frame;
  capture.phaseDetectedAt ??= timestampMs;
  if (capture.measuringStartedAt === null) {
    if (
      timestampMs - capture.phaseDetectedAt
      < CALIBRATION_POSITION_STABLE_MS
    ) {
      calibrationStatus.textContent =
        "Position found—hold still. Automatic measurement is about to begin.";
      return;
    }
    capture.measuringStartedAt = timestampMs;
    capture.frames = [frame];
    calibrationStatus.textContent =
      "Measuring automatically… keep holding this comfortable position.";
    voiceGuidance.speak(
      "Position found. Hold still while I measure.",
      {
        key: `calibration:${engine.exercise.id}:${capture.type}:measuring:${calibrationSession.targetCaptures.length}`,
        cooldownMs: 2500,
      }
    );
    return;
  }

  capture.frames.push(frame);
  const elapsed = timestampMs - capture.measuringStartedAt;
  const captureDurationMs = capture.durationMs ?? CALIBRATION_CAPTURE_MS;
  const remaining = Math.max(
    0,
    Math.ceil((captureDurationMs - elapsed) / 1000)
  );
  calibrationStatus.textContent =
    `Measuring automatically… ${remaining || "almost done"}`;
  if (elapsed < captureDurationMs) return;
  finishCalibrationCapture(capture);
}

function finishCalibrationCapture(capture) {
  calibrationSession.capture = null;
  try {
    validateCalibrationCapture(
      engine.exercise,
      capture.frames,
      capture.type
    );

    if (capture.type === "start") {
      if (calibrationSession.mode === "position-check") {
        const checkedCalibration = {
          ...calibrationSession.savedCalibration,
          safetyContext: calibrationSession.safetyContext,
          lastPositionCheckedAt: new Date().toISOString(),
        };
        saveCalibration(checkedCalibration);
        engine.changeExercise(
          exSelect.value,
          sideSelect.value,
          checkedCalibration
        );
        smoother.state = {};
        combinedPoseHistory = [];
        cancelCalibration();
        statusEl.textContent =
          "Starting position confirmed — movement guide ready";
        setFeedbackBanner(
          "good",
          "Starting position confirmed. Begin when you are comfortable."
        );
        announceExerciseInstruction("Starting position confirmed.");
        return;
      }
      calibrationSession.startFrames = capture.frames;
      calibrationSession.step = "target";
      renderCalibrationStep();
      beginCalibrationCapture("target");
      announceCalibrationStage("target");
    } else {
      calibrationSession.targetCaptures.push(capture.frames);
      if (calibrationSession.targetCaptures.length >= 3) {
        calibrationDraft = createCalibration(engine.exercise, {
          affectedSide: sideSelect.value,
          startFrames: calibrationSession.startFrames,
          targetCaptures: calibrationSession.targetCaptures,
        });
        calibrationDraft.safetyContext = calibrationSession.safetyContext;
        calibrationDraft.lastPositionCheckedAt = new Date().toISOString();
        calibrationSession.step = "result";
        renderCalibrationStep();
        voiceGuidance.speak(
          "Personal movement setup complete. Review and save your range.",
          {
            key: `calibration:${engine.exercise.id}:complete`,
            interrupt: true,
          }
        );
      } else {
        renderCalibrationStep();
        beginCalibrationCapture("target", { awaitingReturn: true });
        const completed = calibrationSession.targetCaptures.length;
        voiceGuidance.speak(
          `Sample ${completed} saved. Return to your starting position. I will tell you when to move again.`,
          {
            key: `calibration:${engine.exercise.id}:return:${completed}`,
            interrupt: true,
          }
        );
      }
    }
  } catch (error) {
    const retryAfter = performance.now() + 1800;
    beginCalibrationCapture(capture.type, {
      retryAfter,
      durationMs: capture.durationMs,
    });
    calibrationStatus.textContent =
      `${error.message} I will retry automatically—reposition comfortably and hold still.`;
    voiceGuidance.speak(
      `${error.message} Reposition comfortably. I will retry automatically.`,
      {
        key: `calibration:${engine.exercise.id}:${capture.type}:retry`,
        interrupt: true,
        cooldownMs: 3000,
      }
    );
  }
}

function resetCalibrationPositionTimer(capture) {
  capture.frames = [];
  capture.phaseDetectedAt = null;
  capture.measuringStartedAt = null;
  capture.previousFrame = null;
}

function calibrationFrameIsStable(previousFrame, frame) {
  if (!previousFrame || !frame) return true;
  return Object.keys(frame).every((key) => {
    const previous = previousFrame[key];
    const current = frame[key];
    if (typeof previous === "string" || typeof current === "string") {
      return previous === current;
    }
    if (!Number.isFinite(previous) || !Number.isFinite(current)) return false;
    const tolerance = Math.max(
      Math.abs(previous) <= 2 && Math.abs(current) <= 2 ? 0.025 : 2.5,
      Math.abs(previous) * 0.015
    );
    return Math.abs(current - previous) <= tolerance;
  });
}

function calibrationWaitingMessage(type) {
  const config = engine.exercise.calibration;
  const phase = type === "start" ? config.startPhase : config.targetPhase;
  return type === "start"
    ? `Move into your comfortable ${phase.replaceAll("_", " ")} position and hold still. Measurement starts automatically.`
    : `Move into a comfortable ${phase.replaceAll("_", " ")} position and hold it. Measurement starts automatically.`;
}

function announceCalibrationStage(type, { afterReturn = false } = {}) {
  const config = engine.exercise.calibration;
  if (type === "start") {
    const startInstruction = config.startInstruction
      ?? `Hold your ${config.startPhase.replaceAll("_", " ")} position with your full body visible.`;
    const introduction = calibrationSession.mode === "position-check"
      ? (
        "I will reuse your saved personalized movement range. This quick "
        + "position check confirms your starting position before the session. "
      )
      : (
        "This short setup personalizes movement detection so I can recognize "
        + "your exercise more accurately. It does not change safety limits. "
      );
    voiceGuidance.speak(
      introduction
      + `${startInstruction} You do not need to press anything. I will measure automatically.`,
      {
        key: `calibration:${engine.exercise.id}:start`,
        interrupt: true,
      }
    );
    return;
  }

  const sample = calibrationSession.targetCaptures.length + 1;
  const targetInstruction = config.targetInstruction
    ?? `Move into a comfortable ${config.targetPhase.replaceAll("_", " ")} position.`;
  voiceGuidance.speak(
    `${afterReturn ? "Starting position found. " : "Starting position saved. "}`
    + `${targetInstruction} This is sample ${sample} of 3. Hold the position; `
    + "I will measure automatically.",
    {
      key: `calibration:${engine.exercise.id}:target:${sample}:${afterReturn ? "return" : "first"}`,
      interrupt: true,
    }
  );
}

function cancelCalibration() {
  const wasActive = Boolean(calibrationSession);
  calibrationSession = null;
  calibrationDraft = null;
  voiceGuidance.cancel();
  calibrationOverlay?.classList.add("hidden");
  if (wasActive) calibrationReturnFocus?.focus();
}

// ── Static panel renders ──────────────────────────────────────────────────────

function renderPoseStrip(exercise, activePhase) {
  const stages = engine.stages;
  if (!stages.length) { poseStripEl.innerHTML = ""; return; }

  poseStripEl.innerHTML = stages.map((stage, i) => {
    const isActive = stage === activePhase;
    const arrow = i < stages.length - 1
      ? `<span class="pose-arrow-sep">→</span>`
      : "";
    return `
      <div class="pose-card${isActive ? " active" : ""}">
        <span class="pose-step">${i + 1}</span>
        <span class="pose-label">${stage}</span>
      </div>
      ${arrow}`;
  }).join("");
}

function renderPrescription(ex) {
  const p = activeDose(ex);
  if (profile.carePath === "clinician" && !p.id) {
    prescEl.textContent = "This movement is not in your active prescription";
    if (repTargetEl) repTargetEl.textContent = "—";
  } else if (profile.carePath === "clinician") {
    prescEl.textContent =
      `${p.sets} sets × ${p.reps} reps` +
      (p.holdSeconds ? ` · hold ${p.holdSeconds}s` : "") +
      ` · ${p.daysPerWeek} days/week` +
      (p.clinicianName ? ` · prescribed by ${p.clinicianName}` : "");
    if (repTargetEl) repTargetEl.textContent = p.reps;
  } else if (p.mode === "clinician_plan") {
    prescEl.textContent = "A clinician prescription is required";
    if (repTargetEl) repTargetEl.textContent = "—";
  } else {
    prescEl.textContent =
      `${p.sets} sets × ${p.reps} reps` +
      (p.holdSeconds ? ` · hold ${p.holdSeconds}s` : "") +
      ` · ${p.daysPerWeek} days/week`;
    if (repTargetEl) repTargetEl.textContent = p.reps;
  }

  // For hold exercises the goal is expressed in seconds held, not reps.
  const metric = goalMetric(ex);
  if (repLabelEl) repLabelEl.textContent = metric.unit;
  if (repTargetEl && metric.goal !== null && repTargetEl.textContent !== "—") {
    repTargetEl.textContent = metric.isHold ? `${metric.goal}s` : metric.goal;
  }
  if (setCompleteBadgeEl) setCompleteBadgeEl.classList.add("hidden");

  // Show inline hold timer only for stretch exercises
  if (ex.category === "stretch" && p.holdSeconds) {
    holdInlineEl.classList.remove("hidden");
    holdInlineEl.classList.remove("active");
    holdInlineCountEl.textContent = p.holdSeconds;
  } else {
    holdInlineEl.classList.add("hidden");
  }
}

function renderTrackingWarning(ex) {
  const clinicianNote = activeDose(ex).notes;
  if (ex.safetyNote || ex.trackingWarning || clinicianNote) {
    trackWarnEl.textContent = [
      ex.safetyNote ? `⚠ Safety: ${ex.safetyNote}` : "",
      clinicianNote ? `Clinician instruction: ${clinicianNote}` : "",
      ex.trackingWarning ?? "",
    ].filter(Boolean).join(" ");
    trackWarnEl.classList.remove("hidden");
  } else {
    trackWarnEl.classList.add("hidden");
  }
  if (!video.srcObject && !exerciseUsesHand(ex)) {
    setupTip.textContent = cameraSetupTip(ex);
  }
}

function cameraSetupTip(exercise) {
  const camera = exercise.camera ?? "front";
  if (camera.includes("close")) {
    return "Close view · Upright phone · Keep every required joint visible";
  }
  if (camera.includes("side") || camera.includes("oblique")) {
    return "Side/oblique view · Keep the complete moving limb visible";
  }
  return "Front view · Phone at chest height · Keep required joints visible";
}

function renderStaticPhaseFlow(activeEngine) {
  phaseFlowEl.innerHTML = activeEngine.stages
    .map((stage, index) => {
      const active = index === 0 ? " active" : "";
      const arrow =
        index < activeEngine.stages.length - 1
          ? '<span class="phase-arrow">→</span>'
          : "";
      return `<span class="phase-chip${active}">${stage}</span>${arrow}`;
    })
    .join("");
}

function setFeedbackBanner(state, cue = "") {
  if (!feedbackEl) return;
  const symbol = feedbackEl.querySelector(".feedback-symbol");
  const title = feedbackEl.querySelector("strong");
  const detail = feedbackEl.querySelector("div > span");
  feedbackEl.classList.toggle("needs-adjustment", state === "adjust");
  feedbackEl.classList.toggle(
    "tracking-uncertain",
    state === "tracking" || state === "position"
  );

  if (state === "adjust") {
    symbol.textContent = "!";
    title.textContent = "Small adjustment";
    detail.textContent = cue || "Follow the coaching cue below";
  } else if (state === "good") {
    symbol.textContent = "✓";
    title.textContent = "Movement looks good";
    detail.textContent = "Keep this pace and breathe naturally";
  } else if (state === "tracking") {
    symbol.textContent = "?";
    title.textContent = "Tracking uncertain";
    detail.textContent =
      cue || "Make sure your required joints are clearly visible";
  } else if (state === "position") {
    symbol.textContent = "↔";
    title.textContent = "Let’s get you in frame";
    detail.textContent = cue || "Make sure your full body is visible";
  } else if (state === "hand-ready") {
    symbol.textContent = "✓";
    title.textContent = "Hand tracking ready";
    detail.textContent = "All 21 hand landmarks are visible at a usable size";
  } else if (state === "finished") {
    symbol.textContent = "✓";
    title.textContent = "Exercise finished by you";
    detail.textContent = "You can now complete or skip the optional check-in";
  } else {
    symbol.textContent = "●";
    title.textContent = "Get into position";
    detail.textContent = "Live guidance appears here";
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────

function hasPathwayAccess() {
  if (!hasLivePracticeAccess()) {
    setFeedbackBanner(
      "tracking",
      "Sign in with an eligible patient pathway before starting"
    );
    return false;
  }
  if (profile.carePath === "needs_review") {
    statusEl.textContent = "Professional review is recommended before self-guided exercise";
    setFeedbackBanner(
      "tracking",
      "A general wellness plan was not created from your screening answers"
    );
    voiceGuidance.speak(
      "Please get professional guidance before starting self-guided exercise.",
      { key: "wellness-needs-review", interrupt: true }
    );
    return false;
  }
  if (
    profile.carePath === "wellness" &&
    !isWellnessEligible(profile)
  ) {
    statusEl.textContent = "Complete the general wellness safety screen first";
    setFeedbackBanner(
      "tracking",
      "Open Create your first plan and complete the wellness questions"
    );
    voiceGuidance.speak(
      "Please complete the general wellness safety questions before starting.",
      { key: "wellness-screening-required", interrupt: true }
    );
    return false;
  }
  if (
    profile.carePath === "clinician" &&
    !activePrescriptions.has(engine.exercise.id)
  ) {
    statusEl.textContent = "This exercise is not in your active prescription";
    setFeedbackBanner(
      "tracking",
      "Choose one of the movements assigned by your physiotherapist"
    );
    return false;
  }
  if (engine.exercise.requiresClinicianPlan && profile.carePath !== "clinician") {
    statusEl.textContent = "This exercise requires a clinician-approved care plan";
    setFeedbackBanner(
      "tracking",
      "Choose an exercise available for your care path or update your clinician plan"
    );
    return false;
  }
  return true;
}

function announceExerciseInstruction(prefix = "") {
  const clinicianNote = activeDose(engine.exercise).notes;
  const spokenInstruction = [
    prefix,
    exerciseSpokenInstruction(engine.exercise),
    clinicianNote ? `Your clinician's instruction is: ${clinicianNote}` : "",
  ].filter(Boolean).join(" ");
  voiceGuidance.speak(spokenInstruction, {
    key: `instruction:${engine.exercise.id}`,
    cooldownMs: 3000,
    interrupt: true,
  });
}

async function activateCameraGuide({ announceInstruction = true } = {}) {
  if (running) return true;
  if (!(await ensureVoiceModeChosen())) return false;
  if (!hasPathwayAccess()) return false;
  if (exerciseUsesHand(engine.exercise) && !handLandmarker) {
    statusEl.textContent = "The hand-tracking model is unavailable";
    setFeedbackBanner(
      "tracking",
      "Reload with an internet connection or choose a Pose-only exercise"
    );
    return false;
  }
  try {
    toggleBtn.disabled = true;
    handTrackingToggle.disabled = true;
    statusEl.textContent = "Starting camera…";
    await startCamera();
    running = true;
    lastVideoTime = -1;
    combinedPoseHistory = [];
    beginExerciseSession();
    resetSpokenCoaching();
    configureFallMonitoring(engine.exercise);
    if (fallReadinessEl.dataset.state === "ready") {
      fallReadinessTitleEl.textContent = "Local possible-fall check ready";
      fallReadinessDetailEl.textContent =
        "The camera check is active. No emergency alert is sent in this version.";
    }
    cameraStage?.classList.add("camera-active");
    if (exerciseUsesHand(engine.exercise)) {
      const combined = engine.exercise.trackingMode === TRACKING_MODES.POSE_AND_HAND;
      handFrameGuide.classList.remove("hidden");
      handFrameGuide.classList.toggle("is-arm-mode", combined);
      handGuideText.textContent = combined
        ? "Keep the working elbow, wrist and complete hand visible"
        : "Keep one complete hand inside this area";
      setupTip.textContent = combined
        ? "Combined mode · Upright phone · Working elbow and complete hand visible"
        : "Hand mode · One complete hand close to the camera";
    } else {
      setupTip.textContent = cameraSetupTip(engine.exercise);
    }
    toggleBtn.classList.remove("hidden");
    toggleBtn.innerHTML = 'Pause camera guide <span aria-hidden="true">Ⅱ</span>';
    toggleBtn.disabled = false;
    finishExerciseBtn.disabled = false;
    cameraSessionHintEl.textContent =
      "Pausing only stops the camera. Choose “Finish exercise and check in” when you decide you are done.";
    renderFrame();
    if (announceInstruction) announceExerciseInstruction();
    return true;
  } catch (err) {
    statusEl.textContent = `Camera error: ${err.message}`;
    toggleBtn.classList.add("hidden");
    toggleBtn.disabled = false;
    handTrackingToggle.disabled = !handLandmarker;
    return false;
  }
}

function deactivateCameraGuide({
  statusMessage = "Camera paused — exercise not marked finished",
} = {}) {
  running = false;
  voiceGuidance.cancel();
  resetSpokenCoaching();
  cancelAnimationFrame(rafId);
  cancelCalibration();
  if (holdInterval) {
    clearHoldTimer(activeDose(engine.exercise).holdSeconds);
  }
  stopCamera();
  combinedPoseHistory = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  cameraStage?.classList.remove("camera-active");
  handFrameGuide.classList.add("hidden");
  handFrameGuide.classList.remove("is-arm-mode");
  setupTip.textContent = cameraSetupTip(engine.exercise);
  toggleBtn.innerHTML = 'Pause camera guide <span aria-hidden="true">Ⅱ</span>';
  toggleBtn.classList.add("hidden");
  renderPrimaryCameraAction();
  finishExerciseBtn.disabled = !exerciseSessionActive;
  cameraSessionHintEl.textContent = exerciseSessionActive
    ? "Your exercise is paused and has not been marked finished. Resume the camera or finish when you are ready."
    : "Stopping the camera does not mark an exercise as finished.";
  handTrackingToggle.disabled = !handLandmarker;
  statusEl.textContent = statusMessage;
  setFeedbackBanner("ready");
  renderFallReadiness(engine.exercise);

}

async function startHandPreview() {
  if (!hasLivePracticeAccess()) return false;
  if (!handLandmarker || running) return false;
  handPreviewMode = true;
  handTrackingToggle.disabled = true;
  toggleBtn.disabled = true;
  handTrackingReadout.classList.remove("hidden");
  handFrameGuide.classList.remove("hidden");
  handFrameGuide.classList.remove("is-arm-mode");
  handGuideText.textContent = "Keep one complete hand inside this area";
  setupTip.textContent = "Close-up mode · One full hand visible · Keep wrist and fingertips in frame";
  statusEl.textContent = "Starting close-up hand camera…";
  setFeedbackBanner("position", "Place one open hand inside the close-up guide");

  try {
    await startCamera();
    running = true;
    lastVideoTime = -1;
    cameraStage?.classList.add("camera-active");
    handTrackingToggle.textContent = "Stop hand check";
    handTrackingToggle.disabled = false;
    renderFrame();
    return true;
  } catch (error) {
    handPreviewMode = false;
    handFrameGuide.classList.add("hidden");
    handTrackingReadout.classList.add("hidden");
    setupTip.textContent = "Phone at chest height · 2–3 m away · Full body visible";
    statusEl.textContent = `Camera error: ${error.message}`;
    handTrackingToggle.disabled = false;
    toggleBtn.disabled = false;
    return false;
  }
}

function stopHandPreview() {
  running = false;
  handPreviewMode = false;
  cancelAnimationFrame(rafId);
  stopCamera();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  cameraStage?.classList.remove("camera-active");
  handFrameGuide.classList.add("hidden");
  handFrameGuide.classList.remove("is-arm-mode");
  handTrackingReadout.classList.add("hidden");
  resetHandReadout();
  setupTip.textContent = "Phone at chest height · 2–3 m away · Full body visible";
  handTrackingToggle.textContent = "Check hand tracking";
  handTrackingToggle.disabled = false;
  toggleBtn.classList.add("hidden");
  toggleBtn.disabled = false;
  statusEl.textContent = "Movement guide ready";
  setFeedbackBanner("ready");
}

function clearSessionMeasurements() {
  Object.keys(sessionCueCounts).forEach(k => delete sessionCueCounts[k]);
  Object.keys(sessionAngleStats).forEach(k => delete sessionAngleStats[k]);
  sessionSymmetryWarnings = 0;
}

function resetSetProgress() {
  completedSetCount = 0;
  completedSessionReps = 0;
  pendingSetStartCheck = null;
  sessionAllSetsComplete = false;
  lastFeedbackResult = null;
}

function resetExerciseProgressForNewSession() {
  resetSetProgress();
  engine.changeExercise(
    exSelect.value,
    sideSelect.value,
    getCalibration(exSelect.value, sideSelect.value)
  );
  smoother.state = {};
  combinedPoseHistory = [];
  if (holdInterval) {
    clearHoldTimer(activeDose(engine.exercise).holdSeconds);
  }
  holdTimerSection.classList.add("hidden");
  progressSection.classList.remove("hidden");
  repCountEl.textContent = "0";
  setCompleteBadgeEl?.classList.add("hidden");
  cueListEl.innerHTML = "";
  symWarnEl.classList.add("hidden");
  progressEl.style.width = "0%";
  progressLbl.textContent = "Position yourself to start";
  renderPoseStrip(engine.exercise, engine.stages[0]);
  renderStaticPhaseFlow(engine);
  resetSpokenCoaching();
  setFeedbackBanner("ready");
}

function beginExerciseSession() {
  if (exerciseSessionActive) return;
  resetExerciseProgressForNewSession();
  exerciseSessionActive = true;
  sessionStartedAt = new Date().toISOString();
  clearSessionMeasurements();
}

function discardExerciseSession() {
  exerciseSessionActive = false;
  sessionStartedAt = null;
  resetSetProgress();
  clearSessionMeasurements();
  finishExerciseBtn.disabled = true;
  cameraSessionHintEl.textContent =
    "Stopping the camera does not mark an exercise as finished.";
  renderPrimaryCameraAction();
}

function completeExerciseSession() {
  const currentSetReps = sessionAllSetsComplete ? 0 : engine.repCount;
  const totalRepsCompleted = completedSessionReps + currentSetReps;
  const partialSetCompleted =
    !sessionAllSetsComplete && currentSetReps > 0 ? 1 : 0;
  const totalSetsCompleted = Math.min(
    plannedSetCount(),
    completedSetCount + partialSetCompleted
  );
  const shouldRecord =
    exerciseSessionActive &&
    isLoggedIn() &&
    totalRepsCompleted > 0 &&
    Boolean(sessionStartedAt);

  if (!shouldRecord) {
    discardExerciseSession();
    return;
  }

  const endedAt = new Date().toISOString();
  const ex = engine.exercise;
  const dose = activeDose(ex);
  const cuesTriggered = Object.entries(sessionCueCounts).map(
    ([cue_text, trigger_count]) => ({ cue_text, trigger_count })
  );
  const angleSummaries = {};
  Object.entries(sessionAngleStats).forEach(([key, s]) => {
    if (s.count > 0) {
      angleSummaries[key] = {
        min:  Math.round(s.min * 10) / 10,
        max:  Math.round(s.max * 10) / 10,
        mean: Math.round((s.sum / s.count) * 10) / 10,
      };
    }
  });

  postSession({
    exercise:                ex.id,
    prescription:            dose.id ?? null,
    started_at:              sessionStartedAt,
    ended_at:                endedAt,
    sets_completed:          totalSetsCompleted,
    reps_completed:          totalRepsCompleted,
    reps_target:             dose.reps ?? totalRepsCompleted,
    sets_target:             dose.sets ?? 1,
    affected_side:           profile.focusSide ?? "right",
    cues_triggered:          cuesTriggered,
    symmetry_warnings_count: sessionSymmetryWarnings,
    angle_summaries:         angleSummaries,
  }).catch(() => {});

  discardExerciseSession();
}

// ── Pain check-in ─────────────────────────────────────────────────────────────
const painCheckinEl = document.getElementById("painCheckin");
const painSkipBtn   = document.getElementById("painSkip");
const painCheckinContextEl = document.getElementById("painCheckinContext");
const painCheckinTitleEl = document.getElementById("painCheckinTitle");
const painLevelChoicesEl = document.getElementById("painLevelChoices");
const painConfirmationEl = document.getElementById("painConfirmation");
const painConfirmationSummaryEl = document.getElementById("painConfirmationSummary");
const recoveryChoicesEl = document.getElementById("recoveryChoices");
const painSafetyInterviewEl = document.getElementById("painSafetyInterview");
const painSafetyReassuranceEl = document.getElementById("painSafetyReassurance");
const painSafetyHeadingEl = document.getElementById("painSafetyHeading");
const painSafetyMessageEl = document.getElementById("painSafetyMessage");
const painSafetyQuestionEl = document.getElementById("painSafetyQuestion");
const painSafetyHelpEl = document.getElementById("painSafetyHelp");
const painSafetyChoicesEl = document.getElementById("painSafetyChoices");
const voiceCheckinStatusEl = document.getElementById("voiceCheckinStatus");
const painVoiceInputBtn = document.getElementById("painVoiceInput");
const recordedPainEl = document.getElementById("recordedPain");
const recordedPainContextEl = document.getElementById("recordedPainContext");
const recordedPainMessageEl = document.getElementById("recordedPainMessage");
const recordedPainValueEl = document.getElementById("recordedPainValue");
let painCheckinState = null;

function painQuestion(context) {
  return context === "before"
    ? "Before we begin, what is your pain level right now, from zero to ten?"
    : "You marked this exercise as finished. What is your pain level now, from zero to ten?";
}

function recoveryQuestion(context) {
  return context === "before"
    ? "Compared with your previous session, is your recovery better, about the same, worse, or are you not sure?"
    : "Compared with before this exercise, do you feel better, about the same, worse, or are you not sure?";
}

function painConfirmationQuestion(level) {
  return `I heard pain level ${level} out of ten. Is that correct?`;
}

const PAIN_SAFETY_REASSURANCE =
  "Thank you. Please stop moving and rest somewhere safe. "
  + "We will proceed only after I have confirmed that you are well enough.";

const PAIN_SAFETY_STEPS = Object.freeze({
  urgent: {
    question:
      "Are you experiencing chest pressure, unusual shortness of breath, "
      + "dizziness or faintness, sudden weakness or numbness, or have you fallen?",
    help: "Choose Yes if any one of these applies. If you are not sure, choose Not sure.",
    choices: [
      ["no", "No, none of these"],
      ["yes", "Yes"],
      ["unsure", "Not sure"],
    ],
    field: "urgentSymptoms",
    next: "location",
  },
  location: {
    question: "Where are you feeling the pain?",
    help: "Choose the area that best matches what you feel now.",
    choices: [
      ["knee", "Knee"],
      ["hip", "Hip"],
      ["ankle", "Ankle or foot"],
      ["back", "Back"],
      ["shoulder", "Shoulder or arm"],
      ["other", "Other area"],
    ],
    field: "painLocation",
    next: "side",
  },
  side: {
    question: "Which side is affected?",
    help: "Choose Not sure if the pain is central or difficult to locate.",
    choices: [
      ["left", "Left side"],
      ["right", "Right side"],
      ["both", "Both sides"],
      ["unsure", "Not sure"],
    ],
    field: "painSide",
    next: "familiarity",
  },
  familiarity: {
    question:
      "Is this new pain, your usual pain becoming stronger, or something different "
      + "from what you normally feel?",
    help: "This does not diagnose the pain. It helps record what changed.",
    choices: [
      ["new", "New pain"],
      ["usual-stronger", "Usual pain, but stronger"],
      ["different", "Something different"],
      ["unsure", "Not sure"],
    ],
    field: "painFamiliarity",
    next: "timing",
  },
  timing: {
    question: "When did the pain increase?",
    help:
      "PhysioVision will record the current exercise, set, and repetition automatically.",
    choices: [
      ["before", "Before I started"],
      ["during", "During this exercise"],
      ["after", "Immediately after"],
      ["unsure", "Not sure"],
    ],
    field: "onsetTiming",
    next: "rest",
  },
  rest: {
    question:
      "Now that you have stopped and rested briefly, is the pain getting better, "
      + "staying the same, or getting worse?",
    help: "Stay resting while you answer.",
    choices: [
      ["better", "Getting better"],
      ["same", "Staying the same"],
      ["worse", "Getting worse"],
      ["unsure", "Not sure"],
    ],
    field: "restTrend",
    next: "mobility",
  },
  mobility: {
    question: "Can you sit, stand, or move to a safe position without assistance?",
    help: "Do not test a movement that feels unsafe just to answer this question.",
    choices: [
      ["safe", "Yes, safely"],
      ["nearby", "I need someone nearby"],
      ["help", "No, I need help"],
    ],
    field: "safeMovement",
    next: "outcome",
  },
});

function isPainSafetyStage(stage = painCheckinState?.stage) {
  return typeof stage === "string" && stage.startsWith("safety-");
}

function updatePainCheckinPresentation() {
  const safetyActive = isPainSafetyStage();
  const safetyOutcome = painCheckinState?.stage === "safety-outcome";
  painCheckinEl.classList.toggle(
    "hands-free-checkin",
    handsFreeVoiceEnabled && !safetyActive
  );
  painCheckinEl.classList.toggle("safety-interview-active", safetyActive);
  painVoiceInputBtn.classList.toggle(
    "hidden",
    (handsFreeVoiceEnabled && !safetyActive) || safetyOutcome
  );
  painVoiceInputBtn.disabled = !voiceGuidance.canListen;
}

function continueAfterPainCheckin(completed) {
  if (completed.continuation === "calibration") {
    startCalibrationFlow(completed.calibrationTrigger);
  } else if (completed.continuation === "camera" || completed.startAfter) {
    activateCameraGuide();
  }
}

function renderRecordedPain({ painLevel, context }) {
  if (!Number.isInteger(painLevel) || painLevel < 0 || painLevel > 10) return;

  recordedPainEl.classList.remove("hidden", "is-moderate", "is-high");
  if (painLevel >= 7) recordedPainEl.classList.add("is-high");
  else if (painLevel >= 4) recordedPainEl.classList.add("is-moderate");

  recordedPainContextEl.textContent =
    context === "after" ? "After exercise pain" : "Before exercise pain";
  recordedPainMessageEl.textContent = `Pain level ${painLevel} recorded`;
  recordedPainValueEl.textContent = String(painLevel);
  recordedPainEl.setAttribute(
    "aria-label",
    `${recordedPainContextEl.textContent}: pain level ${painLevel} out of 10 recorded`
  );
}

function clearRecordedPain() {
  recordedPainEl.classList.add("hidden");
  recordedPainEl.classList.remove("is-moderate", "is-high");
  recordedPainEl.removeAttribute("aria-label");
}

function acknowledgeRecordedPain(completed) {
  renderRecordedPain(completed);

  const level = completed.painLevel;
  const acknowledgement =
    `Thank you. I have recorded your pain level as ${level} out of 10. We will continue gently.`;
  let continued = false;
  let fallbackTimer = null;
  const continueOnce = () => {
    if (continued) return;
    continued = true;
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    continueAfterPainCheckin(completed);
  };

  const spoken = voiceGuidance.speak(acknowledgement, {
    key: `checkin:${completed.context}:recorded:${level}`,
    interrupt: true,
    onEnd: continueOnce,
  });

  if (spoken) fallbackTimer = window.setTimeout(continueOnce, 3500);
  else window.setTimeout(continueOnce, 200);
}

function startPainVoiceListening({ expectedStage = null } = {}) {
  if (
    !painCheckinState ||
    (expectedStage && painCheckinState.stage !== expectedStage)
  ) {
    return false;
  }

  return voiceGuidance.listen({
    onStatus: (status) => {
      voiceCheckinStatusEl.textContent = status;
    },
    onError: (message) => {
      if (handsFreeVoiceEnabled) {
        painCheckinEl.classList.remove("hands-free-checkin");
      }
      voiceCheckinStatusEl.textContent =
        `${message} You can also use the large on-screen choices.`;
    },
    onResult: (transcript) => {
      voiceCheckinStatusEl.textContent = `I heard: “${transcript}”`;
      if (painCheckinState?.stage === "pain") {
        acceptPainLevel(parsePainLevel(transcript));
      } else if (painCheckinState?.stage === "confirm-pain") {
        acceptPainConfirmation(parseConfirmationResponse(transcript));
      } else if (isPainSafetyStage()) {
        const stage = painCheckinState.stage.replace("safety-", "");
        if (stage !== "outcome") {
          acceptPainSafetyResponse(parsePainSafetyResponse(stage, transcript));
        }
      } else {
        acceptRecoveryStatus(parseRecoveryStatus(transcript));
      }
    },
  });
}

function speakPainPrompt(question, key, expectedStage) {
  const beginListening = () => {
    if (
      handsFreeVoiceEnabled &&
      painCheckinState?.stage === expectedStage
    ) {
      startPainVoiceListening({ expectedStage });
    }
  };
  const spoken = voiceGuidance.speak(question, {
    key,
    interrupt: true,
    onEnd: beginListening,
  });
  if (!spoken && handsFreeVoiceEnabled) {
    window.setTimeout(beginListening, 200);
  }
}

function showPainCheckin(context = "after", {
  startAfter = false,
  continuation = "",
  calibrationTrigger = null,
} = {}) {
  if (!isLoggedIn()) {
    continueAfterPainCheckin({
      startAfter,
      continuation,
      calibrationTrigger,
    });
    return;
  }

  if (context === "before") clearRecordedPain();

  painCheckinState = {
    context,
    startAfter,
    continuation,
    calibrationTrigger,
    stage: "pain",
    painLevel: null,
    recoveryStatus: "",
    safetyAnswers: null,
  };
  painCheckinContextEl.textContent =
    context === "before" ? "Before exercise" : "After exercise";
  painCheckinTitleEl.innerHTML =
    `${escapeHtml(painQuestion(context))} <span>(0 = none, 10 = severe)</span>`;
  painLevelChoicesEl.classList.remove("hidden");
  painConfirmationEl.classList.add("hidden");
  recoveryChoicesEl.classList.add("hidden");
  painSafetyInterviewEl.classList.add("hidden");
  painSkipBtn.classList.remove("hidden");
  voiceCheckinStatusEl.textContent = handsFreeVoiceEnabled
    ? (
      "Hands-free voice is on. Listen to the question, then say "
      + "a number from zero to ten."
    )
    : voiceGuidance.canListen
      ? "Choose a number, or use Answer by voice as a fallback."
    : "Voice input is unavailable in this browser. Choose a button.";
  updatePainCheckinPresentation();
  painCheckinEl.classList.remove("hidden");
  if (startAfter || continuation) toggleBtn.disabled = true;

  speakPainPrompt(
    painQuestion(context),
    `checkin:${context}:pain`,
    "pain"
  );
}

function hidePainCheckin() {
  voiceGuidance.cancel();
  painCheckinEl.classList.add("hidden");
  painCheckinEl.classList.remove(
    "hands-free-checkin",
    "safety-interview-active"
  );
  painSafetyInterviewEl.classList.add("hidden");
  voiceCheckinStatusEl.textContent = "";
  painCheckinState = null;
  toggleBtn.disabled = false;
}

function shouldAskRecovery() {
  return profile.carePath === "clinician";
}

function beginRecoveryQuestion() {
  if (!painCheckinState) return;
  voiceGuidance.cancel();
  painCheckinState.stage = "recovery";
  painLevelChoicesEl.classList.add("hidden");
  painConfirmationEl.classList.add("hidden");
  recoveryChoicesEl.classList.remove("hidden");
  painSafetyInterviewEl.classList.add("hidden");
  painSkipBtn.classList.remove("hidden");
  updatePainCheckinPresentation();
  painCheckinTitleEl.textContent = recoveryQuestion(painCheckinState.context);
  voiceCheckinStatusEl.textContent = handsFreeVoiceEnabled
    ? "Listening will start after the question. Say better, same, worse, or not sure."
    : voiceGuidance.canListen
      ? "Choose an answer, or use Answer by voice as a fallback."
    : "Choose the answer that fits best.";
  speakPainPrompt(
    recoveryQuestion(painCheckinState.context),
    `checkin:${painCheckinState.context}:recovery`,
    "recovery"
  );
}

function finishPainCheckin() {
  if (!painCheckinState) return;
  const completed = { ...painCheckinState };

  postPainCheckin({
    pain_level: completed.painLevel,
    timing: completed.context,
    recovery_status: completed.recoveryStatus,
    checked_at: new Date().toISOString(),
  }).catch(() => {});

  if (completed.context === "before") {
    preExerciseCheckinCompleted = true;
    confirmedPreExercisePain = completed.painLevel;
  }
  hidePainCheckin();
  acknowledgeRecordedPain(completed);
}

function requiresPainSafetyInterview() {
  const level = painCheckinState?.painLevel;
  const increase =
    painCheckinState?.context === "after" &&
    Number.isInteger(confirmedPreExercisePain)
      ? level - confirmedPreExercisePain
      : 0;
  return Number.isInteger(level) && (level >= 7 || increase >= 2);
}

function createPainSafetyAnswers() {
  return {
    urgentSymptoms: "",
    painLocation: "",
    painSide: "",
    painFamiliarity: "",
    onsetTiming: "",
    restTrend: "",
    safeMovement: "",
    outcome: "",
    reportForPhysiotherapist: false,
    exerciseId: engine.exercise?.id ?? "",
    exerciseName: engine.exercise?.name ?? "",
    repsCompleted: completedSessionReps + (engine.repCount ?? 0),
    setNumber: completedSetCount + 1,
  };
}

function painSafetyStageName() {
  return isPainSafetyStage()
    ? painCheckinState.stage.replace("safety-", "")
    : "";
}

function renderPainSafetyStage(stageName, { announceReassurance = false } = {}) {
  if (!painCheckinState || !PAIN_SAFETY_STEPS[stageName]) return;
  const step = PAIN_SAFETY_STEPS[stageName];
  painCheckinState.stage = `safety-${stageName}`;
  painLevelChoicesEl.classList.add("hidden");
  painConfirmationEl.classList.add("hidden");
  recoveryChoicesEl.classList.add("hidden");
  painSafetyInterviewEl.classList.remove("hidden", "is-urgent", "is-outcome");
  painSkipBtn.classList.add("hidden");
  painCheckinTitleEl.textContent = "Let’s check that you are safe";
  painSafetyHeadingEl.textContent = "Please stay resting";
  painSafetyMessageEl.textContent = PAIN_SAFETY_REASSURANCE;
  painSafetyQuestionEl.textContent = step.question;
  painSafetyHelpEl.textContent = step.help;
  painSafetyChoicesEl.replaceChildren();
  step.choices.forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pain-safety-choice";
    button.dataset.painSafetyResponse = value;
    button.textContent = label;
    painSafetyChoicesEl.appendChild(button);
  });
  voiceCheckinStatusEl.textContent = voiceGuidance.canListen
    ? "You can answer by voice after the question, or choose a large button."
    : "Choose the answer that fits best.";
  updatePainCheckinPresentation();
  const spokenPrompt = announceReassurance
    ? `${PAIN_SAFETY_REASSURANCE} ${step.question}`
    : step.question;
  speakPainPrompt(
    spokenPrompt,
    `checkin:${painCheckinState.context}:safety:${stageName}`,
    `safety-${stageName}`
  );
}

function beginPainSafetyInterview() {
  if (!painCheckinState) return;
  voiceGuidance.cancel();
  if (running) {
    deactivateCameraGuide({
      statusMessage: "Camera paused for a pain safety check",
    });
  }
  painCheckinState.startAfter = false;
  painCheckinState.continuation = "";
  painCheckinState.calibrationTrigger = null;
  painCheckinState.safetyAnswers = createPainSafetyAnswers();
  renderPainSafetyStage("urgent", { announceReassurance: true });
}

function determinePainSafetyOutcome() {
  const answers = painCheckinState?.safetyAnswers ?? {};
  if (answers.urgentSymptoms !== "no" || answers.safeMovement === "help") {
    return "urgent";
  }
  if (
    painCheckinState.painLevel >= 7 ||
    answers.restTrend !== "better" ||
    answers.safeMovement !== "safe"
  ) {
    return "professional";
  }
  return "monitor";
}

function renderPainSafetyOutcome(forcedOutcome = "") {
  if (!painCheckinState?.safetyAnswers) return;
  voiceGuidance.cancel();
  const outcome = forcedOutcome || determinePainSafetyOutcome();
  painCheckinState.safetyAnswers.outcome = outcome;
  painCheckinState.stage = "safety-outcome";
  painSafetyInterviewEl.classList.remove("hidden");
  painSafetyInterviewEl.classList.add("is-outcome");
  painSafetyInterviewEl.classList.toggle("is-urgent", outcome === "urgent");
  painSafetyChoicesEl.replaceChildren();

  let heading = "End this exercise for today";
  let message =
    "Your pain increase has been recorded. Rest and monitor how you feel before doing more exercise.";
  let help =
    "Do not restart this exercise today. This guidance is not a diagnosis.";
  if (outcome === "urgent") {
    heading = "Stop exercising and get help now";
    message =
      "Do not continue exercising. If these symptoms are severe, new, or worsening, call local emergency services now.";
    help =
      "PhysioVision has not contacted an emergency service or another person. Ask someone nearby for help if you can do so safely.";
  } else if (outcome === "professional") {
    heading = "Pause today’s programme and seek professional advice";
    message =
      "Your pain is substantial, has not improved after resting, or you may need help moving safely.";
    help =
      "Please stop today’s exercise and consider contacting a qualified healthcare professional. This is not a diagnosis.";
  }

  painCheckinTitleEl.textContent = "Your safety check is complete";
  painSafetyHeadingEl.textContent = heading;
  painSafetyMessageEl.textContent = message;
  painSafetyQuestionEl.textContent = "What happens next";
  painSafetyHelpEl.textContent = profile.carePath === "clinician"
    ? `${help} You may also save this report for your physiotherapist to review. This does not notify them or change your prescribed plan.`
    : help;

  if (profile.carePath === "clinician") {
    const reportButton = document.createElement("button");
    reportButton.type = "button";
    reportButton.className = "pain-safety-choice is-primary";
    reportButton.dataset.painSafetyAction = "save-report";
    reportButton.textContent = "Save for my physiotherapist to review";
    painSafetyChoicesEl.appendChild(reportButton);
  }
  const finishButton = document.createElement("button");
  finishButton.type = "button";
  finishButton.className = "pain-safety-choice";
  finishButton.dataset.painSafetyAction = "finish";
  finishButton.textContent = profile.carePath === "clinician"
    ? "Finish without saving a review report"
    : "Finish safety check";
  painSafetyChoicesEl.appendChild(finishButton);

  voiceCheckinStatusEl.textContent =
    "The camera remains paused. Choose an option below when you are ready.";
  updatePainCheckinPresentation();
  voiceGuidance.speak(`${heading}. ${message} ${help}`, {
    key: `checkin:${painCheckinState.context}:safety-outcome:${outcome}`,
    interrupt: true,
  });
}

function acceptPainSafetyResponse(response) {
  const stageName = painSafetyStageName();
  const step = PAIN_SAFETY_STEPS[stageName];
  if (!painCheckinState?.safetyAnswers || !step) return;
  const allowed = step.choices.map(([value]) => value);
  if (!allowed.includes(response)) {
    voiceCheckinStatusEl.textContent =
      "I could not match that answer. Please try again or choose a large button.";
    return;
  }
  painCheckinState.safetyAnswers[step.field] = response;
  if (stageName === "urgent" && response !== "no") {
    renderPainSafetyOutcome("urgent");
    return;
  }
  if (step.next === "outcome") {
    renderPainSafetyOutcome();
    return;
  }
  renderPainSafetyStage(step.next);
}

function finishPainSafetyInterview({ reportForPhysiotherapist = false } = {}) {
  if (!painCheckinState?.safetyAnswers) return;
  const completed = {
    ...painCheckinState,
    safetyAnswers: {
      ...painCheckinState.safetyAnswers,
      reportForPhysiotherapist,
    },
  };
  const answers = completed.safetyAnswers;
  postPainCheckin({
    pain_level: completed.painLevel,
    timing: completed.context,
    recovery_status: answers.restTrend || completed.recoveryStatus,
    location_notes: [answers.painSide, answers.painLocation]
      .filter(Boolean)
      .join(" "),
    safety_follow_up: {
      urgent_symptoms: answers.urgentSymptoms,
      pain_location: answers.painLocation,
      pain_side: answers.painSide,
      pain_familiarity: answers.painFamiliarity,
      onset_timing: answers.onsetTiming,
      rest_trend: answers.restTrend,
      safe_movement: answers.safeMovement,
      outcome: answers.outcome,
      report_for_physiotherapist: reportForPhysiotherapist,
      exercise_id: answers.exerciseId,
      exercise_name: answers.exerciseName,
      reps_completed: answers.repsCompleted,
      set_number: answers.setNumber,
    },
    requires_review:
      answers.outcome !== "monitor" || reportForPhysiotherapist,
    checked_at: new Date().toISOString(),
  }).catch(() => {});

  preExerciseCheckinCompleted = false;
  confirmedPreExercisePain = null;
  hidePainCheckin();
  renderRecordedPain(completed);
  statusEl.textContent = "Exercise paused after pain safety check";
  cameraSessionHintEl.textContent =
    "The exercise was not marked finished, but it should not be restarted today.";
  setFeedbackBanner("tracking", "Rest and follow the safety guidance recorded in your check-in");
  const savedMessage = reportForPhysiotherapist
    ? "Your pain and safety answers were saved for your physiotherapist to review. They were not automatically notified."
    : "Your pain and safety answers were recorded. The camera remains paused.";
  voiceGuidance.speak(savedMessage, {
    key: `checkin:${completed.context}:safety-saved:${reportForPhysiotherapist}`,
    interrupt: true,
  });
}

function acceptPainLevel(level) {
  if (!painCheckinState || !Number.isInteger(level) || level < 0 || level > 10) {
    voiceCheckinStatusEl.textContent =
      "Please choose or say one number from zero to ten.";
    return;
  }
  painCheckinState.painLevel = level;
  beginPainConfirmation();
}

function beginPainConfirmation() {
  if (!painCheckinState || !Number.isInteger(painCheckinState.painLevel)) return;
  voiceGuidance.cancel();
  painCheckinState.stage = "confirm-pain";
  painLevelChoicesEl.classList.add("hidden");
  recoveryChoicesEl.classList.add("hidden");
  painSafetyInterviewEl.classList.add("hidden");
  painConfirmationEl.classList.remove("hidden");
  painSkipBtn.classList.add("hidden");
  updatePainCheckinPresentation();

  const level = painCheckinState.painLevel;
  const question = painConfirmationQuestion(level);
  painCheckinTitleEl.textContent = "Please confirm your pain level";
  painConfirmationSummaryEl.textContent = `Pain level ${level} out of 10`;
  voiceCheckinStatusEl.textContent = handsFreeVoiceEnabled
    ? "Listening will start after the confirmation question. Say yes or change."
    : voiceGuidance.canListen
      ? "Select Yes, continue or Change my answer. Voice input is also available."
      : "Select Yes, continue or Change my answer.";
  speakPainPrompt(
    question,
    `checkin:${painCheckinState.context}:pain-confirmation:${level}`,
    "confirm-pain"
  );
}

function returnToPainQuestion() {
  if (!painCheckinState) return;
  voiceGuidance.cancel();
  painCheckinState.stage = "pain";
  painCheckinState.painLevel = null;
  painCheckinTitleEl.innerHTML =
    `${escapeHtml(painQuestion(painCheckinState.context))} <span>(0 = none, 10 = severe)</span>`;
  painLevelChoicesEl.classList.remove("hidden");
  painConfirmationEl.classList.add("hidden");
  recoveryChoicesEl.classList.add("hidden");
  painSafetyInterviewEl.classList.add("hidden");
  painSkipBtn.classList.remove("hidden");
  updatePainCheckinPresentation();
  voiceCheckinStatusEl.textContent = handsFreeVoiceEnabled
    ? "Please say your pain level again, from zero to ten."
    : "Choose a different number.";
  speakPainPrompt(
    painQuestion(painCheckinState.context),
    `checkin:${painCheckinState.context}:pain:retry`,
    "pain"
  );
}

function acceptPainConfirmation(response) {
  if (!painCheckinState || painCheckinState.stage !== "confirm-pain") return;
  if (response === "change") {
    returnToPainQuestion();
    return;
  }
  if (response !== "confirm") {
    voiceCheckinStatusEl.textContent =
      "Please say yes or change, or use one of the confirmation buttons.";
    return;
  }
  if (requiresPainSafetyInterview()) beginPainSafetyInterview();
  else if (shouldAskRecovery()) beginRecoveryQuestion();
  else finishPainCheckin();
}

function acceptRecoveryStatus(status) {
  if (
    !painCheckinState ||
    !["better", "same", "worse", "unsure"].includes(status)
  ) {
    voiceCheckinStatusEl.textContent =
      "Please say better, same, worse, or not sure.";
    return;
  }
  painCheckinState.recoveryStatus = status;
  finishPainCheckin();
}

painCheckinEl.querySelectorAll("[data-pain]").forEach(btn => {
  btn.addEventListener("click", () => {
    acceptPainLevel(parseInt(btn.dataset.pain, 10));
  });
});

painCheckinEl.querySelectorAll("[data-recovery]").forEach((btn) => {
  btn.addEventListener("click", () => {
    acceptRecoveryStatus(btn.dataset.recovery);
  });
});

painCheckinEl.querySelectorAll("[data-pain-confirmation]").forEach((btn) => {
  btn.addEventListener("click", () => {
    acceptPainConfirmation(btn.dataset.painConfirmation);
  });
});

painSafetyChoicesEl.addEventListener("click", (event) => {
  const responseButton = event.target.closest("[data-pain-safety-response]");
  if (responseButton) {
    acceptPainSafetyResponse(responseButton.dataset.painSafetyResponse);
    return;
  }
  const actionButton = event.target.closest("[data-pain-safety-action]");
  if (actionButton?.dataset.painSafetyAction === "save-report") {
    finishPainSafetyInterview({ reportForPhysiotherapist: true });
  } else if (actionButton?.dataset.painSafetyAction === "finish") {
    finishPainSafetyInterview();
  }
});

painVoiceInputBtn.addEventListener("click", () => {
  startPainVoiceListening();
});

painSkipBtn.addEventListener("click", () => {
  if (isPainSafetyStage()) return;
  const completed = painCheckinState ? { ...painCheckinState } : null;
  if (completed?.context === "before") {
    preExerciseCheckinCompleted = true;
    confirmedPreExercisePain = null;
  }
  hidePainCheckin();
  if (completed) continueAfterPainCheckin(completed);
});

toggleBtn.addEventListener("click", () => {
  if (running) deactivateCameraGuide();
});

finishExerciseBtn.addEventListener("click", () => {
  if (!exerciseSessionActive) return;
  if (running) {
    deactivateCameraGuide({
      statusMessage: "Camera stopped — finishing exercise",
    });
  }
  completeExerciseSession();
  toggleBtn.classList.add("hidden");
  toggleBtn.innerHTML = 'Pause camera guide <span aria-hidden="true">Ⅱ</span>';
  finishExerciseBtn.disabled = true;
  preExerciseCheckinCompleted = false;
  confirmedPreExercisePain = null;
  renderPrimaryCameraAction();
  cameraSessionHintEl.textContent =
    "Exercise marked finished. Complete the optional check-in, or skip it.";
  statusEl.textContent = "Exercise marked finished";
  setFeedbackBanner("finished");
  showPainCheckin("after");
});

handTrackingToggle.addEventListener("click", async () => {
  if (handPreviewMode) stopHandPreview();
  else await startHandPreview();
});

fallSafetyOkay.addEventListener("click", () => {
  showFallSafetyResult("okay", activeFallEvent ?? {});
});

fallSafetyHelp.addEventListener("click", () => {
  showFallSafetyResult("help", activeFallEvent ?? {});
});

fallSafetyVoice.addEventListener("click", () => {
  startFallSafetyVoiceListening();
});

fallSafetyClose.addEventListener("click", closeFallSafetyCheck);

syncPracticeAccess();

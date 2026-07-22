import {
  PoseLandmarker,
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

import { jointAngles, symmetry, VISIBILITY_THRESHOLD } from "./geometry.js";
import { selectTrackedHand, summarizeHandResult } from "./hand-geometry.js";
import {
  TRACKING_MODES,
  exerciseUsesHand,
  measureCombinedWristFrame,
  measureHandSequenceFrame,
} from "./exercise-tracking.js";
import { FeedbackEngine, EXERCISES } from "./feedback/engine.js";
import { POSES } from "./poses.js";
import {
  createCalibration,
  extractCalibrationFrame,
  getCalibration,
  hasSavedProfile,
  loadProfile,
  saveCalibration,
  validateCalibrationCapture,
} from "./personalization.js";
import { postSession, postPainCheckin, postCalibration, isLoggedIn } from "./api.js";

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
const feedbackEl         = document.getElementById("feedbackBanner");
const cameraStage        = document.getElementById("cameraStage");
const personalizationTitle  = document.getElementById("personalizationTitle");
const personalizationDetail = document.getElementById("personalizationDetail");
const calibrationBadge      = document.getElementById("calibrationBadge");
const calibrationDetail     = document.getElementById("calibrationDetail");
const openCalibrationBtn    = document.getElementById("openCalibration");
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

let profile = loadProfile();
let poseLandmarker = null;
let handLandmarker = null;
let sessionStartedAt = null;

// Accumulated per-session stats (reset on each camera start)
const sessionCueCounts = {};
let sessionSymmetryWarnings = 0;
const sessionAngleStats = {}; // {angleName: {min, max, sum, count}}

// ── Hold timer state ──────────────────────────────────────────────────────────
let holdInterval  = null;
let holdRemaining = 0;
let holdTotal     = 0;

// ── Personal calibration state ───────────────────────────────────────────────
const CALIBRATION_CAPTURE_MS = 1800;
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
  opt.textContent = ex.requiresClinicianPlan
    ? `${ex.name} · clinician plan`
    : ex.name;
  exSelect.appendChild(opt);
});

function refreshExerciseAccess() {
  EXERCISES.forEach((exercise) => {
    const option = [...exSelect.options].find((item) => item.value === exercise.id);
    if (!option) return;
    option.disabled = Boolean(
      exercise.requiresClinicianPlan && profile.carePath !== "clinician"
    );
  });
}

refreshExerciseAccess();

sideSelect.value = profile.focusSide;
let engine = new FeedbackEngine(
  EXERCISES[0].id,
  profile.focusSide,
  getCalibration(EXERCISES[0].id)
);
renderPrescription(engine.exercise);
renderTrackingWarning(engine.exercise);
renderPoseStrip(engine.exercise, engine.stages[0]);
renderStaticPhaseFlow(engine);
renderPersonalization();

exSelect.addEventListener("change", () => {
  flushSession();
  cancelCalibration();
  engine.changeExercise(
    exSelect.value,
    sideSelect.value,
    getCalibration(exSelect.value)
  );
  smoother.state = {};
  combinedPoseHistory = [];
  clearHoldTimer(engine.exercise.prescription.holdSeconds);
  holdTimerSection.classList.add("hidden");
  progressSection.classList.remove("hidden");
  renderPrescription(engine.exercise);
  renderTrackingWarning(engine.exercise);
renderPoseStrip(engine.exercise, engine.stages[0]);
renderStaticPhaseFlow(engine);
  repCountEl.textContent = "0";
  cueListEl.innerHTML = "";
  symWarnEl.classList.add("hidden");
  progressEl.style.width = "0%";
  progressLbl.textContent = "Position yourself to start";
  setFeedbackBanner("ready");
  renderPersonalization();
});

sideSelect.addEventListener("change", () => {
  cancelCalibration();
  engine.changeExercise(
    exSelect.value,
    sideSelect.value,
    getCalibration(exSelect.value)
  );
  smoother.state = {};
  combinedPoseHistory = [];
  repCountEl.textContent = "0";
  progressEl.style.width = "0%";
  setFeedbackBanner("ready");
  renderPersonalization();
});

window.addEventListener("physiovision:profile-updated", (event) => {
  cancelCalibration();
  profile = event.detail;
  refreshExerciseAccess();
  if (exSelect.selectedOptions[0]?.disabled) {
    exSelect.value = EXERCISES.find((exercise) => !exercise.requiresClinicianPlan)?.id
      ?? EXERCISES[0].id;
    exSelect.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  sideSelect.value = profile.focusSide;
  engine.changeExercise(
    exSelect.value,
    sideSelect.value,
    getCalibration(exSelect.value)
  );
  smoother.state = {};
  repCountEl.textContent = "0";
  progressEl.style.width = "0%";
  setFeedbackBanner("ready");
  renderPersonalization();
});

// ── MediaPipe setup ───────────────────────────────────────────────────────────

async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });

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

const drawingUtils = new DrawingUtils(ctx);
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
    (frame) => timestampMs - frame.timestampMs <= 800
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
        const measurements = measureHandSequenceFrame({
          handResult,
          side: sideSelect.value,
          frame: { width: video.videoWidth, height: video.videoHeight },
        });
        const feedback = updateFeedbackPanel(measurements, frameTimestamp);
        statusEl.textContent = feedback.trackingReady
          ? "Tracking the hand-shape sequence"
          : "Keep one complete hand close and fully visible";
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
        const measurements = measureCombinedWristFrame({
          poseResult,
          handResult,
          side: sideSelect.value,
          frame: { width: video.videoWidth, height: video.videoHeight },
          poseHistory: combinedPoseHistory,
        });
        updateDebugPanel(measurements);
        const feedback = updateFeedbackPanel(measurements, frameTimestamp);
        statusEl.textContent = feedback.trackingReady
          ? "Tracking your elbow, wrist and hand together"
          : "Keep the working elbow and complete hand visible";
      } else {
        const result = poseLandmarker.detectForVideo(video, frameTimestamp);
        if (result.landmarks.length > 0) {
          const landmarks = result.landmarks[0];
          drawPoseResult(result);

          // worldLandmarks for angle math, landmarks for visibility gating
          const raw = jointAngles(result.worldLandmarks[0], landmarks);
          const angles = Object.fromEntries(
            Object.entries(raw).map(([k, a]) => [k, smoother.smooth(k, a)])
          );

          updateDebugPanel(angles);
          if (calibrationSession) {
            updateCalibrationCapture(angles, frameTimestamp);
            statusEl.textContent = "Personal calibration in progress";
          } else {
            updateFeedbackPanel(angles, frameTimestamp);
            statusEl.textContent = "Tracking your movement";
          }
        } else {
          updateCalibrationCapture(null, frameTimestamp);
          const interruptedHold = engine.inHold;
          if (holdInterval) {
            clearHoldTimer(engine.exercise.prescription.holdSeconds);
          }
          statusEl.textContent = "Step back so your full body is visible";
          setFeedbackBanner(
            "position",
            interruptedHold
              ? "Hold reset — return to the stretch to restart"
              : ""
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

function updateFeedbackPanel(angles, timestampMs) {
  const fb = engine.update(angles, timestampMs);
  const holdSeconds = fb.exercise.trackingHoldSeconds
    ?? fb.exercise.prescription.holdSeconds
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

  // Rep counter
  repCountEl.textContent = fb.repCount;

  // Highlight active pose card without re-rendering the whole strip
  poseStripEl.querySelectorAll(".pose-card").forEach((card, i) => {
    card.classList.toggle("active", i === fb.stageIndex);
  });

  // Phase flow chips
  phaseFlowEl.innerHTML = fb.stages
    .map((s, i) => {
      const active = s === fb.phase ? " active" : "";
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
    const nextIdx = fb.stages.indexOf(fb.phase) + 1;
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
  if (fb.inHold && !fb.holdPositionMaintained) {
    setFeedbackBanner(
      fb.trackingReady ? "adjust" : "tracking",
      "Hold reset — return to the target position to restart"
    );
  } else if (!fb.trackingReady) {
    setFeedbackBanner(
      "tracking",
      fb.inHold
        ? "Hold reset — keep the required joints visible to restart"
        : ""
    );
  } else if (!fb.sequenceOnTrack && fb.positionRecognized) {
    setFeedbackBanner(
      "adjust",
      `Follow the order — move to ${fb.expectedNextPhase.replaceAll("_", " ")} next`
    );
  } else if (!fb.positionRecognized && !personalizedCues.length) {
    const nextIdx = fb.stages.indexOf(fb.phase) + 1;
    const nextPhase = fb.stages[nextIdx] ?? fb.stages[0];
    setFeedbackBanner(
      "adjust",
      `Move slowly toward the ${nextPhase.replaceAll("_", " ")} position`
    );
  } else {
    setFeedbackBanner(
      personalizedCues.length ? "adjust" : "good",
      personalizedCues[0]
    );
  }

  // Symmetry warning
  if (fb.symmetryWarning) {
    symWarnEl.textContent = fb.symmetryWarning;
    symWarnEl.classList.remove("hidden");
  } else {
    symWarnEl.classList.add("hidden");
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
  const calibration = getCalibration(exSelect.value);
  const supportsCalibration = Boolean(engine.exercise.calibration);

  personalizationTitle.textContent = savedProfile
    ? `Guidance for ${profile.name || "you"}`
    : "Set up your profile";
  personalizationDetail.textContent = savedProfile
    ? `${profile.goal} · ${cueStyleLabel(profile.cueStyle)} coaching`
    : "Save your goals, preferences, and comfortable range.";

  if (calibration) {
    const kneeValues = [
      calibration.target?.leftKnee?.median,
      calibration.target?.rightKnee?.median,
    ].filter(Number.isFinite);
    const depth = kneeValues.length
      ? `${Math.round(kneeValues.reduce((sum, value) => sum + value, 0) / kneeValues.length)}° knee target`
      : "comfortable target saved";
    calibrationBadge.textContent = "Personal range active";
    calibrationDetail.textContent = `${depth} · safety limits unchanged`;
    openCalibrationBtn.textContent = "Recalibrate";
  } else if (supportsCalibration) {
    calibrationBadge.textContent = "Standard range";
    calibrationDetail.textContent = `Calibrate ${engine.exercise.name} to your comfortable depth.`;
    openCalibrationBtn.textContent = "Calibrate";
  } else {
    calibrationBadge.textContent = "Standard range";
    calibrationDetail.textContent = "Personal calibration is currently available for Half Squats.";
    openCalibrationBtn.textContent = "Unavailable";
  }

  openCalibrationBtn.disabled = !poseLandmarker || !supportsCalibration;
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

openCalibrationBtn.addEventListener("click", async () => {
  if (!engine.exercise.calibration) return;
  if (!running && !(await activateCameraGuide())) return;

  calibrationDraft = null;
  calibrationSession = {
    exerciseId: engine.exercise.id,
    step: "intro",
    startFrames: null,
    targetCaptures: [],
    capture: null,
  };
  calibrationOverlay.classList.remove("hidden");
  renderCalibrationStep();
  calibrationAction.focus();
});

calibrationCancel.addEventListener("click", cancelCalibration);

calibrationAction.addEventListener("click", () => {
  if (!calibrationSession) return;

  if (calibrationSession.step === "intro") {
    calibrationSession.step = "start";
    renderCalibrationStep();
  } else if (calibrationSession.step === "start") {
    beginCalibrationCapture("start");
  } else if (calibrationSession.step === "target") {
    beginCalibrationCapture("target");
  } else if (calibrationSession.step === "result" && calibrationDraft) {
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
    renderPersonalization();
    setFeedbackBanner("ready");
    cancelCalibration();
    statusEl.textContent = "Personal range saved — movement guide ready";
  }
});

function renderCalibrationStep() {
  if (!calibrationSession) return;
  const dots = [...calibrationOverlay.querySelectorAll(".calibration-dots span")];
  const stepIndex = { intro: 0, start: 1, target: 2, result: 3 }[
    calibrationSession.step
  ];
  dots.forEach((dot, index) => dot.classList.toggle("active", index <= stepIndex));
  calibrationStatus.textContent = "";
  calibrationResult.classList.add("hidden");
  calibrationAction.disabled = false;

  if (calibrationSession.step === "intro") {
    calibrationStepLabel.textContent = "Personal calibration · about 1 minute";
    calibrationTitle.textContent = `Fit ${engine.exercise.name} to your movement`;
    calibrationInstructions.textContent =
      "Keep a sturdy chair nearby. We’ll measure your natural standing position, then three comfortable half-squat depths. Stop if you feel pain, dizziness, or unsteadiness.";
    calibrationAction.textContent = "Begin";
  } else if (calibrationSession.step === "start") {
    calibrationStepLabel.textContent = "Step 1 · Starting position";
    calibrationTitle.textContent = "Stand naturally and look forward";
    calibrationInstructions.textContent =
      "Keep both feet, knees, hips, shoulders, and your head visible. Hold still while we measure for two seconds.";
    calibrationAction.textContent = "Measure standing position";
  } else if (calibrationSession.step === "target") {
    const nextRep = calibrationSession.targetCaptures.length + 1;
    calibrationStepLabel.textContent = `Step 2 · Comfortable squat ${nextRep} of 3`;
    calibrationTitle.textContent = "Move to a comfortable half squat";
    calibrationInstructions.textContent =
      "Use the chair for support if needed. Keep your chest lifted and knees over your feet, then hold your comfortable depth.";
    calibrationAction.textContent = `Measure squat ${nextRep}`;
  } else {
    const knees = [
      calibrationDraft?.target.leftKnee?.median,
      calibrationDraft?.target.rightKnee?.median,
    ].filter(Number.isFinite);
    const target = knees.length
      ? Math.round(knees.reduce((sum, value) => sum + value, 0) / knees.length)
      : null;
    calibrationStepLabel.textContent = "Step 3 · Review";
    calibrationTitle.textContent = "Your personal range is ready";
    calibrationInstructions.textContent =
      "This adjusts when a comfortable squat is recognized. Form and safety limits are not relaxed.";
    calibrationResult.innerHTML = `
      <span><strong>${target ?? "—"}°</strong>comfortable knee target</span>
      <span><strong>${calibrationDraft?.naturalKneeDifference ?? "—"}°</strong>natural left/right difference</span>
    `;
    calibrationResult.classList.remove("hidden");
    calibrationAction.textContent = "Save personal range";
  }
  calibrationAction.focus();
}

function beginCalibrationCapture(type) {
  calibrationSession.capture = {
    type,
    startedAt: performance.now(),
    frames: [],
  };
  calibrationAction.disabled = true;
  calibrationStatus.textContent = "Measuring… hold this position";
}

function updateCalibrationCapture(angles, timestampMs) {
  const capture = calibrationSession?.capture;
  if (!capture) return;

  if (angles) {
    const frame = extractCalibrationFrame(
      engine.exercise,
      angles,
      sideSelect.value
    );
    if (frame) capture.frames.push(frame);
  }

  const remaining = Math.max(
    0,
    Math.ceil((CALIBRATION_CAPTURE_MS - (timestampMs - capture.startedAt)) / 1000)
  );
  calibrationStatus.textContent = angles
    ? `Measuring… ${remaining || "almost done"}`
    : "Pause — make sure your full body is visible";

  if (timestampMs - capture.startedAt < CALIBRATION_CAPTURE_MS) return;
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
      calibrationSession.startFrames = capture.frames;
      calibrationSession.step = "target";
    } else {
      calibrationSession.targetCaptures.push(capture.frames);
      if (calibrationSession.targetCaptures.length >= 3) {
        calibrationDraft = createCalibration(engine.exercise, {
          affectedSide: sideSelect.value,
          startFrames: calibrationSession.startFrames,
          targetCaptures: calibrationSession.targetCaptures,
        });
        calibrationSession.step = "result";
      }
    }
    renderCalibrationStep();
  } catch (error) {
    calibrationAction.disabled = false;
    calibrationStatus.textContent = `${error.message} Try again.`;
  }
}

function cancelCalibration() {
  const wasActive = Boolean(calibrationSession);
  calibrationSession = null;
  calibrationDraft = null;
  calibrationOverlay?.classList.add("hidden");
  if (wasActive) openCalibrationBtn?.focus();
}

// ── Static panel renders ──────────────────────────────────────────────────────

function renderPoseStrip(exercise, activePhase) {
  const images = exercise.stageImages ?? [];
  const stages = engine.stages;
  if (!images.length) { poseStripEl.innerHTML = ""; return; }

  poseStripEl.innerHTML = images.map((poseKey, i) => {
    const svg = POSES[poseKey] ?? "";
    const isLandscape = svg.includes('viewBox="0 0 160');
    const isActive = stages[i] === activePhase;
    const label = stages[i] ?? "";
    const arrow = i < images.length - 1
      ? `<span class="pose-arrow-sep">→</span>`
      : "";
    return `
      <div class="pose-card${isActive ? " active" : ""}">
        ${svg.replace("<svg ", `<svg class="${isLandscape ? "landscape" : ""}" `)}
        <span class="pose-label">${label}</span>
      </div>
      ${arrow}`;
  }).join("");
}

function renderPrescription(ex) {
  const p = ex.prescription;
  if (p.mode === "clinician_plan") {
    prescEl.textContent = "Follow your clinician-approved dose";
    if (repTargetEl) repTargetEl.textContent = "—";
  } else {
    prescEl.textContent =
      `${p.sets} sets × ${p.reps} reps` +
      (p.holdSeconds ? ` · hold ${p.holdSeconds}s` : "") +
      ` · ${p.daysPerWeek} days/week`;
    if (repTargetEl) repTargetEl.textContent = p.reps;
  }

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
  if (ex.trackingWarning) {
    trackWarnEl.textContent = ex.trackingWarning;
    trackWarnEl.classList.remove("hidden");
  } else {
    trackWarnEl.classList.add("hidden");
  }
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
  } else {
    symbol.textContent = "●";
    title.textContent = "Get into position";
    detail.textContent = "Your guidance will appear here";
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────

async function activateCameraGuide() {
  if (running) return true;
  if (exerciseUsesHand(engine.exercise) && !handLandmarker) {
    statusEl.textContent = "The hand-tracking model is unavailable";
    setFeedbackBanner(
      "tracking",
      "Reload with an internet connection or choose a Pose-only exercise"
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
  try {
    toggleBtn.disabled = true;
    handTrackingToggle.disabled = true;
    statusEl.textContent = "Starting camera…";
    await startCamera();
    running = true;
    lastVideoTime = -1;
    combinedPoseHistory = [];
    sessionStartedAt = new Date().toISOString();
    Object.keys(sessionCueCounts).forEach(k => delete sessionCueCounts[k]);
    Object.keys(sessionAngleStats).forEach(k => delete sessionAngleStats[k]);
    sessionSymmetryWarnings = 0;
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
    }
    toggleBtn.innerHTML = 'Stop camera guide <span aria-hidden="true">■</span>';
    toggleBtn.disabled = false;
    renderFrame();
    return true;
  } catch (err) {
    statusEl.textContent = `Camera error: ${err.message}`;
    toggleBtn.disabled = false;
    handTrackingToggle.disabled = !handLandmarker;
    return false;
  }
}

function deactivateCameraGuide() {
  running = false;
  cancelAnimationFrame(rafId);
  cancelCalibration();
  if (holdInterval) {
    clearHoldTimer(engine.exercise.prescription.holdSeconds);
  }
  stopCamera();
  combinedPoseHistory = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  cameraStage?.classList.remove("camera-active");
  handFrameGuide.classList.add("hidden");
  handFrameGuide.classList.remove("is-arm-mode");
  setupTip.textContent = "Phone at chest height · 2–3 m away · Full body visible";
  toggleBtn.innerHTML = 'Start camera guide <span aria-hidden="true">→</span>';
  handTrackingToggle.disabled = !handLandmarker;
  statusEl.textContent = "Stopped";
  setFeedbackBanner("ready");

  flushSession();
  showPainCheckin();
}

async function startHandPreview() {
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
  toggleBtn.disabled = false;
  statusEl.textContent = "Movement guide ready";
  setFeedbackBanner("ready");
}

function flushSession() {
  if (!isLoggedIn() || engine.repCount === 0 || !sessionStartedAt) return;
  const endedAt = new Date().toISOString();
  const ex = engine.exercise;
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
    started_at:              sessionStartedAt,
    ended_at:                endedAt,
    sets_completed:          1,
    reps_completed:          engine.repCount,
    reps_target:             ex.prescription?.reps ?? engine.repCount,
    sets_target:             ex.prescription?.sets ?? 1,
    affected_side:           profile.focusSide ?? "right",
    cues_triggered:          cuesTriggered,
    symmetry_warnings_count: sessionSymmetryWarnings,
    angle_summaries:         angleSummaries,
  }).catch(() => {});

  // Reset for the next exercise
  sessionStartedAt = new Date().toISOString();
  Object.keys(sessionCueCounts).forEach(k => delete sessionCueCounts[k]);
  Object.keys(sessionAngleStats).forEach(k => delete sessionAngleStats[k]);
  sessionSymmetryWarnings = 0;
}

// ── Pain check-in ─────────────────────────────────────────────────────────────
const painCheckinEl = document.getElementById("painCheckin");
const painSkipBtn   = document.getElementById("painSkip");

function showPainCheckin() {
  if (!isLoggedIn()) return;
  painCheckinEl.classList.remove("hidden");
}

function hidePainCheckin() {
  painCheckinEl.classList.add("hidden");
}

painCheckinEl.querySelectorAll("[data-pain]").forEach(btn => {
  btn.addEventListener("click", () => {
    const level = parseInt(btn.dataset.pain, 10);
    postPainCheckin({
      pain_level: level,
      checked_at: new Date().toISOString(),
    }).catch(() => {});
    hidePainCheckin();
  });
});

painSkipBtn.addEventListener("click", hidePainCheckin);

toggleBtn.addEventListener("click", async () => {
  if (running) deactivateCameraGuide();
  else await activateCameraGuide();
});

handTrackingToggle.addEventListener("click", async () => {
  if (handPreviewMode) stopHandPreview();
  else await startHandPreview();
});

createLandmarker().catch((err) => {
  statusEl.textContent = "Movement model unavailable — check your connection";
});

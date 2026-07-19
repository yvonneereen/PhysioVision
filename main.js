import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

import { jointAngles, symmetry, VISIBILITY_THRESHOLD } from "./geometry.js";
import { FeedbackEngine, EXERCISES } from "./feedback/engine.js";

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
const statusEl    = document.getElementById("status");
const toggleBtn   = document.getElementById("toggle");
const fpsEl       = document.getElementById("fps");
const exSelect    = document.getElementById("exerciseSelect");
const sideSelect  = document.getElementById("sideSelect");
const repCountEl  = document.getElementById("repCount");
const phaseFlowEl = document.getElementById("phaseFlow");
const progressEl  = document.getElementById("progressFill");
const progressLbl = document.getElementById("progressLabel");
const cueListEl   = document.getElementById("cueList");
const symWarnEl   = document.getElementById("symWarning");
const trackWarnEl = document.getElementById("trackingWarning");
const prescEl     = document.getElementById("prescription");

// ── Exercise selector ─────────────────────────────────────────────────────────

EXERCISES.forEach((ex) => {
  const opt = document.createElement("option");
  opt.value = ex.id;
  opt.textContent = ex.name;
  exSelect.appendChild(opt);
});

let engine = new FeedbackEngine(EXERCISES[0].id, "right");
renderPrescription(engine.exercise);
renderTrackingWarning(engine.exercise);

exSelect.addEventListener("change", () => {
  engine.changeExercise(exSelect.value, sideSelect.value);
  smoother.state = {}; // reset smoothing on exercise change
  renderPrescription(engine.exercise);
  renderTrackingWarning(engine.exercise);
  repCountEl.textContent = "0";
  cueListEl.innerHTML = "";
  symWarnEl.classList.add("hidden");
  progressEl.style.width = "0%";
  progressLbl.textContent = "Position yourself to start";
});

sideSelect.addEventListener("change", () => {
  engine.changeExercise(exSelect.value, sideSelect.value);
  smoother.state = {};
});

// ── MediaPipe setup ───────────────────────────────────────────────────────────

let poseLandmarker;

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
  statusEl.textContent = "Model ready — click Start camera";
  toggleBtn.disabled = false;
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

// ── Render loop ───────────────────────────────────────────────────────────────

const drawingUtils = new DrawingUtils(ctx);
let running = false;
let rafId;
let lastVideoTime = -1;
let lastFrameStamp = performance.now();

function renderFrame() {
  if (!running) return;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = poseLandmarker.detectForVideo(video, performance.now());

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];

      drawingUtils.drawLandmarks(landmarks, {
        radius: 4,
        color: (data) =>
          (data?.from?.visibility ?? 1) < VISIBILITY_THRESHOLD
            ? "#f59e0b"
            : "#4ade80",
      });
      drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
        color: "#a7f3d0",
        lineWidth: 2,
      });

      // worldLandmarks for angle math, landmarks for visibility gating
      const raw = jointAngles(result.worldLandmarks[0], landmarks);
      const angles = Object.fromEntries(
        Object.entries(raw).map(([k, a]) => [k, smoother.smooth(k, a)])
      );

      updateDebugPanel(angles);
      updateFeedbackPanel(angles);
      statusEl.textContent = "Tracking";
    } else {
      statusEl.textContent = "No pose detected";
    }

    ctx.restore();

    const now = performance.now();
    fpsEl.textContent = (1000 / (now - lastFrameStamp)).toFixed(0);
    lastFrameStamp = now;
  }

  rafId = requestAnimationFrame(renderFrame);
}

// ── Panel updates ─────────────────────────────────────────────────────────────

function updateFeedbackPanel(angles) {
  const fb = engine.update(angles);

  // Rep counter
  repCountEl.textContent = fb.repCount;

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

  // Progress bar
  const pct = Math.round(fb.progress * 100);
  progressEl.style.width = `${pct}%`;
  const nextIdx = fb.stages.indexOf(fb.phase) + 1;
  const nextPhase = fb.stages[nextIdx] ?? fb.stages[0];
  progressLbl.textContent =
    pct >= 100
      ? `Hold ${fb.phase} position`
      : `Moving to ${nextPhase}… ${pct}%`;

  // Coaching cues
  cueListEl.innerHTML = fb.cues
    .map((c) => `<li>${c}</li>`)
    .join("");

  // Symmetry warning
  if (fb.symmetryWarning) {
    symWarnEl.textContent = fb.symmetryWarning;
    symWarnEl.classList.remove("hidden");
  } else {
    symWarnEl.classList.add("hidden");
  }
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

// ── Static panel renders ──────────────────────────────────────────────────────

function renderPrescription(ex) {
  const p = ex.prescription;
  prescEl.textContent =
    `${p.sets} sets × ${p.reps} reps` +
    (p.holdSeconds ? ` · hold ${p.holdSeconds}s` : "") +
    ` · ${p.daysPerWeek} days/week`;
}

function renderTrackingWarning(ex) {
  if (ex.trackingWarning) {
    trackWarnEl.textContent = ex.trackingWarning;
    trackWarnEl.classList.remove("hidden");
  } else {
    trackWarnEl.classList.add("hidden");
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────

toggleBtn.addEventListener("click", async () => {
  if (!running) {
    try {
      toggleBtn.disabled = true;
      statusEl.textContent = "Starting camera…";
      await startCamera();
      running = true;
      toggleBtn.textContent = "Stop camera";
      toggleBtn.disabled = false;
      renderFrame();
    } catch (err) {
      statusEl.textContent = `Camera error: ${err.message}`;
      toggleBtn.disabled = false;
    }
  } else {
    running = false;
    cancelAnimationFrame(rafId);
    stopCamera();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    toggleBtn.textContent = "Start camera";
    statusEl.textContent = "Stopped";
  }
});

createLandmarker().catch((err) => {
  statusEl.textContent = `Model failed to load: ${err.message}`;
});

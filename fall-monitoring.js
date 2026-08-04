export const FALL_MONITORING_MODES = Object.freeze({
  STANDING: "standing",
  SEATED: "seated",
  FLOOR: "floor",
  UNAVAILABLE: "unavailable",
});

const FLOOR_EXERCISES = new Set([
  "supine-hamstring-stretch",
  "straight-leg-raises-supine",
  "straight-leg-raises-prone",
  "hip-abduction",
  "hip-adduction",
  "leg-presses",
  "ankle_pumps",
  "heel_slides",
  "hip_bridge",
  "clamshell",
  "single_knee_to_chest_stretch",
  "hip_flexor_stretch",
]);

const SEATED_EXERCISES = new Set([
  "leg-extensions",
]);

const UNAVAILABLE_EXERCISES = new Set([
  "wrist_extension_stretch",
  "wrist_flexion_stretch",
  "tendon_glides",
  "forearm_supination_pronation_strengthening",
  "stress_ball_squeeze",
  "ankle_rotations",
  "ankle_range_of_motion",
  "ankle_dorsiflexion_plantar_flexion",
  "pendulum",
]);

const LANDMARKS = Object.freeze({
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
});

const DEFAULTS = Object.freeze({
  minimumVisibility: 0.55,
  warmupMs: 1200,
  minimumWarmupFrames: 8,
  historyWindowMs: 1000,
  candidateHoldMs: 5000,
  lostVisibilityMs: 1200,
  rapidDescentRatio: 0.18,
  torsoChangeDegrees: 38,
  lyingTorsoDegrees: 55,
  recoveredTorsoDegrees: 35,
  hipFloorGapRatio: 0.3,
  headFloorGapRatio: 0.44,
  stillMovementRatio: 0.028,
  requiredSignals: 3,
});

function finitePoint(point, minimumVisibility) {
  return Boolean(
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    (point.visibility ?? 1) >= minimumVisibility
  );
}

function centre(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function torsoAngleFromVertical(shoulders, hips) {
  const dx = Math.abs(shoulders.x - hips.x);
  const dy = Math.abs(shoulders.y - hips.y);
  return Math.atan2(dx, Math.max(dy, 0.0001)) * (180 / Math.PI);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function fallMonitoringModeForExercise(exerciseOrId) {
  const id = typeof exerciseOrId === "string"
    ? exerciseOrId
    : exerciseOrId?.id;
  const trackingMode = typeof exerciseOrId === "object"
    ? exerciseOrId?.trackingMode
    : null;

  if (!id || trackingMode === "hand" || trackingMode === "pose_and_hand") {
    return FALL_MONITORING_MODES.UNAVAILABLE;
  }
  if (UNAVAILABLE_EXERCISES.has(id)) {
    return FALL_MONITORING_MODES.UNAVAILABLE;
  }
  if (FLOOR_EXERCISES.has(id)) {
    return FALL_MONITORING_MODES.FLOOR;
  }
  if (SEATED_EXERCISES.has(id)) {
    return FALL_MONITORING_MODES.SEATED;
  }
  return FALL_MONITORING_MODES.STANDING;
}

export function fallMonitoringReadiness(exerciseOrId) {
  const mode = fallMonitoringModeForExercise(exerciseOrId);
  if (mode === FALL_MONITORING_MODES.FLOOR) {
    return {
      mode,
      state: "limited",
      title: "Floor exercise: visibility check active",
      detail:
        "Possible-fall detection is limited because lying down is expected. Automatic contact alerts cannot start from this mode.",
    };
  }
  if (mode === FALL_MONITORING_MODES.UNAVAILABLE) {
    return {
      mode,
      state: "unavailable",
      title: "Possible-fall check unavailable for this movement",
      detail:
        "Close-up or supported-lean tracking cannot reliably identify a fall, so automatic contact alerts are unavailable.",
    };
  }
  return {
    mode,
    state: "ready",
    title: "Local possible-fall check available",
    detail:
      "It starts with the camera and can begin a verified-contact alert after a one-minute no-response check.",
  };
}

export function summarizeFallPose(landmarks, minimumVisibility = 0.55) {
  if (!Array.isArray(landmarks)) return null;
  const required = [
    LANDMARKS.NOSE,
    LANDMARKS.LEFT_SHOULDER,
    LANDMARKS.RIGHT_SHOULDER,
    LANDMARKS.LEFT_HIP,
    LANDMARKS.RIGHT_HIP,
    LANDMARKS.LEFT_ANKLE,
    LANDMARKS.RIGHT_ANKLE,
  ].map((index) => landmarks[index]);

  if (required.some((point) => !finitePoint(point, minimumVisibility))) {
    return null;
  }

  const nose = landmarks[LANDMARKS.NOSE];
  const shoulders = centre(
    landmarks[LANDMARKS.LEFT_SHOULDER],
    landmarks[LANDMARKS.RIGHT_SHOULDER]
  );
  const hips = centre(
    landmarks[LANDMARKS.LEFT_HIP],
    landmarks[LANDMARKS.RIGHT_HIP]
  );
  const ankles = centre(
    landmarks[LANDMARKS.LEFT_ANKLE],
    landmarks[LANDMARKS.RIGHT_ANKLE]
  );
  const kneesVisible = finitePoint(
    landmarks[LANDMARKS.LEFT_KNEE],
    minimumVisibility
  ) && finitePoint(
    landmarks[LANDMARKS.RIGHT_KNEE],
    minimumVisibility
  );
  const knees = kneesVisible
    ? centre(
        landmarks[LANDMARKS.LEFT_KNEE],
        landmarks[LANDMARKS.RIGHT_KNEE]
      )
    : null;

  return {
    nose: { x: nose.x, y: nose.y },
    shoulders,
    hips,
    knees,
    ankles,
    floorY: Math.max(
      landmarks[LANDMARKS.LEFT_ANKLE].y,
      landmarks[LANDMARKS.RIGHT_ANKLE].y
    ),
    torsoAngle: torsoAngleFromVertical(shoulders, hips),
  };
}

function poseMovement(previous, current) {
  if (!previous || !current) return Infinity;
  const points = ["nose", "shoulders", "hips", "knees", "ankles"]
    .filter((key) => previous[key] && current[key]);
  return average(points.map((key) => distance(previous[key], current[key])));
}

export function parseWellbeingResponse(transcript) {
  const normalized = String(transcript ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;
  if (
    /\b(help|need help|hurt|injured|cannot move|cant move|not okay|not ok)\b/.test(
      normalized
    )
  ) {
    return "help";
  }
  if (
    /\b(im okay|i am okay|im ok|i am ok|okay|ok|im fine|i am fine|fine|all good)\b/.test(
      normalized
    )
  ) {
    return "okay";
  }
  return null;
}

export class FallMonitor {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.configure(null);
  }

  configure(exerciseOrId) {
    this.exerciseId = typeof exerciseOrId === "string"
      ? exerciseOrId
      : exerciseOrId?.id ?? null;
    this.mode = fallMonitoringModeForExercise(exerciseOrId);
    this.reset();
    return fallMonitoringReadiness(exerciseOrId);
  }

  reset() {
    this.baseline = null;
    this.warmupStartedAt = null;
    this.warmupFrames = [];
    this.history = [];
    this.previousPose = null;
    this.lastVisibleAt = null;
    this.candidate = null;
    this.triggered = false;
  }

  resumeAfterCheck() {
    this.reset();
  }

  notePoseUnavailable(timestampMs) {
    if (
      this.mode === FALL_MONITORING_MODES.FLOOR ||
      this.mode === FALL_MONITORING_MODES.UNAVAILABLE
    ) {
      return { type: "visibility_lost", mode: this.mode };
    }
    if (
      this.lastVisibleAt !== null &&
      timestampMs - this.lastVisibleAt >= this.options.lostVisibilityMs
    ) {
      this.candidate = null;
      this.history = [];
      return { type: "visibility_lost", mode: this.mode };
    }
    return { type: "waiting_for_pose", mode: this.mode };
  }

  update({ landmarks, timestampMs }) {
    if (this.mode === FALL_MONITORING_MODES.FLOOR) {
      return { type: "limited", mode: this.mode };
    }
    if (this.mode === FALL_MONITORING_MODES.UNAVAILABLE) {
      return { type: "unavailable", mode: this.mode };
    }
    if (this.triggered) {
      return { type: "possible_fall", mode: this.mode, repeated: true };
    }

    const pose = summarizeFallPose(
      landmarks,
      this.options.minimumVisibility
    );
    if (!pose) return this.notePoseUnavailable(timestampMs);

    this.lastVisibleAt = timestampMs;
    if (!this.baseline) {
      return this.#warmUp(pose, timestampMs);
    }

    this.history.push({ ...pose, timestampMs });
    this.history = this.history.filter(
      (frame) => timestampMs - frame.timestampMs <= this.options.historyWindowMs
    );
    const earlier = this.history[0] ?? pose;
    const height = Math.max(this.baseline.personHeight, 0.12);
    const movementRatio = poseMovement(this.previousPose, pose) / height;
    this.previousPose = pose;

    if (this.candidate) {
      return this.#updateCandidate(pose, timestampMs, movementRatio);
    }

    const signals = this.#fallSignals(earlier, pose, height);
    if (signals.count >= this.options.requiredSignals) {
      this.candidate = {
        startedAt: timestampMs,
        stillSince: movementRatio <= this.options.stillMovementRatio
          ? timestampMs
          : null,
        signals: signals.active,
      };
      return {
        type: "candidate",
        mode: this.mode,
        signals: signals.active,
      };
    }

    return { type: "monitoring", mode: this.mode };
  }

  #warmUp(pose, timestampMs) {
    if (this.warmupStartedAt === null) this.warmupStartedAt = timestampMs;
    const plausibleStart = this.mode === FALL_MONITORING_MODES.SEATED
      ? pose.torsoAngle < 42
      : pose.torsoAngle < 32;

    if (!plausibleStart) {
      this.warmupStartedAt = timestampMs;
      this.warmupFrames = [];
      return { type: "position_for_baseline", mode: this.mode };
    }

    this.warmupFrames.push(pose);
    if (
      timestampMs - this.warmupStartedAt < this.options.warmupMs ||
      this.warmupFrames.length < this.options.minimumWarmupFrames
    ) {
      return { type: "warming_up", mode: this.mode };
    }

    const floorY = average(this.warmupFrames.map((frame) => frame.floorY));
    const noseY = average(this.warmupFrames.map((frame) => frame.nose.y));
    this.baseline = {
      floorY,
      hipY: average(this.warmupFrames.map((frame) => frame.hips.y)),
      torsoAngle: average(
        this.warmupFrames.map((frame) => frame.torsoAngle)
      ),
      personHeight: Math.max(floorY - noseY, 0.12),
    };
    this.history = [{ ...pose, timestampMs }];
    this.previousPose = pose;
    return { type: "ready", mode: this.mode };
  }

  #fallSignals(earlier, pose, height) {
    const descentRatio = (pose.hips.y - earlier.hips.y) / height;
    const torsoChange = pose.torsoAngle - this.baseline.torsoAngle;
    const hipFloorGap = (this.baseline.floorY - pose.hips.y) / height;
    const headFloorGap = (this.baseline.floorY - pose.nose.y) / height;
    const active = [];

    if (descentRatio >= this.options.rapidDescentRatio) {
      active.push("rapid_downward_movement");
    }
    if (torsoChange >= this.options.torsoChangeDegrees) {
      active.push("large_torso_angle_change");
    }
    if (
      earlier.torsoAngle < this.options.recoveredTorsoDegrees &&
      pose.torsoAngle >= this.options.lyingTorsoDegrees
    ) {
      active.push("upright_to_lying_transition");
    }
    if (
      hipFloorGap <= this.options.hipFloorGapRatio &&
      headFloorGap <= this.options.headFloorGapRatio
    ) {
      active.push("head_and_hips_near_floor");
    }

    return { count: active.length, active };
  }

  #updateCandidate(pose, timestampMs, movementRatio) {
    const height = Math.max(this.baseline.personHeight, 0.12);
    const hipFloorGap = (this.baseline.floorY - pose.hips.y) / height;
    const recovered =
      pose.torsoAngle <= this.options.recoveredTorsoDegrees &&
      hipFloorGap > this.options.hipFloorGapRatio;

    if (recovered) {
      this.candidate = null;
      return { type: "candidate_cleared", mode: this.mode };
    }

    if (movementRatio <= this.options.stillMovementRatio) {
      if (this.candidate.stillSince === null) {
        this.candidate.stillSince = timestampMs;
      }
    } else {
      this.candidate.stillSince = null;
    }

    const stillFor = this.candidate.stillSince === null
      ? 0
      : timestampMs - this.candidate.stillSince;
    if (stillFor >= this.options.candidateHoldMs) {
      this.triggered = true;
      return {
        type: "possible_fall",
        mode: this.mode,
        signals: this.candidate.signals,
        stillForMs: stillFor,
      };
    }

    return {
      type: "candidate",
      mode: this.mode,
      signals: this.candidate.signals,
      stillForMs: stillFor,
    };
  }
}

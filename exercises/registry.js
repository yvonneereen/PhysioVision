/**
 * Executable exercise rule specifications.
 *
 * The original entries use the AAOS Knee Conditioning Programme:
 * https://www.orthoinfo.org/recovery/knee-conditioning-program
 * Newly promoted catalog entries are explicitly labelled as prototype
 * primary-motion tracking and remain subject to clinician/video validation.
 *
 * Each entry defines:
 *   - Which joint angles to measure (using the landmark triples from geometry.js)
 *   - Target angle ranges per phase (degrees)
 *   - Which angles constitute a completed rep (repRule state machine)
 *   - Symmetry constraints where both sides are in frame
 *   - Coaching cues triggered by out-of-range angles
 *
 * Camera setup: fixed frontal camera, chest height, 2–3 m from user, full body in frame.
 * Angles use MediaPipe worldLandmarks (3D metric, hip-centred) so they are computed in
 * true 3D space and remain valid from a frontal viewpoint — depth is inferred by the model.
 *
 * Angle convention (all from geometry.js `angle(A, B, C)`):
 *   knee  = angle(hip,      knee,   ankle)     — 180° = fully extended
 *   hip   = angle(shoulder, hip,    knee)      — 180° = fully extended / lying flat
 *   ankle = angle(knee,     ankle,  footIndex) — ~90° = neutral standing
 *
 * For side-lying exercises the hip angle (shoulder→hip→knee) still works:
 *   leg in line with trunk ≈ 170–180°, leg lifted 45° ≈ 125–135°.
 */

export const EXERCISES = [
  // ── Stretches ─────────────────────────────────────────────────────────────

  {
    id: "heel-cord-stretch",
    name: "Heel Cord Stretch",
    category: "stretch",
    prescription: { sets: 2, reps: 4, holdSeconds: 30, daysPerWeek: "6–7" },
    camera: "front",
    // Primary: ankle dorsiflexion of the back (affected) leg.
    // Measured as angle(knee, ankle, footIndex).
    // Neutral standing ≈ 90°; calf on stretch (dorsiflexed) < 85°.
    trackedAngles: {
      ankle: { points: ["knee", "ankle", "footIndex"], side: "affected" },
    },
    phases: [
      { name: "neutral", ankle: [88, 115] },
      { name: "stretch",  ankle: [50, 87] },   // no overlap with neutral — frontal depth inference is imprecise
    ],
    repRule: "neutral → stretch → hold",
    stageImages: ["standing", "calf-stretch"],
    cues: {
      "ankle>92": "Lean forward more to feel the stretch in the calf",
    },
    trackingNotes: "Side camera; back leg ankle/footIndex landmarks must be visible.",
  },

  {
    id: "standing-quad-stretch",
    name: "Standing Quadriceps Stretch",
    category: "stretch",
    prescription: { sets: 1, reps: 3, holdSeconds: 45, daysPerWeek: "4–5" },
    camera: "front",
    // Affected knee flexes deeply — heel drawn toward buttock.
    trackedAngles: {
      knee: { points: ["hip", "knee", "ankle"], side: "affected" },
    },
    phases: [
      { name: "standing", knee: [155, 180] },
      { name: "stretch",  knee: [30, 70] },    // deeply flexed, heel near buttock
    ],
    repRule: "standing → stretch → hold",
    stageImages: ["standing", "quad-stretch"],
    cues: {
      "knee>80": "Pull heel closer to your buttock for a deeper stretch",
    },
    trackingNotes: "Side camera. Ankle landmark may be partially occluded when heel is raised; flag low-confidence.",
  },

  {
    id: "supine-hamstring-stretch",
    name: "Supine Hamstring Stretch",
    category: "stretch",
    prescription: { sets: 1, reps: 3, holdSeconds: 45, daysPerWeek: "4–5" },
    camera: "front",
    // Hip flexes (leg pulled toward chest), knee should stay as extended as possible.
    trackedAngles: {
      hip:  { points: ["shoulder", "hip",  "knee"],  side: "affected" },
      knee: { points: ["hip",      "knee", "ankle"], side: "affected" },
    },
    phases: [
      { name: "flat",    hip: [155, 180], knee: [155, 180] },
      { name: "stretch", hip: [60, 110],  knee: [130, 180] }, // hip flexed, knee as straight as possible
    ],
    repRule: "flat → stretch → hold",
    stageImages: ["lying-flat", "lying-leg-raised"],
    cues: {
      "knee<120": "Try to straighten your knee more while holding the stretch",
    },
    trackingNotes: "Supine (lying) — side camera. Keep leg in sagittal plane for clean angle reads.",
  },

  // ── Strengthening ─────────────────────────────────────────────────────────

  {
    id: "half-squats",
    name: "Half Squats",
    category: "strengthening",
    prescription: { sets: 3, reps: 10, holdSeconds: 5, daysPerWeek: "4–5" },
    camera: "front", // required for bilateral symmetry and facing-direction checks
    trackingWarning:
      "Face the camera and keep both feet, knees, hips, and shoulders fully visible.",
    trackedAngles: {
      leftKnee:  { points: ["leftHip",  "leftKnee",  "leftAnkle"]  },
      rightKnee: { points: ["rightHip", "rightKnee", "rightAnkle"] },
      leftHip:   { points: ["leftShoulder",  "leftHip",  "leftKnee"]  },
      rightHip:  { points: ["rightShoulder", "rightHip", "rightKnee"] },
      torsoLean: {
        points: ["leftShoulder", "rightShoulder", "leftHip", "rightHip"],
      },
      leftKneeForwardRatio: {
        points: ["nose", "leftKnee", "leftAnkle", "leftFootIndex"],
      },
      rightKneeForwardRatio: {
        points: ["nose", "rightKnee", "rightAnkle", "rightFootIndex"],
      },
    },
    // Require a position to remain stable before advancing the rep state.
    phaseConfirmationMs: 300,
    maxCues: 1,
    calibration: {
      startPhase: "standing",
      targetPhase: "squat",
      captureKeys: [
        "leftKnee",
        "rightKnee",
        "leftHip",
        "rightHip",
        "torsoLean",
        "leftKneeForwardRatio",
        "rightKneeForwardRatio",
      ],
      // Only the user's comfortable joint range is personalised. Form-safety
      // measurements are captured and validated, but their limits stay fixed.
      personalizedKeys: ["leftKnee", "rightKnee", "leftHip", "rightHip"],
      toleranceDegrees: 8,
      safeRanges: {
        start: {
          leftKnee: [145, 180],
          rightKnee: [145, 180],
          leftHip: [145, 180],
          rightHip: [145, 180],
          torsoLean: [0, 25],
          leftKneeForwardRatio: [-1, 0.15],
          rightKneeForwardRatio: [-1, 0.15],
        },
        target: {
          // A shallower comfortable squat can be calibrated, while 90° remains
          // the deepest permitted knee angle in this prototype.
          leftKnee: [90, 145],
          rightKnee: [90, 145],
          leftHip: [90, 150],
          rightHip: [90, 150],
          torsoLean: [0, 40],
          leftKneeForwardRatio: [-1, 0.15],
          rightKneeForwardRatio: [-1, 0.15],
        },
      },
      captureErrors: {
        leftKnee: "Use a comfortable half-squat depth and do not bend past 90°.",
        rightKnee: "Use a comfortable half-squat depth and do not bend past 90°.",
        leftHip: "Use a smaller, comfortable movement for this calibration.",
        rightHip: "Use a smaller, comfortable movement for this calibration.",
        torsoLean: "Lift your chest and try the measurement again.",
        leftKneeForwardRatio: "Move your knees back over your feet, then try again.",
        rightKneeForwardRatio: "Move your knees back over your feet, then try again.",
      },
    },
    phases: [
      {
        name: "standing",
        leftKnee: [160, 180],
        rightKnee: [160, 180],
        leftHip: [155, 180],
        rightHip: [155, 180],
        torsoLean: [0, 25],
        leftKneeForwardRatio: [-1, 0.15],
        rightKneeForwardRatio: [-1, 0.15],
      },
      {
        name: "squat",
        leftKnee: [90, 130],
        rightKnee: [90, 130],
        leftHip: [90, 135],
        rightHip: [90, 135],
        torsoLean: [0, 40],
        leftKneeForwardRatio: [-1, 0.15],
        rightKneeForwardRatio: [-1, 0.15],
      },
    ],
    repRule: "standing → squat → standing",
    stageImages: ["standing", "squat", "standing"],
    symmetry: { joint: "knee", maxDiffDeg: 15 },
    cues: {
      "leftKnee<90": "Don't go too deep — this is a half squat only",
      "rightKnee<90": "Don't go too deep — this is a half squat only",
      "torsoLean>40": "Lift your chest slightly — avoid leaning too far forward",
      "leftKneeForwardRatio>0.15": "Move your left knee back so it stays over your foot",
      "rightKneeForwardRatio>0.15": "Move your right knee back so it stays over your foot",
      "kneeDiff>15": "Keep both knees bending equally",
    },
  },

  {
    id: "hamstring-curls",
    name: "Hamstring Curls",
    category: "strengthening",
    prescription: { sets: 3, reps: 10, holdSeconds: 5, daysPerWeek: "4–5" },
    camera: "front",
    trackingWarning: "Ankle moves behind the body — depth inference is less accurate at peak curl. Angle readings are approximate.",
    // Standing; affected knee flexes, heel rises toward ceiling.
    trackedAngles: {
      knee: { points: ["hip", "knee", "ankle"], side: "affected" },
    },
    phases: [
      { name: "standing", knee: [160, 180] },
      { name: "curled",   knee: [30, 70]   }, // heel toward ceiling
    ],
    repRule: "standing → curled → standing",
    stageImages: ["standing", "knee-curled", "standing"],
    cues: {
      "knee>90": "Curl higher — bring your heel up toward the ceiling",
    },
  },

  {
    id: "calf-raises",
    name: "Calf Raises",
    category: "strengthening",
    prescription: { sets: 2, reps: 10, holdSeconds: 0, daysPerWeek: "6–7" },
    camera: "front",
    // Foot inclination: degrees the foot rises above horizontal (floor), 0° when flat.
    // ~0–10° standing flat; ~20–45° on tiptoe. Directly captures heel elevation.
    trackedAngles: {
      footInclination: { points: ["heel", "footIndex"], side: "affected" },
    },
    phases: [
      { name: "flat",   footInclination: [0, 12]  },
      { name: "raised", footInclination: [18, 50] },
    ],
    repRule: "flat → raised → flat",
    stageImages: ["standing", "calf-raised", "standing"],
    cues: {
      "footInclination<18": "Rise higher onto your toes",
    },
  },

  {
    id: "leg-extensions",
    name: "Leg Extensions (Seated)",
    category: "strengthening",
    prescription: { sets: 3, reps: 10, holdSeconds: 5, daysPerWeek: "4–5" },
    camera: "front",
    // Seated on chair; knee extends from ~90° to full extension.
    trackedAngles: {
      knee: { points: ["hip", "knee", "ankle"], side: "affected" },
    },
    phases: [
      { name: "seated",   knee: [80, 105]  }, // at rest on chair
      { name: "extended", knee: [155, 180] }, // leg straightened out
    ],
    repRule: "seated → extended → seated",
    stageImages: ["seated", "seated-leg-extended", "seated"],
    cues: {
      "knee<150": "Try to straighten your leg fully at the top",
    },
  },

  {
    id: "straight-leg-raises-supine",
    name: "Straight-Leg Raises (Supine)",
    category: "strengthening",
    prescription: { sets: 3, reps: 10, holdSeconds: 5, daysPerWeek: "4–5" },
    camera: "front",
    // Lying on back; affected leg lifts 6–10 inches with knee kept straight.
    trackedAngles: {
      hip:  { points: ["shoulder", "hip",  "knee"],  side: "affected" },
      knee: { points: ["hip",      "knee", "ankle"], side: "affected" },
    },
    phases: [
      { name: "flat",   hip: [155, 180], knee: [155, 180] },
      { name: "raised", hip: [125, 155], knee: [155, 180] }, // 6–10 inch lift ≈ 25–35° hip flexion
    ],
    repRule: "flat → raised → flat",
    stageImages: ["lying-flat", "lying-leg-raised", "lying-flat"],
    cues: {
      "knee<150":  "Keep your leg straight — don't bend the knee",
      "hip<120":   "Lower leg slightly — 6 to 10 inches off the floor is enough",
    },
  },

  {
    id: "straight-leg-raises-prone",
    name: "Straight-Leg Raises (Prone)",
    category: "strengthening",
    prescription: { sets: 3, reps: 10, holdSeconds: 5, daysPerWeek: "4–5" },
    camera: "front",
    // Lying face-down; hip extends (leg lifts toward ceiling).
    // Hip extension beyond neutral: angle(shoulder, hip, knee) increases past 180° is
    // not directly computable, so we track relative change: start ≈ 170–180°,
    // raised ≈ 185–200° (landmark coords allow >180° in world space).
    trackedAngles: {
      hip:  { points: ["shoulder", "hip",  "knee"],  side: "affected" },
      knee: { points: ["hip",      "knee", "ankle"], side: "affected" },
    },
    phases: [
      { name: "flat",   hip: [165, 185], knee: [155, 180] },
      { name: "raised", hip: [185, 210], knee: [155, 180] }, // hip extension past neutral
    ],
    repRule: "flat → raised → flat",
    stageImages: ["prone-flat", "prone-leg-raised", "prone-flat"],
    cues: {
      "knee<150": "Keep your knee straight while lifting",
    },
    trackingNotes: "Prone position — face down. Landmark visibility will be low on many joints. Flag liberally.",
    trackingWarning: "High occlusion risk in prone position; side camera essential.",
  },

  {
    id: "hip-abduction",
    name: "Hip Abduction",
    category: "strengthening",
    prescription: { sets: 3, reps: 20, holdSeconds: 5, daysPerWeek: "4–5" },
    camera: "front",
    // Side-lying; top (affected) leg lifts to ~45°.
    // Measured as angle(shoulder, hip, knee) on the top side:
    //   leg in line with trunk ≈ 170–180°; abducted 45° ≈ 125–135°.
    trackedAngles: {
      hip: { points: ["shoulder", "hip", "knee"], side: "affected" },
    },
    phases: [
      { name: "rest",     hip: [160, 180] },
      { name: "abducted", hip: [125, 145] }, // 45° abduction
    ],
    repRule: "rest → abducted → rest",
    stageImages: ["side-lying", "side-lying-abducted", "side-lying"],
    cues: {
      "hip>150": "Lift the leg higher — aim for a 45° angle from your body",
    },
    trackingNotes: "Side-lying; front camera shows frontal-plane motion. Top-side hip/knee landmarks may partially occlude. Flag aggressively.",
    trackingWarning: "Side-lying position: expect frequent low-confidence flags on affected-side landmarks.",
  },

  {
    id: "hip-adduction",
    name: "Hip Adduction",
    category: "strengthening",
    prescription: { sets: 3, reps: 20, holdSeconds: 5, daysPerWeek: "4–5" },
    camera: "front",
    // Side-lying on injured side; bottom (injured) leg lifts 6–8 inches.
    // Same angle definition — angle(shoulder, hip, knee) — but on the bottom side.
    trackedAngles: {
      hip: { points: ["shoulder", "hip", "knee"], side: "affected" },
    },
    phases: [
      { name: "rest",     hip: [160, 180] },
      { name: "adducted", hip: [145, 159] }, // top at 159 to avoid overlap with rest (160+)
    ],
    repRule: "rest → adducted → rest",
    stageImages: ["side-lying", "side-lying-abducted", "side-lying"],
    cues: {
      "hip>163": "Lift the bottom leg off the floor — 6 to 8 inches is the target",
    },
    trackingNotes: "Side-lying on injured side. Bottom leg likely partially occluded by upper body. Expect very high low-confidence rate.",
    trackingWarning: "Most reliable when patient is visible from a 45° elevated front angle.",
  },

  {
    id: "leg-presses",
    name: "Leg Presses (Elastic Band)",
    category: "strengthening",
    prescription: { sets: 3, reps: 10, holdSeconds: 2, daysPerWeek: "4–5" },
    camera: "front",
    // Supine; elastic band around foot arch; knee and hip extend against resistance.
    trackedAngles: {
      hip:  { points: ["shoulder", "hip",  "knee"],  side: "affected" },
      knee: { points: ["hip",      "knee", "ankle"], side: "affected" },
    },
    phases: [
      { name: "bent",     hip: [70, 110],  knee: [70, 105]  }, // start — knees pulled in
      { name: "extended", hip: [140, 180], knee: [150, 180] }, // legs pressed out straight
    ],
    repRule: "bent → extended → bent",
    stageImages: ["lying-knees-bent", "lying-legs-extended", "lying-knees-bent"],
    cues: {
      "knee<150": "Press fully against the band — straighten your leg completely",
    },
    trackingNotes: "Supine. Side camera gives cleanest sagittal-plane read.",
  },

  // ── Newly promoted primary-motion prototypes ─────────────────────────────

  {
    id: "ankle_pumps",
    name: "Ankle Pumps",
    category: "mobility",
    trackingMaturity: "prototype_primary_motion_only",
    requiresClinicianPlan: true,
    prescription: {
      mode: "clinician_plan",
      sets: null,
      reps: null,
      holdSeconds: 0,
      daysPerWeek: "as prescribed",
    },
    camera: "side",
    phaseConfirmationMs: 300,
    maxCues: 1,
    trackingWarning:
      "Prototype tracking: lie with the working leg supported and use a close side view that includes the knee, ankle and complete foot. The guide checks ankle direction and whether the knee stays nearly straight; it cannot assess pain, swelling, circulation or post-operative restrictions. Use only if included in your clinician-approved plan.",
    trackedAngles: {
      ankle: { points: ["knee", "ankle", "footIndex"], side: "affected" },
      knee: { points: ["hip", "knee", "ankle"], side: "affected" },
    },
    phases: [
      { name: "toes_up", ankle: [45, 88], knee: [145, 180] },
      { name: "toes_down", ankle: [98, 150], knee: [145, 180] },
    ],
    repRule: "toes_up → toes_down → toes_up",
    stageImages: ["ankle-toes-up", "ankle-toes-down", "ankle-toes-up"],
    cues: {
      "knee<145": "Keep your knee and upper leg still while moving your ankle",
      "ankle>150": "Use a smaller, comfortable ankle movement",
    },
    trackingNotes:
      "Only the supported, nearly straight-leg variant is enabled. The seated bent-knee variant needs a separate calibration and phase definition.",
  },

  {
    id: "heel_slides",
    name: "Heel Slides",
    category: "mobility",
    trackingMaturity: "prototype_primary_motion_only",
    requiresClinicianPlan: true,
    prescription: {
      mode: "clinician_plan",
      sets: null,
      reps: null,
      holdSeconds: 0,
      daysPerWeek: "as prescribed",
    },
    camera: "side",
    phaseConfirmationMs: 300,
    trackingWarning:
      "Prototype tracking: use an elevated side view with the working hip, knee and ankle visible. The guide counts knee bending and straightening only; it cannot confirm heel contact, pelvic stability, trunk bracing or pain. Use only if included in your clinician-approved plan.",
    trackedAngles: {
      knee: { points: ["hip", "knee", "ankle"], side: "affected" },
    },
    phases: [
      { name: "knee_bent", knee: [60, 120] },
      { name: "leg_extended", knee: [150, 180] },
    ],
    repRule: "knee_bent → leg_extended → knee_bent",
    stageImages: ["heel-slide-bent", "heel-slide-extended", "heel-slide-bent"],
    cues: {},
    trackingNotes:
      "Primary knee motion only. Pelvic displacement and surface contact require additional features before full-form feedback can be enabled.",
  },

  {
    id: "hip_bridge",
    name: "Hip Bridge",
    category: "strengthening",
    trackingMaturity: "prototype_primary_motion_only",
    requiresClinicianPlan: true,
    prescription: {
      mode: "clinician_plan",
      sets: null,
      reps: null,
      holdSeconds: 0,
      daysPerWeek: "as prescribed",
    },
    camera: "side",
    phaseConfirmationMs: 300,
    maxCues: 1,
    trackingWarning:
      "Prototype tracking: use a full side view at bed or floor height with the working shoulder, hip, knee and ankle visible. The guide checks primary hip alignment and knee position; it cannot assess abdominal activation, buttock activation, lower-back arching or pain. Use only if included in your clinician-approved plan.",
    trackedAngles: {
      hip: { points: ["shoulder", "hip", "knee"], side: "affected" },
      knee: { points: ["hip", "knee", "ankle"], side: "affected" },
    },
    phases: [
      { name: "pelvis_down", hip: [105, 148], knee: [55, 125] },
      { name: "bridge", hip: [155, 180], knee: [55, 125] },
    ],
    repRule: "pelvis_down → bridge → pelvis_down",
    stageImages: ["bridge-down", "bridge-up", "bridge-down"],
    cues: {
      "knee<55": "Move your foot slightly farther away to keep the knee comfortable",
      "knee>125": "Move your foot slightly closer before lifting again",
    },
    trackingNotes:
      "Primary shoulder-hip-knee alignment only. Lumbar curvature is not represented by the current landmark model.",
  },
];

// Quick lookup by exercise id.
// basic fildering
export const EXERCISE_MAP = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

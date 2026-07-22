/**
 * Exercise knowledge-base records and prototype tracking labels.
 *
 * These entries are intentionally separate from registry.js. The registry is
 * executable movement-scoring logic; this catalog is reviewed educational
 * content. `liveTracking` means an engineering prototype is selectable, not
 * that its thresholds or clinical safety have been validated.
 */

export const EXERCISE_TAGS = Object.freeze({
  GENERAL: "GENERAL",
  POST_OP: "POST_OP",
  CLINICIAN_GUIDED: "CLINICIAN_GUIDED",
  SUPPORT_REQUIRED: "SUPPORT_REQUIRED",
  HAND_TRACKING_REQUIRED: "HAND_TRACKING_REQUIRED",
  POSE_LIMITED: "POSE_LIMITED",
});

const draftExercise = (record) => {
  // Every exercise in this supplied catalogue now has an executable prototype.
  // "Live" means selectable camera rules exist, not that the rules have been
  // clinically validated or can observe every safety-relevant property.
  const liveTracking = record.liveTracking !== false;
  return {
    ...record,
    reviewStatus: record.reviewStatus ?? (liveTracking
      ? "prototype_primary_motion_tracking"
      : "pending_clinician_review"),
    liveTracking,
    trackingRequirement: record.trackingRequirement ?? (liveTracking
      ? record.tags.includes(EXERCISE_TAGS.HAND_TRACKING_REQUIRED)
        ? "hand_sequence_prototype"
        : "pose_primary_motion_prototype"
      : record.tags.includes(EXERCISE_TAGS.HAND_TRACKING_REQUIRED)
        ? "hand_landmarks"
        : record.tags.includes(EXERCISE_TAGS.POSE_LIMITED)
          ? "pose_limited"
          : "pose_rules_not_validated"),
  };
};

export const DRAFT_EXERCISES = [
  draftExercise({
    id: "wrist_extension_stretch",
    liveTracking: true,
    reviewStatus: "prototype_sequence_tracking",
    trackingRequirement: "pose_and_hand_sequence_prototype",
    name: "Wrist Extension Stretch",
    region: "Hand & wrist",
    category: "Stretch",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED, EXERCISE_TAGS.HAND_TRACKING_REQUIRED],
    typicalUse: ["carpal tunnel rehabilitation", "wrist stiffness", "forearm tendon irritation"],
    instruction: "Sit or stand with one arm extended and the elbow straight. Keep the palm facing downward. Use the opposite hand to move the fingers and wrist gently upward. Keep the forearm still and stop if numbness, tingling or pain increases.",
  }),
  draftExercise({
    id: "wrist_flexion_stretch",
    liveTracking: true,
    reviewStatus: "prototype_sequence_tracking",
    trackingRequirement: "pose_and_hand_sequence_prototype",
    name: "Wrist Flexion Stretch",
    region: "Hand & wrist",
    category: "Stretch",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED, EXERCISE_TAGS.HAND_TRACKING_REQUIRED],
    typicalUse: ["wrist stiffness", "carpal tunnel rehabilitation", "tennis elbow rehabilitation"],
    instruction: "Extend one arm with the elbow straight and palm facing downward. Point the fingers toward the floor. Use the opposite hand to draw the hand gently toward the body. Keep the shoulder relaxed and do not force the wrist.",
  }),
  draftExercise({
    id: "tendon_glides",
    liveTracking: true,
    reviewStatus: "prototype_sequence_tracking",
    trackingRequirement: "hand_sequence_prototype",
    name: "Tendon Glides",
    region: "Hand & wrist",
    category: "Mobility",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED, EXERCISE_TAGS.HAND_TRACKING_REQUIRED],
    typicalUse: ["carpal tunnel rehabilitation", "finger stiffness", "reduced hand mobility"],
    instruction: "Sit with the forearm supported and wrist straight. Begin with all fingers straight. Move slowly through a hook fist, full fist, tabletop position and straight fist. Return to the fully straight position between each shape.",
  }),
  draftExercise({
    id: "forearm_supination_pronation_strengthening",
    reviewStatus: "prototype_sequence_tracking",
    trackingRequirement: "pose_and_hand_sequence_prototype",
    name: "Forearm Supination and Pronation",
    region: "Hand & wrist",
    category: "Strengthening",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED, EXERCISE_TAGS.HAND_TRACKING_REQUIRED],
    typicalUse: ["reduced forearm rotation", "elbow tendinopathy", "forearm weakness"],
    instruction: "Sit with the elbow bent approximately 90 degrees and supported beside the body. Hold a light object vertically. Rotate the forearm until the palm faces upward, return to neutral, rotate until the palm faces downward and return slowly.",
  }),
  draftExercise({
    id: "stress_ball_squeeze",
    reviewStatus: "prototype_sequence_tracking",
    trackingRequirement: "hand_sequence_prototype",
    name: "Stress Ball Squeeze",
    region: "Hand & wrist",
    category: "Strengthening",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED, EXERCISE_TAGS.HAND_TRACKING_REQUIRED, EXERCISE_TAGS.POSE_LIMITED],
    typicalUse: ["reduced grip strength", "hand weakness", "elbow tendinopathy"],
    instruction: "Sit with the forearm supported and hold a soft ball in the palm. Close the fingers gently around the ball without using maximum force. Pause briefly and then open the hand completely. Stop if finger, thumb or wrist pain increases.",
  }),
  draftExercise({
    id: "ankle_pumps",
    liveTracking: true,
    name: "Ankle Pumps",
    region: "Ankle & balance",
    category: "Mobility",
    tags: [EXERCISE_TAGS.GENERAL, EXERCISE_TAGS.POST_OP],
    typicalUse: ["ankle stiffness", "reduced lower-limb mobility", "hip or knee replacement recovery"],
    instruction: "Sit or lie with the leg supported. Pull the toes toward the shin and then point the toes away. Keep the knee and upper leg relatively still. Move slowly through a comfortable range.",
  }),
  draftExercise({
    id: "ankle_rotations",
    name: "Ankle Rotations",
    region: "Ankle & balance",
    category: "Mobility",
    tags: [EXERCISE_TAGS.GENERAL, EXERCISE_TAGS.POST_OP],
    typicalUse: ["ankle stiffness", "reduced ankle mobility", "joint replacement recovery"],
    instruction: "Sit or lie with the lower leg supported and the foot free to move. Rotate the foot slowly inward and outward, or make small circles in both directions. Avoid moving the entire leg.",
  }),
  draftExercise({
    id: "ankle_range_of_motion",
    name: "Ankle Range of Motion",
    region: "Ankle & balance",
    category: "Mobility",
    tags: [EXERCISE_TAGS.GENERAL, EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["ankle stiffness", "reduced foot mobility", "ankle injury rehabilitation"],
    instruction: "Sit with the foot lifted slightly from the floor. Use the big toe to trace small alphabet letters in the air. Produce the movement from the ankle while keeping the knee and hip relatively still.",
  }),
  draftExercise({
    id: "ankle_dorsiflexion_plantar_flexion",
    name: "Ankle Dorsiflexion and Plantar Flexion",
    region: "Ankle & balance",
    category: "Strengthening",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["ankle weakness", "reduced foot clearance", "ankle rehabilitation"],
    instruction: "Sit with the leg supported and a light resistance band secured safely. Pull the toes toward the shin against the band and return slowly. Reposition the band as instructed, point the toes away against resistance and return with control.",
  }),
  draftExercise({
    id: "supported_single_leg_balance",
    name: "Supported Single-Leg Balance",
    region: "Ankle & balance",
    category: "Balance",
    tags: [EXERCISE_TAGS.GENERAL, EXERCISE_TAGS.SUPPORT_REQUIRED],
    typicalUse: ["reduced balance", "ankle instability", "fall prevention"],
    instruction: "Stand beside a fixed counter or rail and hold it with both hands. Shift the weight onto one leg and lift the other foot slightly from the floor. Keep the trunk upright and the standing knee slightly relaxed. Place the raised foot down immediately if balance becomes unstable.",
  }),
  draftExercise({
    id: "clamshell",
    name: "Clamshell",
    region: "Hip & walking",
    category: "Strengthening",
    tags: [EXERCISE_TAGS.GENERAL, EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["age-related hip weakness", "hip osteoarthritis", "reduced pelvic stability"],
    instruction: "Lie on one side with the hips and knees bent and the feet together. Keep the pelvis facing forward. Raise the upper knee while keeping the feet touching. Do not roll the trunk or pelvis backward. Pause and lower slowly.",
  }),
  draftExercise({
    id: "supported_forward_step_up",
    name: "Supported Forward Step-Up",
    region: "Hip & walking",
    category: "Strengthening",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED, EXERCISE_TAGS.SUPPORT_REQUIRED],
    typicalUse: ["stair difficulty", "hip weakness", "reduced lower-limb function"],
    instruction: "Face a low step while holding a fixed rail or counter. Place the working foot fully on the step. Shift the body forward and upward over that foot. Straighten the supporting leg without locking it. Step down slowly while maintaining control.",
  }),
  draftExercise({
    id: "walking_progression",
    name: "Walking Progression",
    region: "Hip & walking",
    category: "Gait",
    tags: [EXERCISE_TAGS.GENERAL, EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["reduced walking endurance", "age-related mobility loss", "hip osteoarthritis"],
    instruction: "Walk upright at a comfortable speed. Place the heel on the ground first, transfer the weight through the foot and push away through the toes. Aim for similar step lengths on both sides. Avoid dragging the foot, leaning sideways or rushing.",
  }),
  draftExercise({
    id: "walking_with_mobility_aid",
    name: "Walking with a Mobility Aid",
    region: "Hip & walking",
    category: "Gait",
    tags: [EXERCISE_TAGS.POST_OP, EXERCISE_TAGS.CLINICIAN_GUIDED, EXERCISE_TAGS.SUPPORT_REQUIRED],
    typicalUse: ["hip replacement recovery", "fracture recovery", "postoperative gait training"],
    instruction: "Stand inside the walker or use the prescribed crutches or cane. Move the aid forward a short distance. Step forward with the recovering leg and then bring the other leg through. Follow the clinician’s weight-bearing instructions and do not place more weight on the recovering side than permitted.",
  }),
  draftExercise({
    id: "hip_bridge",
    liveTracking: true,
    name: "Hip Bridge",
    region: "Spine & core",
    category: "Strengthening",
    tags: [EXERCISE_TAGS.GENERAL, EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["age-related hip weakness", "selected lower-back pain", "reduced trunk control"],
    instruction: "Lie on the back with the knees bent and feet flat. Gently tighten the abdomen and buttocks. Raise the pelvis until the shoulders, hips and knees are approximately aligned. Avoid excessive arching of the lower back. Lower the pelvis slowly.",
  }),
  draftExercise({
    id: "heel_slides",
    liveTracking: true,
    name: "Heel Slides",
    region: "Spine & core",
    category: "Mobility",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["postoperative spine rehabilitation", "reduced trunk control", "hip and knee mobility"],
    instruction: "Lie on the back with both knees bent and feet supported. Gently brace the trunk. Slide one heel forward until the leg is nearly straight while keeping the pelvis still. Slide the heel back to the starting position and repeat with the other leg.",
  }),
  draftExercise({
    id: "single_knee_to_chest_stretch",
    name: "Single Knee-to-Chest Stretch",
    region: "Spine & core",
    category: "Stretch",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["selected lower-back stiffness", "hip stiffness", "reduced lumbar mobility"],
    instruction: "Lie on the back with both knees bent. Hold behind one thigh and bring that knee gently toward the chest. Keep the head and shoulders relaxed. Return slowly and change legs. Stop if the movement produces spreading leg pain, numbness or tingling.",
  }),
  draftExercise({
    id: "hip_flexor_stretch",
    name: "Hip Flexor Stretch",
    region: "Spine & core",
    category: "Stretch",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["hip-flexor stiffness", "reduced hip extension", "selected lower-back rehabilitation"],
    instruction: "Lie near the edge of a firm bed. Hold one knee gently toward the chest while allowing the other leg to lower toward the side of the bed. Keep the lower back comfortable and avoid forcing the hanging leg downward.",
  }),
  draftExercise({
    id: "pendulum",
    name: "Shoulder Pendulum",
    region: "Shoulder",
    category: "Mobility",
    tags: [EXERCISE_TAGS.GENERAL, EXERCISE_TAGS.POST_OP, EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["rotator-cuff conditions", "shoulder stiffness", "shoulder-surgery recovery"],
    instruction: "Lean forward and support one hand on a stable counter or table. Let the other arm hang completely relaxed. Shift the body gently to make the hanging arm move forward and backward, side to side and in small circles. Do not actively lift the shoulder.",
  }),
  draftExercise({
    id: "crossover_arm_stretch",
    name: "Crossover Arm Stretch",
    region: "Shoulder",
    category: "Stretch",
    tags: [EXERCISE_TAGS.GENERAL, EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["posterior shoulder stiffness", "reduced shoulder mobility", "rotator-cuff rehabilitation"],
    instruction: "Sit or stand upright with the shoulders relaxed. Bring one arm across the chest. Hold the upper arm with the opposite hand and guide it gently closer to the chest. Do not pull or press directly on the elbow.",
  }),
  draftExercise({
    id: "standing_row",
    name: "Standing Row",
    region: "Shoulder",
    category: "Strengthening",
    tags: [EXERCISE_TAGS.GENERAL, EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["age-related upper-back weakness", "reduced scapular control", "rotator-cuff rehabilitation"],
    instruction: "Anchor a light resistance band at approximately waist height. Hold the band with the elbow bent beside the body. Pull the elbow backward and draw the shoulder blade gently toward the spine. Avoid shrugging, leaning or twisting. Return slowly.",
  }),
  draftExercise({
    id: "external_rotation_with_resistance_band",
    name: "External Rotation with Resistance Band",
    region: "Shoulder",
    category: "Strengthening",
    tags: [EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["rotator-cuff weakness", "shoulder instability", "age-related shoulder weakness"],
    instruction: "Stand or sit with the elbow bent approximately 90 degrees and held against the side. Rotate the forearm outward against light resistance. Keep the elbow touching the body and avoid rotating the trunk. Return slowly.",
  }),
  draftExercise({
    id: "shoulder_forward_elevation_assisted",
    name: "Assisted Shoulder Forward Elevation",
    region: "Shoulder",
    category: "Mobility",
    tags: [EXERCISE_TAGS.POST_OP, EXERCISE_TAGS.CLINICIAN_GUIDED],
    typicalUse: ["shoulder surgery", "shoulder stiffness", "reduced shoulder elevation"],
    instruction: "Lie or sit with the hands clasped or holding a light stick. Use the stronger arm to help raise the recovering arm forward and upward. Keep the shoulder relaxed. Stop at the clinician-approved height and lower slowly.",
  }),
];

export const DRAFT_EXERCISE_MAP = Object.fromEntries(
  DRAFT_EXERCISES.map((exercise) => [exercise.id, exercise])
);

export function requiresClinicianPlan(exercise) {
  return exercise.tags.some((tag) =>
    [EXERCISE_TAGS.CLINICIAN_GUIDED, EXERCISE_TAGS.POST_OP].includes(tag)
  );
}

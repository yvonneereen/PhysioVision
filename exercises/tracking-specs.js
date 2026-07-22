/**
 * Machine-measurement plans for the draft exercise catalog.
 *
 * These are engineering hypotheses, not clinically validated limits. They map
 * human instructions to landmarks and features that could be measured. They
 * deliberately remain outside registry.js and cannot drive live feedback.
 * Every seed threshold must be replaced or confirmed using personal
 * calibration plus clinician-labelled validation videos.
 */

export const TRACKING_SPEC_STATUS = "engineering_draft_requires_validation";
export const PROTOTYPE_TRACKING_SPEC_STATUS =
  "engineering_prototype_requires_real_video_validation";

const DEFAULT_QUALITY_GATES = Object.freeze({
  minimumLandmarkVisibility: 0.65,
  minimumStableDurationMs: 350,
  onTrackingLoss: "pause_immediately_and_hide_positive_feedback",
});

const seedRange = (min, max, unit = "degrees") => ({
  strategy: "engineering_seed",
  range: [min, max],
  unit,
  requiresClinicianVideoValidation: true,
});

const calibratedDelta = (min, max, unit = "degrees") => ({
  strategy: "change_from_personal_calibration",
  range: [min, max],
  unit,
  requiresClinicianVideoValidation: true,
});

const clinicianTarget = (description) => ({
  strategy: "clinician_plan_or_personal_calibration",
  description,
  requiresClinicianVideoValidation: true,
});

const rule = (metric, type, landmarks, acceptance, cue) => ({
  metric,
  type,
  landmarks,
  acceptance,
  cue,
});

const spec = (exerciseId, definition) => ({
  exerciseId,
  status: definition.liveTracking
    ? PROTOTYPE_TRACKING_SPEC_STATUS
    : TRACKING_SPEC_STATUS,
  liveTracking: false,
  qualityGates: DEFAULT_QUALITY_GATES,
  ...definition,
});

const ALL_HAND_LANDMARKS = [
  "wrist",
  "thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip",
  "index_mcp", "index_pip", "index_dip", "index_tip",
  "middle_mcp", "middle_pip", "middle_dip", "middle_tip",
  "ring_mcp", "ring_pip", "ring_dip", "ring_tip",
  "pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip",
];

export const DRAFT_TRACKING_SPECS = [
  spec("wrist_extension_stretch", {
    liveTracking: true,
    readiness: "implemented_prototype_requires_real_video_validation",
    tracker: "synchronised_pose_and_hand_landmarker",
    camera: "Close side-oblique view of both forearms and hands",
    requiredLandmarks: {
      pose: ["working_shoulder", "working_elbow", "working_wrist"],
      hand: ["wrist", "index_mcp", "middle_mcp", "pinky_mcp"],
    },
    phases: ["neutral", "wrist_extended", "hold", "neutral"],
    rules: [
      rule("elbow_extension", "joint_angle", ["shoulder", "elbow", "wrist"], seedRange(160, 180), "Straighten your elbow gently"),
      rule("wrist_extension", "joint_angle", ["elbow", "hand_wrist", "middle_mcp"], calibratedDelta(15, 60), "Move the fingers and wrist gently upward"),
      rule("palm_direction", "palm_plane_orientation", ["hand_wrist", "index_mcp", "pinky_mcp"], clinicianTarget("Palm remains approximately downward"), "Turn your palm downward"),
      rule("forearm_stillness", "displacement_ratio", ["elbow", "wrist", "shoulder_width"], seedRange(0, 0.08, "shoulder_width_ratio"), "Keep your forearm still"),
    ],
    cannotVerify: ["amount of assistance from the opposite hand", "pain", "numbness", "tingling"],
  }),

  spec("wrist_flexion_stretch", {
    liveTracking: true,
    readiness: "implemented_prototype_requires_real_video_validation",
    tracker: "synchronised_pose_and_hand_landmarker",
    camera: "Close side-oblique view of both forearms and hands",
    requiredLandmarks: {
      pose: ["working_shoulder", "working_elbow", "working_wrist"],
      hand: ["wrist", "index_mcp", "middle_mcp", "pinky_mcp"],
    },
    phases: ["neutral", "wrist_flexed", "hold", "neutral"],
    rules: [
      rule("elbow_extension", "joint_angle", ["shoulder", "elbow", "wrist"], seedRange(160, 180), "Straighten your elbow gently"),
      rule("wrist_flexion", "joint_angle", ["elbow", "hand_wrist", "middle_mcp"], calibratedDelta(15, 60), "Point the fingers gently toward the floor"),
      rule("palm_direction", "palm_plane_orientation", ["hand_wrist", "index_mcp", "pinky_mcp"], clinicianTarget("Palm remains approximately downward"), "Turn your palm downward"),
      rule("shoulder_stillness", "displacement_ratio", ["shoulder", "hip", "shoulder_width"], seedRange(0, 0.08, "shoulder_width_ratio"), "Relax your shoulder and keep it still"),
    ],
    cannotVerify: ["stretch force", "pain"],
  }),

  spec("tendon_glides", {
    liveTracking: true,
    readiness: "rule_based_prototype_requires_real_video_validation",
    tracker: "hand_landmarker_and_temporal_shape_rules",
    camera: "Close frontal-oblique view with the forearm supported and entire hand visible",
    requiredLandmarks: { pose: [], hand: ALL_HAND_LANDMARKS },
    phases: ["straight", "hook_fist", "straight", "full_fist", "straight", "tabletop", "straight", "straight_fist", "straight"],
    rules: [
      rule("hand_shape", "temporal_hand_shape_rules", ALL_HAND_LANDMARKS, clinicianTarget("Classifier validated for the five required shapes and returns to straight between shapes"), "Follow the displayed hand shape slowly"),
      rule("wrist_neutral", "hand_axis_angle", ["wrist", "middle_mcp", "forearm_axis"], seedRange(-15, 15), "Keep your wrist straight"),
    ],
    cannotVerify: ["tendon loading", "pain", "force"],
  }),

  spec("forearm_supination_pronation_strengthening", {
    readiness: "requires_pose_and_hand_tracker",
    tracker: "holistic_pose_and_hands",
    camera: "Close frontal-oblique view of the working arm, hand and object",
    requiredLandmarks: {
      pose: ["working_shoulder", "working_elbow", "working_wrist", "working_hip"],
      hand: ["wrist", "index_mcp", "middle_mcp", "pinky_mcp"],
    },
    phases: ["neutral", "palm_up", "neutral", "palm_down", "neutral"],
    rules: [
      rule("elbow_flexion", "joint_angle", ["shoulder", "elbow", "wrist"], seedRange(75, 105), "Keep your elbow bent near a right angle"),
      rule("palm_rotation", "palm_plane_orientation", ["hand_wrist", "index_mcp", "pinky_mcp"], clinicianTarget("Sequence neutral, palm up, neutral, palm down"), "Rotate only your forearm"),
      rule("upper_arm_stillness", "displacement_ratio", ["shoulder", "elbow", "torso_width"], seedRange(0, 0.1, "torso_width_ratio"), "Keep your elbow beside your body"),
    ],
    cannotVerify: ["object weight", "secure grip", "resistance level"],
  }),

  spec("stress_ball_squeeze", {
    readiness: "manual_review_only_until_occlusion_testing",
    tracker: "hands_plus_optional_object_detector",
    camera: "Close view of the hand and ball with forearm supported",
    requiredLandmarks: { pose: [], hand: ALL_HAND_LANDMARKS },
    phases: ["open", "closed_around_ball", "brief_pause", "open"],
    rules: [
      rule("hand_open_close", "finger_flexion_classifier", ALL_HAND_LANDMARKS, clinicianTarget("Complete opening and gentle closing sequence"), "Open your hand completely between squeezes"),
    ],
    cannotVerify: ["grip force", "maximum effort", "ball softness", "pain", "landmarks hidden by the ball"],
  }),

  spec("ankle_pumps", {
    readiness: "requires_pose_feature_implementation",
    tracker: "pose",
    camera: "Close side view with the supported leg and complete foot visible",
    requiredLandmarks: { pose: ["working_hip", "working_knee", "working_ankle", "working_heel", "working_foot_index"], hand: [] },
    phases: ["neutral", "toes_toward_shin", "neutral", "toes_away", "neutral"],
    rules: [
      rule("ankle_motion", "joint_angle", ["knee", "ankle", "foot_index"], calibratedDelta(8, 45), "Move your toes through your comfortable range"),
      rule("knee_stillness", "angle_change", ["hip", "knee", "ankle"], seedRange(0, 8), "Keep your knee and upper leg still"),
    ],
    cannotVerify: ["bandage restrictions", "pain", "circulation status"],
  }),

  spec("ankle_rotations", {
    readiness: "pose_limited_requires_trajectory_validation",
    tracker: "pose",
    camera: "Close frontal-oblique view with the supported lower leg and foot visible",
    requiredLandmarks: { pose: ["working_knee", "working_ankle", "working_heel", "working_foot_index"], hand: [] },
    phases: ["neutral", "clockwise_circle", "neutral", "counterclockwise_circle"],
    rules: [
      rule("foot_trajectory", "normalized_2d_trajectory", ["ankle", "heel", "foot_index"], clinicianTarget("Small smooth circles in both directions relative to personal range"), "Make a small circle from your ankle"),
      rule("leg_stillness", "displacement_ratio", ["knee", "ankle", "shin_length"], seedRange(0, 0.08, "shin_length_ratio"), "Avoid moving your whole leg"),
    ],
    cannotVerify: ["true ankle inversion and eversion from a single foot-tip landmark", "pain"],
  }),

  spec("ankle_range_of_motion", {
    readiness: "pose_limited_requires_trajectory_classifier",
    tracker: "pose",
    camera: "Close frontal-oblique view with the raised foot filling a substantial part of the frame",
    requiredLandmarks: { pose: ["working_hip", "working_knee", "working_ankle", "working_foot_index"], hand: [] },
    phases: ["foot_lifted", "letter_trajectory", "foot_lifted"],
    rules: [
      rule("toe_path", "normalized_2d_trajectory", ["ankle", "foot_index"], clinicianTarget("Smooth small letter-like paths within calibrated range"), "Trace the letter using your ankle"),
      rule("knee_hip_stillness", "displacement_ratio", ["hip", "knee", "shin_length"], seedRange(0, 0.08, "shin_length_ratio"), "Keep your knee and hip still"),
    ],
    cannotVerify: ["exact alphabet recognition without a trained trajectory model", "pain"],
  }),

  spec("ankle_dorsiflexion_plantar_flexion", {
    readiness: "requires_pose_feature_implementation",
    tracker: "pose",
    camera: "Close side view with the supported leg, ankle, foot and band path visible",
    requiredLandmarks: { pose: ["working_hip", "working_knee", "working_ankle", "working_heel", "working_foot_index"], hand: [] },
    phases: ["neutral", "dorsiflexed", "neutral", "plantar_flexed", "neutral"],
    rules: [
      rule("ankle_motion", "joint_angle", ["knee", "ankle", "foot_index"], calibratedDelta(8, 45), "Move slowly through the prescribed direction"),
      rule("return_control", "angular_velocity", ["knee", "ankle", "foot_index"], clinicianTarget("Maximum return speed learned from supervised repetitions"), "Return more slowly and with control"),
    ],
    cannotVerify: ["band security", "band resistance", "prescribed load", "pain"],
  }),

  spec("supported_single_leg_balance", {
    readiness: "requires_pose_feature_implementation_and_support_check",
    tracker: "pose",
    camera: "Full-body frontal view beside a clearly visible fixed support",
    requiredLandmarks: { pose: ["both_shoulders", "both_hips", "both_knees", "both_ankles", "both_heels", "both_foot_indices", "both_wrists"], hand: [] },
    phases: ["both_feet_down", "supported_single_leg", "both_feet_down"],
    rules: [
      rule("raised_foot_clearance", "distance_ratio", ["raised_ankle", "standing_ankle", "shin_length"], calibratedDelta(0.05, 0.35, "shin_length_ratio"), "Lift the other foot only slightly"),
      rule("trunk_upright", "trunk_angle", ["both_shoulders", "both_hips"], seedRange(0, 12), "Keep your body upright"),
      rule("body_sway", "time_window_displacement", ["shoulder_midpoint", "hip_midpoint", "shoulder_width"], seedRange(0, 0.12, "shoulder_width_ratio"), "Hold the support and steady yourself"),
      rule("standing_knee", "joint_angle", ["hip", "knee", "ankle"], clinicianTarget("Slightly relaxed relative to personal standing calibration"), "Keep your standing knee gently relaxed"),
    ],
    cannotVerify: ["strength or stability of the support", "actual hand grip", "imminent fall"],
  }),

  spec("clamshell", {
    readiness: "pose_limited_due_to_side_lying_occlusion",
    tracker: "pose",
    camera: "Elevated frontal-oblique view of the entire side-lying body",
    requiredLandmarks: { pose: ["both_shoulders", "both_hips", "both_knees", "both_ankles"], hand: [] },
    phases: ["knees_together", "upper_knee_raised", "knees_together"],
    rules: [
      rule("knee_separation", "distance_ratio", ["both_knees", "thigh_length"], calibratedDelta(0.12, 0.8, "thigh_length_ratio"), "Raise your upper knee within your comfortable range"),
      rule("feet_together", "distance_ratio", ["both_ankles", "shin_length"], seedRange(0, 0.18, "shin_length_ratio"), "Keep your feet together"),
      rule("pelvis_roll", "torso_pelvis_orientation_change", ["both_shoulders", "both_hips"], seedRange(0, 12), "Keep your pelvis facing forward"),
    ],
    cannotVerify: ["muscle activation", "pelvic position when hip landmarks overlap"],
  }),

  spec("supported_forward_step_up", {
    readiness: "requires_pose_feature_implementation_and_step_detection",
    tracker: "pose_plus_optional_step_detector",
    camera: "Full-body 45-degree side view including the complete step and support",
    requiredLandmarks: { pose: ["both_shoulders", "both_hips", "both_knees", "both_ankles", "both_heels", "both_foot_indices", "both_wrists"], hand: [] },
    phases: ["floor", "working_foot_on_step", "body_raised", "controlled_descent", "floor"],
    rules: [
      rule("top_knee_extension", "joint_angle", ["working_hip", "working_knee", "working_ankle"], seedRange(150, 178), "Straighten the supporting leg without locking it"),
      rule("trunk_control", "trunk_angle", ["both_shoulders", "both_hips"], seedRange(0, 20), "Keep your body upright over the step"),
      rule("descent_control", "vertical_velocity", ["hip_midpoint", "body_height"], clinicianTarget("Maximum descent speed learned from supervised repetitions"), "Step down more slowly"),
    ],
    cannotVerify: ["step stability", "foot fully supported without step segmentation", "actual rail grip"],
  }),

  spec("walking_progression", {
    readiness: "requires_gait_cycle_model_and_longer_capture_area",
    tracker: "pose",
    camera: "Full-body side or 45-degree view with several uninterrupted steps visible",
    requiredLandmarks: { pose: ["both_shoulders", "both_hips", "both_knees", "both_ankles", "both_heels", "both_foot_indices"], hand: [] },
    phases: ["heel_contact", "mid_stance", "toe_off", "swing", "opposite_heel_contact"],
    rules: [
      rule("gait_events", "temporal_gait_classifier", ["both_hips", "both_knees", "both_ankles", "both_heels", "both_foot_indices"], clinicianTarget("Validated heel-contact and toe-off sequence"), "Place your heel down first and push away through your toes"),
      rule("step_length_symmetry", "bilateral_distance_ratio", ["both_ankles", "leg_length"], seedRange(0, 0.18, "left_right_difference_ratio"), "Aim for similar step lengths"),
      rule("trunk_lean", "trunk_angle", ["both_shoulders", "both_hips"], seedRange(0, 15), "Walk upright without leaning sideways"),
      rule("foot_clearance", "vertical_clearance_ratio", ["swing_foot_index", "stance_foot_index", "foot_length"], clinicianTarget("Minimum clearance based on personal safe gait calibration"), "Lift your foot enough to avoid dragging it"),
    ],
    cannotVerify: ["walking endurance from a short clip", "floor hazards", "pain"],
  }),

  spec("walking_with_mobility_aid", {
    readiness: "manual_review_only_until_aid_and_weight_bearing_sensors_exist",
    tracker: "pose_plus_custom_mobility_aid_detector",
    camera: "Full-body side or 45-degree view including the complete mobility aid",
    requiredLandmarks: { pose: ["both_shoulders", "both_hips", "both_knees", "both_ankles", "both_heels", "both_foot_indices", "both_wrists"], hand: [] },
    phases: ["aid_forward", "recovering_leg_forward", "other_leg_through"],
    rules: [
      rule("step_sequence", "temporal_pose_and_object_sequence", ["both_wrists", "both_ankles", "mobility_aid_bbox"], clinicianTarget("Aid and leg order specified by the clinician"), "Follow the prescribed aid and stepping sequence"),
    ],
    cannotVerify: ["weight bearing through each leg", "aid type and fit", "aid stability", "clinician restrictions", "fall risk"],
  }),

  spec("hip_bridge", {
    readiness: "requires_pose_feature_implementation",
    tracker: "pose",
    camera: "Full-body side view at approximately bed or floor height",
    requiredLandmarks: { pose: ["working_shoulder", "working_hip", "working_knee", "working_ankle", "working_heel"], hand: [] },
    phases: ["pelvis_down", "bridge", "pelvis_down"],
    rules: [
      rule("bridge_alignment", "joint_angle", ["shoulder", "hip", "knee"], seedRange(155, 180), "Raise your pelvis until your shoulders, hips and knees align"),
      rule("pelvis_lift", "vertical_displacement_ratio", ["hip", "thigh_length"], calibratedDelta(0.1, 0.65, "thigh_length_ratio"), "Lift your pelvis within your comfortable range"),
      rule("foot_stillness", "displacement_ratio", ["ankle", "heel", "foot_length"], seedRange(0, 0.12, "foot_length_ratio"), "Keep your feet planted"),
    ],
    cannotVerify: ["abdominal or buttock contraction", "lumbar segment arching from pose landmarks alone", "pain"],
  }),

  spec("heel_slides", {
    readiness: "requires_pose_feature_implementation",
    tracker: "pose",
    camera: "Elevated side-oblique view of the entire supine body and both feet",
    requiredLandmarks: { pose: ["both_shoulders", "both_hips", "both_knees", "both_ankles", "both_heels"], hand: [] },
    phases: ["knee_bent", "heel_slid_forward", "knee_bent", "change_side"],
    rules: [
      rule("knee_extension", "joint_angle", ["hip", "knee", "ankle"], clinicianTarget("Nearly straight endpoint based on comfortable calibration"), "Slide your heel farther only if comfortable"),
      rule("heel_path", "surface_trajectory", ["heel", "hip", "body_length"], clinicianTarget("Slow forward-and-back path without lifting"), "Keep your heel supported as it slides"),
      rule("pelvis_stillness", "displacement_ratio", ["both_hips", "torso_length"], seedRange(0, 0.08, "torso_length_ratio"), "Keep your pelvis still"),
    ],
    cannotVerify: ["trunk bracing", "surface contact", "pain"],
  }),

  spec("single_knee_to_chest_stretch", {
    readiness: "requires_pose_feature_implementation",
    tracker: "pose",
    camera: "Elevated side-oblique view of the complete supine body",
    requiredLandmarks: { pose: ["both_shoulders", "both_hips", "both_knees", "both_ankles", "both_wrists"], hand: [] },
    phases: ["both_knees_bent", "one_knee_toward_chest", "both_knees_bent", "change_side"],
    rules: [
      rule("hip_flexion", "joint_angle", ["shoulder", "working_hip", "working_knee"], clinicianTarget("Comfortable clinician-approved endpoint"), "Bring your knee gently toward your chest"),
      rule("upper_body_stillness", "displacement_ratio", ["both_shoulders", "torso_length"], seedRange(0, 0.08, "torso_length_ratio"), "Keep your head and shoulders relaxed"),
    ],
    cannotVerify: ["where the hands apply pressure", "spreading pain", "numbness", "tingling"],
  }),

  spec("hip_flexor_stretch", {
    readiness: "pose_limited_due_to_bed_edge_and_occlusion",
    tracker: "pose",
    camera: "Full-body side view including the bed edge and hanging leg",
    requiredLandmarks: { pose: ["both_shoulders", "both_hips", "both_knees", "both_ankles", "both_wrists"], hand: [] },
    phases: ["both_legs_supported", "one_knee_held", "other_leg_lowered", "return"],
    rules: [
      rule("held_hip_flexion", "joint_angle", ["shoulder", "held_hip", "held_knee"], clinicianTarget("Comfortable held-knee position"), "Hold one knee gently toward your chest"),
      rule("hanging_hip_extension", "joint_angle", ["shoulder", "hanging_hip", "hanging_knee"], clinicianTarget("Clinician-approved comfortable endpoint"), "Allow the other leg to lower without forcing it"),
      rule("pelvis_control", "pelvis_orientation_change", ["both_hips", "both_shoulders"], seedRange(0, 12), "Keep your lower back comfortable and pelvis steady"),
    ],
    cannotVerify: ["bed firmness and edge safety", "lumbar comfort", "stretch force"],
  }),

  spec("pendulum", {
    readiness: "pose_limited_because_passive_motion_is_not_observable",
    tracker: "pose",
    camera: "Full upper-body side-oblique view including the support surface and hanging arm",
    requiredLandmarks: { pose: ["both_shoulders", "both_elbows", "both_wrists", "both_hips"], hand: [] },
    phases: ["supported_lean", "small_swing_or_circle", "supported_lean"],
    rules: [
      rule("forward_lean", "trunk_angle", ["both_shoulders", "both_hips"], seedRange(20, 70), "Lean forward while supporting yourself"),
      rule("hanging_elbow", "joint_angle", ["shoulder", "elbow", "wrist"], seedRange(145, 180), "Let the hanging arm relax"),
      rule("wrist_path", "normalized_2d_trajectory", ["shoulder", "wrist", "arm_length"], clinicianTarget("Small forward/back, side-to-side or circular path"), "Keep the movement small and gentle"),
    ],
    cannotVerify: ["whether the shoulder is passive rather than actively lifting", "support stability", "pain"],
  }),

  spec("crossover_arm_stretch", {
    readiness: "requires_pose_feature_implementation",
    tracker: "pose",
    camera: "Frontal upper-body view with both arms and hands visible",
    requiredLandmarks: { pose: ["both_shoulders", "both_elbows", "both_wrists", "both_hips"], hand: [] },
    phases: ["arms_relaxed", "working_arm_across_chest", "hold", "arms_relaxed"],
    rules: [
      rule("arm_across_midline", "horizontal_distance_ratio", ["working_wrist", "torso_midline", "shoulder_width"], calibratedDelta(0.1, 0.8, "shoulder_width_ratio"), "Bring your arm gently across your chest"),
      rule("shoulder_height", "bilateral_height_difference_ratio", ["both_shoulders", "torso_length"], seedRange(0, 0.08, "torso_length_ratio"), "Keep your shoulders relaxed"),
      rule("trunk_rotation", "torso_orientation_change", ["both_shoulders", "both_hips"], seedRange(0, 12), "Keep your body facing forward"),
    ],
    cannotVerify: ["pressure applied directly to the elbow", "stretch force", "pain"],
  }),

  spec("standing_row", {
    readiness: "requires_pose_feature_implementation",
    tracker: "pose",
    camera: "45-degree upper-body view including the band anchor, torso and working arm",
    requiredLandmarks: { pose: ["both_shoulders", "working_elbow", "working_wrist", "both_hips"], hand: [] },
    phases: ["arm_forward", "elbow_pulled_back", "arm_forward"],
    rules: [
      rule("elbow_retraction", "posterior_displacement_ratio", ["working_elbow", "working_shoulder", "upper_arm_length"], calibratedDelta(0.12, 0.8, "upper_arm_length_ratio"), "Pull your elbow backward beside your body"),
      rule("trunk_control", "trunk_angle_change", ["both_shoulders", "both_hips"], seedRange(0, 10), "Avoid leaning or twisting"),
      rule("shoulder_shrug", "shoulder_height_change_ratio", ["working_shoulder", "opposite_shoulder", "torso_length"], seedRange(0, 0.08, "torso_length_ratio"), "Keep your shoulder down and relaxed"),
    ],
    cannotVerify: ["scapular retraction directly", "band anchor security", "band resistance", "grip"],
  }),

  spec("external_rotation_with_resistance_band", {
    readiness: "requires_pose_feature_implementation",
    tracker: "pose",
    camera: "Frontal upper-body view including both shoulders, hips and working forearm",
    requiredLandmarks: { pose: ["both_shoulders", "working_elbow", "working_wrist", "both_hips"], hand: [] },
    phases: ["forearm_forward", "forearm_rotated_out", "forearm_forward"],
    rules: [
      rule("elbow_flexion", "joint_angle", ["shoulder", "elbow", "wrist"], seedRange(75, 105), "Keep your elbow bent near a right angle"),
      rule("elbow_beside_body", "distance_ratio", ["elbow", "hip", "torso_width"], seedRange(0, 0.28, "torso_width_ratio"), "Keep your elbow touching your side"),
      rule("outward_rotation", "wrist_lateral_displacement_ratio", ["wrist", "elbow", "forearm_length"], calibratedDelta(0.12, 0.9, "forearm_length_ratio"), "Rotate your forearm outward without moving your elbow"),
      rule("trunk_rotation", "torso_orientation_change", ["both_shoulders", "both_hips"], seedRange(0, 10), "Keep your trunk facing forward"),
    ],
    cannotVerify: ["band resistance", "elbow contact force", "shoulder internal motion quality"],
  }),

  spec("shoulder_forward_elevation_assisted", {
    readiness: "requires_pose_feature_implementation_and_clinician_target",
    tracker: "pose",
    camera: "Frontal or 45-degree upper-body view with both complete arms visible",
    requiredLandmarks: { pose: ["both_shoulders", "both_elbows", "both_wrists", "both_hips"], hand: [] },
    phases: ["arms_down", "assisted_elevation", "clinician_approved_height", "arms_down"],
    rules: [
      rule("shoulder_elevation", "joint_angle", ["hip", "shoulder", "elbow"], clinicianTarget("Maximum elevation angle must come from the clinician plan and personal calibration"), "Stop at your approved height"),
      rule("hand_proximity", "distance_ratio", ["both_wrists", "forearm_length"], seedRange(0, 0.3, "forearm_length_ratio"), "Keep your hands clasped or together on the stick"),
      rule("trunk_compensation", "trunk_angle", ["both_shoulders", "both_hips"], seedRange(0, 15), "Keep your body still as your arms rise"),
      rule("shoulder_shrug", "shoulder_height_change_ratio", ["both_shoulders", "torso_length"], seedRange(0, 0.1, "torso_length_ratio"), "Relax your shoulder"),
    ],
    cannotVerify: ["which arm supplies assistance", "stick grip", "post-operative restriction unless supplied by clinician plan", "pain"],
  }),
];

export const DRAFT_TRACKING_SPEC_MAP = Object.fromEntries(
  DRAFT_TRACKING_SPECS.map((trackingSpec) => [trackingSpec.exerciseId, trackingSpec])
);

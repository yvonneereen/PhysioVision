import json
import re


class WellnessPlanValidationError(ValueError):
    pass


GOAL_LABELS = {
    "stronger_knees": "Stronger knees",
    "better_balance": "Better balance",
    "less_stiffness": "Move with less stiffness",
    "stay_active": "Stay active",
    "stronger_hips": "Stronger hips",
    "shoulder_mobility": "Better shoulder movement",
    "ankle_mobility": "Better ankle movement",
    "walking_confidence": "Walk with confidence",
    "other": "Other",
}


# This is the AI agent's reviewed tool catalogue. Gemini may choose only from
# these camera-trackable exercises; names, equipment limits and plan dose
# boundaries are enforced again after generation.
WELLNESS_EXERCISE_CATALOGUE = {
    "half-squats": {
        "name": "Half squats",
        "goals": ["stronger_knees", "better_balance", "stay_active", "walking_confidence"],
        "equipment": "chair",
        "history_cautious": False,
    },
    "leg-extensions": {
        "name": "Seated leg extensions",
        "goals": ["stronger_knees", "stay_active"],
        "equipment": "chair",
        "history_cautious": True,
    },
    "heel-cord-stretch": {
        "name": "Heel cord stretch",
        "goals": ["less_stiffness", "ankle_mobility", "walking_confidence"],
        "equipment": "none",
        "history_cautious": True,
    },
    "calf-raises": {
        "name": "Calf raises",
        "goals": ["stronger_knees", "better_balance", "ankle_mobility", "walking_confidence"],
        "equipment": "chair",
        "history_cautious": False,
    },
    "hamstring-curls": {
        "name": "Hamstring curls",
        "goals": ["stronger_knees", "stay_active", "walking_confidence"],
        "equipment": "chair",
        "history_cautious": False,
    },
    "hip-abduction": {
        "name": "Standing hip abduction",
        "goals": ["better_balance", "stronger_hips", "walking_confidence"],
        "equipment": "chair",
        "history_cautious": False,
    },
    "straight-leg-raises-supine": {
        "name": "Supine straight-leg raises",
        "goals": ["stronger_knees", "stronger_hips"],
        "equipment": "none",
        "history_cautious": True,
    },
    "hip-adduction": {
        "name": "Side-lying hip adduction",
        "goals": ["stronger_hips", "stay_active"],
        "equipment": "none",
        "history_cautious": True,
    },
    "leg-presses": {
        "name": "Elastic-band leg presses",
        "goals": ["stronger_knees", "stronger_hips", "walking_confidence"],
        "equipment": "band",
        "history_cautious": False,
    },
    "pendulum": {
        "name": "Shoulder pendulum",
        "goals": ["shoulder_mobility"],
        "equipment": "none",
        "history_cautious": True,
    },
}

DAY_SCHEDULES = {
    1: ["Mon"],
    2: ["Mon", "Thu"],
    3: ["Mon", "Wed", "Sat"],
    4: ["Mon", "Tue", "Thu", "Sat"],
    5: ["Mon", "Tue", "Wed", "Fri", "Sat"],
    6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
}

WELLNESS_SETS = 1
WELLNESS_REPETITIONS_MIN = 6
WELLNESS_REPETITIONS_MAX = 10
WELLNESS_DOSAGE_LABEL = "1 set of 6–10 repetitions"


def _clean_text(value, *, maximum):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:maximum]


def allowed_exercises(preferences):
    equipment = preferences.get("equipment", "chair")
    history_cautious = bool(preferences.get("has_relevant_history"))
    supported_equipment = {
        "none": {"none"},
        "chair": {"none", "chair"},
        "chair_band": {"none", "chair", "band"},
    }.get(equipment, {"none", "chair"})
    return {
        exercise_id: exercise
        for exercise_id, exercise in WELLNESS_EXERCISE_CATALOGUE.items()
        if exercise["equipment"] in supported_equipment
        and (
            not history_cautious
            or exercise.get("history_cautious") is True
        )
    }


def normalize_wellness_plan(raw_plan, preferences):
    if not isinstance(raw_plan, dict):
        raise WellnessPlanValidationError("The AI response was not a plan object.")

    expected_days = int(preferences.get("days_per_week", 3))
    if expected_days not in DAY_SCHEDULES:
        raise WellnessPlanValidationError("Choose between one and seven sessions per week.")

    available = allowed_exercises(preferences)
    history_cautious = bool(preferences.get("has_relevant_history"))
    raw_days = raw_plan.get("days")
    if not isinstance(raw_days, list) or len(raw_days) != expected_days:
        raise WellnessPlanValidationError(
            f"The draft must contain exactly {expected_days} sessions."
        )

    maximum_exercises = 1 if history_cautious else 2
    days = []
    selected_ids = []
    for index, raw_day in enumerate(raw_days):
        if not isinstance(raw_day, dict):
            raise WellnessPlanValidationError("Every session must be an object.")
        exercise_ids = raw_day.get("exercise_ids", raw_day.get("exerciseIds"))
        if (
            not isinstance(exercise_ids, list)
            or not 1 <= len(exercise_ids) <= maximum_exercises
        ):
            raise WellnessPlanValidationError(
                (
                    "Every session must contain one lower-load reviewed "
                    "exercise when recovered history is being considered."
                    if history_cautious
                    else (
                        "Every session must contain one or two reviewed "
                        "exercises."
                    )
                )
            )
        exercise_ids = list(dict.fromkeys(str(item) for item in exercise_ids))
        if not exercise_ids or any(item not in available for item in exercise_ids):
            raise WellnessPlanValidationError(
                "The draft included an exercise outside the reviewed catalogue."
            )
        exercise_names = [available[item]["name"] for item in exercise_ids]
        selected_ids.extend(exercise_ids)
        days.append({
            "day": DAY_SCHEDULES[expected_days][index],
            "title": _clean_text(
                raw_day.get("title") or f"Session {index + 1}",
                maximum=70,
            ),
            "exercise_ids": exercise_ids,
            "exerciseIds": exercise_ids,
            "exercises": " · ".join(exercise_names),
            "sets": WELLNESS_SETS,
            "repetitions_min": WELLNESS_REPETITIONS_MIN,
            "repetitions_max": WELLNESS_REPETITIONS_MAX,
            "dosage": WELLNESS_DOSAGE_LABEL,
        })

    goal = preferences.get("goal", "stay_active")
    if goal != "other" and not any(
        goal in WELLNESS_EXERCISE_CATALOGUE[exercise_id]["goals"]
        for exercise_id in selected_ids
    ):
        raise WellnessPlanValidationError(
            "The draft does not include an exercise related to the selected goal."
        )

    rationale = raw_plan.get("rationale")
    if not isinstance(rationale, list):
        rationale = []
    rationale = [
        _clean_text(item, maximum=180)
        for item in rationale[:3]
        if _clean_text(item, maximum=180)
    ]
    rationale = [
        item
        for item in rationale
        if not re.search(r"\b(?:minute|minutes|min|duration)\b", item, re.I)
    ]
    if not rationale:
        rationale = [
            "The draft uses only reviewed exercises compatible with your answers and available equipment."
        ]
    dosage_rationale = (
        "Uses one set of 6–10 repetitions for each exercise to keep the "
        "starting dose manageable."
    )
    if not any("6–10" in item for item in rationale):
        rationale = rationale[:2] + [dosage_rationale]
    if history_cautious:
        rationale = [
            (
                "Your recovered medical or injury history was treated as a "
                "caution, so this draft uses the lower-load reviewed subset "
                "and one movement per session."
            ),
            dosage_rationale,
            (
                "Every session still requires your review, and you should "
                "stop if a movement causes pain or concerning symptoms."
            ),
        ]

    goal_label = (
        _clean_text(preferences.get("custom_goal"), maximum=120)
        if goal == "other"
        else GOAL_LABELS.get(goal, "Stay active")
    )
    return {
        "version": 1,
        "source": "gemini_wellness_agent",
        "goal": goal_label or "Stay active",
        "summary": (
            f"A cautious starting plan focused on "
            f"{goal_label or 'staying active'}."
            if history_cautious
            else _clean_text(
                raw_plan.get("summary")
                or (
                    f"A gradual plan focused on "
                    f"{goal_label or 'staying active'}."
                ),
                maximum=240,
            )
        ),
        "rationale": rationale,
        "days": days,
        "constraints": {
            "days_per_week": expected_days,
            "sets_per_exercise": WELLNESS_SETS,
            "repetitions_min": WELLNESS_REPETITIONS_MIN,
            "repetitions_max": WELLNESS_REPETITIONS_MAX,
            "equipment": preferences.get("equipment", "chair"),
            "recovered_history_considered": history_cautious,
            "safety_screen_required": True,
        },
        "agent_trace": [
            "Confirmed the general-wellness safety screen is eligible.",
            f"Filtered the reviewed catalogue to {len(available)} compatible exercises.",
            *(
                [
                    (
                        "Applied the recovered-history caution: lower-load "
                        "movements, one movement per session and a fixed "
                        "single-set dose."
                    )
                ]
                if history_cautious
                else []
            ),
            "Validated every exercise and session against fixed application limits.",
        ],
    }


def _extract_json(text):
    candidate = str(text or "").strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*", "", candidate)
        candidate = re.sub(r"\s*```$", "", candidate)
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start < 0 or end <= start:
        raise WellnessPlanValidationError("The AI response did not contain JSON.")
    try:
        return json.loads(candidate[start:end + 1])
    except json.JSONDecodeError as exc:
        raise WellnessPlanValidationError("The AI response contained invalid JSON.") from exc


def _planner_prompt(user, preferences, previous_plan=None, revision=""):
    available = allowed_exercises(preferences)
    catalogue = [
        {
            "id": exercise_id,
            "name": item["name"],
            "suitable_goals": item["goals"],
            "equipment": item["equipment"],
        }
        for exercise_id, item in available.items()
    ]
    goal = preferences.get("goal", "stay_active")
    goal_label = (
        preferences.get("custom_goal")
        if goal == "other"
        else GOAL_LABELS.get(goal, "Stay active")
    )
    planning_input = {
        "preferred_name": user.first_name or "the user",
        "age": preferences.get("age"),
        "height_cm": preferences.get("height_cm"),
        "weight_kg": str(preferences.get("weight_kg") or ""),
        "goal": goal_label,
        "activity_level": preferences.get("activity_level"),
        "focus_side": preferences.get("focus_side"),
        "coaching_style": preferences.get("cue_style"),
        "days_per_week": preferences.get("days_per_week"),
        "fixed_dosage": {
            "sets": WELLNESS_SETS,
            "repetitions_min": WELLNESS_REPETITIONS_MIN,
            "repetitions_max": WELLNESS_REPETITIONS_MAX,
        },
        "equipment": preferences.get("equipment"),
        "user_notes": preferences.get("planning_notes", ""),
        "history_cautious_mode": bool(
            preferences.get("has_relevant_history")
        ),
        "recovered_medical_or_injury_history": preferences.get(
            "medical_history",
            "",
        ),
        "revision_request": revision,
        "previous_draft": previous_plan or None,
        "reviewed_catalogue_tool_result": catalogue,
    }
    return json.dumps(planning_input, ensure_ascii=True)


def generate_wellness_plan(user, preferences, *, previous_plan=None, revision=""):
    from django.conf import settings

    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    from google import genai
    from google.genai import types

    system_instruction = """
You are the PhysioVision general-wellness planning agent for an older adult.
The application has already completed a separate, deterministic safety screen.
You do not diagnose, medically clear, or create rehabilitation treatment.

Use only exercise IDs from reviewed_catalogue_tool_result. Create exactly the
requested number of sessions, with one or two exercises per session. The
application assigns every selected exercise one set of 6–10 repetitions; do not
choose or change the dose. Prefer gradual variety and the user's stated goal,
activity, equipment and notes. A revision request may change the draft but can
never loosen those rules.

If history_cautious_mode is true, treat the recovered history only as a
conservative planning constraint, never as a diagnosis or medical clearance.
Use only the already-filtered lower-load catalogue, choose exactly one movement
per session, and do not claim that the plan will prevent pain. The rationale
should briefly explain how the reported history made the draft more cautious
without repeating sensitive details.

Return JSON only, using this shape:
{
  "summary": "one short, supportive explanation",
  "rationale": ["reason one", "reason two"],
  "days": [
    {
      "title": "short session title",
      "exercise_ids": ["reviewed-id"]
    }
  ]
}
Do not include markdown, medical claims, new exercises, dosage fields,
diagnoses, or anything outside the JSON object.
""".strip()

    # Bound each provider attempt below the web-worker deadline. The planner
    # may make a second attempt when Gemini returns malformed or unsafe JSON,
    # so two 50-second calls still fit inside Gunicorn's 120-second timeout.
    client = genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options=types.HttpOptions(
            timeout=settings.GEMINI_PLANNER_TIMEOUT_MS,
        ),
    )
    prompt = _planner_prompt(user, preferences, previous_plan, revision)
    validation_feedback = ""
    last_error = None
    for _ in range(2):
        interaction = client.interactions.create(
            model=settings.GEMINI_MODEL,
            system_instruction=system_instruction,
            input=prompt + validation_feedback,
        )
        try:
            return normalize_wellness_plan(
                _extract_json(interaction.output_text),
                preferences,
            )
        except WellnessPlanValidationError as exc:
            last_error = exc
            validation_feedback = (
                "\nThe previous draft failed application validation: "
                f"{exc}. Return a corrected complete JSON object."
            )
    raise RuntimeError("The AI could not produce a safe plan.") from last_error


def accepted_plan_instruction(profile):
    plan = profile.wellness_plan or {}
    if not plan:
        return (
            "No AI wellness plan has been accepted. Invite the user to open "
            "Create my plan with AI; do not invent a plan in chat."
        )
    sessions = "; ".join(
        (
            f"{day.get('day')}: {day.get('exercises')} "
            f"({day.get('dosage') or WELLNESS_DOSAGE_LABEL})"
        )
        for day in plan.get("days", [])
    )
    return (
        "The user accepted this AI-drafted, application-validated wellness "
        f"plan: {sessions}. Explain this plan when asked, but do not silently "
        "replace it. Plan changes must go through the planning review screen."
    )

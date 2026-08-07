import unittest
from pathlib import Path
import sys
import json
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.core.wellness_agent import (
    WellnessPlanValidationError,
    _planner_prompt,
    allowed_exercises,
    normalize_wellness_plan,
)


def preferences(**overrides):
    values = {
        "goal": "stronger_knees",
        "custom_goal": "",
        "activity_level": "lightly_active",
        "focus_side": "both",
        "cue_style": "gentle",
        "days_per_week": 3,
        "minutes_per_session": 10,
        "equipment": "chair",
        "planning_notes": "",
        "has_relevant_history": False,
        "medical_history": "",
    }
    values.update(overrides)
    return values


class WellnessAgentGuardrailTests(unittest.TestCase):
    def test_deployment_deadlines_leave_room_for_two_provider_attempts(self):
        project_root = Path(__file__).resolve().parents[1]
        render_config = (project_root / "render.yaml").read_text()
        gunicorn_config = (project_root / "gunicorn.conf.py").read_text()
        backend_settings = (project_root / "backend/settings.py").read_text()
        planner_source = (
            project_root / "api/core/wellness_agent.py"
        ).read_text()

        self.assertIn("-c gunicorn.conf.py", render_config)
        self.assertIn("timeout = 120", gunicorn_config)
        self.assertIn("threads = 4", gunicorn_config)
        self.assertIn('worker_class = "gthread"', gunicorn_config)
        self.assertIn('value: "50000"', render_config)
        self.assertIn("default=50000", backend_settings)
        self.assertIn(
            "timeout=settings.GEMINI_PLANNER_TIMEOUT_MS",
            planner_source,
        )

    def test_normalizes_a_reviewed_three_day_plan(self):
        plan = normalize_wellness_plan(
            {
                "summary": "A gradual knee-strength plan.",
                "rationale": ["Matches the selected goal."],
                "days": [
                    {
                        "title": "Control",
                        "exercise_ids": ["half-squats"],
                        "duration_minutes": 10,
                    },
                    {
                        "title": "Seated strength",
                        "exercise_ids": ["leg-extensions"],
                        "duration_minutes": 8,
                    },
                    {
                        "title": "Lower-leg support",
                        "exercise_ids": ["calf-raises"],
                        "duration_minutes": 10,
                    },
                ],
            },
            preferences(),
        )

        self.assertEqual(plan["source"], "gemini_wellness_agent")
        self.assertEqual(len(plan["days"]), 3)
        self.assertEqual(plan["days"][0]["day"], "Mon")
        self.assertEqual(plan["days"][0]["exercise_ids"], ["half-squats"])
        self.assertEqual(plan["days"][0]["sets"], 1)
        self.assertEqual(plan["days"][0]["repetitions_min"], 6)
        self.assertEqual(plan["days"][0]["repetitions_max"], 10)
        self.assertEqual(
            plan["days"][0]["dosage"],
            "1 set of 6–10 repetitions",
        )
        self.assertNotIn("duration_minutes", plan["days"][0])

    def test_rejects_an_unreviewed_exercise(self):
        with self.assertRaises(WellnessPlanValidationError):
            normalize_wellness_plan(
                {
                    "days": [
                        {"exercise_ids": ["invented-movement"]},
                        {"exercise_ids": ["leg-extensions"]},
                        {"exercise_ids": ["calf-raises"]},
                    ],
                },
                preferences(),
            )

    def test_rejects_the_wrong_number_of_sessions(self):
        with self.assertRaises(WellnessPlanValidationError):
            normalize_wellness_plan(
                {
                    "days": [
                        {"exercise_ids": ["half-squats"]},
                        {"exercise_ids": ["leg-extensions"]},
                    ],
                },
                preferences(),
            )

    def test_equipment_filter_excludes_chair_and_band_exercises(self):
        available = allowed_exercises(preferences(equipment="none"))
        self.assertNotIn("half-squats", available)
        self.assertNotIn("leg-presses", available)
        self.assertIn("hip-adduction", available)

    def test_clinician_only_exercises_are_never_available_to_wellness_plans(self):
        available = allowed_exercises(preferences(equipment="chair_band"))

        for exercise_id in (
            "ankle_pumps",
            "heel_slides",
            "hip_bridge",
            "clamshell",
        ):
            self.assertNotIn(exercise_id, available)

    def test_walk_with_confidence_catalogue_includes_direct_balance(self):
        walking_preferences = preferences(
            goal="walking_confidence",
            equipment="chair",
            days_per_week=6,
        )
        available = allowed_exercises(walking_preferences)

        self.assertEqual(
            available["supported_single_leg_balance"]["movement_type"],
            "functional_balance",
        )

        prompt = json.loads(_planner_prompt(
            SimpleNamespace(first_name="Yvonne"),
            walking_preferences,
        ))
        supported = next(
            item
            for item in prompt["reviewed_catalogue_tool_result"]
            if item["id"] == "supported_single_leg_balance"
        )
        self.assertEqual(supported["movement_type"], "functional_balance")
        self.assertTrue(any(
            "at least 2 sessions" in rule
            for rule in prompt["selection_rules"]
        ))

    def test_rejects_strength_only_walk_with_confidence_draft(self):
        with self.assertRaisesRegex(
            WellnessPlanValidationError,
            "strength work alone",
        ):
            normalize_wellness_plan(
                {
                    "days": [
                        {"exercise_ids": ["half-squats"]},
                        {"exercise_ids": ["calf-raises"]},
                        {"exercise_ids": ["hamstring-curls"]},
                        {"exercise_ids": ["hip-abduction"]},
                        {"exercise_ids": ["calf-raises"]},
                        {"exercise_ids": ["half-squats"]},
                    ],
                },
                preferences(
                    goal="walking_confidence",
                    equipment="chair",
                    days_per_week=6,
                ),
            )

    def test_walk_with_confidence_plan_balances_function_and_strength(self):
        plan = normalize_wellness_plan(
            {
                "summary": "A varied walking-confidence plan.",
                "rationale": ["Matches the selected goal."],
                "days": [
                    {"exercise_ids": ["supported_single_leg_balance"]},
                    {"exercise_ids": ["heel-cord-stretch"]},
                    {"exercise_ids": ["half-squats"]},
                    {"exercise_ids": ["heel-cord-stretch"]},
                    {"exercise_ids": ["supported_single_leg_balance"]},
                    {"exercise_ids": ["calf-raises"]},
                ],
            },
            preferences(
                goal="walking_confidence",
                equipment="chair",
                days_per_week=6,
            ),
        )

        balance_sessions = [
            day
            for day in plan["days"]
            if "supported_single_leg_balance" in day["exercise_ids"]
        ]
        self.assertEqual(len(balance_sessions), 2)
        self.assertIn(
            "challenge balance directly",
            plan["rationale"][0],
        )
        self.assertIn(
            "Required direct balance practice",
            " ".join(plan["agent_trace"]),
        )

    def test_shoulder_goal_uses_the_reviewed_pendulum_detector(self):
        available = allowed_exercises(preferences(
            goal="shoulder_mobility",
            equipment="none",
        ))
        self.assertIn("pendulum", available)

        plan = normalize_wellness_plan(
            {
                "summary": "A gradual shoulder-mobility plan.",
                "days": [
                    {"exercise_ids": ["pendulum"]}
                    for _ in range(3)
                ],
            },
            preferences(goal="shoulder_mobility", equipment="none"),
        )

        self.assertEqual(plan["goal"], "Better shoulder movement")
        self.assertEqual(
            plan["days"][0]["exercises"],
            "Shoulder pendulum",
        )

    def test_supports_a_seven_day_preference(self):
        plan = normalize_wellness_plan(
            {
                "days": [
                    {"exercise_ids": ["hip-adduction"]}
                    for _ in range(7)
                ],
            },
            preferences(
                goal="stay_active",
                days_per_week=7,
                minutes_per_session=30,
            ),
        )

        self.assertEqual(len(plan["days"]), 7)
        self.assertEqual(plan["days"][-1]["day"], "Sun")
        self.assertEqual(plan["constraints"]["sets_per_exercise"], 1)
        self.assertEqual(plan["constraints"]["repetitions_min"], 6)
        self.assertEqual(plan["constraints"]["repetitions_max"], 10)

    def test_recovered_history_uses_cautious_catalogue(self):
        available = allowed_exercises(preferences(
            has_relevant_history=True,
            medical_history="Recovered from an old knee injury.",
        ))

        self.assertNotIn("half-squats", available)
        self.assertNotIn("leg-presses", available)
        self.assertIn("leg-extensions", available)
        self.assertIn("hip-adduction", available)

    def test_recovered_history_uses_fixed_dosage_and_session_size(self):
        cautious = preferences(
            has_relevant_history=True,
            medical_history="Recovered from an old knee injury.",
            minutes_per_session=30,
        )
        plan = normalize_wellness_plan(
            {
                "summary": (
                    "A plan for the user's old right knee injury."
                ),
                "rationale": [
                    "The old right knee injury needs special treatment.",
                ],
                "days": [
                    {
                        "exercise_ids": ["leg-extensions"],
                        "duration_minutes": 30,
                    }
                    for _ in range(3)
                ],
            },
            cautious,
        )

        self.assertEqual(plan["constraints"]["sets_per_exercise"], 1)
        self.assertEqual(plan["constraints"]["repetitions_min"], 6)
        self.assertEqual(plan["constraints"]["repetitions_max"], 10)
        self.assertTrue(
            plan["constraints"]["recovered_history_considered"],
        )
        self.assertTrue(all(
            day["dosage"] == "1 set of 6–10 repetitions"
            for day in plan["days"]
        ))
        self.assertTrue(all(
            "duration_minutes" not in day
            for day in plan["days"]
        ))
        self.assertNotIn("right knee", plan["summary"].lower())
        self.assertNotIn(
            "right knee",
            " ".join(plan["rationale"]).lower(),
        )

        with self.assertRaises(WellnessPlanValidationError):
            normalize_wellness_plan(
                {
                    "days": [
                        {
                            "exercise_ids": [
                                "leg-extensions",
                                "hip-adduction",
                            ],
                        }
                        for _ in range(3)
                    ],
                },
                cautious,
            )


if __name__ == "__main__":
    unittest.main()

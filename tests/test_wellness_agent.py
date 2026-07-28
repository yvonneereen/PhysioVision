import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.core.wellness_agent import (
    WellnessPlanValidationError,
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
    }
    values.update(overrides)
    return values


class WellnessAgentGuardrailTests(unittest.TestCase):
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
        self.assertIn("ankle_pumps", available)


if __name__ == "__main__":
    unittest.main()

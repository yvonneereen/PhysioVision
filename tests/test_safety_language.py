import unittest
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.core.safety_language import (  # noqa: E402
    validate_safety_language_interpretation,
)


class SafetyLanguageValidationTests(unittest.TestCase):
    def test_accepts_only_a_high_confidence_allowed_answer(self):
        result = validate_safety_language_interpretation(
            "side",
            {
                "response": "both",
                "confidence": "high",
                "facts": [],
                "summary": "Pain is on both sides.",
            },
        )
        self.assertTrue(result["matched"])
        self.assertEqual(result["response"], "both")

    def test_medium_confidence_keeps_the_user_on_the_question(self):
        result = validate_safety_language_interpretation(
            "location",
            {
                "response": "knee",
                "confidence": "medium",
                "facts": [],
                "summary": "The location may be the knee.",
            },
        )
        self.assertFalse(result["matched"])
        self.assertEqual(result["response"], "")
        self.assertIn("Where does it hurt", result["retry_prompt"])

    def test_concerning_fact_cannot_be_mapped_to_reassurance(self):
        result = validate_safety_language_interpretation(
            "urgent",
            {
                "response": "no",
                "confidence": "high",
                "facts": ["breathing_difficulty"],
                "summary": "The speaker reports difficulty breathing.",
            },
        )
        self.assertTrue(result["matched"])
        self.assertEqual(result["response"], "yes")

    def test_severe_pain_alone_is_not_relabelled_as_urgent_warning_sign(self):
        result = validate_safety_language_interpretation(
            "urgent",
            {
                "response": "no",
                "confidence": "high",
                "facts": ["severe_pain", "no_reported_warning_sign"],
                "summary": "No listed warning sign, but pain is severe.",
            },
        )
        self.assertTrue(result["matched"])
        self.assertEqual(result["response"], "no")

    def test_inability_to_move_uses_fixed_help_path(self):
        result = validate_safety_language_interpretation(
            "mobility",
            {
                "response": "safe",
                "confidence": "high",
                "facts": ["unable_to_move_safely"],
                "summary": "The speaker cannot stand without help.",
            },
        )
        self.assertTrue(result["matched"])
        self.assertEqual(result["response"], "help")


if __name__ == "__main__":
    unittest.main()

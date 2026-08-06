from types import SimpleNamespace
from unittest.mock import patch

from rest_framework.test import APITestCase

from api.catalogue.models import Exercise, Prescription
from api.core.models import ClinicianProfile, PatientProfile, User, UserRole


class ClinicianAssistantWebsiteTests(APITestCase):
    endpoint = "/api/auth/agent/chat/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="clinician@example.com",
            email="clinician@example.com",
            password="test-password",
            role=UserRole.CLINICIAN,
            first_name="Casey",
        )
        self.clinician = ClinicianProfile.objects.create(
            user=self.user,
            license_number="TEST-CLINICIAN",
        )
        patient_user = User.objects.create_user(
            username="sarah@example.com",
            email="sarah@example.com",
            password="test-password",
            role=UserRole.PATIENT,
            first_name="Sarah",
            last_name="Lee",
        )
        self.patient = PatientProfile.objects.create(
            user=patient_user,
            primary_clinician=self.clinician,
        )

        other_user = User.objects.create_user(
            username="other-clinician@example.com",
            email="other-clinician@example.com",
            password="test-password",
            role=UserRole.CLINICIAN,
        )
        other_clinician = ClinicianProfile.objects.create(
            user=other_user,
            license_number="OTHER-CLINICIAN",
        )
        other_patient_user = User.objects.create_user(
            username="private@example.com",
            email="private@example.com",
            password="test-password",
            role=UserRole.PATIENT,
            first_name="Private",
            last_name="Patient",
        )
        PatientProfile.objects.create(
            user=other_patient_user,
            primary_clinician=other_clinician,
        )

        self.exercise = Exercise.objects.create(
            id="assistant-half-squats",
            name="Assistant Half Squats",
            category="strengthening",
            camera_direction="front",
            rep_rule="start → finish → start",
            tracked_angles_config={},
            phases_config=[],
            cues_config={},
        )
        self.client.force_authenticate(self.user)

    def ask(self, message):
        return self.client.post(self.endpoint, {"message": message}, format="json")

    def test_help_lists_website_commands(self):
        response = self.ask("help")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["command"], "help")
        self.assertIn("my patients", response.data["reply"])
        self.assertIn("build a plan", response.data["reply"])

    def test_roster_and_summary_are_scoped_to_authenticated_clinician(self):
        roster = self.ask("my patients")
        summary = self.ask("summary")

        self.assertIn("1 patient(s)", roster.data["reply"])
        self.assertIn("1 patient(s)", summary.data["reply"])
        self.assertNotIn("Private Patient", roster.data["reply"])

    def test_lookup_cannot_access_another_clinicians_patient(self):
        response = self.ask("pain Private")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["command"], "pain")
        self.assertIn("in your roster", response.data["reply"])

    def test_assign_creates_prescription_for_own_patient(self):
        response = self.ask("assign Assistant Half Squats to Sarah")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["command"], "assign")
        self.assertTrue(response.data["changed"])
        self.assertTrue(Prescription.objects.filter(
            patient=self.patient,
            clinician=self.clinician,
            exercise=self.exercise,
            is_active=True,
        ).exists())

    @patch("api.slack_bot.services.generate_patient_message", return_value="Draft encouragement")
    def test_draft_message_uses_scoped_patient(self, generate_message):
        response = self.ask("draft message for Sarah")

        self.assertEqual(response.data["command"], "draft_message")
        self.assertEqual(response.data["reply"], "Draft encouragement")
        generate_message.assert_called_once_with(self.patient)

    @patch("api.slack_bot.services.build_plan_draft_blocks")
    @patch("api.slack_bot.services.build_plan_draft")
    def test_plan_builder_routes_to_existing_service(self, build_plan, build_blocks):
        draft = SimpleNamespace(
            patient=self.patient,
            plan={
                "summary": "A gentle plan.",
                "days": [{"exercise_ids": [self.exercise.id]}],
                "constraints": {"days_per_week": 4},
            },
            preferences={
                "days_per_week": 4,
                "clinical_summary": "adherence 70%",
                "dose": {self.exercise.id: {"sets": 2, "reps": 8}},
            },
        )
        build_plan.return_value = (self.patient, draft, None)
        build_blocks.return_value = [{
            "type": "section",
            "text": {"type": "mrkdwn", "text": "*Draft programme — Sarah Lee*"},
        }]

        response = self.ask("build a plan for Sarah 4 days with a band")

        self.assertEqual(response.data["command"], "build_plan")
        self.assertTrue(response.data["changed"])
        self.assertIn("Draft programme", response.data["reply"])
        self.assertEqual(response.data["data"]["patient_name"], "Sarah Lee")
        self.assertEqual(response.data["data"]["exercises"][0]["sets"], 2)
        build_plan.assert_called_once_with(
            self.clinician,
            "sarah",
            days_per_week=4,
            equipment="chair_band",
        )

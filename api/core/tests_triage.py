from unittest.mock import patch

from rest_framework.test import APITestCase

from api.consultations.models import CareMessage, MessageSender
from api.core.email_delivery import EmailDeliveryError

from api.core.models import (
    CarePath,
    ClinicianProfile,
    PatientPathwayChoice,
    PatientProfile,
    User,
    UserRole,
)


class ClinicianTriageTests(APITestCase):
    queue_url = "/api/auth/clinician/triage/"

    def setUp(self):
        self.clinician_user = User.objects.create_user(
            username="triage-clinician@example.com",
            email="triage-clinician@example.com",
            password="test-password",
            role=UserRole.CLINICIAN,
        )
        self.clinician = ClinicianProfile.objects.create(
            user=self.clinician_user,
            license_number="TRIAGE-TEST",
        )
        waiting_user = User.objects.create_user(
            username="waiting@example.com",
            email="waiting@example.com",
            password="test-password",
            role=UserRole.PATIENT,
            first_name="Waiting",
            last_name="Patient",
        )
        self.waiting = PatientProfile.objects.create(
            user=waiting_user,
            pathway_choice=PatientPathwayChoice.PHYSIOTHERAPIST,
            care_path=CarePath.CLINICIAN,
            goal="mobility",
        )
        wellness_user = User.objects.create_user(
            username="wellness@example.com",
            email="wellness@example.com",
            password="test-password",
            role=UserRole.PATIENT,
            first_name="Wellness",
        )
        self.wellness = PatientProfile.objects.create(
            user=wellness_user,
            pathway_choice=PatientPathwayChoice.WELLNESS,
            care_path=CarePath.WELLNESS,
        )

    def claim_url(self, patient):
        return f"/api/auth/clinician/triage/{patient.id}/claim/"

    def test_queue_contains_only_unassigned_physio_requests(self):
        self.client.force_authenticate(self.clinician_user)

        response = self.client.get(self.queue_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], str(self.waiting.id))
        self.assertEqual(response.data[0]["name"], "Waiting Patient")

    def test_patient_cannot_view_or_claim_triage(self):
        self.client.force_authenticate(self.waiting.user)

        queue = self.client.get(self.queue_url)
        claim = self.client.post(self.claim_url(self.waiting), {}, format="json")

        self.assertEqual(queue.status_code, 403)
        self.assertEqual(claim.status_code, 403)

    @patch("api.core.views.deliver_email")
    def test_claim_adds_patient_to_roster_and_notifies_them(self, deliver_email):
        self.client.force_authenticate(self.clinician_user)

        response = self.client.post(self.claim_url(self.waiting), {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.waiting.refresh_from_db()
        self.assertEqual(self.waiting.primary_clinician, self.clinician)
        self.assertEqual(self.waiting.care_path, CarePath.NEEDS_REVIEW)
        self.assertEqual(self.client.get(self.queue_url).data, [])
        message = CareMessage.objects.get(patient=self.waiting)
        self.assertEqual(message.clinician, self.clinician)
        self.assertEqual(message.sender, MessageSender.CLINICIAN)
        self.assertIn("accepted your request", message.body)
        deliver_email.assert_called_once_with(
            subject="A physiotherapist has accepted your PhysioVision request",
            message=(
                "Hello Waiting,\n\n"
                "triage-clinician@example.com has accepted your request for "
                "physiotherapist support and is now linked to your PhysioVision "
                "account. They will review your information before recommending or "
                "changing any programme.\n\n"
                "Sign in to PhysioVision to view your care-team messages."
            ),
            recipient="waiting@example.com",
        )
        self.assertEqual(response.data["notification"], {
            "in_app": True,
            "email_sent": True,
        })

    @patch("api.core.views.deliver_email", side_effect=EmailDeliveryError)
    def test_email_failure_does_not_undo_claim_or_in_app_message(self, deliver_email):
        self.client.force_authenticate(self.clinician_user)

        response = self.client.post(self.claim_url(self.waiting), {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.waiting.refresh_from_db()
        self.assertEqual(self.waiting.primary_clinician, self.clinician)
        self.assertTrue(CareMessage.objects.filter(patient=self.waiting).exists())
        self.assertFalse(response.data["notification"]["email_sent"])

    def test_claim_rejects_patient_already_claimed_by_another_clinician(self):
        other_user = User.objects.create_user(
            username="other-triage@example.com",
            email="other-triage@example.com",
            password="test-password",
            role=UserRole.CLINICIAN,
        )
        other = ClinicianProfile.objects.create(
            user=other_user,
            license_number="OTHER-TRIAGE",
        )
        self.waiting.primary_clinician = other
        self.waiting.save(update_fields=["primary_clinician"])
        self.client.force_authenticate(self.clinician_user)

        response = self.client.post(self.claim_url(self.waiting), {}, format="json")

        self.assertEqual(response.status_code, 409)
        self.assertIn("already been claimed", response.data["detail"])

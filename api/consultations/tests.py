from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from api.core.models import (
    ClinicianProfile,
    PatientProfile,
    User,
    UserRole,
)


class PatientConsultationBookingTests(APITestCase):
    def setUp(self):
        self.patient_user = User.objects.create_user(
            username='patient@example.com',
            email='patient@example.com',
            password='safe-password',
            role=UserRole.PATIENT,
        )
        self.patient = PatientProfile.objects.create(user=self.patient_user)
        self.clinician_user = User.objects.create_user(
            username='physio@example.com',
            email='physio@example.com',
            password='safe-password',
            first_name='Mei',
            last_name='Lin',
            role=UserRole.CLINICIAN,
        )
        self.clinician = ClinicianProfile.objects.create(
            user=self.clinician_user,
            license_number='PT-100',
            is_accepting_patients=True,
        )

    def request_payload(self):
        return {
            'scheduled_at': (timezone.now() + timedelta(days=2)).isoformat(),
            'duration_minutes': 30,
            'patient_notes': 'I would like to review my recent knee pain.',
        }

    def test_linked_patient_books_with_primary_clinician(self):
        self.patient.primary_clinician = self.clinician
        self.patient.save(update_fields=['primary_clinician', 'updated_at'])
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            '/api/consultations/',
            self.request_payload(),
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(str(response.data['clinician']), str(self.clinician.id))
        self.assertEqual(response.data['clinician_name'], 'Mei Lin')

    def test_unlinked_patient_is_matched_to_accepting_clinician(self):
        self.client.force_authenticate(self.patient_user)

        response = self.client.post(
            '/api/consultations/',
            self.request_payload(),
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(str(response.data['clinician']), str(self.clinician.id))

    def test_clinician_cannot_create_patient_consultation(self):
        self.client.force_authenticate(self.clinician_user)

        response = self.client.post(
            '/api/consultations/',
            self.request_payload(),
            format='json',
        )

        self.assertEqual(response.status_code, 403)

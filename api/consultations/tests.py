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


class CareMessageTests(APITestCase):
    def setUp(self):
        self.patient_user = User.objects.create_user(
            username='pat@ex.com', email='pat@ex.com', password='pw',
            role=UserRole.PATIENT, first_name='Sam', last_name='Lee',
        )
        self.clinician_user = User.objects.create_user(
            username='doc@ex.com', email='doc@ex.com', password='pw',
            role=UserRole.CLINICIAN, first_name='Mei', last_name='Lin',
        )
        self.clinician = ClinicianProfile.objects.create(
            user=self.clinician_user, license_number='PT-1',
        )
        self.patient = PatientProfile.objects.create(
            user=self.patient_user, primary_clinician=self.clinician,
        )

    def test_patient_with_clinician_can_send(self):
        self.client.force_authenticate(self.patient_user)
        response = self.client.post(
            '/api/care-messages/', {'body': 'Is soreness normal?'}, format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['sender'], 'patient')
        self.assertEqual(response.data['sender_name'], 'Sam Lee')

    def test_patient_without_clinician_cannot_send(self):
        self.patient.primary_clinician = None
        self.patient.save(update_fields=['primary_clinician'])
        self.client.force_authenticate(self.patient_user)
        response = self.client.post(
            '/api/care-messages/', {'body': 'Hello?'}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_clinician_replies_and_thread_is_scoped(self):
        # Patient sends, clinician sees it scoped by ?patient= and replies.
        self.client.force_authenticate(self.patient_user)
        self.client.post('/api/care-messages/', {'body': 'Question'}, format='json')

        self.client.force_authenticate(self.clinician_user)
        listed = self.client.get(f'/api/care-messages/?patient={self.patient.id}')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data['results']
                             if isinstance(listed.data, dict) else listed.data), 1)

        reply = self.client.post(
            '/api/care-messages/',
            {'body': 'That can be normal early on.', 'patient': str(self.patient.id)},
            format='json',
        )
        self.assertEqual(reply.status_code, 201)
        self.assertEqual(reply.data['sender'], 'clinician')

    def test_clinician_cannot_message_other_roster_patient(self):
        other = PatientProfile.objects.create(
            user=User.objects.create_user(
                username='other@ex.com', email='other@ex.com', password='pw',
                role=UserRole.PATIENT,
            ),
        )
        self.client.force_authenticate(self.clinician_user)
        response = self.client.post(
            '/api/care-messages/',
            {'body': 'hi', 'patient': str(other.id)},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from api.core.models import (
    CarePath,
    ClinicianProfile,
    PatientProfile,
    User,
    UserRole,
)

from .models import Exercise


class PrescriptionAccessTests(APITestCase):
    endpoint = '/api/prescriptions/'

    def setUp(self):
        self.clinician_user = User.objects.create_user(
            username='pt@example.com',
            email='pt@example.com',
            password='test-password',
            role=UserRole.CLINICIAN,
        )
        self.clinician = ClinicianProfile.objects.create(
            user=self.clinician_user,
            license_number='DEMO-ONLY',
        )
        self.patient_user = User.objects.create_user(
            username='patient@example.com',
            email='patient@example.com',
            password='test-password',
            role=UserRole.PATIENT,
        )
        self.patient = PatientProfile.objects.create(
            user=self.patient_user,
            primary_clinician=self.clinician,
            care_path=CarePath.NEEDS_REVIEW,
        )
        self.exercise = Exercise.objects.create(
            id='test-movement',
            name='Test Movement',
            category='mobility',
            camera_direction='front',
            rep_rule='start → finish → start',
            tracked_angles_config={},
            phases_config=[],
            cues_config={},
        )

    def payload(self, patient=None):
        return {
            'patient': str((patient or self.patient).id),
            'exercise': self.exercise.id,
            'sets': 2,
            'reps': 8,
            'hold_seconds': 0,
            'days_per_week': '3',
            'notes': 'Stay inside the approved range.',
            'is_active': True,
            'valid_from': timezone.localdate().isoformat(),
        }

    def test_clinician_assigns_and_patient_receives_active_prescription(self):
        self.client.force_authenticate(self.clinician_user)
        created = self.client.post(
            self.endpoint,
            self.payload(),
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['patient_name'], 'patient@example.com')
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.care_path, CarePath.CLINICIAN)

        self.client.force_authenticate(self.patient_user)
        patient_list = self.client.get(self.endpoint)
        self.assertEqual(patient_list.status_code, 200)
        prescriptions = patient_list.data
        self.assertEqual(len(prescriptions), 1)
        self.assertEqual(prescriptions[0]['exercise'], self.exercise.id)
        self.assertEqual(prescriptions[0]['reps'], 8)

    def test_patient_cannot_create_or_change_prescription(self):
        self.client.force_authenticate(self.patient_user)
        response = self.client.post(
            self.endpoint,
            self.payload(),
            format='json',
        )
        self.assertIn(response.status_code, (400, 403))

    def test_clinician_cannot_prescribe_to_unlinked_patient(self):
        other_user = User.objects.create_user(
            username='other-patient@example.com',
            email='other-patient@example.com',
            password='test-password',
            role=UserRole.PATIENT,
        )
        other = PatientProfile.objects.create(user=other_user)
        self.client.force_authenticate(self.clinician_user)

        response = self.client.post(
            self.endpoint,
            self.payload(other),
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('patient', response.data)

    def test_expired_prescription_is_hidden_from_patient(self):
        self.client.force_authenticate(self.clinician_user)
        payload = self.payload()
        payload['valid_from'] = (
            timezone.localdate() - timedelta(days=10)
        ).isoformat()
        payload['valid_until'] = (
            timezone.localdate() - timedelta(days=1)
        ).isoformat()
        created = self.client.post(self.endpoint, payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)

        clinician_list = self.client.get(self.endpoint)
        self.assertEqual(clinician_list.status_code, 200)
        self.assertEqual(clinician_list.data, [])

        roster = self.client.get('/api/patients/')
        self.assertEqual(roster.status_code, 200)
        roster_rows = roster.data.get('results', roster.data)
        self.assertIsNone(roster_rows[0]['active_prescription'])

        self.client.force_authenticate(self.patient_user)
        patient_list = self.client.get(self.endpoint)
        self.assertEqual(patient_list.status_code, 200)
        self.assertEqual(patient_list.data, [])

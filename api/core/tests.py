from unittest.mock import patch

from rest_framework.test import APITestCase

from .models import (
    CarePath,
    ClinicianProfile,
    PatientProfile,
    User,
    UserRole,
    WellnessScreeningStatus,
)


class ProductionReadinessTests(APITestCase):
    def test_health_check_confirms_database_access(self):
        response = self.client.get('/api/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {'status': 'ok', 'database': 'reachable'},
        )

    def test_patient_can_register_and_sign_in_again(self):
        registration = {
            'email': 'online-patient@example.com',
            'password': 'safe-test-password',
            'first_name': 'Online',
            'last_name': 'Patient',
            'role': UserRole.PATIENT,
        }

        created = self.client.post(
            '/api/auth/register/',
            registration,
            format='json',
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data['role'], UserRole.PATIENT)
        self.assertTrue(created.data['token'])
        self.assertTrue(
            PatientProfile.objects.filter(
                user__email=registration['email'],
            ).exists()
        )

        signed_in = self.client.post(
            '/api/auth/login/',
            {
                'email': registration['email'],
                'password': registration['password'],
            },
            format='json',
        )

        self.assertEqual(signed_in.status_code, 200)
        self.assertEqual(signed_in.data['role'], UserRole.PATIENT)
        self.assertTrue(signed_in.data['token'])

    def test_registration_normalizes_email_and_rejects_case_duplicates(self):
        registration = {
            'email': 'MixedCase@Example.com',
            'password': 'safe-test-password',
            'first_name': 'Mixed',
            'last_name': 'Case',
            'role': UserRole.PATIENT,
        }

        created = self.client.post(
            '/api/auth/register/',
            registration,
            format='json',
        )
        duplicate = self.client.post(
            '/api/auth/register/',
            {
                **registration,
                'email': 'mixedcase@example.com',
            },
            format='json',
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(
            User.objects.get(email='mixedcase@example.com').email,
            'mixedcase@example.com',
        )

        signed_in = self.client.post(
            '/api/auth/login/',
            {
                'email': 'MIXEDCASE@example.com',
                'password': registration['password'],
            },
            format='json',
        )
        self.assertEqual(signed_in.status_code, 200)


class AgentChatViewTests(APITestCase):
    endpoint = '/api/auth/agent/chat/'

    def make_user(self, role):
        email = f'{role}@example.com'
        return User.objects.create_user(
            username=email,
            email=email,
            password='test-password',
            role=role,
        )

    def test_authentication_is_required(self):
        response = self.client.post(
            self.endpoint,
            {'message': 'Hello'},
            format='json',
        )

        self.assertEqual(response.status_code, 401)

    def test_message_is_required(self):
        self.client.force_authenticate(self.make_user(UserRole.PATIENT))

        response = self.client.post(
            self.endpoint,
            {'message': '   '},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['detail'], 'Message is required.')

    @patch('api.core.views.generate_agent_reply')
    def test_patient_role_is_selected_from_authenticated_user(self, generate_reply):
        user = self.make_user(UserRole.PATIENT)
        self.client.force_authenticate(user)
        generate_reply.return_value = 'Patient reply'

        response = self.client.post(
            self.endpoint,
            {'message': 'How should I exercise?'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], UserRole.PATIENT)
        self.assertEqual(response.data['reply'], 'Patient reply')
        generate_reply.assert_called_once_with(user, 'How should I exercise?')

    @patch('api.core.views.generate_agent_reply')
    def test_clinician_role_is_selected_from_authenticated_user(self, generate_reply):
        user = self.make_user(UserRole.CLINICIAN)
        self.client.force_authenticate(user)
        generate_reply.return_value = 'Clinician reply'

        response = self.client.post(
            self.endpoint,
            {'message': 'Summarise recent trends.'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], UserRole.CLINICIAN)
        self.assertEqual(response.data['reply'], 'Clinician reply')

    @patch('api.core.views.generate_agent_reply')
    def test_provider_failure_returns_safe_error(self, generate_reply):
        self.client.force_authenticate(self.make_user(UserRole.PATIENT))
        generate_reply.side_effect = RuntimeError('provider detail')

        response = self.client.post(
            self.endpoint,
            {'message': 'Hello'},
            format='json',
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['detail'], 'The assistant is unavailable.')


class WellnessScreeningViewTests(APITestCase):
    endpoint = '/api/auth/wellness-screening/'

    def make_patient(self):
        user = User.objects.create_user(
            username='wellness@example.com',
            email='wellness@example.com',
            password='test-password',
            role=UserRole.PATIENT,
        )
        PatientProfile.objects.create(user=user)
        return user

    def answers(self, **overrides):
        answers = {
            'not_treating_condition': True,
            'no_clinician_restrictions': True,
            'general_wellness_goal': True,
            'no_concerning_symptoms': True,
        }
        answers.update(overrides)
        return answers

    def test_authentication_is_required(self):
        response = self.client.post(
            self.endpoint,
            self.answers(),
            format='json',
        )
        self.assertEqual(response.status_code, 401)

    def test_all_confirmations_select_wellness_path(self):
        user = self.make_patient()
        self.client.force_authenticate(user)

        response = self.client.post(
            self.endpoint,
            self.answers(),
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        user.patient_profile.refresh_from_db()
        self.assertEqual(
            user.patient_profile.wellness_screening_status,
            WellnessScreeningStatus.ELIGIBLE,
        )
        self.assertEqual(user.patient_profile.care_path, CarePath.WELLNESS)
        self.assertTrue(user.patient_profile.low_risk_acknowledged)

    def test_any_unclear_answer_routes_to_review(self):
        user = self.make_patient()
        self.client.force_authenticate(user)

        response = self.client.post(
            self.endpoint,
            self.answers(no_concerning_symptoms=False),
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        user.patient_profile.refresh_from_db()
        self.assertEqual(response.data['status'], WellnessScreeningStatus.NEEDS_REVIEW)
        self.assertEqual(user.patient_profile.care_path, CarePath.NEEDS_REVIEW)
        self.assertFalse(user.patient_profile.low_risk_acknowledged)

    def test_every_answer_is_required(self):
        user = self.make_patient()
        self.client.force_authenticate(user)
        incomplete = self.answers()
        incomplete.pop('no_concerning_symptoms')

        response = self.client.post(
            self.endpoint,
            incomplete,
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('no_concerning_symptoms', response.data)


class CareInvitationFlowTests(APITestCase):
    def make_clinician(self):
        user = User.objects.create_user(
            username='clinician@example.com',
            email='clinician@example.com',
            password='test-password',
            role=UserRole.CLINICIAN,
        )
        ClinicianProfile.objects.create(
            user=user,
            license_number='DEMO-ONLY',
        )
        return user

    def make_patient(self):
        user = User.objects.create_user(
            username='linked-patient@example.com',
            email='linked-patient@example.com',
            password='test-password',
            role=UserRole.PATIENT,
        )
        PatientProfile.objects.create(user=user)
        return user

    def test_clinician_code_links_the_intended_patient_once(self):
        clinician = self.make_clinician()
        patient = self.make_patient()

        self.client.force_authenticate(clinician)
        created = self.client.post(
            '/api/auth/care-invitations/',
            {},
            format='json',
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(len(created.data['code']), 8)

        self.client.force_authenticate(patient)
        accepted = self.client.post(
            '/api/auth/care-invitations/accept/',
            {'code': created.data['code']},
            format='json',
        )
        self.assertEqual(accepted.status_code, 200)
        patient.patient_profile.refresh_from_db()
        self.assertEqual(
            patient.patient_profile.primary_clinician,
            clinician.clinician_profile,
        )
        self.assertEqual(
            patient.patient_profile.care_path,
            CarePath.NEEDS_REVIEW,
        )

        second = self.client.post(
            '/api/auth/care-invitations/accept/',
            {'code': created.data['code']},
            format='json',
        )
        self.assertEqual(second.status_code, 400)

    def test_patient_cannot_generate_clinician_invitation(self):
        patient = self.make_patient()
        self.client.force_authenticate(patient)

        response = self.client.post(
            '/api/auth/care-invitations/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, 403)

    def test_clinician_patient_list_is_limited_to_linked_patients(self):
        clinician = self.make_clinician()
        linked = self.make_patient()
        linked.patient_profile.primary_clinician = clinician.clinician_profile
        linked.patient_profile.save()
        unlinked = User.objects.create_user(
            username='other@example.com',
            email='other@example.com',
            password='test-password',
            role=UserRole.PATIENT,
        )
        PatientProfile.objects.create(user=unlinked)
        self.client.force_authenticate(clinician)

        response = self.client.get('/api/auth/clinician/patients/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['email'], linked.email)

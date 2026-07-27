import re
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import (
    CarePath,
    ClinicianProfile,
    PatientProfile,
    User,
    UserRole,
    WellnessScreeningStatus,
)


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
)
class ProductionReadinessTests(APITestCase):
    def setUp(self):
        cache.clear()

    def verification_code(self):
        return re.search(r'\b\d{6}\b', mail.outbox[-1].body).group(0)

    def test_health_check_confirms_database_access(self):
        response = self.client.get('/api/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {'status': 'ok', 'database': 'reachable'},
        )

    def test_patient_must_verify_email_before_signing_in(self):
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
        self.assertTrue(created.data['verification_required'])
        self.assertNotIn('token', created.data)
        self.assertTrue(
            PatientProfile.objects.filter(
                user__email=registration['email'],
            ).exists()
        )
        user = User.objects.get(email=registration['email'])
        self.assertFalse(user.is_active)
        self.assertIsNone(user.email_verified_at)

        blocked_sign_in = self.client.post(
            '/api/auth/login/',
            {
                'email': registration['email'],
                'password': registration['password'],
            },
            format='json',
        )
        self.assertEqual(blocked_sign_in.status_code, 403)
        self.assertEqual(blocked_sign_in.data['code'], 'email_not_verified')

        valid_code = self.verification_code()
        wrong_code = (
            valid_code[:-1]
            + str((int(valid_code[-1]) + 1) % 10)
        )
        rejected_code = self.client.post(
            '/api/auth/verify-email/',
            {'email': registration['email'], 'code': wrong_code},
            format='json',
        )
        self.assertEqual(rejected_code.status_code, 400)

        verified = self.client.post(
            '/api/auth/verify-email/',
            {
                'email': registration['email'],
                'code': valid_code,
            },
            format='json',
        )
        self.assertEqual(verified.status_code, 200)
        self.assertTrue(verified.data['token'])
        verified_token = verified.data['token']
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertIsNotNone(user.email_verified_at)

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
        self.assertNotEqual(signed_in.data['token'], verified_token)

        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {verified_token}'
        )
        rotated_out = self.client.get('/api/auth/me/')
        self.assertEqual(rotated_out.status_code, 401)

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Token {signed_in.data['token']}"
        )
        current_account = self.client.get('/api/auth/me/')
        self.assertEqual(current_account.status_code, 200)
        self.assertEqual(
            current_account.data['email'],
            registration['email'],
        )

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

        self.assertEqual(created.status_code, 201)
        self.assertEqual(
            User.objects.get(email='mixedcase@example.com').email,
            'mixedcase@example.com',
        )

        verified = self.client.post(
            '/api/auth/verify-email/',
            {
                'email': 'MIXEDCASE@example.com',
                'code': self.verification_code(),
            },
            format='json',
        )
        self.assertEqual(verified.status_code, 200)

        duplicate = self.client.post(
            '/api/auth/register/',
            {
                **registration,
                'email': 'mixedcase@example.com',
            },
            format='json',
        )
        self.assertEqual(duplicate.status_code, 400)

        signed_in = self.client.post(
            '/api/auth/login/',
            {
                'email': 'MIXEDCASE@example.com',
                'password': registration['password'],
            },
            format='json',
        )
        self.assertEqual(signed_in.status_code, 200)

    def test_unverified_registration_can_restart_with_a_new_password(self):
        registration = {
            'email': 'restart@example.com',
            'password': 'first-safe-password',
            'first_name': 'First',
            'last_name': 'Attempt',
            'role': UserRole.PATIENT,
        }
        created = self.client.post(
            '/api/auth/register/',
            registration,
            format='json',
        )
        first_code = self.verification_code()

        restarted = self.client.post(
            '/api/auth/register/',
            {
                **registration,
                'email': 'RESTART@example.com',
                'password': 'replacement-safe-password',
                'first_name': 'Restarted',
            },
            format='json',
        )
        second_code = self.verification_code()

        self.assertEqual(created.status_code, 201)
        self.assertEqual(restarted.status_code, 200)
        self.assertTrue(restarted.data['verification_required'])
        self.assertEqual(User.objects.filter(
            email='restart@example.com',
        ).count(), 1)

        user = User.objects.get(email='restart@example.com')
        self.assertEqual(user.first_name, 'Restarted')
        self.assertFalse(user.check_password('first-safe-password'))
        self.assertTrue(user.check_password('replacement-safe-password'))

        old_code = self.client.post(
            '/api/auth/verify-email/',
            {'email': registration['email'], 'code': first_code},
            format='json',
        )
        self.assertEqual(old_code.status_code, 400)

        verified = self.client.post(
            '/api/auth/verify-email/',
            {'email': registration['email'], 'code': second_code},
            format='json',
        )
        self.assertEqual(verified.status_code, 200)

        signed_in = self.client.post(
            '/api/auth/login/',
            {
                'email': registration['email'],
                'password': 'replacement-safe-password',
            },
            format='json',
        )
        self.assertEqual(signed_in.status_code, 200)

    @override_settings(EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS=0)
    @patch(
        'api.core.email_verification.secrets.randbelow',
        side_effect=[111111, 222222],
    )
    def test_resend_replaces_the_old_code(self, _randbelow):
        registration = {
            'email': 'resend@example.com',
            'password': 'safe-test-password',
            'first_name': 'Re',
            'last_name': 'Send',
            'role': UserRole.PATIENT,
        }
        self.client.post('/api/auth/register/', registration, format='json')
        first_code = self.verification_code()

        resent = self.client.post(
            '/api/auth/resend-verification/',
            {'email': registration['email']},
            format='json',
        )
        self.assertEqual(resent.status_code, 200)
        second_code = self.verification_code()

        old_code = self.client.post(
            '/api/auth/verify-email/',
            {'email': registration['email'], 'code': first_code},
            format='json',
        )
        self.assertEqual(old_code.status_code, 400)

        new_code = self.client.post(
            '/api/auth/verify-email/',
            {'email': registration['email'], 'code': second_code},
            format='json',
        )
        self.assertEqual(new_code.status_code, 200)


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

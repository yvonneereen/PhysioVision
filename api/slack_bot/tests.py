from datetime import timedelta

from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from .services import _parse_when, _sparkline, link_slack_user, slack_link_code_digest


class SparklineTests(SimpleTestCase):
    """_sparkline is a pure list-of-numbers → unicode-string renderer."""

    def test_empty_input_returns_dash(self):
        self.assertEqual(_sparkline([], 0, 100), "—")

    def test_all_none_returns_dash(self):
        self.assertEqual(_sparkline([None, None], 0, 100), "—")

    def test_length_matches_number_of_values(self):
        self.assertEqual(len(_sparkline([10, 20, 30], 0, 100)), 3)

    def test_min_maps_to_first_tick_and_max_to_last(self):
        spark = _sparkline([0, 100], 0, 100)
        self.assertEqual(spark[0], "▁")
        self.assertEqual(spark[-1], "█")

    def test_ascending_values_produce_non_decreasing_ticks(self):
        spark = _sparkline([0, 25, 50, 75, 100], 0, 100)
        self.assertEqual(list(spark), sorted(spark))

    def test_values_are_clamped_to_range(self):
        # Below lo and above hi should still land on the extreme ticks.
        self.assertEqual(_sparkline([-50, 999], 0, 100), "▁█")

    def test_skips_none_but_keeps_numbers(self):
        self.assertEqual(len(_sparkline([10, None, 90], 0, 100)), 2)


class ParseWhenTests(SimpleTestCase):
    """_parse_when turns a natural time phrase into an aware datetime or None."""

    def test_garbage_returns_none(self):
        self.assertIsNone(_parse_when("not a time at all zzz"))

    def test_empty_returns_none(self):
        self.assertIsNone(_parse_when(""))

    def test_parses_explicit_datetime_as_aware(self):
        result = _parse_when("2026-08-01 15:30")
        self.assertIsNotNone(result)
        self.assertTrue(timezone.is_aware(result))
        self.assertEqual((result.year, result.month, result.day), (2026, 8, 1))
        self.assertEqual((result.hour, result.minute), (15, 30))


class SlackLinkCodeTests(TestCase):
    """link_slack_user attaches the Slack user id to the code's clinician."""

    def setUp(self):
        from api.core.models import ClinicianProfile, SlackLinkCode, User, UserRole

        self.user = User.objects.create_user(
            username="dr.chen@clinic.com", email="dr.chen@clinic.com",
            password="pw", role=UserRole.CLINICIAN,
            first_name="Dr", last_name="Chen",
        )
        self.clinician = ClinicianProfile.objects.create(
            user=self.user, license_number="LIC1",
        )
        self.SlackLinkCode = SlackLinkCode

    def _make_code(self, raw="483920", *, ttl_minutes=10):
        return self.SlackLinkCode.objects.create(
            clinician=self.clinician,
            code_digest=slack_link_code_digest(raw),
            expires_at=timezone.now() + timedelta(minutes=ttl_minutes),
        )

    def test_valid_code_links_user_and_burns_code(self):
        link = self._make_code()
        clinician, error = link_slack_user("483920", "U0123")
        self.assertIsNone(error)
        self.assertEqual(clinician.pk, self.clinician.pk)
        self.clinician.refresh_from_db()
        link.refresh_from_db()
        self.assertEqual(self.clinician.slack_user_id, "U0123")
        self.assertIsNotNone(link.used_at)

    def test_used_code_is_rejected(self):
        self._make_code()
        link_slack_user("483920", "U0123")
        clinician, error = link_slack_user("483920", "U9999")
        self.assertIsNone(clinician)
        self.assertIn("already been used", error)

    def test_expired_code_is_rejected(self):
        self._make_code(ttl_minutes=-1)
        clinician, error = link_slack_user("483920", "U0123")
        self.assertIsNone(clinician)
        self.assertIn("expired", error)

    def test_unknown_code_is_rejected(self):
        clinician, error = link_slack_user("000000", "U0123")
        self.assertIsNone(clinician)
        self.assertIn("isn't valid", error)


class ArgAfterTests(SimpleTestCase):
    """_arg_after extracts the patient name following a command keyword."""

    def _fn(self):
        from .views import _arg_after
        return _arg_after

    def test_pain_for_name(self):
        self.assertEqual(self._fn()("<@u1> pain for sarah", "pain"), "sarah")

    def test_bare_keyword_and_name(self):
        self.assertEqual(self._fn()("adherence bob jones", "adherence"), "bob jones")

    def test_resolve_strips_mention(self):
        self.assertEqual(self._fn()("<@ubot> resolve mei ling", "resolve"), "mei ling")

    def test_missing_name_returns_none(self):
        self.assertIsNone(self._fn()("sessions", "sessions"))


class CommandScopingTests(TestCase):
    """Tier 1 commands resolve and act only on the linked clinician's patients."""

    def setUp(self):
        from api.consultations.models import Escalation, EscalationTrigger
        from api.core.models import (
            ClinicianProfile, PatientProfile, User, UserRole,
        )

        self.clinician_user = User.objects.create_user(
            username="dr@c.com", email="dr@c.com", password="pw",
            role=UserRole.CLINICIAN, first_name="Dee", last_name="Doc",
        )
        self.clinician = ClinicianProfile.objects.create(
            user=self.clinician_user, license_number="L1", slack_user_id="UDOC",
        )
        patient_user = User.objects.create_user(
            username="pat@c.com", email="pat@c.com", password="pw",
            role=UserRole.PATIENT, first_name="Sarah", last_name="Payne",
        )
        self.patient = PatientProfile.objects.create(
            user=patient_user, primary_clinician=self.clinician,
        )
        self.esc = Escalation.objects.create(
            patient=self.patient, trigger_type=EscalationTrigger.MANUAL,
            description="Check in.", status="open",
        )

    def test_find_clinician_by_slack_user(self):
        from .services import find_clinician_by_slack_user
        self.assertEqual(find_clinician_by_slack_user("UDOC").pk, self.clinician.pk)
        self.assertIsNone(find_clinician_by_slack_user("UNKNOWN"))
        self.assertIsNone(find_clinician_by_slack_user(""))

    def test_resolve_marks_escalations_action_taken(self):
        from .services import resolve_patient_escalations
        patient, count, error = resolve_patient_escalations(self.clinician, "sarah")
        self.assertIsNone(error)
        self.assertEqual(count, 1)
        self.esc.refresh_from_db()
        self.assertEqual(self.esc.status, "action_taken")
        self.assertEqual(self.esc.reviewed_by_id, self.clinician.pk)

    def test_resolve_unknown_patient_errors(self):
        from .services import resolve_patient_escalations
        patient, count, error = resolve_patient_escalations(self.clinician, "nobody")
        self.assertIsNone(patient)
        self.assertIn("No patient matching", error)

    def test_resolve_ignores_other_clinicians_patient(self):
        # A second clinician cannot resolve the first clinician's patient.
        from api.core.models import ClinicianProfile, User, UserRole
        from .services import resolve_patient_escalations
        other_user = User.objects.create_user(
            username="dr2@c.com", email="dr2@c.com", password="pw",
            role=UserRole.CLINICIAN, first_name="Ann", last_name="Other",
        )
        other = ClinicianProfile.objects.create(user=other_user, license_number="L2")
        patient, count, error = resolve_patient_escalations(other, "sarah")
        self.assertIsNone(patient)
        self.esc.refresh_from_db()
        self.assertEqual(self.esc.status, "open")

    def test_roster_names_lists_clinician_patients(self):
        from .services import roster_names
        self.assertEqual(roster_names(self.clinician), ["Sarah Payne"])

    def test_ask_patient_lists_roster_with_example(self):
        from .views import _ask_patient
        captured = []
        _ask_patient(lambda text=None, **kw: captured.append(text), self.clinician, "confirm")
        self.assertIn("Sarah Payne", captured[0])
        self.assertIn("confirm Sarah", captured[0])

    def test_confirm_consultation_flips_status(self):
        from api.consultations.models import Consultation, ConsultationStatus
        from .services import confirm_consultation
        c = Consultation.objects.create(
            patient=self.patient, clinician=self.clinician,
            scheduled_at=timezone.now() + timedelta(days=1),
            status=ConsultationStatus.REQUESTED,
        )
        consult, error = confirm_consultation(self.clinician, "sarah")
        self.assertIsNone(error)
        c.refresh_from_db()
        self.assertEqual(c.status, ConsultationStatus.CONFIRMED)

    def test_confirm_without_pending_errors(self):
        from .services import confirm_consultation
        consult, error = confirm_consultation(self.clinician, "sarah")
        self.assertIsNone(consult)
        self.assertIn("no pending consultation", error)

    def test_assign_exercise_creates_active_prescription(self):
        from api.catalogue.models import Exercise, Prescription
        from .services import assign_exercise
        ex = Exercise.objects.create(
            id="half-squats", name="Half Squats", category="strengthening",
            rep_rule="standing → squat → standing", is_active=True,
            tracked_angles_config={}, phases_config=[], cues_config={},
        )
        patient, result, error = assign_exercise(self.clinician, "half sq", "sarah")
        self.assertIsNone(error)
        exercise, rx = result
        self.assertEqual(exercise.pk, ex.pk)
        self.assertTrue(
            Prescription.objects.filter(
                patient=self.patient, exercise=ex, is_active=True,
            ).exists()
        )

    def test_assign_unknown_exercise_errors(self):
        from .services import assign_exercise
        patient, result, error = assign_exercise(self.clinician, "nonesuch", "sarah")
        self.assertIsNone(result)
        self.assertIn("No active exercise", error)


class ClaimPatientTests(TestCase):
    """Triage 'Claim' assigns an unclaimed patient to the acting clinician."""

    def setUp(self):
        from api.core.models import (
            ClinicianProfile, PatientProfile, User, UserRole,
        )
        self.clinician = ClinicianProfile.objects.create(
            user=User.objects.create_user(
                username="dr@c.com", email="dr@c.com", password="pw",
                role=UserRole.CLINICIAN, first_name="Dee", last_name="Doc",
            ),
            license_number="L1", slack_user_id="UDOC",
        )
        # Unassigned patient — the kind that lands in the triage channel.
        self.patient = PatientProfile.objects.create(
            user=User.objects.create_user(
                username="pat@c.com", email="pat@c.com", password="pw",
                role=UserRole.PATIENT, first_name="Sarah", last_name="Payne",
            ),
            primary_clinician=None,
            slack_thread_ts="OLD-TS",
        )

    def test_claim_assigns_and_resets_thread(self):
        from .services import claim_patient
        patient, error = claim_patient(self.clinician, str(self.patient.id))
        self.assertIsNone(error)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.primary_clinician_id, self.clinician.id)
        self.assertEqual(self.patient.slack_thread_ts, "")

    def test_claim_rejects_another_clinicians_patient(self):
        from api.core.models import ClinicianProfile, User, UserRole
        from .services import claim_patient
        other = ClinicianProfile.objects.create(
            user=User.objects.create_user(
                username="dr2@c.com", email="dr2@c.com", password="pw",
                role=UserRole.CLINICIAN, first_name="Ann", last_name="Other",
            ),
            license_number="L2",
        )
        self.patient.primary_clinician = other
        self.patient.save(update_fields=["primary_clinician"])
        patient, error = claim_patient(self.clinician, str(self.patient.id))
        self.assertIsNone(patient)
        self.assertIn("already assigned", error)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.primary_clinician_id, other.id)

    def test_claim_unknown_patient_errors(self):
        from .services import claim_patient
        # A well-formed but non-existent UUID.
        patient, error = claim_patient(
            self.clinician, "00000000-0000-0000-0000-000000000000",
        )
        self.assertIsNone(patient)
        self.assertIn("no longer exists", error)

    def test_claim_malformed_id_errors(self):
        from .services import claim_patient
        patient, error = claim_patient(self.clinician, "999999")
        self.assertIsNone(patient)
        self.assertIn("no longer exists", error)


class PlanBuilderTests(TestCase):
    """The AI programme builder's accept/mapping logic (no live Gemini call)."""

    def setUp(self):
        from api.catalogue.models import Exercise
        from api.core.models import (
            ClinicianProfile, PatientProfile, User, UserRole,
        )

        cu = User.objects.create_user(
            username="pb-dr@c.com", email="pb-dr@c.com", password="pw",
            role=UserRole.CLINICIAN, first_name="Pat", last_name="Doc",
        )
        self.clinician = ClinicianProfile.objects.create(user=cu, license_number="L")
        pu = User.objects.create_user(
            username="pb-pat@c.com", email="pb-pat@c.com", password="pw",
            role=UserRole.PATIENT, first_name="Sarah", last_name="Payne",
        )
        self.patient = PatientProfile.objects.create(
            user=pu, primary_clinician=self.clinician,
        )
        for slug, name in (("half-squats", "Half Squats"), ("calf-raises", "Calf Raises")):
            Exercise.objects.create(
                id=slug, name=name, category="strengthening",
                rep_rule="a → b → a", is_active=True,
                default_sets=3, default_reps=10,
                tracked_angles_config={}, phases_config=[], cues_config={},
            )

    def _stage_draft(self):
        from api.core.models import SlackPlanDraft
        return SlackPlanDraft.objects.create(
            patient=self.patient, clinician=self.clinician,
            plan={
                "summary": "A gradual knee plan.",
                "days": [
                    {"exercise_ids": ["half-squats"]},
                    {"exercise_ids": ["calf-raises"]},
                ],
                "constraints": {"days_per_week": 3},
            },
            preferences={"days_per_week": 3},
        )

    def test_accept_creates_prescriptions_and_clears_draft(self):
        from api.catalogue.models import Prescription
        from api.core.models import SlackPlanDraft
        from .services import accept_plan_draft
        self._stage_draft()
        patient, created, error = accept_plan_draft(self.clinician, "sarah")
        self.assertIsNone(error)
        self.assertEqual(created, 2)
        rx = Prescription.objects.filter(patient=self.patient, is_active=True)
        self.assertEqual(rx.count(), 2)
        self.assertEqual(rx.first().sets, 3)
        self.assertFalse(SlackPlanDraft.objects.filter(patient=self.patient).exists())

    def test_accept_without_draft_errors(self):
        from .services import accept_plan_draft
        patient, created, error = accept_plan_draft(self.clinician, "sarah")
        self.assertEqual(created, 0)
        self.assertIn("No draft", error)

    def test_draft_blocks_render_exercise_names(self):
        from .services import build_plan_draft_blocks
        draft = self._stage_draft()
        text = build_plan_draft_blocks(draft)[0]["text"]["text"]
        self.assertIn("Half Squats", text)
        self.assertIn("Calf Raises", text)

    def test_draft_blocks_show_considered_context_and_dose(self):
        from api.core.models import SlackPlanDraft
        from .services import build_plan_draft_blocks
        draft = SlackPlanDraft.objects.create(
            patient=self.patient, clinician=self.clinician,
            plan={"days": [{"exercise_ids": ["half-squats"]}],
                  "constraints": {"days_per_week": 3}},
            preferences={
                "days_per_week": 3,
                "clinical_summary": "peak pain 8/10; adherence 40%",
                "dose": {"half-squats": {"sets": 2, "reps": 7}},
            },
        )
        text = build_plan_draft_blocks(draft)[0]["text"]["text"]
        self.assertIn("Considered", text)
        self.assertIn("peak pain 8/10", text)
        self.assertIn("2×7", text)  # adapted, not the 3×10 default

    def test_suggested_dose_is_conservative_under_high_pain(self):
        from api.catalogue.models import Exercise
        from .services import _suggested_dose
        ex = Exercise.objects.get(id="half-squats")
        normal = _suggested_dose(ex, {"max_pain": 2, "trend": "stable"})
        painful = _suggested_dose(ex, {"max_pain": 8, "trend": "stable"})
        declining = _suggested_dose(ex, {"max_pain": None, "trend": "declining"})
        self.assertEqual(normal, (3, 10))
        self.assertEqual(painful, (2, 7))
        self.assertEqual(declining, (2, 7))

    def test_accept_uses_adapted_dose_from_draft(self):
        from api.catalogue.models import Prescription
        from api.core.models import SlackPlanDraft
        from .services import accept_plan_draft
        SlackPlanDraft.objects.create(
            patient=self.patient, clinician=self.clinician,
            plan={"days": [{"exercise_ids": ["half-squats"]}],
                  "constraints": {"days_per_week": 3}},
            preferences={"days_per_week": 3,
                         "dose": {"half-squats": {"sets": 1, "reps": 6}}},
        )
        accept_plan_draft(self.clinician, "sarah")
        rx = Prescription.objects.get(patient=self.patient, is_active=True)
        self.assertEqual((rx.sets, rx.reps), (1, 6))

    @override_settings(GEMINI_API_KEY="")
    def test_build_without_gemini_fails_gracefully(self):
        from api.core.models import SlackPlanDraft
        from .services import build_plan_draft
        patient, draft, error = build_plan_draft(self.clinician, "sarah")
        self.assertIsNone(draft)
        self.assertIn("unavailable", error)
        self.assertFalse(SlackPlanDraft.objects.filter(patient=self.patient).exists())


class OptionalSlackIntegrationTests(TestCase):
    @override_settings(
        SLACK_BOT_TOKEN='',
        SLACK_SIGNING_SECRET='',
    )
    def test_missing_slack_credentials_do_not_break_the_api(self):
        response = self.client.post(
            '/api/slack/events/',
            data='{}',
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json(),
            {'detail': 'Slack integration is not configured.'},
        )


@override_settings(SLACK_BOT_TOKEN='xoxb-test', SLACK_TRIAGE_CHANNEL_ID='C-TRIAGE')
class SelfReferralTriageTests(TestCase):
    """Only patients who opt in to physiotherapist help appear in triage."""

    def setUp(self):
        from api.core.models import (
            PatientPathwayChoice, PatientProfile, User, UserRole,
        )
        self.PatientPathwayChoice = PatientPathwayChoice
        self.patient = PatientProfile.objects.create(
            user=User.objects.create_user(
                username="pat@c.com", email="pat@c.com", password="pw",
                role=UserRole.PATIENT, first_name="Sarah", last_name="Payne",
            ),
            primary_clinician=None,
            pathway_choice=PatientPathwayChoice.PHYSIOTHERAPIST,
        )

    def test_opt_in_patient_is_posted_to_triage_with_claim_button(self):
        from unittest.mock import MagicMock, patch
        from .services import post_self_referral_to_triage

        client = MagicMock()
        with patch('api.slack_bot.services._get_slack_client', return_value=client):
            post_self_referral_to_triage(self.patient)

        client.chat_postMessage.assert_called_once()
        kwargs = client.chat_postMessage.call_args.kwargs
        self.assertEqual(kwargs["channel"], "C-TRIAGE")
        action_ids = [
            el.get("action_id")
            for block in kwargs["blocks"] if block.get("type") == "actions"
            for el in block["elements"]
        ]
        self.assertIn("claim_patient", action_ids)

    def test_patient_with_clinician_is_not_posted(self):
        from unittest.mock import MagicMock, patch
        from api.core.models import ClinicianProfile, User, UserRole
        from .services import post_self_referral_to_triage

        self.patient.primary_clinician = ClinicianProfile.objects.create(
            user=User.objects.create_user(
                username="dr@c.com", email="dr@c.com", password="pw",
                role=UserRole.CLINICIAN, first_name="Dee", last_name="Doc",
            ),
            license_number="L1",
        )
        self.patient.save(update_fields=["primary_clinician"])

        client = MagicMock()
        with patch('api.slack_bot.services._get_slack_client', return_value=client):
            result = post_self_referral_to_triage(self.patient)

        self.assertIsNone(result)
        client.chat_postMessage.assert_not_called()

    def test_wellness_patient_escalation_is_not_surfaced(self):
        from unittest.mock import MagicMock, patch
        from api.consultations.models import Escalation, EscalationTrigger
        from .services import _post_escalation_alert

        # Patient did NOT opt in to therapist help.
        self.patient.pathway_choice = self.PatientPathwayChoice.WELLNESS
        self.patient.save(update_fields=["pathway_choice"])
        esc = Escalation.objects.create(
            patient=self.patient, trigger_type=EscalationTrigger.MANUAL,
            description="High pain.", status="open",
        )

        client = MagicMock()
        with patch('api.slack_bot.services._get_slack_client', return_value=client):
            _post_escalation_alert(esc)

        client.chat_postMessage.assert_not_called()

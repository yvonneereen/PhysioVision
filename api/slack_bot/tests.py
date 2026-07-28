from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone

from .services import _parse_when, _sparkline


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

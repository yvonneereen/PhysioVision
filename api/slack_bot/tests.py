from django.test import TestCase, override_settings


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

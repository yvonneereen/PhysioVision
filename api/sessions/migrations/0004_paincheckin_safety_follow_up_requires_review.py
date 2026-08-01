from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("physio_sessions", "0003_paincheckin_timing_recovery_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="paincheckin",
            name="requires_review",
            field=models.BooleanField(
                default=False,
                help_text="Whether this check-in should be reviewed before more exercise.",
            ),
        ),
        migrations.AddField(
            model_name="paincheckin",
            name="safety_follow_up",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Structured answers and outcome from a pain safety follow-up.",
            ),
        ),
    ]

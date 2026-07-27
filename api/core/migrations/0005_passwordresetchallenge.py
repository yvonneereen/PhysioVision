import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_email_verification"),
    ]

    operations = [
        migrations.CreateModel(
            name="PasswordResetChallenge",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("code_hash", models.CharField(max_length=128)),
                ("expires_at", models.DateTimeField()),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                (
                    "attempts_remaining",
                    models.PositiveSmallIntegerField(default=5),
                ),
                ("verified_at", models.DateTimeField(blank=True, null=True)),
                ("reset_token_hash", models.CharField(blank=True, max_length=64)),
                (
                    "reset_token_expires_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="password_reset_challenge",
                        to="core.user",
                    ),
                ),
            ],
            options={
                "db_table": "core_passwordresetchallenge",
            },
        ),
    ]

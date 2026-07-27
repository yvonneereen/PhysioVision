import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_passwordresetchallenge"),
    ]

    operations = [
        migrations.CreateModel(
            name="LoginVerificationChallenge",
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
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="login_verification_challenge",
                        to="core.user",
                    ),
                ),
            ],
            options={
                "db_table": "core_loginverificationchallenge",
            },
        ),
    ]

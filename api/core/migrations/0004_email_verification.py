# Generated for PhysioVision email verification.

import django.db.models.deletion
import uuid
from django.db import migrations, models
from django.utils import timezone


def mark_existing_users_verified(apps, schema_editor):
    User = apps.get_model("core", "User")
    User.objects.filter(email_verified_at__isnull=True).update(
        email_verified_at=timezone.now()
    )


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_careinvitation"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="EmailVerification",
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
                        related_name="email_verification",
                        to="core.user",
                    ),
                ),
            ],
            options={
                "db_table": "core_emailverification",
            },
        ),
        migrations.RunPython(
            mark_existing_users_verified,
            reverse_code=migrations.RunPython.noop,
        ),
    ]

import django.db.models.deletion
import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0013_patientprofile_emergency_contact"),
    ]

    operations = [
        migrations.AddField(
            model_name="patientprofile",
            name="emergency_contact_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="EmergencyContactVerificationChallenge",
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
                ("phone", models.CharField(max_length=24)),
                ("code_hash", models.CharField(max_length=128)),
                ("expires_at", models.DateTimeField()),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                (
                    "attempts_remaining",
                    models.PositiveSmallIntegerField(default=5),
                ),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "patient",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name=(
                            "emergency_contact_verification_challenge"
                        ),
                        to="core.patientprofile",
                    ),
                ),
            ],
            options={
                "db_table": "core_emergencycontactverificationchallenge",
            },
        ),
        migrations.CreateModel(
            name="EmergencyAlert",
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
                (
                    "client_event_id",
                    models.UUIDField(editable=False, unique=True),
                ),
                ("source", models.CharField(default="possible_fall", max_length=30)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Waiting for the user"),
                            ("cancelled", "Cancelled by the user"),
                            ("notifying", "Contact notification in progress"),
                            ("notified", "SMS and call requested"),
                            (
                                "partial",
                                "Only one notification channel succeeded",
                            ),
                            ("failed", "Contact notification failed"),
                            (
                                "not_configured",
                                "No verified contact or provider",
                            ),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=20,
                    ),
                ),
                (
                    "response",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("okay", "I am okay"),
                            ("help", "I need help"),
                            ("no_response", "No response"),
                        ],
                        max_length=20,
                    ),
                ),
                ("exercise_id", models.CharField(blank=True, max_length=80)),
                (
                    "monitoring_mode",
                    models.CharField(blank=True, max_length=30),
                ),
                ("signals", models.JSONField(blank=True, default=list)),
                ("notify_after", models.DateTimeField(db_index=True)),
                ("responded_at", models.DateTimeField(blank=True, null=True)),
                (
                    "notification_attempted_at",
                    models.DateTimeField(blank=True, null=True),
                ),
                ("contact_name", models.CharField(blank=True, max_length=60)),
                ("contact_phone", models.CharField(blank=True, max_length=24)),
                ("sms_message_id", models.CharField(blank=True, max_length=64)),
                ("voice_call_id", models.CharField(blank=True, max_length=64)),
                ("delivery_error", models.TextField(blank=True)),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="emergency_alerts",
                        to="core.patientprofile",
                    ),
                ),
            ],
            options={
                "db_table": "core_emergencyalert",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="emergencyalert",
            index=models.Index(
                fields=["patient", "status"],
                name="core_emerg_patient_80ed9e_idx",
            ),
        ),
    ]

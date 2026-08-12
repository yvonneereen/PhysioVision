import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0019_caredischarge"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClinicianAiSession",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "title",
                    models.CharField(default="New AI session", max_length=120),
                ),
                (
                    "clinician",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ai_sessions",
                        to="core.clinicianprofile",
                    ),
                ),
            ],
            options={
                "db_table": "core_clinicianaisession",
                "ordering": ["-updated_at"],
                "indexes": [
                    models.Index(
                        fields=["clinician", "updated_at"],
                        name="core_ai_sess_clin_upd_idx",
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name="ClinicianAiMessage",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "role",
                    models.CharField(
                        choices=[
                            ("user", "Clinician"),
                            ("assistant", "AI assistant"),
                            ("error", "Assistant error"),
                        ],
                        max_length=10,
                    ),
                ),
                ("body", models.TextField()),
                ("command", models.CharField(blank=True, max_length=40)),
                ("data", models.JSONField(blank=True, default=dict)),
                (
                    "session",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="core.clinicianaisession",
                    ),
                ),
            ],
            options={
                "db_table": "core_clinicianaimessage",
                "ordering": ["created_at"],
                "indexes": [
                    models.Index(
                        fields=["session", "created_at"],
                        name="core_ai_msg_sess_created_idx",
                    ),
                ],
            },
        ),
    ]

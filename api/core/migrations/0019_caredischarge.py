import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0018_clear_duplicate_rosanne_triage_request"),
    ]

    operations = [
        migrations.CreateModel(
            name="CareDischarge",
            fields=[
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True),
                ),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("note", models.TextField(blank=True)),
                (
                    "prescriptions_ended",
                    models.PositiveSmallIntegerField(default=0),
                ),
                (
                    "consultations_cancelled",
                    models.PositiveSmallIntegerField(default=0),
                ),
                (
                    "clinician",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="care_discharges_made",
                        to="core.clinicianprofile",
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="care_discharges",
                        to="core.patientprofile",
                    ),
                ),
            ],
            options={
                "db_table": "core_caredischarge",
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(
                        fields=["patient", "created_at"],
                        name="core_discharge_pat_created_idx",
                    ),
                ],
            },
        ),
    ]

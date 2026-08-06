from django.db import migrations, models
from django.utils import timezone


def restore_pending_wellness_requests(apps, schema_editor):
    """Repair wellness self-referrals created by the previous request flow."""
    PatientProfile = apps.get_model("core", "PatientProfile")
    affected = PatientProfile.objects.filter(
        primary_clinician__isnull=True,
        pathway_choice="physiotherapist",
        wellness_screening_status="eligible",
    )
    for profile in affected.iterator():
        profile.physiotherapist_requested_at = (
            profile.pathway_selected_at or timezone.now()
        )
        profile.pathway_choice = "wellness"
        profile.care_path = "wellness"
        profile.save(update_fields=[
            "physiotherapist_requested_at",
            "pathway_choice",
            "care_path",
        ])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0014_emergency_alert_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="patientprofile",
            name="physiotherapist_requested_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(
            restore_pending_wellness_requests,
            migrations.RunPython.noop,
        ),
    ]

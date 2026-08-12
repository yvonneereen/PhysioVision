from django.db import migrations


TARGET_EMAIL = "yvonneereen@outlook.com"


def clear_duplicate_rosanne_triage_request(apps, schema_editor):
    """Remove only the confirmed duplicate Rosanne account from triage."""
    PatientProfile = apps.get_model("core", "PatientProfile")

    profiles = PatientProfile.objects.filter(
        user__email__iexact=TARGET_EMAIL,
        user__role="patient",
        primary_clinician__isnull=True,
    )
    for profile in profiles.iterator():
        update_fields = []

        if profile.physiotherapist_requested_at is not None:
            profile.physiotherapist_requested_at = None
            update_fields.append("physiotherapist_requested_at")

        # Initial-pathway requests use the pathway choice rather than the
        # request timestamp. Clear that queue marker without deleting the
        # patient account or any of its records.
        if profile.pathway_choice == "physiotherapist":
            profile.pathway_choice = "unselected"
            profile.pathway_selected_at = None
            profile.care_path = "wellness"
            update_fields.extend([
                "pathway_choice",
                "pathway_selected_at",
                "care_path",
            ])

        if update_fields:
            profile.save(update_fields=update_fields)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0017_clear_linked_patient_triage_requests"),
    ]

    operations = [
        migrations.RunPython(
            clear_duplicate_rosanne_triage_request,
            migrations.RunPython.noop,
        ),
    ]

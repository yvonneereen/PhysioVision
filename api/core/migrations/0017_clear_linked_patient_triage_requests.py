from django.db import migrations


def clear_linked_patient_triage_requests(apps, schema_editor):
    PatientProfile = apps.get_model("core", "PatientProfile")
    PatientProfile.objects.filter(
        primary_clinician__isnull=False,
        physiotherapist_requested_at__isnull=False,
    ).update(physiotherapist_requested_at=None)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0016_patientprofile_shoulder_mobility_goal"),
    ]

    operations = [
        migrations.RunPython(
            clear_linked_patient_triage_requests,
            migrations.RunPython.noop,
        ),
    ]

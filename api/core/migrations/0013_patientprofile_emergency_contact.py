from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0012_slackplandraft"),
    ]

    operations = [
        migrations.AddField(
            model_name="patientprofile",
            name="emergency_contact_name",
            field=models.CharField(blank=True, max_length=60),
        ),
        migrations.AddField(
            model_name="patientprofile",
            name="emergency_contact_relationship",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name="patientprofile",
            name="emergency_contact_phone",
            field=models.CharField(blank=True, max_length=24),
        ),
        migrations.AddField(
            model_name="patientprofile",
            name="emergency_contact_consent",
            field=models.BooleanField(default=False),
        ),
    ]

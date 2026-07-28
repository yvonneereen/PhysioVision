from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_loginverificationchallenge"),
    ]

    operations = [
        migrations.AddField(
            model_name="patientprofile",
            name="pathway_choice",
            field=models.CharField(
                choices=[
                    ("unselected", "Not selected"),
                    ("physiotherapist", "Physiotherapist-assigned plan"),
                    ("wellness", "General wellness"),
                ],
                default="unselected",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="patientprofile",
            name="pathway_selected_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

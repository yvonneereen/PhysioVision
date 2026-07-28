from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0007_patient_pathway_choice"),
    ]

    operations = [
        migrations.AddField(
            model_name="patientprofile",
            name="custom_goal",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AlterField(
            model_name="patientprofile",
            name="goal",
            field=models.CharField(
                choices=[
                    ("stronger_knees", "Stronger knees"),
                    ("better_balance", "Better balance"),
                    ("less_stiffness", "Move with less stiffness"),
                    ("stay_active", "Stay active"),
                    ("stronger_hips", "Stronger hips"),
                    ("ankle_mobility", "Better ankle movement"),
                    ("walking_confidence", "Walk with confidence"),
                    ("other", "Other"),
                ],
                default="stronger_knees",
                max_length=30,
            ),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0015_patientprofile_physiotherapist_requested_at"),
    ]

    operations = [
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
                    ("shoulder_mobility", "Better shoulder movement"),
                    ("ankle_mobility", "Better ankle movement"),
                    ("walking_confidence", "Walk with confidence"),
                    ("other", "Other"),
                ],
                default="stronger_knees",
                max_length=30,
            ),
        ),
    ]

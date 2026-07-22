from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalogue", "0003_alter_exercise_category"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="calibration",
            name="unique_active_calibration_per_patient_exercise",
        ),
        migrations.RemoveIndex(
            model_name="calibration",
            name="catalogue_c_patient_23cc7e_idx",
        ),
        migrations.AddIndex(
            model_name="calibration",
            index=models.Index(
                fields=["patient", "exercise", "affected_side", "is_active"],
                name="catalogue_cal_side_lookup",
            ),
        ),
        migrations.AddConstraint(
            model_name="calibration",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_active=True),
                fields=("patient", "exercise", "affected_side"),
                name="unique_active_calibration_patient_exercise_side",
            ),
        ),
    ]

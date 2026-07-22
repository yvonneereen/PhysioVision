from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalogue", "0002_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="exercise",
            name="category",
            field=models.CharField(
                choices=[
                    ("strengthening", "Strengthening"),
                    ("stretch", "Stretch"),
                    ("mobility", "Mobility"),
                ],
                db_index=True,
                max_length=15,
            ),
        ),
    ]

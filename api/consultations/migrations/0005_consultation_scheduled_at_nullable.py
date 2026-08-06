from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("consultations", "0004_caremessage"),
    ]

    operations = [
        migrations.AlterField(
            model_name="consultation",
            name="scheduled_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterModelOptions(
            name="consultation",
            options={
                "ordering": ["-created_at"],
                "verbose_name": "consultation",
                "verbose_name_plural": "consultations",
            },
        ),
    ]

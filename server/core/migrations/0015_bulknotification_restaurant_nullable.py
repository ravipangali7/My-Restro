import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0014_bulknotification_title_link"),
    ]

    operations = [
        migrations.AlterField(
            model_name="bulknotification",
            name="restaurant",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="bulk_notifications",
                to="core.restaurant",
            ),
        ),
    ]

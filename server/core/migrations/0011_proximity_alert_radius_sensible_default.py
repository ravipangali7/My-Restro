from decimal import Decimal

import django.core.validators
from django.db import migrations, models


def bump_legacy_two_meter_radius(apps, schema_editor):
    """2 m was the original default; GPS noise makes that radius unusable for real alerts."""
    Restaurant = apps.get_model("core", "Restaurant")
    Restaurant.objects.filter(proximity_alert_radius_m=Decimal("2.00")).update(
        proximity_alert_radius_m=Decimal("150.00")
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0010_transaction_created_by"),
    ]

    operations = [
        migrations.RunPython(bump_legacy_two_meter_radius, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="restaurant",
            name="proximity_alert_radius_m",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("150.00"),
                max_digits=10,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0.10")),
                    django.core.validators.MaxValueValidator(Decimal("5000.00")),
                ],
            ),
        ),
    ]

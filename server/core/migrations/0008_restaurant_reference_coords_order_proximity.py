from decimal import Decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0007_delivery_pricing"),
    ]

    operations = [
        migrations.AddField(
            model_name="restaurant",
            name="reference_latitude",
            field=models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="restaurant",
            name="reference_longitude",
            field=models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="restaurant",
            name="proximity_alert_radius_m",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("2.00"),
                max_digits=10,
                validators=[
                    django.core.validators.MinValueValidator(Decimal("0.10")),
                    django.core.validators.MaxValueValidator(Decimal("5000.00")),
                ],
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="last_reported_latitude",
            field=models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="last_reported_longitude",
            field=models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="last_reported_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="proximity_unpaid_alert_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]

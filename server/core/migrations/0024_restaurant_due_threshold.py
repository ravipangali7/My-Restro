# Generated manually for per-venue due threshold override.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0023_restaurant_platform_fee_overrides"),
    ]

    operations = [
        migrations.AddField(
            model_name="restaurant",
            name="due_threshold",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="If set, overrides platform due auto-suspend threshold for this venue only.",
                max_digits=12,
                null=True,
            ),
        ),
    ]

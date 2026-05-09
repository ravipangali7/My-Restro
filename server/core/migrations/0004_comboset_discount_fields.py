from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_productitem_rawmaterial_unit_cascade"),
    ]

    operations = [
        migrations.AddField(
            model_name="comboset",
            name="discount",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
        ),
        migrations.AddField(
            model_name="comboset",
            name="discount_type",
            field=models.CharField(
                choices=[("flat", "Flat"), ("percentage", "Percentage")],
                default="flat",
                max_length=20,
            ),
        ),
    ]

from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0022_user_phone_max_length"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="service_charge",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
        ),
    ]

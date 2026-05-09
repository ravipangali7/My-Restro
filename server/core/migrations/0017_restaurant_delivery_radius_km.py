from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0016_transaction_category_share_balance_adjustment"),
    ]

    operations = [
        migrations.AddField(
            model_name="restaurant",
            name="delivery_radius_km",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("50.00"),
                max_digits=10,
                validators=[MinValueValidator(Decimal("0.10"))],
            ),
        ),
    ]

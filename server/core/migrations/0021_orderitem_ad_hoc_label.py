# Generated manually for counter / scan line labels

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0020_order_partial_payments_staff_records"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderitem",
            name="ad_hoc_label",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
    ]

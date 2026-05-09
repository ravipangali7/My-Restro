from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0008_restaurant_reference_coords_order_proximity"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="guest_customer_name",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name="order",
            name="guest_customer_phone",
            field=models.CharField(blank=True, max_length=32),
        ),
    ]

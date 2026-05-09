from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0017_restaurant_delivery_radius_km"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="bill_image",
            field=models.ImageField(blank=True, null=True, upload_to="order_bills/"),
        ),
    ]

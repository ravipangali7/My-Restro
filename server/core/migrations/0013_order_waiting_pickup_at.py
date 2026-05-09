from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0012_order_status_delivered"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="waiting_pickup_at",
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text="Set when the order moves to waiting_pickup; cleared on delivery.",
                null=True,
            ),
        ),
    ]

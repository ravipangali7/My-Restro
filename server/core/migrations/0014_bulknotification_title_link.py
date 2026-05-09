from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0013_order_waiting_pickup_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="bulknotification",
            name="title",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="bulknotification",
            name="link",
            field=models.CharField(blank=True, default="", max_length=500),
        ),
    ]

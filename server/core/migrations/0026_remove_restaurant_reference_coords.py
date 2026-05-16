from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0025_alter_bulknotification_image_alter_category_image_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="restaurant",
            name="reference_latitude",
        ),
        migrations.RemoveField(
            model_name="restaurant",
            name="reference_longitude",
        ),
    ]

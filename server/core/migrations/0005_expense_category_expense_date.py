from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0004_comboset_discount_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="expense",
            name="category",
            field=models.CharField(
                choices=[
                    ("utilities", "Utilities"),
                    ("salary", "Salary"),
                    ("rent", "Rent"),
                    ("maintenance", "Maintenance"),
                    ("marketing", "Marketing"),
                    ("other", "Other"),
                ],
                default="other",
                max_length=40,
            ),
        ),
        migrations.AddField(
            model_name="expense",
            name="expense_date",
            field=models.DateField(default=django.utils.timezone.now),
        ),
    ]

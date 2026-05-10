# Generated manually for per-restaurant subscription / SMS rate overrides.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0022_user_phone_max_length"),
    ]

    operations = [
        migrations.AddField(
            model_name="restaurant",
            name="subscription_fee_per_month",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=12,
                null=True,
                help_text="If set, this monthly subscription reference rate applies to this venue only; otherwise the platform default is used.",
            ),
        ),
        migrations.AddField(
            model_name="restaurant",
            name="sms_per_usage",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=12,
                null=True,
                help_text="If set, this SMS unit rate applies to this venue only; otherwise the platform default is used.",
            ),
        ),
    ]

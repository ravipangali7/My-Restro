# Generated manually for shareholder balance adjustment ledger rows.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0015_bulknotification_restaurant_nullable"),
    ]

    operations = [
        migrations.AlterField(
            model_name="transaction",
            name="category",
            field=models.CharField(
                choices=[
                    ("transaction_fee", "Transaction Fee"),
                    ("order_payment", "Order Payment"),
                    ("subscription_fee", "Subscription Fee"),
                    ("sms_usage", "SMS Usage"),
                    ("share_distribution", "Share Distribution"),
                    ("share_withdrawal", "Share Withdrawal"),
                    ("share_balance_adjustment", "Share Balance Adjustment"),
                    ("due_paid", "Due Paid"),
                    ("ledger_credit", "Ledger Credit"),
                    ("ledger_debit", "Ledger Debit"),
                    ("salary", "Salary"),
                ],
                max_length=40,
            ),
        ),
    ]

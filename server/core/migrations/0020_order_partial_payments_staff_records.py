from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


def backfill_amount_paid_for_paid_orders(apps, schema_editor):
    Order = apps.get_model("core", "Order")
    for o in Order.objects.filter(payment_status="success").iterator(chunk_size=200):
        total = o.total or Decimal("0.00")
        if (o.amount_paid or Decimal("0.00")) == Decimal("0.00") and total > 0:
            o.amount_paid = total
            o.save(update_fields=["amount_paid"])


def noop_backfill(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0019_supersetting_due_payment_qr"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="amount_paid",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("0.00"),
                help_text="Sum of staff-recorded counter payments toward this order (partial or full).",
                max_digits=12,
            ),
        ),
        migrations.AlterField(
            model_name="order",
            name="payment_method",
            field=models.CharField(
                choices=[
                    ("cash", "Cash"),
                    ("e_wallet", "E-Wallet"),
                    ("qr", "QR / UPI"),
                ],
                default="cash",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="order",
            name="payment_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("partial", "Partial"),
                    ("success", "Success"),
                    ("failed", "Failed"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="transaction",
            name="payment_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("partial", "Partial"),
                    ("success", "Success"),
                    ("failed", "Failed"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="OrderStaffPaymentRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "channel",
                    models.CharField(
                        choices=[("cash", "Cash"), ("qr", "QR / UPI")],
                        max_length=20,
                    ),
                ),
                (
                    "order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="staff_payment_records",
                        to="core.order",
                    ),
                ),
                (
                    "recorded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="order_staff_payment_records",
                        to="core.user",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
        migrations.RunPython(backfill_amount_paid_for_paid_orders, noop_backfill),
    ]

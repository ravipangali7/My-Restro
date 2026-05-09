from django.core.management.base import BaseCommand
from django.db.models import Count

from core.models import Order
from core.services.order_transactions import upsert_order_payment_transaction


class Command(BaseCommand):
    help = "Create or refresh order_payment Transaction rows for every order that has line items."

    def handle(self, *args, **options):
        qs = Order.objects.annotate(_item_count=Count("items")).filter(_item_count__gt=0)
        updated = 0
        for order in qs.iterator():
            upsert_order_payment_transaction(order)
            updated += 1
        self.stdout.write(self.style.SUCCESS(f"Upserted order payment transactions for {updated} order(s)."))

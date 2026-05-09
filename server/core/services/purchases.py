from decimal import Decimal

from django.db import transaction

from core.models import Purchase, StockLog, StockLogType
from core.services.exceptions import AlreadyPostedError
from core.services.pricing import apply_discount_to_subtotal


@transaction.atomic
def finalize_purchase(purchase: Purchase) -> Purchase:
    """
    Post purchase to inventory: line totals, purchase subtotal/total, stock in + StockLog.
    Safe to call once per purchase; repeats raise AlreadyPostedError.
    """
    if StockLog.objects.filter(purchase=purchase, type=StockLogType.IN).exists():
        raise AlreadyPostedError("Purchase already posted to stock.")

    items = list(purchase.items.select_related("raw_material"))
    if not items:
        raise ValueError("Purchase has no line items.")

    subtotal = Decimal("0.00")
    for line in items:
        line_total = line.price * line.quantity
        line.total = line_total
        subtotal += line_total
        line.save(update_fields=["total", "updated_at"])

    purchase.subtotal = subtotal
    purchase.total = apply_discount_to_subtotal(subtotal, purchase.discount_type, purchase.discount)
    purchase.save(update_fields=["subtotal", "total", "updated_at"])

    for line in items:
        rm = line.raw_material
        rm.stock += line.quantity
        rm.save(update_fields=["stock", "updated_at"])
        StockLog.objects.create(
            restaurant=purchase.restaurant,
            raw_material=rm,
            type=StockLogType.IN,
            quantity=line.quantity,
            purchase=purchase,
            purchase_item=line,
        )

    return purchase

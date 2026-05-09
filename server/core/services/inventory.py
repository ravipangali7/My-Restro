from collections import defaultdict
from decimal import Decimal

from django.db import transaction

from core.models import OrderItem, ProductRawMaterial, RawMaterial, StockLog, StockLogType
from core.services.exceptions import InsufficientStockError


def _per_unit_needs_by_raw_material(order_item: OrderItem) -> dict[int, Decimal]:
    """
    Resolve raw material quantities per 1 unit of this order line.

    Product-level rows (``product_item`` null) are defaults. When the menu item has
    any item-specific rows, those amounts **override** the product-level amount for
    the same raw material; product-level rows for ingredients not listed on the
    item recipe are still applied (base recipe + variant/extra lines).

    Multiple ``ProductRawMaterial`` rows for the same ingredient are summed before
    merging tiers.
    """
    product = order_item.product
    if not product:
        return {}

    restaurant = order_item.order.restaurant
    product_item = order_item.product_item

    base_totals: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    for link in ProductRawMaterial.objects.filter(
        restaurant=restaurant, product=product, product_item__isnull=True
    ):
        base_totals[link.raw_material_id] += link.raw_material_quantity

    item_totals: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    for link in ProductRawMaterial.objects.filter(
        restaurant=restaurant, product=product, product_item=product_item
    ):
        item_totals[link.raw_material_id] += link.raw_material_quantity

    if not item_totals:
        return dict(base_totals)

    merged = dict(base_totals)
    for rm_id, qty in item_totals.items():
        merged[rm_id] = qty
    return merged


def _consumption_already_logged(order_item: OrderItem) -> bool:
    return StockLog.objects.filter(
        order_item=order_item, type=StockLogType.OUT, order=order_item.order
    ).exists()


@transaction.atomic
def consume_stock_for_order_item(order_item: OrderItem) -> int:
    """
    Decrement RawMaterial.stock and create StockLog (out) rows for one order line.
    Idempotent: skips if logs already exist for this order_item.
    Returns number of stock log rows created.
    """
    if not order_item.product_item_id:
        return 0
    if _consumption_already_logged(order_item):
        return 0

    per_unit = _per_unit_needs_by_raw_material(order_item)
    if not per_unit:
        return 0

    created = 0
    qty = order_item.quantity
    rms = {
        rm.pk: rm
        for rm in RawMaterial.objects.filter(pk__in=per_unit.keys()).select_for_update()
    }

    for rm_id in sorted(per_unit.keys()):
        rm = rms[rm_id]
        need = per_unit[rm_id] * qty
        if need <= 0:
            continue
        if rm.stock < need:
            raise InsufficientStockError(rm.name, need, rm.stock)
        rm.stock -= need
        rm.save(update_fields=["stock", "updated_at"])
        StockLog.objects.create(
            restaurant=order_item.order.restaurant,
            raw_material=rm,
            type=StockLogType.OUT,
            quantity=need,
            order=order_item.order,
            order_item=order_item,
        )
        created += 1
    return created


@transaction.atomic
def consume_stock_for_order(order) -> int:
    """Apply raw-material consumption for every eligible line on an order."""
    total_logs = 0
    for item in order.items.all():
        total_logs += consume_stock_for_order_item(item)
    return total_logs

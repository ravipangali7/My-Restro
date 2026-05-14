from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.models import (
    ComboSet,
    Order,
    OrderItem,
    OrderStatus,
    OrderType,
    PaymentMethod,
    PaymentStatus,
    ProductItem,
    Staff,
    User,
)
from core.services.exceptions import ValidationError
from core.services.geo import haversine_distance_km
from core.services.inventory import consume_stock_for_order
from core.services.order_bill import attach_order_bill_image
from core.services.order_ready_notifications import notify_customer_order_ready_with_bill
from core.services.transactions import effective_per_transaction_fee, record_platform_transaction_fee_for_order


def _line_unit_and_product(*, restaurant, product_item_id=None, comboset_id=None):
    if product_item_id:
        pi = ProductItem.objects.select_related("product").get(
            pk=product_item_id, product__restaurant=restaurant, is_active=True
        )
        return pi.discounted_price, pi.product, pi, None
    if comboset_id:
        cs = ComboSet.objects.get(pk=comboset_id, restaurant=restaurant, is_active=True)
        return cs.price, None, None, cs
    raise ValidationError("Each line needs product_item_id or comboset_id.")


def assert_waiter_assignable(restaurant, waiter):
    if waiter is None:
        return
    try:
        st = Staff.objects.get(restaurant=restaurant, user=waiter)
    except Staff.DoesNotExist:
        return
    if st.is_suspend:
        raise ValidationError("Cannot assign a suspended staff member as waiter.")


@transaction.atomic
def create_order_with_items(
    *,
    restaurant,
    lines,
    customer=None,
    guest_customer_name="",
    guest_customer_phone="",
    table=None,
    order_type=None,
    address="",
    latitude=None,
    longitude=None,
    payment_method=None,
    fcm_token="",
    waiter=None,
    people_for=1,
    order_discount: Decimal | None = None,
):
    """
    Build order lines from ProductItem (unit = discounted_price) or ComboSet (unit = combo price).
    Computes sub_total and total (order-level discount subtracted from sub_total).
    """
    assert_waiter_assignable(restaurant, waiter)

    order_discount = order_discount if order_discount is not None else Decimal("0.00")
    resolved_type = order_type or OrderType.TABLE
    resolved_payment_method = payment_method or PaymentMethod.CASH
    if resolved_payment_method == PaymentMethod.E_WALLET:
        initial_payment_status = PaymentStatus.SUCCESS
    else:
        initial_payment_status = PaymentStatus.PENDING
    order = Order(
        restaurant=restaurant,
        customer=customer,
        guest_customer_name=(guest_customer_name or "")[:150],
        guest_customer_phone=(guest_customer_phone or "")[:32],
        table=table,
        order_type=resolved_type,
        address=address or "",
        latitude=latitude,
        longitude=longitude,
        status=OrderStatus.PENDING,
        payment_status=initial_payment_status,
        payment_method=resolved_payment_method,
        fcm_token=fcm_token or "",
        waiter=waiter,
        people_for=people_for,
        discount=order_discount,
    )
    order.save()

    sub_total = Decimal("0.00")
    for raw in lines:
        qty = Decimal(str(raw["quantity"]))
        if qty <= 0:
            raise ValidationError("Line quantity must be positive.")
        unit, product, pi, cs = _line_unit_and_product(
            restaurant=restaurant,
            product_item_id=raw.get("product_item_id"),
            comboset_id=raw.get("comboset_id"),
        )
        line_total = unit * qty
        OrderItem.objects.create(
            order=order,
            product=product,
            product_item=pi,
            comboset=cs,
            price=unit,
            quantity=qty,
            total=line_total,
        )
        sub_total += line_total

    delivery_fee = Decimal("0.00")
    if resolved_type == OrderType.DELIVERY:
        if not restaurant.can_delivery:
            raise ValidationError("This restaurant does not offer delivery.")
        if latitude is None or longitude is None:
            raise ValidationError("Delivery orders require a location on the map (latitude and longitude).")
        if restaurant.latitude is None or restaurant.longitude is None:
            raise ValidationError("Restaurant location is not set; delivery distance cannot be calculated.")
        km = Decimal(str(haversine_distance_km(
            float(restaurant.latitude),
            float(restaurant.longitude),
            float(latitude),
            float(longitude),
        )))
        radius_km = restaurant.delivery_radius_km or Decimal("0.00")
        if radius_km > Decimal("0.00") and km >= radius_km:
            raise ValidationError("You are out of reach of the restaurant delivery radius.")
        rate = restaurant.delivery_fee_per_km or Decimal("0.00")
        if rate > Decimal("0.00"):
            delivery_fee = (km * rate).quantize(Decimal("0.01"))

    effective_fee = effective_per_transaction_fee(restaurant)
    service_charge = effective_fee.quantize(Decimal("0.01")) if effective_fee > 0 else Decimal("0.00")
    order.sub_total = sub_total
    order.delivery_fee = delivery_fee
    order.total = max(Decimal("0.00"), sub_total - order_discount) + service_charge + delivery_fee
    order.save(update_fields=["sub_total", "discount", "delivery_fee", "total", "updated_at"])

    record_platform_transaction_fee_for_order(order)
    attach_order_bill_image(order)
    return order


def recalculate_order_totals(order: Order) -> Order:
    """Recompute sub_total and total from persisted line items and order.discount."""
    sub_total = sum((li.total for li in order.items.all()), Decimal("0.00"))
    effective_fee = effective_per_transaction_fee(order.restaurant)
    service_charge = effective_fee.quantize(Decimal("0.01")) if effective_fee > 0 else Decimal("0.00")
    order.sub_total = sub_total
    order.total = (
        max(Decimal("0.00"), sub_total - order.discount)
        + service_charge
        + (order.delivery_fee or Decimal("0.00"))
    )
    order.save(update_fields=["sub_total", "total", "updated_at"])
    return order


@transaction.atomic
def add_cashier_line_to_order(
    *,
    order: Order,
    restaurant,
    product_item_id: int | None = None,
    ad_hoc_label: str = "",
    unit_price: Decimal | None = None,
    quantity: Decimal = Decimal("1.00"),
) -> Order:
    """
    Add a line from catalog (``product_item_id``) or a counter/scan ad-hoc row (name + unit price).
    Recomputes subtotal and bill total; regenerates the bill image. Does not post inventory.
    """
    if order.status == OrderStatus.REJECTED:
        raise ValidationError("Cannot add lines to a rejected order.")
    if order.payment_status == PaymentStatus.SUCCESS:
        raise ValidationError("This order is already fully paid.")
    if quantity <= 0:
        raise ValidationError("Line quantity must be positive.")

    if product_item_id:
        u, product, pi, _cs = _line_unit_and_product(
            restaurant=restaurant, product_item_id=product_item_id, comboset_id=None
        )
        line_total = (u * quantity).quantize(Decimal("0.01"))
        OrderItem.objects.create(
            order=order,
            product=product,
            product_item=pi,
            comboset=None,
            ad_hoc_label="",
            price=u,
            quantity=quantity,
            total=line_total,
        )
    else:
        label = (ad_hoc_label or "").strip()
        if not label:
            raise ValidationError("Item name is required for this line.")
        if unit_price is None or unit_price < 0:
            raise ValidationError("Unit price must be zero or greater for counter lines.")
        line_total = (unit_price * quantity).quantize(Decimal("0.01"))
        OrderItem.objects.create(
            order=order,
            product=None,
            product_item=None,
            comboset=None,
            ad_hoc_label=label[:200],
            price=unit_price,
            quantity=quantity,
            total=line_total,
        )

    order.refresh_from_db()
    recalculate_order_totals(order)
    attach_order_bill_image(order)
    order.refresh_from_db()
    return order


@transaction.atomic
def transition_order_status(
    order: Order,
    new_status: str,
    *,
    reject_reason: str = "",
    consume_inventory_when_ready: bool = True,
    status_changed_by: User | None = None,
) -> Order:
    """
    Update order status. When moving to ``ready``, optionally consume raw materials.
    Rejection sets reject_reason and does not consume stock.

    On any real status change, schedules customer SMS (Twilio) + in-app side effects after commit;
    successful SMS is billed to the restaurant. ``status_changed_by`` is stored on the SMS ledger row
    when present (owner, kitchen, or waiter who triggered the transition).
    """
    if new_status not in {c[0] for c in OrderStatus.choices}:
        raise ValidationError(f"Invalid order status: {new_status!r}.")
    old = order.status
    if new_status == OrderStatus.DELIVERED and old != OrderStatus.WAITING_PICKUP:
        raise ValidationError("Only waiting pickup orders can be marked delivered.")
    if new_status == OrderStatus.WAITING_PICKUP and old != OrderStatus.READY:
        raise ValidationError("Only ready orders can move to waiting pickup.")
    order.status = new_status
    if new_status == OrderStatus.REJECTED:
        order.reject_reason = (reject_reason or "")[:255]
    else:
        order.reject_reason = ""

    pickup_ts_fields: list[str] = []
    if new_status == OrderStatus.WAITING_PICKUP:
        order.waiting_pickup_at = timezone.now()
        pickup_ts_fields.append("waiting_pickup_at")
    elif old == OrderStatus.WAITING_PICKUP and new_status == OrderStatus.DELIVERED:
        order.waiting_pickup_at = None
        pickup_ts_fields.append("waiting_pickup_at")

    update_fields = ["status", "reject_reason", *pickup_ts_fields, "updated_at"]

    order.save(update_fields=update_fields)

    if new_status == OrderStatus.READY and old != OrderStatus.READY and consume_inventory_when_ready:
        consume_stock_for_order(order)

    if new_status == OrderStatus.READY and old != OrderStatus.READY:
        notify_customer_order_ready_with_bill(order, old_status=old)

    if old != new_status:
        oid, old_s, new_s = order.pk, old, new_status
        actor_pk = getattr(status_changed_by, "pk", None)

        def _customer_side_effects() -> None:
            from core.services.order_status_customer_notify import run_order_status_change_customer_side_effects

            run_order_status_change_customer_side_effects(
                order_id=oid,
                old_status=old_s,
                new_status=new_s,
                actor_user_id=actor_pk,
            )

        transaction.on_commit(_customer_side_effects)

    return order

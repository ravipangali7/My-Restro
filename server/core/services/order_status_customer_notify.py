"""SMS + in-app push when an order status changes (post-commit).

Owner and kitchen/waiter flows all use ``POST /api/orders/:id/transition-status/``, which calls
``transition_order_status`` and schedules this module on commit. When Twilio successfully sends the
status SMS, the venue is billed via ``record_restaurant_order_status_sms_charge`` (SMS_USAGE + due balance).
"""

from __future__ import annotations

import logging

from django.db import transaction

from core.auth.portal import normalize_phone
from core.models import BulkNotification, BulkNotificationType, Order, OrderStatus
from core.services.sms import send_plain_sms
from core.services.sms_billing import record_restaurant_order_status_sms_charge

logger = logging.getLogger(__name__)


def _status_display(code: str) -> str:
    return dict(OrderStatus.choices).get(code, code.replace("_", " ").title())


def _order_customer_notify_receivers(order: Order) -> list[str]:
    if order.customer_id:
        return [str(order.customer_id)]
    phone = (order.guest_customer_phone or "").strip()
    if phone:
        return [normalize_phone(phone)]
    return []


def _order_customer_sms_phone(order: Order) -> str:
    """
    Prefer the linked customer's profile phone; if missing, fall back to the order's guest phone
    (covers logged-in customers who supplied a contact number on the order).
    """
    guest = (order.guest_customer_phone or "").strip()
    if order.customer_id and order.customer is not None:
        raw = (order.customer.phone or "").strip()
        if raw:
            return normalize_phone(raw)
        if guest:
            return normalize_phone(guest)
        return ""
    return normalize_phone(guest) if guest else ""


def _sms_body(order: Order, new_status: str) -> str:
    label = _status_display(new_status)
    rname = (order.restaurant.name or "Restaurant").strip()
    return f"{rname}: order {order.order_id} is now {label}. Thank you."


def _create_status_push_notification(order: Order, new_status: str) -> None:
    receivers = _order_customer_notify_receivers(order)
    if not receivers:
        return
    label = _status_display(new_status)
    title = f"Order {order.order_id} update"
    message = f"Your order at {order.restaurant.name} is now {label}."
    BulkNotification.objects.create(
        restaurant=None,
        title=title[:200],
        message=message,
        link="/customer/notifications",
        receivers=receivers,
        type=BulkNotificationType.PUSH,
    )


def run_order_status_change_customer_side_effects(
    *,
    order_id: int,
    old_status: str,
    new_status: str,
    actor_user_id: int | None = None,
) -> None:
    """
    Called via ``transaction.on_commit`` after a successful status transition.

    - Sends an SMS when a customer phone is available; on Twilio success, records SMS_USAGE due.
    - Creates an in-app push for non-ready transitions. ``ready`` uses
      ``notify_customer_order_ready_with_bill`` (already run inside the status transaction).
    """
    try:
        order = Order.objects.select_related("restaurant", "customer").get(pk=order_id)
    except Order.DoesNotExist:
        logger.warning("order_status side effects: order id=%s missing", order_id)
        return

    phone = _order_customer_sms_phone(order)
    sms_sent = False
    if phone and "".join(c for c in phone if c.isdigit()):
        try:
            sms_sent = send_plain_sms(phone, _sms_body(order, new_status))
        except Exception:
            logger.exception("order_status SMS send failed order_id=%s", order_id)
            sms_sent = False
        if sms_sent:
            try:
                record_restaurant_order_status_sms_charge(
                    restaurant_id=order.restaurant_id,
                    order_id=order.order_id,
                    old_status=old_status,
                    new_status=new_status,
                    created_by_id=actor_user_id,
                )
            except Exception:
                logger.exception("order_status SMS billing failed order_id=%s", order_id)

    if new_status == OrderStatus.READY and old_status != OrderStatus.READY:
        return

    try:
        with transaction.atomic():
            _create_status_push_notification(order, new_status)
    except Exception:
        logger.exception("order_status push notification failed order_id=%s", order_id)

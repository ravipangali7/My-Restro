"""Customer-facing in-app notification when an order becomes ready (includes bill image)."""

from __future__ import annotations

from django.core.files.base import ContentFile

from core.auth.portal import normalize_phone
from core.models import BulkNotification, BulkNotificationType, Order, OrderStatus
from core.services.order_bill import ensure_order_bill_image


def notify_customer_order_ready_with_bill(order: Order, *, old_status: str) -> None:
    """
    Create a platform-scoped BulkNotification targeted at the customer (or guest phone),
    with a copy of the order bill image when available.
    """
    if order.status != OrderStatus.READY or old_status == OrderStatus.READY:
        return

    ensure_order_bill_image(order)
    order.refresh_from_db(fields=["bill_image"])

    receivers: list[str] = []
    if order.customer_id:
        receivers.append(str(order.customer_id))
    else:
        phone = (order.guest_customer_phone or "").strip()
        if phone:
            receivers.append(normalize_phone(phone))
    if not receivers:
        return

    title = f"Order {order.order_id} is ready"
    message = (
        f"Your order at {order.restaurant.name} is ready. "
        f"Open Notifications to view your bill image — tap the image for a full-screen view."
    )

    n = BulkNotification.objects.create(
        restaurant=None,
        title=title[:200],
        message=message,
        link="/customer/notifications",
        receivers=receivers,
        type=BulkNotificationType.PUSH,
    )

    if order.bill_image:
        with order.bill_image.open("rb") as src:
            n.image.save(f"order-{order.pk}-ready-bill.png", ContentFile(src.read()), save=True)

    # Deep-link to this row on the notifications page (hash is preserved by the app router).
    n.link = f"/customer/notifications#n-{n.id}"
    n.save(update_fields=["link"])

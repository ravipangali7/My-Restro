from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from core.models import Order, OrderItem
from core.services.order_transactions import upsert_order_payment_transaction


@receiver(post_save, sender=Order)
def sync_order_payment_transaction(sender, instance: Order, **kwargs):
    """Keep the order_payment transaction row in sync after totals or payment change."""
    if kwargs.get("raw"):
        return
    if not instance.pk or not instance.order_id:
        return
    if not instance.items.exists():
        return
    upsert_order_payment_transaction(instance)


@receiver(post_save, sender=OrderItem)
@receiver(post_delete, sender=OrderItem)
def sync_order_payment_transaction_from_items(sender, instance: OrderItem, **kwargs):
    """When lines are added after the order exists (e.g. seeds, imports), Order may not save again."""
    if kwargs.get("raw"):
        return
    order = instance.order
    if not order.pk or not order.order_id:
        return
    if not order.items.exists():
        return
    order.refresh_from_db()
    upsert_order_payment_transaction(order)

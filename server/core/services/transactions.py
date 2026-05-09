from decimal import Decimal

from django.db.models import F

from core.models import PaymentStatus, Restaurant, Transaction, TransactionCategory, TransactionType

from core.services.restaurant_due import apply_due_balance_deactivation
from core.services.super_settings import get_super_setting


def effective_per_transaction_fee(restaurant) -> Decimal:
    fee = restaurant.per_transaction_fee or Decimal("0.00")
    if fee > 0:
        return fee
    setting = get_super_setting()
    return setting.per_transaction_fee or Decimal("0.00")


def _platform_fee_remarks(order_id: str) -> str:
    return f"Transaction fee — order {order_id}"


def record_platform_transaction_fee_for_order(order) -> Transaction | None:
    """
    Apply the configured per-order platform fee once: add it to the restaurant's due balance,
    record a transaction_fee row, and deactivate the restaurant if due_threshold is exceeded.
    Idempotent per order (matched by remarks + category).
    """
    fee = effective_per_transaction_fee(order.restaurant)
    if fee <= 0:
        return None
    remarks = _platform_fee_remarks(order.order_id)
    if Transaction.objects.filter(
        restaurant_id=order.restaurant_id,
        category=TransactionCategory.TRANSACTION_FEE,
        remarks=remarks,
        is_system=True,
    ).exists():
        return None

    restaurant = Restaurant.objects.select_for_update().get(pk=order.restaurant_id)
    tx = Transaction.objects.create(
        restaurant=restaurant,
        amount=fee,
        payment_status=PaymentStatus.SUCCESS,
        remarks=remarks,
        transaction_type=TransactionType.IN,
        category=TransactionCategory.TRANSACTION_FEE,
        is_system=True,
    )
    Restaurant.objects.filter(pk=restaurant.pk).update(due_balance=F("due_balance") + fee)
    restaurant.refresh_from_db()
    if apply_due_balance_deactivation(restaurant):
        restaurant.save(update_fields=["is_active", "updated_at"])
    return tx

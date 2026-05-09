from decimal import Decimal

from django.db import transaction as db_transaction

from core.models import Order, PaymentStatus, Transaction, TransactionCategory, TransactionType
from core.request_context import get_current_request_user


def order_payment_transaction_remarks(order_id: str) -> str:
    return f"Order payment — {order_id}"


def upsert_order_payment_transaction(order: Order) -> Transaction | None:
    """
    One reporting row per order: amount mirrors order total; payment_status mirrors order.
    """
    if not order.order_id:
        return None
    remarks = order_payment_transaction_remarks(order.order_id)
    actor = get_current_request_user()
    actor_pk = actor.pk if actor is not None and getattr(actor, "is_authenticated", False) else None
    with db_transaction.atomic():
        tx = (
            Transaction.objects.select_for_update()
            .filter(
                restaurant_id=order.restaurant_id,
                category=TransactionCategory.ORDER_PAYMENT,
                remarks=remarks,
            )
            .first()
        )
        amount = order.total if order.total is not None else Decimal("0.00")
        pay = order.payment_status or PaymentStatus.PENDING
        if tx:
            tx.amount = amount
            tx.payment_status = pay
            update_fields = ["amount", "payment_status", "updated_at"]
            if tx.created_by_id is None and actor_pk is not None:
                tx.created_by_id = actor_pk
                update_fields.append("created_by_id")
            tx.save(update_fields=update_fields)
            return tx
        return Transaction.objects.create(
            restaurant=order.restaurant,
            created_by_id=actor_pk,
            amount=amount,
            payment_status=pay,
            remarks=remarks,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.ORDER_PAYMENT,
            is_system=False,
        )

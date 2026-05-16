from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from core.models import (
    PaymentStatus,
    Restaurant,
    ShareholderWithdrawal,
    Transaction,
    TransactionCategory,
    TransactionType,
    User,
    WithdrawalStatus,
)
from core.services.exceptions import ValidationError


def _pending_withdrawal_total(user) -> Decimal:
    total = (
        ShareholderWithdrawal.objects.filter(user=user, status=WithdrawalStatus.PENDING).aggregate(s=Sum("amount"))["s"]
        or Decimal("0.00")
    )
    return total


@transaction.atomic
def request_shareholder_withdrawal(user, amount: Decimal, remarks: str = "") -> ShareholderWithdrawal:
    shareholder = User.objects.select_for_update().get(pk=user.pk)
    if not shareholder.is_shareholder:
        raise ValidationError("User is not a shareholder.")
    if amount <= 0:
        raise ValidationError("Withdrawal amount must be positive.")
    remarks_clean = (remarks or "").strip()
    if not remarks_clean:
        raise ValidationError("Remarks are required.")
    pending = _pending_withdrawal_total(shareholder)
    available = shareholder.balance - pending
    if amount > available:
        raise ValidationError("Withdrawal amount cannot exceed available balance.")
    return ShareholderWithdrawal.objects.create(
        user=shareholder, amount=amount, remarks=remarks_clean, status=WithdrawalStatus.PENDING
    )


def _restaurant_for_share_withdrawal_bookkeeping(
    withdrawal_user, restaurant: Restaurant | None
) -> Restaurant:
    """Resolve a restaurant row for the audit Transaction FK.

    Platform shareholder withdrawals are approved only by the super admin; no restaurant
    permission is required. When the shareholder does not own a venue, we attach the
    ledger line to the first restaurant by primary key purely to satisfy the non-null
    FK (system / platform cash-out).
    """
    if restaurant is not None:
        return restaurant
    owned = withdrawal_user.restaurants.order_by("pk").first()
    if owned:
        return owned
    fallback = Restaurant.objects.order_by("pk").first()
    if fallback is None:
        raise ValidationError("No restaurant exists to record this share withdrawal.")
    return fallback


@transaction.atomic
def approve_shareholder_withdrawal(
    w: ShareholderWithdrawal, restaurant: Restaurant | None = None
) -> ShareholderWithdrawal:
    locked_w = ShareholderWithdrawal.objects.select_for_update().select_related("user").get(pk=w.pk)
    if locked_w.status != WithdrawalStatus.PENDING:
        raise ValidationError("Only pending withdrawals can be approved.")
    if not locked_w.user.is_shareholder:
        raise ValidationError("User is not a shareholder.")

    shareholder = User.objects.select_for_update().get(pk=locked_w.user_id)
    if locked_w.amount > shareholder.balance:
        raise ValidationError("Insufficient shareholder balance.")

    restaurant = _restaurant_for_share_withdrawal_bookkeeping(shareholder, restaurant)

    shareholder.balance -= locked_w.amount
    shareholder.save(update_fields=["balance", "updated_at"])

    base = f"Share withdrawal #{locked_w.pk}"
    note = (locked_w.remarks or "").strip()
    if note:
        sep = " — "
        budget = 255 - len(base) - len(sep)
        if budget > 0:
            if len(note) > budget:
                note = note[: max(budget - 1, 0)] + "…"
            withdrawal_remarks = f"{base}{sep}{note}"[:255]
        else:
            withdrawal_remarks = base[:255]
    else:
        withdrawal_remarks = base

    Transaction.objects.create(
        restaurant=restaurant,
        created_by=shareholder,
        amount=locked_w.amount,
        payment_status=PaymentStatus.SUCCESS,
        remarks=withdrawal_remarks,
        transaction_type=TransactionType.OUT,
        category=TransactionCategory.SHARE_WITHDRAWAL,
        is_system=True,
    )

    locked_w.status = WithdrawalStatus.APPROVED
    locked_w.save(update_fields=["status", "updated_at"])
    return locked_w


@transaction.atomic
def record_shareholder_balance_adjustment_transaction(
    shareholder,
    old_balance: Decimal,
    new_balance: Decimal,
    *,
    reason: str = "",
) -> Transaction | None:
    """Log a shareholder balance change (e.g. super-admin edit) as a ledger Transaction."""
    if not shareholder.is_shareholder:
        return None
    delta = new_balance - old_balance
    if delta == 0:
        return None
    restaurant = _restaurant_for_share_withdrawal_bookkeeping(shareholder, None)
    amount = abs(delta)
    txn_type = TransactionType.IN if delta > 0 else TransactionType.OUT
    cleaned = (reason or "").strip() or "Balance adjusted by administrator"
    if len(cleaned) > 255:
        cleaned = cleaned[:252] + "..."
    return Transaction.objects.create(
        restaurant=restaurant,
        created_by=shareholder,
        amount=amount,
        payment_status=PaymentStatus.SUCCESS,
        remarks=cleaned,
        transaction_type=txn_type,
        category=TransactionCategory.SHARE_BALANCE_ADJUSTMENT,
        is_system=True,
    )


def _pending_withdrawal_total_excluding(withdrawal_id: int, user_id: int) -> Decimal:
    total = (
        ShareholderWithdrawal.objects.filter(user_id=user_id, status=WithdrawalStatus.PENDING)
        .exclude(pk=withdrawal_id)
        .aggregate(s=Sum("amount"))["s"]
        or Decimal("0.00")
    )
    return total


@transaction.atomic
def update_pending_shareholder_withdrawal(
    w: ShareholderWithdrawal,
    *,
    user: User | None = None,
    amount: Decimal | None = None,
    remarks: str | None = None,
) -> ShareholderWithdrawal:
    locked_w = ShareholderWithdrawal.objects.select_for_update().select_related("user").get(pk=w.pk)
    if locked_w.status != WithdrawalStatus.PENDING:
        raise ValidationError("Only pending withdrawals can be updated.")

    shareholder = locked_w.user
    if user is not None and user.pk != locked_w.user_id:
        shareholder = User.objects.select_for_update().get(pk=user.pk)
        if not shareholder.is_shareholder:
            raise ValidationError("User is not a shareholder.")
        locked_w.user = shareholder

    new_amount = locked_w.amount if amount is None else amount
    if new_amount <= 0:
        raise ValidationError("Withdrawal amount must be positive.")

    if remarks is not None:
        remarks_clean = (remarks or "").strip()
        if not remarks_clean:
            raise ValidationError("Remarks are required.")
        locked_w.remarks = remarks_clean

    pending_other = _pending_withdrawal_total_excluding(locked_w.pk, shareholder.pk)
    available = shareholder.balance - pending_other
    if new_amount > available:
        raise ValidationError("Withdrawal amount cannot exceed available balance.")

    locked_w.amount = new_amount
    locked_w.save(update_fields=["user", "amount", "remarks", "updated_at"])
    return locked_w


@transaction.atomic
def reject_shareholder_withdrawal(w: ShareholderWithdrawal, reason: str) -> ShareholderWithdrawal:
    locked_w = ShareholderWithdrawal.objects.select_for_update().get(pk=w.pk)
    if locked_w.status != WithdrawalStatus.PENDING:
        raise ValidationError("Only pending withdrawals can be rejected.")
    locked_w.status = WithdrawalStatus.REJECTED
    locked_w.reject_reason = reason[:255]
    locked_w.save(update_fields=["status", "reject_reason", "updated_at"])
    return locked_w

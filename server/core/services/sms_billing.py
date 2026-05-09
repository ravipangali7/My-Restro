"""Bill platform SMS usage (OTP) to owners or restaurants using SuperSetting.sms_per_usage."""

from __future__ import annotations

import logging
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F

from core.auth.portal import primary_staff_membership
from core.models import PaymentStatus, Restaurant, Staff, Transaction, TransactionCategory, TransactionType, UserRole
from core.services.restaurant_due import apply_due_balance_deactivation
from core.services.super_settings import get_super_setting

logger = logging.getLogger(__name__)


def _parse_optional_restaurant_id(raw) -> int | None:
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


@transaction.atomic
def record_sms_otp_charge_after_sent(*, phone: str, purpose: str, restaurant_id_raw=None) -> None:
    """
    After a successful OTP SMS send, add sms_per_usage to the correct due bucket.

    - Owner login OTP: User.due_balance (owner account).
    - Staff login OTP: Restaurant.due_balance + Transaction (sms_usage) for the scoped restaurant.

    Register / customer / super-admin OTPs are not billed here.
    """
    if purpose != "login":
        return

    setting = get_super_setting()
    rate = setting.sms_per_usage or Decimal("0.00")
    if rate <= Decimal("0.00"):
        return

    User = get_user_model()
    user = User.objects.select_for_update().filter(phone=phone).first()
    if user is None:
        return

    role = getattr(user, "role", None)
    if role == UserRole.OWNER:
        User.objects.filter(pk=user.pk).update(due_balance=F("due_balance") + rate)
        return

    if role == UserRole.STAFF:
        rid = _parse_optional_restaurant_id(restaurant_id_raw)
        staff_row = None
        if rid is not None:
            staff_row = Staff.objects.filter(user=user, restaurant_id=rid).select_related("restaurant").first()
        if staff_row is None:
            staff_row = primary_staff_membership(user)
        if staff_row is None:
            logger.warning("SMS OTP billed for staff with no Staff membership: user_id=%s", user.pk)
            return

        restaurant = Restaurant.objects.select_for_update().get(pk=staff_row.restaurant_id)
        remarks = "SMS OTP — login verification"
        Transaction.objects.create(
            restaurant=restaurant,
            created_by=user,
            amount=rate,
            payment_status=PaymentStatus.SUCCESS,
            remarks=remarks,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.SMS_USAGE,
            is_system=True,
        )
        Restaurant.objects.filter(pk=restaurant.pk).update(due_balance=F("due_balance") + rate)
        restaurant.refresh_from_db()
        if apply_due_balance_deactivation(restaurant):
            restaurant.save(update_fields=["is_active", "updated_at"])
        return

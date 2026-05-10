"""Effective platform fees for a restaurant: venue override when set, else global SuperSetting."""

from __future__ import annotations

from decimal import Decimal

from core.services.super_settings import get_super_setting


def effective_per_transaction_fee(restaurant) -> Decimal:
    """Restaurant ``per_transaction_fee`` > 0 wins; otherwise the platform default applies."""
    fee = restaurant.per_transaction_fee or Decimal("0.00")
    if fee > 0:
        return fee
    setting = get_super_setting()
    return setting.per_transaction_fee or Decimal("0.00")


def effective_subscription_fee_per_month(restaurant) -> Decimal:
    """Non-null ``restaurant.subscription_fee_per_month`` wins; otherwise SuperSetting."""
    v = getattr(restaurant, "subscription_fee_per_month", None)
    if v is not None:
        return Decimal(str(v))
    setting = get_super_setting()
    return setting.subscription_fee_per_month or Decimal("0.00")


def effective_sms_per_usage(restaurant) -> Decimal:
    """Non-null ``restaurant.sms_per_usage`` wins; otherwise SuperSetting."""
    v = getattr(restaurant, "sms_per_usage", None)
    if v is not None:
        return Decimal(str(v))
    setting = get_super_setting()
    return setting.sms_per_usage or Decimal("0.00")

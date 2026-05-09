"""Platform due threshold enforcement for restaurants."""

from __future__ import annotations

from decimal import Decimal

from core.models import Restaurant
from core.services.super_settings import get_super_setting


def platform_due_threshold() -> Decimal:
    s = get_super_setting()
    return s.due_threshold if s.due_threshold is not None else Decimal("0.00")


def apply_due_balance_deactivation(restaurant: Restaurant) -> bool:
    """
    When due balance reaches or exceeds the configured platform threshold, deactivate the restaurant.

    Does not auto-reactivate when the balance drops (handled by pay-due or super admin approval flows).

    Returns True if `is_active` was changed to False.
    """
    threshold = platform_due_threshold()
    if threshold <= 0:
        return False
    if restaurant.due_balance >= threshold and restaurant.is_active:
        restaurant.is_active = False
        return True
    return False

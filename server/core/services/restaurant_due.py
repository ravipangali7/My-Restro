"""Platform due auto-suspend: uses each venue's effective due threshold (override or super defaults)."""

from __future__ import annotations

from core.models import Restaurant
from core.services.platform_pricing import effective_due_threshold


def apply_due_balance_deactivation(restaurant: Restaurant) -> bool:
    """
    When due balance reaches or exceeds the effective due threshold for this venue, deactivate the restaurant.

    Does not auto-reactivate when the balance drops (handled by pay-due or super admin approval flows).

    Returns True if `is_active` was changed to False.
    """
    threshold = effective_due_threshold(restaurant)
    if threshold <= 0:
        return False
    if restaurant.due_balance >= threshold and restaurant.is_active:
        restaurant.is_active = False
        return True
    return False

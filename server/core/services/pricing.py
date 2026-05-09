from decimal import Decimal

from core.models import DiscountType


def apply_discount_to_subtotal(subtotal: Decimal, discount_type: str, discount: Decimal) -> Decimal:
    """
    Mirror ProductItem / Purchase discount semantics (flat vs percentage), floored at zero.
    """
    if discount_type == DiscountType.PERCENTAGE:
        return max(
            Decimal("0.00"),
            subtotal - ((subtotal * discount) / Decimal("100.00")),
        )
    return max(Decimal("0.00"), subtotal - discount)

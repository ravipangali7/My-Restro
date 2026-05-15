from django.db.models import Q

from core.models import Order, Restaurant, Staff, StaffRole, User, UserRole

# ``User.phone`` / ``Otp.phone`` column size; normalized values longer than this must be rejected
# before save (PostgreSQL raises on overflow; otherwise clients see an opaque 500).
USER_PHONE_MAX_LEN = 32

# Local mobile numbers are stored and validated as exactly this many digits, with no + prefix.
LOCAL_PHONE_DIGITS = 10

# Shareholders with many withdrawals: matching each id with two ``Q`` branches explodes SQL size;
# use chunked ``remarks__regex`` instead (portable via Django's regex lookup).
_SHARE_WITHDRAWAL_REMARK_RE_CHUNK = 150


def _share_withdrawal_transaction_q(withdrawal_ids: list[int]) -> Q:
    """Match ledger rows for ``Share withdrawal #<id>`` (optional em-dash note suffix)."""
    from core.models import TransactionCategory

    if not withdrawal_ids:
        return Q(pk__in=[])
    combined = Q()
    for i in range(0, len(withdrawal_ids), _SHARE_WITHDRAWAL_REMARK_RE_CHUNK):
        chunk = withdrawal_ids[i : i + _SHARE_WITHDRAWAL_REMARK_RE_CHUNK]
        # Prefer longer numeric ids in the alternation so ``#12`` is not satisfied by ``#1``.
        ids_sorted = sorted({int(wid) for wid in chunk}, key=lambda n: len(str(n)), reverse=True)
        alt = "|".join(str(n) for n in ids_sorted)
        # Em dash (U+2014) after the space, matching transaction labels elsewhere in the codebase.
        pat = rf"^Share withdrawal #({alt})( —.*)?$"
        combined |= Q(category=TransactionCategory.SHARE_WITHDRAWAL, remarks__regex=pat)
    return combined


def normalize_phone(phone: str) -> str:
    """Digits only (for comparison and storage). Empty string when there are no digits."""
    if phone is None:
        return ""
    return "".join(c for c in str(phone).strip() if c.isdigit())


def parse_local_phone(raw: str | None, *, required: bool = True) -> tuple[str | None, str | None]:
    """
    Validate a local number: exactly LOCAL_PHONE_DIGITS digits, no leading + / country code in the input.

    Returns (normalized_digits, None) on success, or (None, error_message) on failure.
    When required is False, an empty/whitespace-only value succeeds as ("", None).
    """
    if raw is None:
        s = ""
    else:
        s = str(raw).strip()
    if not s:
        if required:
            return None, "Phone is required."
        return "", None
    if s.startswith("+"):
        return None, "Do not include a country code. Enter exactly 10 digits (no + sign)."
    digits = normalize_phone(s)
    if len(digits) != LOCAL_PHONE_DIGITS:
        return None, f"Phone must be exactly {LOCAL_PHONE_DIGITS} digits with no country code."
    return digits, None


def primary_staff_membership(user: User) -> Staff | None:
    if user.role != UserRole.STAFF:
        return None
    return Staff.objects.filter(user=user).order_by("-joined_at").first()


def portal_role_for_user(user: User) -> str:
    if user.role == UserRole.SUPER_ADMIN:
        if getattr(user, "is_shareholder", False):
            return "shareholder"
        return "superadmin"
    if user.role == UserRole.OWNER:
        return "owner"
    if user.role == UserRole.STAFF:
        staff = primary_staff_membership(user)
        if staff:
            return staff.role
        return "waiter"
    if user.role == UserRole.CUSTOMER:
        if user.is_shareholder:
            return "shareholder"
        return "customer"
    return "customer"


def restaurant_ids_for_user(user: User) -> list[int]:
    if not user.is_authenticated:
        return []
    if user.role == UserRole.SUPER_ADMIN:
        return list(Restaurant.objects.values_list("id", flat=True))
    if user.role == UserRole.OWNER:
        return list(Restaurant.objects.filter(user=user, is_active=True).values_list("id", flat=True))
    if user.role == UserRole.STAFF:
        if portal_role_for_user(user) == "waiter":
            return list(
                Staff.objects.filter(
                    user=user,
                    role=StaffRole.WAITER,
                    restaurant__is_active=True,
                )
                .values_list("restaurant_id", flat=True)
                .distinct()
            )
        return list(
            Staff.objects.filter(user=user, restaurant__is_active=True)
            .values_list("restaurant_id", flat=True)
            .distinct()
        )
    if user.role == UserRole.CUSTOMER:
        if getattr(user, "is_shareholder", False):
            from core.models import ShareholderWithdrawal, Transaction, TransactionCategory

            cats = [
                TransactionCategory.SHARE_WITHDRAWAL,
                TransactionCategory.SHARE_DISTRIBUTION,
                TransactionCategory.SHARE_BALANCE_ADJUSTMENT,
            ]
            withdrawal_ids = list(ShareholderWithdrawal.objects.filter(user=user).values_list("id", flat=True))
            q = Q(created_by=user, category__in=cats)
            if withdrawal_ids:
                q |= _share_withdrawal_transaction_q(withdrawal_ids)
            rids = list(Transaction.objects.filter(q).values_list("restaurant_id", flat=True).distinct())
            order_rids = Order.objects.filter(customer=user).values_list("restaurant_id", flat=True)
            return sorted(set(rids) | set(order_rids))
        return sorted(set(Order.objects.filter(customer=user).values_list("restaurant_id", flat=True)))
    return []


def default_restaurant_id_for_user(user: User) -> int | None:
    if user.role == UserRole.STAFF:
        primary = primary_staff_membership(user)
        if primary is not None:
            return primary.restaurant_id
    ids = restaurant_ids_for_user(user)
    return ids[0] if ids else None


def user_can_access_restaurant(user: User, restaurant_id: int) -> bool:
    if not user.is_authenticated:
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return Restaurant.objects.filter(id=restaurant_id).exists()
    if user.role == UserRole.OWNER:
        return Restaurant.objects.filter(id=restaurant_id, user=user).exists()
    if user.role == UserRole.STAFF:
        return Staff.objects.filter(user=user, restaurant_id=restaurant_id, restaurant__is_active=True).exists()
    if user.role == UserRole.CUSTOMER:
        return Restaurant.objects.filter(id=restaurant_id, is_active=True).exists()
    return False


def user_can_manage_restaurant(user: User, restaurant_id: int) -> bool:
    if not user.is_authenticated:
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return Restaurant.objects.filter(id=restaurant_id).exists()
    if user.role == UserRole.OWNER:
        return Restaurant.objects.filter(id=restaurant_id, user=user, is_active=True).exists()
    if user.role == UserRole.STAFF:
        if portal_role_for_user(user) == StaffRole.WAITER:
            return False
        return Staff.objects.filter(user=user, restaurant_id=restaurant_id, restaurant__is_active=True).exists()
    return False


def user_can_view_restaurant_financials(user: User, restaurant_id: int) -> bool:
    """List/read transactions and ledgers: owners, super-admins, and any staff (including waiters) at the restaurant."""
    if not user.is_authenticated:
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return Restaurant.objects.filter(id=restaurant_id).exists()
    if user.role == UserRole.OWNER:
        return Restaurant.objects.filter(id=restaurant_id, user=user, is_active=True).exists()
    if user.role == UserRole.STAFF:
        return Staff.objects.filter(user=user, restaurant_id=restaurant_id, restaurant__is_active=True).exists()
    return False

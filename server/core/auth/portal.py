from django.db.models import Q

from core.models import Order, Restaurant, Staff, StaffRole, User, UserRole


def normalize_phone(phone: str) -> str:
    digits = "".join(c for c in phone.strip() if c.isdigit())
    if not digits:
        return phone.strip()
    if phone.strip().startswith("+"):
        return "+" + digits
    return digits


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
                wq = Q()
                for wid in withdrawal_ids:
                    base = f"Share withdrawal #{wid}"
                    wq |= Q(category=TransactionCategory.SHARE_WITHDRAWAL, remarks=base)
                    wq |= Q(category=TransactionCategory.SHARE_WITHDRAWAL, remarks__startswith=f"{base} —")
                q |= wq
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

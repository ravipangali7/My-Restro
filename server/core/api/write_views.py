import json
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.api.list_serializers import BulkNotificationListSerializer, RestaurantListSerializer, UserListSerializer
from core.auth.portal import USER_PHONE_MAX_LEN, normalize_phone, user_can_manage_restaurant
from core.serializers.me import UserMeSerializer
from core.models import (
    BulkNotification,
    BulkNotificationType,
    PaymentStatus,
    Restaurant,
    Staff,
    StaffRole,
    SuperSetting,
    Transaction,
    TransactionCategory,
    TransactionType,
    User,
    UserRole,
)
from core.services.sms import send_plain_sms
from core.services.restaurant_due import apply_due_balance_deactivation
from core.services.super_settings import get_super_setting
from core.services.withdrawals import record_shareholder_balance_adjustment_transaction


def _actor_may_manage_user(actor: User, target: User) -> bool:
    actor_role = getattr(actor, "role", None)
    if actor_role == UserRole.SUPER_ADMIN:
        return True
    if actor_role == UserRole.OWNER:
        staff_ids = Staff.objects.filter(restaurant__user=actor).values_list("user_id", flat=True)
        return target.created_by_id == actor.id or target.id in staff_ids
    return False


def _parse_target_role(raw: str) -> str | None:
    if not raw:
        return None
    v = raw.strip().lower().replace("-", "_")
    for choice, _ in UserRole.choices:
        if v == choice:
            return choice
    return None


def _parse_staff_role(raw: str) -> str:
    v = (raw or "waiter").strip().lower()
    for choice, _ in StaffRole.choices:
        if v == choice:
            return choice
    return StaffRole.WAITER


def _as_bool(value, default: bool = False) -> bool:
    """Parse booleans from JSON or form fields (multipart)."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    s = str(value).lower().strip()
    if s in ("1", "true", "yes", "on"):
        return True
    if s in ("0", "false", "no", "off", ""):
        return False
    return default


def _create_user_response(request):
    actor = request.user
    actor_role = getattr(actor, "role", None)
    if actor_role not in (UserRole.SUPER_ADMIN, UserRole.OWNER):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    phone = normalize_phone(request.data.get("phone", ""))
    name = (request.data.get("name") or "").strip()
    target_role = _parse_target_role(str(request.data.get("role", "")))

    if not phone or not name:
        return Response({"detail": "phone and name are required."}, status=status.HTTP_400_BAD_REQUEST)
    if len(phone) > USER_PHONE_MAX_LEN:
        return Response(
            {"detail": f"Phone number is too long (max {USER_PHONE_MAX_LEN} characters)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if target_role is None:
        return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(phone=phone).exists():
        return Response({"detail": "A user with this phone already exists."}, status=status.HTTP_400_BAD_REQUEST)

    # Super admin accounts cannot be created via the API (use management commands / Django admin).
    if target_role == UserRole.SUPER_ADMIN:
        return Response(
            {"detail": "Super admin accounts cannot be created through the API."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if actor_role == UserRole.OWNER:
        if target_role not in (UserRole.OWNER, UserRole.STAFF, UserRole.CUSTOMER):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        created_by = actor
        is_shareholder = False
        share_percentage = Decimal("0.00")
    else:
        if target_role not in dict(UserRole.choices):
            return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)
        created_by = None
        is_shareholder = _as_bool(request.data.get("is_shareholder"), False)
        try:
            share_percentage = Decimal(str(request.data.get("share_percentage", "0")))
        except Exception:
            share_percentage = Decimal("0.00")

    staff_restaurant_id: int | None = None
    if target_role == UserRole.STAFF:
        raw_rid = request.data.get("restaurant_id")
        try:
            staff_restaurant_id = int(raw_rid)
        except (TypeError, ValueError):
            return Response({"detail": "restaurant_id is required for staff users."}, status=status.HTTP_400_BAD_REQUEST)
        if not user_can_manage_restaurant(actor, staff_restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    staff_role = _parse_staff_role(str(request.data.get("staff_role", "waiter")))
    password = request.data.get("password")
    if isinstance(password, str) and password.strip() == "":
        password = None

    user_kwargs: dict = {
        "name": name,
        "role": target_role,
        "is_shareholder": is_shareholder,
        "share_percentage": share_percentage,
        "created_by": created_by,
    }
    if target_role == UserRole.SUPER_ADMIN:
        user_kwargs["is_staff"] = True
        user_kwargs["is_superuser"] = True

    if actor_role == UserRole.SUPER_ADMIN:
        if "balance" in request.data:
            try:
                user_kwargs["balance"] = Decimal(str(request.data.get("balance")))
            except Exception:
                pass
        if "due_balance" in request.data:
            try:
                user_kwargs["due_balance"] = Decimal(str(request.data.get("due_balance")))
            except Exception:
                pass

    with transaction.atomic():
        user = User.objects.create_user(phone, password=password, **user_kwargs)
        if target_role == UserRole.STAFF and staff_restaurant_id is not None:
            Staff.objects.create(restaurant_id=staff_restaurant_id, user=user, role=staff_role)

    image_file = request.FILES.get("image")
    if image_file:
        user.image = image_file
        user.save(update_fields=["image"])

    return Response(
        UserListSerializer(user, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_user(request):
    return _create_user_response(request)


def _parse_decimal_field(raw, default: Decimal | None = None) -> Decimal | None:
    if raw is None or raw == "":
        return default
    try:
        return Decimal(str(raw))
    except Exception:
        return default


def _patch_user_response(request, pk: int) -> Response:
    actor = request.user
    actor_role = getattr(actor, "role", None)

    if pk == actor.id and actor_role == UserRole.STAFF:
        u = actor
        data = request.data
        if "name" in data:
            nm = (data.get("name") or "").strip()
            if nm:
                u.name = nm
        image_file = request.FILES.get("image")
        if image_file:
            u.image = image_file
        u.save()
        return Response(UserMeSerializer(u, context={"request": request}).data)

    if pk == actor.id and actor_role == UserRole.OWNER:
        u = actor
        data = request.data
        if "name" in data:
            nm = (data.get("name") or "").strip()
            if nm:
                u.name = nm
        if "phone" in data:
            ph = normalize_phone(str(data.get("phone", "")))
            if not ph:
                return Response({"detail": "phone is required."}, status=status.HTTP_400_BAD_REQUEST)
            if len(ph) > USER_PHONE_MAX_LEN:
                return Response(
                    {"detail": f"Phone number is too long (max {USER_PHONE_MAX_LEN} characters)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if User.objects.filter(phone=ph).exclude(pk=u.id).exists():
                return Response(
                    {"detail": "A user with this phone already exists."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            u.phone = ph
        image_file = request.FILES.get("image")
        if image_file:
            u.image = image_file
        u.save()
        return Response(UserMeSerializer(u, context={"request": request}).data)

    # Customers may update their own name, phone, and profile image (ordering app + shareholder portal).
    if pk == actor.id and actor_role == UserRole.CUSTOMER:
        u = actor
        data = request.data
        if "name" in data:
            nm = (data.get("name") or "").strip()
            if nm:
                u.name = nm
        if "phone" in data:
            ph = normalize_phone(str(data.get("phone", "")))
            if not ph:
                return Response({"detail": "phone is required."}, status=status.HTTP_400_BAD_REQUEST)
            if len(ph) > USER_PHONE_MAX_LEN:
                return Response(
                    {"detail": f"Phone number is too long (max {USER_PHONE_MAX_LEN} characters)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if User.objects.filter(phone=ph).exclude(pk=u.id).exists():
                return Response(
                    {"detail": "A user with this phone already exists."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            u.phone = ph
        image_file = request.FILES.get("image")
        if image_file:
            u.image = image_file
        u.save()
        return Response(UserMeSerializer(u, context={"request": request}).data)

    if actor_role not in (UserRole.SUPER_ADMIN, UserRole.OWNER):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    try:
        u = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not _actor_may_manage_user(actor, u):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    data = request.data
    shareholder_balance_ledger: tuple[Decimal, Decimal, str] | None = None

    if "name" in data:
        nm = (data.get("name") or "").strip()
        if nm:
            u.name = nm

    if "role" in data:
        new_role = _parse_target_role(str(data.get("role", "")))
        if new_role is None:
            return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)
        if new_role == UserRole.SUPER_ADMIN and actor_role != UserRole.SUPER_ADMIN:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        if new_role == UserRole.SUPER_ADMIN and u.role != UserRole.SUPER_ADMIN:
            return Response(
                {"detail": "Cannot assign super admin role through the API."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if actor_role == UserRole.OWNER and new_role not in (UserRole.OWNER, UserRole.STAFF, UserRole.CUSTOMER):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        u.role = new_role
        if new_role == UserRole.SUPER_ADMIN:
            u.is_staff = True
            u.is_superuser = True
        else:
            u.is_staff = False
            u.is_superuser = False

    if actor_role == UserRole.SUPER_ADMIN:
        if "is_shareholder" in data:
            u.is_shareholder = _as_bool(data.get("is_shareholder"), u.is_shareholder)
        if "share_percentage" in data:
            sp = _parse_decimal_field(data.get("share_percentage"), u.share_percentage)
            if sp is not None:
                u.share_percentage = sp
        if "balance" in data:
            bal = _parse_decimal_field(data.get("balance"), u.balance)
            if bal is not None:
                if u.is_shareholder and bal != u.balance:
                    reason = str(
                        data.get("balance_adjustment_reason") or data.get("balance_adjustment_remarks") or ""
                    ).strip()
                    shareholder_balance_ledger = (u.balance, bal, reason)
                u.balance = bal
        if "due_balance" in data:
            due = _parse_decimal_field(data.get("due_balance"), u.due_balance)
            if due is not None:
                u.due_balance = due

    image_file = request.FILES.get("image")
    if image_file:
        u.image = image_file

    with transaction.atomic():
        if shareholder_balance_ledger is not None:
            old_b, new_b, reason = shareholder_balance_ledger
            record_shareholder_balance_adjustment_transaction(u, old_b, new_b, reason=reason)
        u.save()

    return Response(UserListSerializer(u, context={"request": request}).data)


@api_view(["DELETE", "PATCH"])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([IsAuthenticated])
def user_detail(request, pk: int):
    if request.method == "PATCH":
        return _patch_user_response(request, pk)

    if getattr(request.user, "role", None) != UserRole.SUPER_ADMIN:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    if pk == request.user.id:
        return Response({"detail": "You cannot delete your own account."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        u = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    u.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


def _parse_iso_date(val) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, date):
        return val
    s = str(val).strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _parse_coord_pair(lat_raw, lng_raw, *, both_required: bool):
    latitude = None
    longitude = None
    if lat_raw not in (None, ""):
        try:
            latitude = Decimal(str(lat_raw))
        except Exception:
            return None, None, Response({"detail": "Invalid latitude."}, status=status.HTTP_400_BAD_REQUEST)
    if lng_raw not in (None, ""):
        try:
            longitude = Decimal(str(lng_raw))
        except Exception:
            return None, None, Response({"detail": "Invalid longitude."}, status=status.HTTP_400_BAD_REQUEST)
    if both_required and (latitude is None or longitude is None):
        return None, None, Response(
            {"detail": "latitude and longitude are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return latitude, longitude, None


def _create_restaurant_response(request):
    actor_role = getattr(request.user, "role", None)
    if actor_role not in (UserRole.SUPER_ADMIN, UserRole.OWNER):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if actor_role == UserRole.OWNER:
        owner = request.user
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        phone = (request.data.get("phone") or "").strip() or (getattr(owner, "phone", None) or "").strip()
        slug_raw = (request.data.get("slug") or "").strip()
        address = (request.data.get("address") or "").strip()
        lat_raw = request.data.get("latitude")
        lng_raw = request.data.get("longitude")
        latitude, longitude, err = _parse_coord_pair(lat_raw, lng_raw, both_required=True)
        if err:
            return err
        ptf = Decimal("0.00")
        if request.data.get("per_transaction_fee") not in (None, ""):
            try:
                ptf = Decimal(str(request.data.get("per_transaction_fee")))
            except Exception:
                return Response({"detail": "Invalid per_transaction_fee."}, status=status.HTTP_400_BAD_REQUEST)
        sub_start = None
        sub_end = None
        is_open = True
        due_bal = Decimal("0.00")
        can_delivery = _as_bool(request.data.get("can_delivery"), False)
        delivery_fee_per_km = Decimal("0.00")
        delivery_radius_km = Decimal("50.00")
        if request.data.get("delivery_fee_per_km") not in (None, ""):
            try:
                delivery_fee_per_km = Decimal(str(request.data.get("delivery_fee_per_km")))
            except Exception:
                return Response({"detail": "Invalid delivery_fee_per_km."}, status=status.HTTP_400_BAD_REQUEST)
            if delivery_fee_per_km < 0:
                return Response(
                    {"detail": "delivery_fee_per_km must be non-negative."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if request.data.get("delivery_radius_km") not in (None, ""):
            try:
                delivery_radius_km = Decimal(str(request.data.get("delivery_radius_km")))
            except Exception:
                return Response({"detail": "Invalid delivery_radius_km."}, status=status.HTTP_400_BAD_REQUEST)
            if delivery_radius_km < Decimal("0.10"):
                return Response(
                    {"detail": "delivery_radius_km must be at least 0.10 km."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        due_bal = Decimal("0.00")
    else:
        raw_uid = request.data.get("user")
        name = (request.data.get("name") or "").strip()
        phone = (request.data.get("phone") or "").strip()
        if raw_uid is None or not name or not phone:
            return Response({"detail": "user, name, and phone are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            owner = User.objects.get(pk=int(raw_uid))
        except (ValueError, User.DoesNotExist):
            return Response({"detail": "Invalid owner."}, status=status.HTTP_400_BAD_REQUEST)

        if owner.role != UserRole.OWNER:
            return Response({"detail": "Selected user must have the owner role."}, status=status.HTTP_400_BAD_REQUEST)

        slug_raw = (request.data.get("slug") or "").strip()
        address = (request.data.get("address") or "").strip()
        lat_raw = request.data.get("latitude")
        lng_raw = request.data.get("longitude")
        latitude, longitude, err = _parse_coord_pair(lat_raw, lng_raw, both_required=False)
        if err:
            return err

        ptf = Decimal("0.00")
        if request.data.get("per_transaction_fee") not in (None, ""):
            try:
                ptf = Decimal(str(request.data.get("per_transaction_fee")))
            except Exception:
                return Response({"detail": "Invalid per_transaction_fee."}, status=status.HTTP_400_BAD_REQUEST)

        sub_start = _parse_iso_date(request.data.get("subscription_start"))
        sub_end = _parse_iso_date(request.data.get("subscription_end"))
        is_open = _as_bool(request.data.get("is_open"), True)
        can_delivery = _as_bool(request.data.get("can_delivery"), False)

        delivery_fee_per_km = Decimal("0.00")
        delivery_radius_km = Decimal("50.00")
        if request.data.get("delivery_fee_per_km") not in (None, ""):
            try:
                delivery_fee_per_km = Decimal(str(request.data.get("delivery_fee_per_km")))
            except Exception:
                return Response({"detail": "Invalid delivery_fee_per_km."}, status=status.HTTP_400_BAD_REQUEST)
            if delivery_fee_per_km < 0:
                return Response({"detail": "delivery_fee_per_km must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)
        if request.data.get("delivery_radius_km") not in (None, ""):
            try:
                delivery_radius_km = Decimal(str(request.data.get("delivery_radius_km")))
            except Exception:
                return Response({"detail": "Invalid delivery_radius_km."}, status=status.HTTP_400_BAD_REQUEST)
            if delivery_radius_km < Decimal("0.10"):
                return Response(
                    {"detail": "delivery_radius_km must be at least 0.10 km."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        due_bal = Decimal("0.00")
        if request.data.get("due_balance") not in (None, ""):
            try:
                due_bal = Decimal(str(request.data.get("due_balance")))
            except Exception:
                return Response({"detail": "Invalid due_balance."}, status=status.HTTP_400_BAD_REQUEST)

    ref_lat_raw = request.data.get("reference_latitude")
    ref_lng_raw = request.data.get("reference_longitude")
    ref_lat = None
    ref_lng = None
    ref_partial = (ref_lat_raw not in (None, "")) or (ref_lng_raw not in (None, ""))
    if ref_partial:
        ref_lat, ref_lng, err = _parse_coord_pair(ref_lat_raw, ref_lng_raw, both_required=True)
        if err:
            return err

    proximity_r = Decimal("2.00")
    if request.data.get("proximity_alert_radius_m") not in (None, ""):
        try:
            proximity_r = Decimal(str(request.data.get("proximity_alert_radius_m")))
        except Exception:
            return Response({"detail": "Invalid proximity_alert_radius_m."}, status=status.HTTP_400_BAD_REQUEST)
        if proximity_r < Decimal("0.10") or proximity_r > Decimal("5000.00"):
            return Response(
                {"detail": "proximity_alert_radius_m must be between 0.10 and 5000 meters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    r = Restaurant(
        user=owner,
        name=name,
        phone=phone,
        slug=slug_raw,
        address=address,
        latitude=latitude,
        longitude=longitude,
        reference_latitude=ref_lat,
        reference_longitude=ref_lng,
        proximity_alert_radius_m=proximity_r,
        due_balance=due_bal if actor_role == UserRole.SUPER_ADMIN else Decimal("0.00"),
        per_transaction_fee=ptf,
        subscription_start=sub_start if actor_role == UserRole.SUPER_ADMIN else None,
        subscription_end=sub_end if actor_role == UserRole.SUPER_ADMIN else None,
        is_open=is_open,
        can_delivery=can_delivery,
        delivery_fee_per_km=delivery_fee_per_km,
        delivery_radius_km=delivery_radius_km,
        is_active=False if actor_role == UserRole.OWNER else True,
    )
    apply_due_balance_deactivation(r)
    r.save()

    logo = request.FILES.get("logo")
    if logo:
        r.logo = logo
        r.save(update_fields=["logo"])

    return Response(
        RestaurantListSerializer(r, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


def _patch_restaurant_response(request, pk: int):
    actor_role = getattr(request.user, "role", None)
    if actor_role not in (UserRole.SUPER_ADMIN, UserRole.OWNER):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    try:
        r = Restaurant.objects.get(pk=pk)
    except Restaurant.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    if actor_role == UserRole.OWNER and r.user_id != request.user.id:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    if actor_role == UserRole.OWNER and not r.is_active:
        return Response(
            {"detail": "This restaurant is pending super admin approval and cannot be updated yet."},
            status=status.HTTP_403_FORBIDDEN,
        )

    data = request.data

    if actor_role == UserRole.OWNER:
        allowed = {
            "can_delivery",
            "delivery_fee_per_km",
            "delivery_radius_km",
            "latitude",
            "longitude",
            "reference_latitude",
            "reference_longitude",
            "proximity_alert_radius_m",
        }
        attempted = {key for key in data.keys() if key not in allowed}
        if attempted:
            return Response(
                {"detail": "One or more fields cannot be updated by owners."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not any(k in data for k in allowed):
            return Response(
                {
                    "detail": "Provide at least one of: can_delivery, delivery_fee_per_km, delivery_radius_km, "
                    "latitude, longitude, reference_latitude, reference_longitude, proximity_alert_radius_m."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        update_fields: list[str] = ["updated_at"]
        if "can_delivery" in data:
            r.can_delivery = _as_bool(data.get("can_delivery"), r.can_delivery)
            update_fields.append("can_delivery")
        if "delivery_fee_per_km" in data:
            raw_df = data.get("delivery_fee_per_km")
            try:
                df = Decimal(str(raw_df)) if raw_df not in (None, "") else Decimal("0.00")
            except Exception:
                return Response({"detail": "Invalid delivery_fee_per_km."}, status=status.HTTP_400_BAD_REQUEST)
            if df < 0:
                return Response(
                    {"detail": "delivery_fee_per_km must be non-negative."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            r.delivery_fee_per_km = df
            update_fields.append("delivery_fee_per_km")
        if "delivery_radius_km" in data:
            raw_dr = data.get("delivery_radius_km")
            try:
                dr = Decimal(str(raw_dr)) if raw_dr not in (None, "") else Decimal("50.00")
            except Exception:
                return Response({"detail": "Invalid delivery_radius_km."}, status=status.HTTP_400_BAD_REQUEST)
            if dr < Decimal("0.10"):
                return Response(
                    {"detail": "delivery_radius_km must be at least 0.10 km."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            r.delivery_radius_km = dr
            update_fields.append("delivery_radius_km")
        if "latitude" in data:
            lat_raw = data.get("latitude")
            if lat_raw in (None, ""):
                r.latitude = None
            else:
                try:
                    r.latitude = Decimal(str(lat_raw))
                except Exception:
                    return Response({"detail": "Invalid latitude."}, status=status.HTTP_400_BAD_REQUEST)
            update_fields.append("latitude")
        if "longitude" in data:
            lng_raw = data.get("longitude")
            if lng_raw in (None, ""):
                r.longitude = None
            else:
                try:
                    r.longitude = Decimal(str(lng_raw))
                except Exception:
                    return Response({"detail": "Invalid longitude."}, status=status.HTTP_400_BAD_REQUEST)
            update_fields.append("longitude")
        if "reference_latitude" in data or "reference_longitude" in data:
            if "reference_latitude" not in data or "reference_longitude" not in data:
                return Response(
                    {"detail": "reference_latitude and reference_longitude must be updated together."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            ref_lat_raw = data.get("reference_latitude")
            ref_lng_raw = data.get("reference_longitude")
            if ref_lat_raw in (None, "") and ref_lng_raw in (None, ""):
                r.reference_latitude = None
                r.reference_longitude = None
            else:
                ref_lat, ref_lng, err = _parse_coord_pair(ref_lat_raw, ref_lng_raw, both_required=True)
                if err:
                    return err
                r.reference_latitude = ref_lat
                r.reference_longitude = ref_lng
            update_fields.append("reference_latitude")
            update_fields.append("reference_longitude")
        if "proximity_alert_radius_m" in data:
            raw_pr = data.get("proximity_alert_radius_m")
            try:
                pr = Decimal(str(raw_pr)) if raw_pr not in (None, "") else Decimal("2.00")
            except Exception:
                return Response({"detail": "Invalid proximity_alert_radius_m."}, status=status.HTTP_400_BAD_REQUEST)
            if pr < Decimal("0.10") or pr > Decimal("5000.00"):
                return Response(
                    {"detail": "proximity_alert_radius_m must be between 0.10 and 5000 meters."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            r.proximity_alert_radius_m = pr
            update_fields.append("proximity_alert_radius_m")
        r.save(update_fields=update_fields)
        return Response(RestaurantListSerializer(r, context={"request": request}).data)

    if "user" in data:
        raw_uid = data.get("user")
        try:
            owner = User.objects.get(pk=int(raw_uid))
        except (ValueError, User.DoesNotExist):
            return Response({"detail": "Invalid owner."}, status=status.HTTP_400_BAD_REQUEST)
        if owner.role != UserRole.OWNER:
            return Response({"detail": "Selected user must have the owner role."}, status=status.HTTP_400_BAD_REQUEST)
        r.user = owner

    if "name" in data:
        nm = (data.get("name") or "").strip()
        if nm:
            r.name = nm

    if "phone" in data:
        r.phone = (data.get("phone") or "").strip()

    if "slug" in data:
        sg = (data.get("slug") or "").strip()
        if sg:
            r.slug = sg

    if "address" in data:
        r.address = (data.get("address") or "").strip()

    if "latitude" in data:
        lat_raw = data.get("latitude")
        if lat_raw in (None, ""):
            r.latitude = None
        else:
            try:
                r.latitude = Decimal(str(lat_raw))
            except Exception:
                return Response({"detail": "Invalid latitude."}, status=status.HTTP_400_BAD_REQUEST)

    if "longitude" in data:
        lng_raw = data.get("longitude")
        if lng_raw in (None, ""):
            r.longitude = None
        else:
            try:
                r.longitude = Decimal(str(lng_raw))
            except Exception:
                return Response({"detail": "Invalid longitude."}, status=status.HTTP_400_BAD_REQUEST)

    if "reference_latitude" in data or "reference_longitude" in data:
        if "reference_latitude" not in data or "reference_longitude" not in data:
            return Response(
                {"detail": "reference_latitude and reference_longitude must be updated together."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ref_lat_raw = data.get("reference_latitude")
        ref_lng_raw = data.get("reference_longitude")
        if ref_lat_raw in (None, "") and ref_lng_raw in (None, ""):
            r.reference_latitude = None
            r.reference_longitude = None
        else:
            ref_lat, ref_lng, err = _parse_coord_pair(ref_lat_raw, ref_lng_raw, both_required=True)
            if err:
                return err
            r.reference_latitude = ref_lat
            r.reference_longitude = ref_lng

    if "proximity_alert_radius_m" in data and data.get("proximity_alert_radius_m") not in (None, ""):
        try:
            pr = Decimal(str(data.get("proximity_alert_radius_m")))
        except Exception:
            return Response({"detail": "Invalid proximity_alert_radius_m."}, status=status.HTTP_400_BAD_REQUEST)
        if pr < Decimal("0.10") or pr > Decimal("5000.00"):
            return Response(
                {"detail": "proximity_alert_radius_m must be between 0.10 and 5000 meters."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        r.proximity_alert_radius_m = pr

    if "per_transaction_fee" in data and data.get("per_transaction_fee") not in (None, ""):
        try:
            r.per_transaction_fee = Decimal(str(data.get("per_transaction_fee")))
        except Exception:
            return Response({"detail": "Invalid per_transaction_fee."}, status=status.HTTP_400_BAD_REQUEST)

    if "due_balance" in data and data.get("due_balance") not in (None, ""):
        try:
            r.due_balance = Decimal(str(data.get("due_balance")))
        except Exception:
            return Response({"detail": "Invalid due_balance."}, status=status.HTTP_400_BAD_REQUEST)

    if "subscription_start" in data:
        r.subscription_start = _parse_iso_date(data.get("subscription_start"))
    if "subscription_end" in data:
        r.subscription_end = _parse_iso_date(data.get("subscription_end"))

    if "is_open" in data:
        r.is_open = _as_bool(data.get("is_open"), r.is_open)
    if "is_active" in data:
        r.is_active = _as_bool(data.get("is_active"), r.is_active)
    if "can_delivery" in data:
        r.can_delivery = _as_bool(data.get("can_delivery"), r.can_delivery)

    if "delivery_fee_per_km" in data:
        raw_df = data.get("delivery_fee_per_km")
        if raw_df in (None, ""):
            r.delivery_fee_per_km = Decimal("0.00")
        else:
            try:
                df = Decimal(str(raw_df))
            except Exception:
                return Response({"detail": "Invalid delivery_fee_per_km."}, status=status.HTTP_400_BAD_REQUEST)
            if df < 0:
                return Response(
                    {"detail": "delivery_fee_per_km must be non-negative."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            r.delivery_fee_per_km = df
    if "delivery_radius_km" in data:
        raw_dr = data.get("delivery_radius_km")
        if raw_dr in (None, ""):
            r.delivery_radius_km = Decimal("50.00")
        else:
            try:
                dr = Decimal(str(raw_dr))
            except Exception:
                return Response({"detail": "Invalid delivery_radius_km."}, status=status.HTTP_400_BAD_REQUEST)
            if dr < Decimal("0.10"):
                return Response(
                    {"detail": "delivery_radius_km must be at least 0.10 km."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            r.delivery_radius_km = dr

    logo = request.FILES.get("logo")
    if logo:
        r.logo = logo

    apply_due_balance_deactivation(r)
    r.save()

    return Response(RestaurantListSerializer(r, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def restaurant_pay_due(request, pk: int):
    """Owner-only: settle the restaurant's due balance to the platform (super admin pool) and reactivate."""
    actor = request.user
    if getattr(actor, "role", None) != UserRole.OWNER:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    with transaction.atomic():
        try:
            r = Restaurant.objects.select_for_update().get(pk=pk)
        except Restaurant.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if r.user_id != actor.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        amount = r.due_balance
        if amount <= Decimal("0.00"):
            return Response({"detail": "No due balance to pay."}, status=status.HTTP_400_BAD_REQUEST)

        setting = get_super_setting()
        if not setting.due_payment_qr:
            return Response(
                {"detail": "Platform due payment QR is not configured. Ask the super admin to upload it in platform settings."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_posted = request.data.get("amount")
        if raw_posted is not None and str(raw_posted).strip() != "":
            try:
                posted = Decimal(str(raw_posted))
            except Exception:
                return Response({"detail": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)
            if posted != amount:
                return Response(
                    {"detail": "Amount must match the current due balance."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        owner_note = (request.data.get("remarks") or "").strip()
        if len(owner_note) > 200:
            owner_note = owner_note[:200]
        if owner_note:
            remarks = f"{owner_note} · Platform due settlement"
        else:
            remarks = "Platform due settlement"
        if len(remarks) > 255:
            remarks = remarks[:255]

        SuperSetting.objects.filter(pk=setting.pk).update(balance=F("balance") + amount)
        Transaction.objects.create(
            restaurant=r,
            created_by=actor,
            amount=amount,
            payment_status=PaymentStatus.SUCCESS,
            remarks=remarks,
            transaction_type=TransactionType.OUT,
            category=TransactionCategory.DUE_PAID,
            is_system=True,
        )
        r.due_balance = Decimal("0.00")
        r.is_active = True
        r.save(update_fields=["due_balance", "is_active", "updated_at"])

    return Response(RestaurantListSerializer(r, context={"request": request}).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def restaurant_detail(request, pk: int):
    if request.method == "PATCH":
        return _patch_restaurant_response(request, pk)

    if getattr(request.user, "role", None) != UserRole.SUPER_ADMIN:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    try:
        r = Restaurant.objects.get(pk=pk)
    except Restaurant.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    r.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_bulk_notification(request):
    """Owner-only: in-app staff notification (BulkNotification with type push)."""
    actor = request.user
    if getattr(actor, "role", None) != UserRole.OWNER:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    try:
        restaurant_id = int(request.data.get("restaurant_id"))
    except (TypeError, ValueError):
        return Response({"detail": "restaurant_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    if not user_can_manage_restaurant(actor, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    message = (request.data.get("message") or "").strip()
    if not message:
        return Response({"detail": "message is required."}, status=status.HTTP_400_BAD_REQUEST)

    title = (request.data.get("title") or "").strip()
    link = (request.data.get("link") or "").strip()
    if link and not link.startswith("/"):
        return Response(
            {"detail": "link must be an app-relative path starting with /."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    raw_receivers = request.data.get("receiver_user_ids")
    receivers: list[str]
    if raw_receivers is None:
        receivers = []
    elif isinstance(raw_receivers, list):
        ids: list[int] = []
        for x in raw_receivers:
            try:
                ids.append(int(x))
            except (TypeError, ValueError):
                return Response(
                    {"detail": "receiver_user_ids must be a list of integers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        staff_users = set(Staff.objects.filter(restaurant_id=restaurant_id).values_list("user_id", flat=True))
        for uid in ids:
            if uid not in staff_users:
                return Response(
                    {"detail": f"User {uid} is not staff at this restaurant."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        receivers = [str(uid) for uid in ids]
    else:
        return Response(
            {"detail": "receiver_user_ids must be a list or omitted for all staff."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    n = BulkNotification.objects.create(
        restaurant_id=restaurant_id,
        title=title,
        message=message,
        link=link,
        receivers=receivers,
        type=BulkNotificationType.PUSH,
    )
    return Response(BulkNotificationListSerializer(n, context={"request": request}).data, status=status.HTTP_201_CREATED)


def _parse_superadmin_receiver_ids(request) -> tuple[list[int] | None, Response | None]:
    """
    Returns (None, None) when all eligible users should receive the campaign.
    Returns (list of int ids, None) for a targeted list.
    On error returns (_, error_response).
    """
    raw = request.data.get("receiver_user_ids")

    if raw in (None, "", []):
        return None, None

    parsed_list: list | None = None
    if isinstance(raw, list):
        parsed_list = raw
    elif isinstance(raw, str):
        s = raw.strip()
        if s in ("", "[]", "null"):
            return None, None
        try:
            parsed_list = json.loads(s)
        except json.JSONDecodeError:
            return None, Response(
                {"detail": "receiver_user_ids must be a JSON array of user ids."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(parsed_list, list):
            return None, Response(
                {"detail": "receiver_user_ids must be a JSON array of user ids."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        return None, Response(
            {"detail": "receiver_user_ids must be a list, JSON string, or omitted for all recipients."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ids: list[int] = []
    for x in parsed_list:
        try:
            ids.append(int(x))
        except (TypeError, ValueError):
            return None, Response(
                {"detail": "receiver_user_ids must contain only integers."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    if not ids:
        return None, Response(
            {"detail": "When targeting recipients, select at least one user."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return ids, None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_superadmin_bulk_notification(request):
    """Superadmin: SMS or push campaigns to all active users except other super admins (platform scope)."""
    if getattr(request.user, "role", None) != UserRole.SUPER_ADMIN:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    message = (request.data.get("message") or "").strip()
    if not message:
        return Response({"detail": "message is required."}, status=status.HTTP_400_BAD_REQUEST)

    raw_type = (request.data.get("type") or "").strip().lower()
    if raw_type not in (BulkNotificationType.SMS, BulkNotificationType.PUSH):
        return Response({"detail": "type must be sms or push."}, status=status.HTTP_400_BAD_REQUEST)

    title = (request.data.get("title") or "").strip()
    link = (request.data.get("link") or "").strip()
    if link and not link.startswith("/"):
        return Response(
            {"detail": "link must be an app-relative path starting with /."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    target_ids, err = _parse_superadmin_receiver_ids(request)
    if err:
        return err

    eligible_base = User.objects.filter(is_active=True).exclude(role=UserRole.SUPER_ADMIN)

    if target_ids is None:
        receivers: list[str] = []
        send_qs = eligible_base
    else:
        invalid = set(target_ids) - set(eligible_base.filter(id__in=target_ids).values_list("id", flat=True))
        if invalid:
            return Response(
                {"detail": "Each receiver must be an active user who is not a super admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        receivers = [str(i) for i in target_ids]
        send_qs = eligible_base.filter(id__in=target_ids)

    create_kwargs: dict = {
        "restaurant": None,
        "title": title,
        "message": message,
        "link": link,
        "receivers": receivers,
        "type": raw_type,
    }
    image = request.FILES.get("image")
    if image:
        create_kwargs["image"] = image

    n = BulkNotification.objects.create(**create_kwargs)

    sms_delivery = None
    if raw_type == BulkNotificationType.SMS:
        sms_delivery = {"sent": 0, "skipped_no_phone": 0, "failed": 0}
        for u in send_qs.only("id", "phone"):
            phone = (u.phone or "").strip()
            if not phone:
                sms_delivery["skipped_no_phone"] += 1
                continue
            if send_plain_sms(phone, message):
                sms_delivery["sent"] += 1
            else:
                sms_delivery["failed"] += 1

        sent_ok = sms_delivery["sent"]
        if sent_ok > 0:
            setting = get_super_setting()
            rate = setting.sms_per_usage or Decimal("0.00")
            if rate > 0:
                total_charge = rate * Decimal(sent_ok)
                SuperSetting.objects.filter(pk=setting.pk).update(balance=F("balance") - total_charge)

    data = BulkNotificationListSerializer(n, context={"request": request}).data
    if sms_delivery is not None:
        data["sms_delivery"] = sms_delivery
    return Response(data, status=status.HTTP_201_CREATED)

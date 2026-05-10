from datetime import date
from decimal import Decimal
import json
import mimetypes
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

from django.db import IntegrityError
from django.db.models import Prefetch, Q, Sum
from django.http import FileResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from core.api.list_serializers import (
    BulkNotificationListSerializer,
    ComboSetListSerializer,
    ExpenseListSerializer,
    LedgerListSerializer,
    PlatformDefaultSerializer,
    ProductListSerializer,
    ProductItemListSerializer,
    ProductRawMaterialListSerializer,
    RestaurantListSerializer,
    StaffListSerializer,
    StockLogListSerializer,
    SuperSettingSerializer,
    SuperSettingUpdateSerializer,
    SupplierListSerializer,
    TableListSerializer,
    TransactionListSerializer,
    UnitListSerializer,
    UserListSerializer,
)
from core.api.write_views import _as_bool, _create_restaurant_response, _create_user_response
from core.auth.portal import (
    normalize_phone,
    portal_role_for_user,
    user_can_access_restaurant,
    user_can_manage_restaurant,
    user_can_view_restaurant_financials,
)
from core.models import (
    BulkNotification,
    BulkNotificationType,
    Category,
    ComboSet,
    DiscountType,
    Expense,
    ExpenseCategory,
    Ledger,
    LedgerPartyType,
    LedgerType,
    Product,
    ProductItem,
    ProductRawMaterial,
    RawMaterial,
    Restaurant,
    ShareholderWithdrawal,
    Staff,
    StaffRole,
    StockLog,
    Supplier,
    Table,
    Transaction,
    TransactionCategory,
    TransactionType,
    Unit,
    User,
    UserRole,
)
from core.services.super_settings import get_super_setting


def _parse_restaurant_id(request):
    rid = request.query_params.get("restaurant_id")
    if not rid:
        return None, Response({"detail": "Query parameter restaurant_id is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        return int(rid), None
    except ValueError:
        return None, Response({"detail": "Invalid restaurant_id."}, status=status.HTTP_400_BAD_REQUEST)


def _combo_total_for_products(product_ids: list[int], restaurant_id: int) -> Decimal:
    total = Decimal("0.00")
    for product in Product.objects.filter(restaurant_id=restaurant_id, id__in=product_ids).prefetch_related("items"):
        best_item = product.items.order_by("price").first()
        if best_item is not None:
            total += best_item.discounted_price
    return total


def _parse_iso_date(raw_value):
    if raw_value in (None, ""):
        return None
    if isinstance(raw_value, date):
        return raw_value
    try:
        return date.fromisoformat(str(raw_value)[:10])
    except ValueError:
        return None


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def list_restaurants(request):
    if request.method == "POST":
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication credentials were not provided."}, status=status.HTTP_401_UNAUTHORIZED)
        return _create_restaurant_response(request)

    qs = Restaurant.objects.all().select_related("user").order_by("name")
    if request.user.is_authenticated:
        role = getattr(request.user, "role", None)
        if role == UserRole.OWNER:
            qs = qs.filter(user=request.user)
        elif role == UserRole.STAFF:
            if portal_role_for_user(request.user) == "waiter":
                qs = qs.filter(
                    id__in=Staff.objects.filter(
                        user=request.user,
                        role=StaffRole.WAITER,
                        restaurant__is_active=True,
                    ).values("restaurant_id")
                )
            else:
                qs = qs.filter(
                    id__in=Staff.objects.filter(user=request.user, restaurant__is_active=True).values("restaurant_id")
                )
        elif role == UserRole.SUPER_ADMIN:
            pass
        else:
            qs = qs.filter(is_active=True)
    else:
        qs = qs.filter(is_active=True)

    # One grouped query per category (avoids per-row subqueries that can mis-sum on some DBs, and avoids
    # Coalesce(Subquery, 0) masking a failed subquery — which would skip the serializer's aggregate fallback).
    restaurant_ids = list(qs.values_list("pk", flat=True))
    sms_totals: dict[int, Decimal] = {}
    fee_totals: dict[int, Decimal] = {}
    if restaurant_ids:
        base = Transaction.objects.filter(
            restaurant_id__in=restaurant_ids,
            transaction_type=TransactionType.IN,
            is_system=True,
        )
        for row in base.filter(category=TransactionCategory.SMS_USAGE).values("restaurant_id").annotate(t=Sum("amount")):
            rid = row["restaurant_id"]
            amt = row["t"]
            sms_totals[rid] = amt if amt is not None else Decimal("0.00")
        for row in base.filter(category=TransactionCategory.TRANSACTION_FEE).values("restaurant_id").annotate(
            t=Sum("amount")
        ):
            rid = row["restaurant_id"]
            amt = row["t"]
            fee_totals[rid] = amt if amt is not None else Decimal("0.00")

    return Response(
        RestaurantListSerializer(
            qs,
            many=True,
            context={
                "request": request,
                "restaurant_sms_usage_totals": sms_totals,
                "restaurant_fee_totals": fee_totals,
            },
        ).data
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def restaurant_qr_brand_image(request, pk: int):
    """
    Stream the restaurant logo for authenticated staff/owners who can access the venue.
    Used by the menu QR page to composite the logo into a canvas/PDF without cross-origin media CORS issues.
    """
    if getattr(request.user, "role", None) == UserRole.CUSTOMER:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    if not user_can_access_restaurant(request.user, pk):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    try:
        restaurant = Restaurant.objects.get(pk=pk)
    except Restaurant.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    if not restaurant.logo:
        return Response({"detail": "No logo configured for this restaurant."}, status=status.HTTP_404_NOT_FOUND)
    try:
        logo_file = restaurant.logo.open("rb")
    except FileNotFoundError:
        return Response({"detail": "Logo file missing."}, status=status.HTTP_404_NOT_FOUND)
    content_type = mimetypes.guess_type(restaurant.logo.name)[0] or "application/octet-stream"
    return FileResponse(logo_file, content_type=content_type)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def geocode_search(request):
    """Proxy address search (Nominatim) for owners/super admins — fills lat/lng in the UI."""
    role = getattr(request.user, "role", None)
    if role not in (UserRole.OWNER, UserRole.SUPER_ADMIN):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    q = (request.query_params.get("q") or "").strip()
    if len(q) < 2:
        return Response({"detail": "Query parameter q is required (at least 2 characters)."}, status=status.HTTP_400_BAD_REQUEST)

    # Bias results to Nepal (street-level coverage); viewbox = SW lon,lat then NE lon,lat per Nominatim.
    nepal_viewbox = "80.05,26.34,88.25,30.45"
    # dedupe=0 returns separate OSM objects (e.g. each street segment / POI) instead of merging
    # duplicates that Nominatim considers the "same" place under dedupe=1.
    url = (
        "https://nominatim.openstreetmap.org/search?"
        f"q={quote_plus(q)}&format=json&limit=20&addressdetails=1"
        f"&countrycodes=np&viewbox={nepal_viewbox}&bounded=0&dedupe=0"
    )
    req = Request(
        url,
        headers={
            "User-Agent": "MyRestro/1.0 (restaurant onboarding; contact: https://github.com/)",
            "Accept-Language": "en",
        },
        method="GET",
    )
    try:
        with urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except (HTTPError, URLError, TimeoutError, OSError):
        return Response({"detail": "Geocoding service unavailable. Try again later."}, status=status.HTTP_502_BAD_GATEWAY)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return Response({"detail": "Invalid response from geocoder."}, status=status.HTTP_502_BAD_GATEWAY)

    if not isinstance(data, list):
        return Response([], status=status.HTTP_200_OK)

    out = []
    for row in data:
        if not isinstance(row, dict):
            continue
        lat = row.get("lat")
        lon = row.get("lon")
        name = row.get("display_name")
        if lat is None or lon is None or not name:
            continue
        item = {"lat": str(lat), "lon": str(lon), "display_name": str(name)}
        pid = row.get("place_id")
        if pid is not None:
            item["place_id"] = str(pid)
        out.append(item)
    return Response(out, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_users(request):
    if request.method == "POST":
        return _create_user_response(request)

    role_user = getattr(request.user, "role", None)
    staff_prefetch = Prefetch(
        "staff_profiles",
        queryset=Staff.objects.select_related("restaurant"),
    )
    if role_user == UserRole.SUPER_ADMIN:
        qs = User.objects.all().order_by("-created_at").prefetch_related(staff_prefetch)
    elif role_user == UserRole.OWNER:
        staff_ids = Staff.objects.filter(restaurant__user=request.user).values_list("user_id", flat=True)
        qs = (
            User.objects.filter(Q(created_by=request.user) | Q(id__in=staff_ids))
            .distinct()
            .order_by("-created_at")
            .prefetch_related(staff_prefetch)
        )
    else:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    role = request.query_params.get("role")
    if role:
        qs = qs.filter(role=role)
    # Unfiltered: all roles and both shareholder flags. With is_shareholder=…, narrow the list.
    sh = request.query_params.get("is_shareholder")
    if sh:
        qs = qs.filter(is_shareholder=str(sh).lower() in ("1", "true", "yes"))
    return Response(UserListSerializer(qs, many=True, context={"request": request}).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_products(request):
    if request.method == "GET":
        restaurant_id, err = _parse_restaurant_id(request)
        if err:
            return err
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        qs = (
            Product.objects.filter(restaurant_id=restaurant_id)
            .select_related("restaurant", "category")
            .order_by("name")
        )
        return Response(ProductListSerializer(qs, many=True).data)

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    name = (request.data.get("name") or "").strip()
    if not name:
        return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

    category = None
    raw_cat = request.data.get("category")
    if raw_cat is not None and raw_cat != "":
        try:
            cid = int(raw_cat)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid category."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            category = Category.objects.get(pk=cid, restaurant_id=restaurant_id)
        except Category.DoesNotExist:
            return Response({"detail": "Category not found."}, status=status.HTTP_400_BAD_REQUEST)

    is_veg = _as_bool(request.data.get("is_veg"), default=False)
    is_active = _as_bool(request.data.get("is_active"), default=True)
    image_file = request.FILES.get("image")

    product = Product(
        restaurant_id=restaurant_id, name=name, category=category, is_veg=is_veg, is_active=is_active
    )
    if image_file:
        product.image = image_file
    try:
        product.save()
    except IntegrityError:
        return Response(
            {"detail": "A product with this name already exists for this restaurant."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(ProductListSerializer(product).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_product_items(request):
    if request.method == "GET":
        restaurant_id, err = _parse_restaurant_id(request)
        if err:
            return err
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        qs = (
            ProductItem.objects.filter(product__restaurant_id=restaurant_id)
            .select_related("product", "unit")
            .order_by("product__name")
        )
        return Response(ProductItemListSerializer(qs, many=True).data)

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    try:
        product_id = int(request.data.get("product"))
    except (TypeError, ValueError):
        return Response({"detail": "product is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        prod = Product.objects.get(pk=product_id, restaurant_id=restaurant_id)
    except Product.DoesNotExist:
        return Response({"detail": "Product not found."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        unit_id = int(request.data.get("unit"))
    except (TypeError, ValueError):
        return Response({"detail": "unit is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        unit = Unit.objects.get(pk=unit_id, restaurant_id=restaurant_id)
    except Unit.DoesNotExist:
        return Response({"detail": "Unit not found for this restaurant."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        price = Decimal(str(request.data.get("price", "0")))
    except Exception:
        return Response({"detail": "Invalid price."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        discount = Decimal(str(request.data.get("discount", "0")))
    except Exception:
        return Response({"detail": "Invalid discount."}, status=status.HTTP_400_BAD_REQUEST)

    discount_type = (request.data.get("discount_type") or DiscountType.FLAT).strip()
    if discount_type not in (DiscountType.FLAT, DiscountType.PERCENTAGE):
        return Response({"detail": "Invalid discount_type."}, status=status.HTTP_400_BAD_REQUEST)

    item = ProductItem.objects.create(
        product=prod,
        unit=unit,
        price=price,
        discount_type=discount_type,
        discount=discount,
    )
    return Response(ProductItemListSerializer(item).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_units(request):
    if request.method == "GET":
        restaurant_id, err = _parse_restaurant_id(request)
        if err:
            return err
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        qs = Unit.objects.filter(restaurant_id=restaurant_id).select_related("restaurant").order_by("name")
        return Response(UnitListSerializer(qs, many=True).data)

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    name = (request.data.get("name") or "").strip()
    symbol = (request.data.get("symbol") or "").strip()
    if not name:
        return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
    if not symbol:
        return Response({"detail": "symbol is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        unit, created = Unit.objects.update_or_create(
            restaurant_id=restaurant_id,
            name=name,
            defaults={"symbol": symbol},
        )
    except IntegrityError:
        # Rare race: another request created the same (restaurant, name) first.
        unit = Unit.objects.get(restaurant_id=restaurant_id, name=name)
        created = False
    out_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return Response(UnitListSerializer(unit).data, status=out_status)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def unit_detail(request, pk: int):
    try:
        unit = Unit.objects.select_related("restaurant").get(pk=pk)
    except Unit.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not user_can_manage_restaurant(request.user, unit.restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        unit.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "name" in request.data:
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        unit.name = name
    if "symbol" in request.data:
        symbol = (request.data.get("symbol") or "").strip()
        if not symbol:
            return Response({"detail": "symbol is required."}, status=status.HTTP_400_BAD_REQUEST)
        unit.symbol = symbol
    try:
        unit.save()
    except IntegrityError:
        return Response(
            {"detail": "A unit with this name already exists for this restaurant."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(UnitListSerializer(unit).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_tables(request):
    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "POST":
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            capacity = int(request.data.get("capacity", 1))
        except (TypeError, ValueError):
            return Response({"detail": "capacity must be a valid integer."}, status=status.HTTP_400_BAD_REQUEST)
        if capacity < 1:
            return Response({"detail": "capacity must be at least 1."}, status=status.HTTP_400_BAD_REQUEST)

        floor = (request.data.get("floor") or "").strip()
        near_by = (request.data.get("near_by") or "").strip()
        notes = (request.data.get("notes") or "").strip()
        is_active = _as_bool(request.data.get("is_active"), default=True)
        image_file = request.FILES.get("image")

        latitude = None
        longitude = None
        lat_raw = request.data.get("latitude")
        lng_raw = request.data.get("longitude")
        if lat_raw not in (None, ""):
            try:
                latitude = Decimal(str(lat_raw))
            except Exception:
                return Response({"detail": "Invalid latitude."}, status=status.HTTP_400_BAD_REQUEST)
        if lng_raw not in (None, ""):
            try:
                longitude = Decimal(str(lng_raw))
            except Exception:
                return Response({"detail": "Invalid longitude."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            table = Table.objects.create(
                restaurant_id=restaurant_id,
                name=name,
                capacity=capacity,
                floor=floor,
                near_by=near_by,
                notes=notes,
                latitude=latitude,
                longitude=longitude,
                is_active=is_active,
                image=image_file or None,
            )
        except IntegrityError:
            return Response(
                {"detail": "A table with this name already exists for this restaurant."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(TableListSerializer(table).data, status=status.HTTP_201_CREATED)

    qs = Table.objects.filter(restaurant_id=restaurant_id).select_related("restaurant").order_by("name")
    return Response(TableListSerializer(qs, many=True).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def table_detail(request, pk: int):
    try:
        table = Table.objects.select_related("restaurant").get(pk=pk)
    except Table.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not user_can_manage_restaurant(request.user, table.restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        table.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = request.data

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        table.name = name

    if "capacity" in data:
        try:
            capacity = int(data.get("capacity"))
        except (TypeError, ValueError):
            return Response({"detail": "capacity must be a valid integer."}, status=status.HTTP_400_BAD_REQUEST)
        if capacity < 1:
            return Response({"detail": "capacity must be at least 1."}, status=status.HTTP_400_BAD_REQUEST)
        table.capacity = capacity

    if "floor" in data:
        table.floor = (data.get("floor") or "").strip()
    if "near_by" in data:
        table.near_by = (data.get("near_by") or "").strip()
    if "notes" in data:
        table.notes = (data.get("notes") or "").strip()
    if "is_active" in data:
        table.is_active = _as_bool(data.get("is_active"), default=table.is_active)

    if "latitude" in data:
        lat_raw = data.get("latitude")
        if lat_raw in (None, ""):
            table.latitude = None
        else:
            try:
                table.latitude = Decimal(str(lat_raw))
            except Exception:
                return Response({"detail": "Invalid latitude."}, status=status.HTTP_400_BAD_REQUEST)

    if "longitude" in data:
        lng_raw = data.get("longitude")
        if lng_raw in (None, ""):
            table.longitude = None
        else:
            try:
                table.longitude = Decimal(str(lng_raw))
            except Exception:
                return Response({"detail": "Invalid longitude."}, status=status.HTTP_400_BAD_REQUEST)

    image_file = request.FILES.get("image")
    if image_file:
        table.image = image_file

    try:
        table.save()
    except IntegrityError:
        return Response(
            {"detail": "A table with this name already exists for this restaurant."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(TableListSerializer(table).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_suppliers(request):
    if request.method == "POST":
        restaurant_id, err = _parse_restaurant_id(request)
        if err:
            return err
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        phone = (request.data.get("phone") or "").strip()
        is_active = _as_bool(request.data.get("is_active"), default=True)
        image_file = request.FILES.get("image")
        try:
            supplier = Supplier.objects.create(
                restaurant_id=restaurant_id, name=name, phone=phone, is_active=is_active
            )
        except IntegrityError:
            return Response(
                {"detail": "A supplier with this name already exists for this restaurant."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if image_file:
            supplier.image = image_file
            supplier.save(update_fields=["image"])
        return Response(SupplierListSerializer(supplier).data, status=status.HTTP_201_CREATED)

    if getattr(request.user, "role", None) == UserRole.SUPER_ADMIN and not request.query_params.get("restaurant_id"):
        qs = (
            Supplier.objects.all()
            .select_related("restaurant")
            .order_by("restaurant__name", "name")
        )
        return Response(SupplierListSerializer(qs, many=True).data)

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    can_read_suppliers = user_can_manage_restaurant(request.user, restaurant_id)
    if not can_read_suppliers:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    qs = Supplier.objects.filter(restaurant_id=restaurant_id).select_related("restaurant").order_by("name")
    return Response(SupplierListSerializer(qs, many=True).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_expenses(request):
    if request.method == "POST":
        restaurant_id, err = _parse_restaurant_id(request)
        if err:
            return err
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        particular = (request.data.get("particular") or "").strip()
        if not particular:
            return Response({"detail": "particular is required."}, status=status.HTTP_400_BAD_REQUEST)
        category = (request.data.get("category") or ExpenseCategory.OTHER).strip()
        if category not in dict(ExpenseCategory.choices):
            return Response({"detail": "Invalid category."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(request.data.get("amount", "0")))
        except Exception:
            return Response({"detail": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)
        if amount < 0:
            return Response({"detail": "amount must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)
        expense_date = _parse_iso_date(request.data.get("expense_date"))
        if expense_date is None:
            expense_date = date.today()
        expense = Expense.objects.create(
            restaurant_id=restaurant_id,
            category=category,
            particular=particular,
            amount=amount,
            expense_date=expense_date,
        )
        return Response(ExpenseListSerializer(expense).data, status=status.HTTP_201_CREATED)

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    qs = Expense.objects.filter(restaurant_id=restaurant_id).select_related("restaurant").order_by("-created_at")
    return Response(ExpenseListSerializer(qs, many=True).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def supplier_detail(request, pk: int):
    try:
        supplier = Supplier.objects.select_related("restaurant").get(pk=pk)
    except Supplier.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not user_can_manage_restaurant(request.user, supplier.restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        supplier.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "name" in request.data:
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        supplier.name = name
    if "phone" in request.data:
        supplier.phone = (request.data.get("phone") or "").strip()
    if "is_active" in request.data:
        supplier.is_active = _as_bool(request.data.get("is_active"), default=supplier.is_active)

    image_file = request.FILES.get("image")
    if image_file:
        supplier.image = image_file
    try:
        supplier.save()
    except IntegrityError:
        return Response(
            {"detail": "A supplier with this name already exists for this restaurant."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(SupplierListSerializer(supplier).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def expense_detail(request, pk: int):
    try:
        expense = Expense.objects.select_related("restaurant").get(pk=pk)
    except Expense.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not user_can_manage_restaurant(request.user, expense.restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        expense.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "particular" in request.data:
        particular = (request.data.get("particular") or "").strip()
        if not particular:
            return Response({"detail": "particular is required."}, status=status.HTTP_400_BAD_REQUEST)
        expense.particular = particular
    if "category" in request.data:
        category = (request.data.get("category") or "").strip()
        if category not in dict(ExpenseCategory.choices):
            return Response({"detail": "Invalid category."}, status=status.HTTP_400_BAD_REQUEST)
        expense.category = category
    if "amount" in request.data:
        try:
            amount = Decimal(str(request.data.get("amount")))
        except Exception:
            return Response({"detail": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)
        if amount < 0:
            return Response({"detail": "amount must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)
        expense.amount = amount
    if "expense_date" in request.data:
        exp_date = _parse_iso_date(request.data.get("expense_date"))
        if exp_date is None:
            return Response({"detail": "Invalid expense_date."}, status=status.HTTP_400_BAD_REQUEST)
        expense.expense_date = exp_date
    expense.save()
    return Response(ExpenseListSerializer(expense).data)


def _shareholder_self_requested(request) -> bool:
    v = request.query_params.get("shareholder_self")
    return str(v).lower() in ("1", "true", "yes")


def _all_owned_transactions_requested(request) -> bool:
    v = request.query_params.get("all_owned")
    return str(v).lower() in ("1", "true", "yes")


def _exclude_owner_register_noise(qs):
    """
    Hide system platform fee accruals (IN) from venue-facing registers, and legacy due settlements
    that were stored with the wrong flow direction.
    """
    return qs.exclude(
        Q(is_system=True, transaction_type=TransactionType.IN, category=TransactionCategory.TRANSACTION_FEE)
        | Q(category=TransactionCategory.DUE_PAID, transaction_type=TransactionType.IN)
    )


def _exclude_superadmin_shareholder_rows_for_owner(qs):
    """
    Restaurant owners see venue register activity only: hide rows created by platform super-admins,
    shareholder users, and any share-capital ledger categories (including legacy null created_by).
    """
    share_categories = (
        TransactionCategory.SHARE_WITHDRAWAL,
        TransactionCategory.SHARE_DISTRIBUTION,
        TransactionCategory.SHARE_BALANCE_ADJUSTMENT,
    )
    return qs.exclude(
        Q(category__in=share_categories)
        | Q(created_by__role=UserRole.SUPER_ADMIN)
        | Q(created_by__is_shareholder=True)
    )


def _serialize_transaction_rows(qs, *, platform_register=False):
    setting = get_super_setting()
    platform_ptf = setting.per_transaction_fee or Decimal("0.00")
    return TransactionListSerializer(
        qs, many=True, context={"platform_ptf": platform_ptf, "platform_register": platform_register}
    ).data


def _filter_transactions_shareholder_self(user: User, qs):
    """Keep share rows that belong to this shareholder, plus venue due settlements (visible to all shareholders)."""
    categories = [
        TransactionCategory.SHARE_WITHDRAWAL,
        TransactionCategory.SHARE_DISTRIBUTION,
        TransactionCategory.SHARE_BALANCE_ADJUSTMENT,
    ]
    withdrawal_ids = list(ShareholderWithdrawal.objects.filter(user=user).values_list("id", flat=True))
    q = Q(created_by=user)
    if withdrawal_ids:
        wq = Q()
        for wid in withdrawal_ids:
            base = f"Share withdrawal #{wid}"
            wq |= Q(category=TransactionCategory.SHARE_WITHDRAWAL, remarks=base)
            wq |= Q(category=TransactionCategory.SHARE_WITHDRAWAL, remarks__startswith=f"{base} —")
        q |= wq
    share_match = Q(category__in=categories) & q
    due_paid = Q(category=TransactionCategory.DUE_PAID)
    return qs.filter(share_match | due_paid)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_transactions(request):
    want_shareholder_self = _shareholder_self_requested(request)
    is_shareholder = getattr(request.user, "is_shareholder", False)
    apply_shareholder_self = want_shareholder_self and is_shareholder

    if getattr(request.user, "role", None) == UserRole.SUPER_ADMIN:
        qs = Transaction.objects.all().select_related("restaurant").order_by("-created_at")
        rid = request.query_params.get("restaurant_id")
        if rid:
            try:
                qs = qs.filter(restaurant_id=int(rid))
            except (TypeError, ValueError):
                return Response({"detail": "Invalid restaurant_id."}, status=status.HTTP_400_BAD_REQUEST)
        if apply_shareholder_self:
            qs = _filter_transactions_shareholder_self(request.user, qs)
        return Response(_serialize_transaction_rows(qs[:500], platform_register=True))

    role = getattr(request.user, "role", None)
    if _all_owned_transactions_requested(request):
        if role != UserRole.OWNER:
            return Response(
                {"detail": "Query parameter all_owned is only supported for restaurant owners."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if apply_shareholder_self:
            return Response(
                {"detail": "all_owned cannot be combined with shareholder_self."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        owned_ids = list(Restaurant.objects.filter(user=request.user).values_list("id", flat=True))
        if not owned_ids:
            return Response([])
        qs = (
            Transaction.objects.filter(restaurant_id__in=owned_ids)
            .select_related("restaurant")
            .order_by("-created_at")
        )
        qs = _exclude_owner_register_noise(qs)
        qs = _exclude_superadmin_shareholder_rows_for_owner(qs)
        return Response(_serialize_transaction_rows(qs))

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err

    can_finance = user_can_view_restaurant_financials(request.user, restaurant_id)
    can_customer_shareholder = (
        apply_shareholder_self
        and role == UserRole.CUSTOMER
        and user_can_access_restaurant(request.user, restaurant_id)
    )
    if not can_finance and not can_customer_shareholder:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    qs = Transaction.objects.filter(restaurant_id=restaurant_id).select_related("restaurant").order_by("-created_at")
    if apply_shareholder_self:
        qs = _filter_transactions_shareholder_self(request.user, qs)
        # Same platform-pool perspective as super-admin list: due settlement is IN to the platform.
        return Response(_serialize_transaction_rows(qs, platform_register=True))
    qs = _exclude_owner_register_noise(qs)
    if role == UserRole.OWNER:
        qs = _exclude_superadmin_shareholder_rows_for_owner(qs)
    return Response(_serialize_transaction_rows(qs))


def _ledger_party_exists(restaurant_id: int, party_type: str, party_id: str) -> bool:
    try:
        pid = int(party_id)
    except (TypeError, ValueError):
        return False
    if party_type == LedgerPartyType.SUPPLIER:
        return Supplier.objects.filter(id=pid, restaurant_id=restaurant_id).exists()
    if party_type == LedgerPartyType.CUSTOMER:
        return User.objects.filter(
            id=pid, role=UserRole.CUSTOMER, customer_orders__restaurant_id=restaurant_id
        ).exists()
    if party_type == LedgerPartyType.STAFF:
        return Staff.objects.filter(restaurant_id=restaurant_id, user_id=pid).exists()
    return False


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_ledgers(request):
    if getattr(request.user, "role", None) == UserRole.SUPER_ADMIN:
        if request.method == "POST":
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        qs = Ledger.objects.all().select_related("restaurant").order_by("-created_at")
        rid = request.query_params.get("restaurant_id")
        if rid:
            qs = qs.filter(restaurant_id=rid)
        party_type = request.query_params.get("party_type")
        party_id = request.query_params.get("party_id")
        if party_type:
            qs = qs.filter(party_type=party_type)
        if party_id:
            qs = qs.filter(party_id=party_id)
        return Response(LedgerListSerializer(qs[:500], many=True).data)

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err

    role = getattr(request.user, "role", None)

    if role == UserRole.CUSTOMER:
        if not user_can_access_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        if request.method == "POST":
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        party_type = request.query_params.get("party_type")
        party_id = request.query_params.get("party_id")
        if party_type and party_type != LedgerPartyType.CUSTOMER:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        if party_id and party_id != str(request.user.pk):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        qs = (
            Ledger.objects.filter(
                restaurant_id=restaurant_id,
                party_type=LedgerPartyType.CUSTOMER,
                party_id=str(request.user.pk),
            )
            .select_related("restaurant")
            .order_by("-created_at")
        )
        return Response(LedgerListSerializer(qs, many=True).data)

    if not user_can_view_restaurant_financials(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "POST":
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        if role == UserRole.STAFF:
            is_cashier_here = Staff.objects.filter(
                user=request.user,
                restaurant_id=restaurant_id,
                role=StaffRole.CASHIER,
                restaurant__is_active=True,
            ).exists()
            if not is_cashier_here:
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        party_type = (request.data.get("party_type") or "").strip()
        party_id = (request.data.get("party_id") or "").strip()
        particular = (request.data.get("particular") or "").strip()
        raw_type = (request.data.get("type") or "").strip()
        if party_type not in dict(LedgerPartyType.choices):
            return Response({"detail": "Invalid party_type."}, status=status.HTTP_400_BAD_REQUEST)
        if not party_id:
            return Response({"detail": "party_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not particular:
            return Response({"detail": "particular is required."}, status=status.HTTP_400_BAD_REQUEST)
        if raw_type not in dict(LedgerType.choices):
            return Response({"detail": "type must be debit or credit."}, status=status.HTTP_400_BAD_REQUEST)
        if not _ledger_party_exists(restaurant_id, party_type, party_id):
            return Response({"detail": "Unknown party for this restaurant."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(request.data.get("amount")))
        except Exception:
            return Response({"detail": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)
        if amount < 0:
            return Response({"detail": "amount must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)
        row = Ledger.objects.create(
            restaurant_id=restaurant_id,
            party_type=party_type,
            party_id=party_id,
            particular=particular,
            amount=amount,
            type=raw_type,
        )
        row = Ledger.objects.select_related("restaurant").get(pk=row.pk)
        return Response(LedgerListSerializer(row).data, status=status.HTTP_201_CREATED)

    qs = Ledger.objects.filter(restaurant_id=restaurant_id).select_related("restaurant").order_by("-created_at")
    is_cashier_here = False
    if role == UserRole.STAFF:
        is_cashier_here = Staff.objects.filter(
            user=request.user,
            restaurant_id=restaurant_id,
            role=StaffRole.CASHIER,
            restaurant__is_active=True,
        ).exists()
        if not is_cashier_here:
            qs = qs.filter(party_type=LedgerPartyType.STAFF, party_id=str(request.user.pk))

    party_type = request.query_params.get("party_type")
    party_id = request.query_params.get("party_id")
    if role != UserRole.STAFF or is_cashier_here:
        if party_type:
            qs = qs.filter(party_type=party_type)
        if party_id:
            qs = qs.filter(party_id=party_id)
    return Response(LedgerListSerializer(qs, many=True).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def ledger_detail(request, pk: int):
    try:
        row = Ledger.objects.select_related("restaurant").get(pk=pk)
    except Ledger.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    restaurant_id = row.restaurant_id
    role = getattr(request.user, "role", None)

    if role == UserRole.CUSTOMER:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if not user_can_view_restaurant_financials(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    is_cashier_here = False
    if role == UserRole.STAFF:
        is_cashier_here = Staff.objects.filter(
            user=request.user,
            restaurant_id=restaurant_id,
            role=StaffRole.CASHIER,
            restaurant__is_active=True,
        ).exists()
        if not is_cashier_here:
            if row.party_type != LedgerPartyType.STAFF or row.party_id != str(request.user.pk):
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method in ("PATCH", "DELETE"):
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        if role == UserRole.STAFF and not is_cashier_here:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "particular" in request.data:
        particular = (request.data.get("particular") or "").strip()
        if not particular:
            return Response({"detail": "particular is required."}, status=status.HTTP_400_BAD_REQUEST)
        row.particular = particular
    if "amount" in request.data:
        try:
            amount = Decimal(str(request.data.get("amount")))
        except Exception:
            return Response({"detail": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)
        if amount < 0:
            return Response({"detail": "amount must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)
        row.amount = amount
    if "type" in request.data:
        raw_type = (request.data.get("type") or "").strip()
        if raw_type not in dict(LedgerType.choices):
            return Response({"detail": "type must be debit or credit."}, status=status.HTTP_400_BAD_REQUEST)
        row.type = raw_type
    row.save()
    row = Ledger.objects.select_related("restaurant").get(pk=row.pk)
    return Response(LedgerListSerializer(row).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_stock_logs(request):
    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    qs = (
        StockLog.objects.filter(restaurant_id=restaurant_id)
        .select_related("restaurant", "raw_material")
        .order_by("-created_at")
    )
    return Response(StockLogListSerializer(qs, many=True).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_combo_sets(request):
    if request.method == "POST":
        restaurant_id, err = _parse_restaurant_id(request)
        if err:
            return err
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        name = (request.data.get("name") or "").strip()
        description = (request.data.get("description") or "").strip()
        raw_products = request.data.get("products") or []
        if isinstance(raw_products, str):
            try:
                raw_products = json.loads(raw_products)
            except Exception:
                return Response({"detail": "products must be an array of product ids."}, status=status.HTTP_400_BAD_REQUEST)
        discount_type = (request.data.get("discount_type") or DiscountType.FLAT).strip()
        raw_discount = request.data.get("discount", 0)
        image_file = request.FILES.get("image")

        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            discount = Decimal(str(raw_discount))
        except Exception:
            return Response({"detail": "discount must be a valid number."}, status=status.HTTP_400_BAD_REQUEST)
        if discount < 0:
            return Response({"detail": "discount must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)
        if discount_type not in (DiscountType.FLAT, DiscountType.PERCENTAGE):
            return Response({"detail": "Invalid discount_type."}, status=status.HTTP_400_BAD_REQUEST)
        if discount_type == DiscountType.PERCENTAGE and discount > Decimal("100"):
            return Response({"detail": "Percentage discount cannot exceed 100."}, status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(raw_products, list):
            return Response({"detail": "products must be an array of product ids."}, status=status.HTTP_400_BAD_REQUEST)

        product_ids: list[int] = []
        for pid in raw_products:
            try:
                product_ids.append(int(pid))
            except (TypeError, ValueError):
                return Response({"detail": "products must contain valid product ids."}, status=status.HTTP_400_BAD_REQUEST)

        valid_product_ids = set(
            Product.objects.filter(restaurant_id=restaurant_id, id__in=product_ids).values_list("id", flat=True)
        )
        if len(valid_product_ids) != len(set(product_ids)):
            return Response(
                {"detail": "One or more selected products are invalid for this restaurant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        total_product_price = _combo_total_for_products(product_ids, restaurant_id)
        if discount_type == DiscountType.PERCENTAGE:
            discount_value = (total_product_price * discount) / Decimal("100.00")
        else:
            discount_value = discount
        final_price = max(Decimal("0.00"), total_product_price - discount_value)

        try:
            combo = ComboSet.objects.create(
                restaurant_id=restaurant_id,
                name=name,
                description=description,
                discount_type=discount_type,
                discount=discount,
                price=final_price,
            )
        except IntegrityError:
            return Response(
                {"detail": "A combo with this name already exists for this restaurant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if valid_product_ids:
            combo.products.set(valid_product_ids)
        if image_file:
            combo.image = image_file
            combo.save(update_fields=["image"])
        return Response(ComboSetListSerializer(combo).data, status=status.HTTP_201_CREATED)

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    qs = (
        ComboSet.objects.filter(restaurant_id=restaurant_id)
        .select_related("restaurant")
        .prefetch_related("products")
        .order_by("name")
    )
    return Response(ComboSetListSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_staff(request):
    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    can_read_staff = user_can_manage_restaurant(request.user, restaurant_id)
    if not can_read_staff:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    qs = Staff.objects.filter(restaurant_id=restaurant_id).select_related("user", "restaurant").order_by("-joined_at")
    return Response(StaffListSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def search_staff_by_phone(request):
    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    phone = normalize_phone(request.query_params.get("phone", ""))
    if not phone:
        return Response({"detail": "phone is required."}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(phone=phone).first()
    if not user:
        return Response({"found": False})

    staff = Staff.objects.filter(restaurant_id=restaurant_id, user=user).first()
    return Response(
        {
            "found": True,
            "already_staff": staff is not None,
            "staff_id": staff.id if staff else None,
            "user": {"id": user.id, "name": user.name, "phone": user.phone},
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_staff(request):
    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    phone = normalize_phone(request.data.get("phone", ""))
    if not phone:
        return Response({"detail": "phone is required."}, status=status.HTTP_400_BAD_REQUEST)

    name = (request.data.get("name") or "").strip()
    role = (request.data.get("role") or "waiter").strip().lower()
    if role not in dict(Staff._meta.get_field("role").choices):
        role = "waiter"

    joined_at = _parse_iso_date(request.data.get("joined_at")) or date.today()
    try:
        salary = Decimal(str(request.data.get("salary", "0")))
        salary_per_day = Decimal(str(request.data.get("salary_per_day", "0")))
    except Exception:
        return Response({"detail": "Invalid salary values."}, status=status.HTTP_400_BAD_REQUEST)
    is_suspend = _as_bool(request.data.get("is_suspend"), default=False)

    user = User.objects.filter(phone=phone).first()
    if user is None:
        user = User.objects.create(phone=phone, name=name or phone, role=UserRole.STAFF, created_by=request.user)
    else:
        updates: list[str] = []
        if name and user.name != name:
            user.name = name
            updates.append("name")
        if user.role != UserRole.STAFF:
            user.role = UserRole.STAFF
            updates.append("role")
        if updates:
            user.save(update_fields=updates)

    staff, _ = Staff.objects.get_or_create(
        restaurant_id=restaurant_id,
        user=user,
        defaults={
            "role": role,
            "joined_at": joined_at,
            "salary": salary,
            "salary_per_day": salary_per_day,
            "is_suspend": is_suspend,
        },
    )
    if staff.role != role or staff.joined_at != joined_at or staff.salary != salary or staff.salary_per_day != salary_per_day or staff.is_suspend != is_suspend:
        staff.role = role
        staff.joined_at = joined_at
        staff.salary = salary
        staff.salary_per_day = salary_per_day
        staff.is_suspend = is_suspend
        staff.save(update_fields=["role", "joined_at", "salary", "salary_per_day", "is_suspend", "updated_at"])

    staff = Staff.objects.select_related("user", "restaurant").get(pk=staff.pk)
    return Response(StaffListSerializer(staff).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def staff_detail(request, pk: int):
    try:
        staff = Staff.objects.select_related("user", "restaurant").get(pk=pk)
    except Staff.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not user_can_manage_restaurant(request.user, staff.restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        staff.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "name" in request.data:
        name = (request.data.get("name") or "").strip()
        if name:
            staff.user.name = name
            staff.user.save(update_fields=["name"])

    if "role" in request.data:
        role = (request.data.get("role") or "").strip().lower()
        if role not in dict(Staff._meta.get_field("role").choices):
            return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)
        staff.role = role

    if "joined_at" in request.data:
        joined_at = _parse_iso_date(request.data.get("joined_at"))
        if joined_at is None:
            return Response({"detail": "Invalid joined_at."}, status=status.HTTP_400_BAD_REQUEST)
        staff.joined_at = joined_at

    if "salary" in request.data:
        try:
            staff.salary = Decimal(str(request.data.get("salary")))
        except Exception:
            return Response({"detail": "Invalid salary."}, status=status.HTTP_400_BAD_REQUEST)

    if "salary_per_day" in request.data:
        try:
            staff.salary_per_day = Decimal(str(request.data.get("salary_per_day")))
        except Exception:
            return Response({"detail": "Invalid salary_per_day."}, status=status.HTTP_400_BAD_REQUEST)

    if "is_suspend" in request.data:
        staff.is_suspend = _as_bool(request.data.get("is_suspend"), default=staff.is_suspend)

    staff.save()
    staff.refresh_from_db()
    return Response(StaffListSerializer(staff).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_customers(request):
    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if getattr(request.user, "role", None) == UserRole.CUSTOMER:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    if not user_can_access_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    customer_ids = (
        User.objects.filter(role=UserRole.CUSTOMER, customer_orders__restaurant_id=restaurant_id)
        .distinct()
        .values_list("id", flat=True)
    )
    qs = User.objects.filter(id__in=customer_ids).order_by("name")
    return Response(UserListSerializer(qs, many=True, context={"request": request}).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_product_raw_materials(request):
    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        qs = ProductRawMaterial.objects.filter(restaurant_id=restaurant_id).select_related(
            "restaurant", "product", "raw_material"
        )
        return Response(ProductRawMaterialListSerializer(qs, many=True).data)

    try:
        product_id = int(request.data.get("product"))
    except (TypeError, ValueError):
        return Response({"detail": "product is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        prod = Product.objects.get(pk=product_id, restaurant_id=restaurant_id)
    except Product.DoesNotExist:
        return Response({"detail": "Product not found."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        rm_id = int(request.data.get("raw_material"))
    except (TypeError, ValueError):
        return Response({"detail": "raw_material is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        rm = RawMaterial.objects.get(pk=rm_id, restaurant_id=restaurant_id)
    except RawMaterial.DoesNotExist:
        return Response({"detail": "Raw material not found for this restaurant."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        qty = Decimal(str(request.data.get("raw_material_quantity", "0")))
    except Exception:
        return Response({"detail": "Invalid raw_material_quantity."}, status=status.HTTP_400_BAD_REQUEST)
    if qty < 0:
        return Response({"detail": "raw_material_quantity must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)

    product_item = None
    raw_pi = request.data.get("product_item")
    if raw_pi not in (None, ""):
        try:
            pi_id = int(raw_pi)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid product_item."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            product_item = ProductItem.objects.get(pk=pi_id, product_id=product_id, product__restaurant_id=restaurant_id)
        except ProductItem.DoesNotExist:
            return Response({"detail": "Product item not found for this product."}, status=status.HTTP_400_BAD_REQUEST)

    link = ProductRawMaterial.objects.create(
        restaurant_id=restaurant_id,
        product=prod,
        product_item=product_item,
        raw_material=rm,
        raw_material_quantity=qty,
    )
    link = ProductRawMaterial.objects.select_related("restaurant", "product", "raw_material").get(pk=link.pk)
    return Response(ProductRawMaterialListSerializer(link).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def super_settings_detail(request):
    if getattr(request.user, "role", None) != UserRole.SUPER_ADMIN:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    obj = get_super_setting()
    if request.method == "GET":
        return Response(SuperSettingSerializer(obj).data)
    serializer = SuperSettingUpdateSerializer(obj, data=request.data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    updated = serializer.save()
    return Response(SuperSettingSerializer(updated).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_platform_defaults(request):
    """Non-sensitive platform pricing for owners and other portals."""
    obj = get_super_setting()
    return Response(PlatformDefaultSerializer(obj).data)


def _visible_bulk_notifications_for_user(user: User, qs):
    """Include rows with empty receivers (broadcast) or receivers matching this user (id or phone)."""
    uid_str = str(user.id)
    phone_norm = normalize_phone(user.phone or "") if user.phone else ""
    out = []
    for n in qs:
        rec = n.receivers or []
        if not rec:
            out.append(n)
            continue
        matched = False
        for r in rec:
            rs = str(r).strip()
            if rs == uid_str:
                matched = True
                break
            try:
                if int(rs) == user.id:
                    matched = True
                    break
            except (TypeError, ValueError):
                pass
            if phone_norm:
                try:
                    if normalize_phone(rs) == phone_norm:
                        matched = True
                        break
                except Exception:
                    pass
        if matched:
            out.append(n)
    return out


def _merge_bulk_notification_rows_by_created(*row_lists):
    """Merge pre-sorted-desc lists of model instances into a single time-desc list without duplicates."""
    seen: set[int] = set()
    merged: list = []
    for rows in row_lists:
        for n in rows:
            pk = n.pk
            if pk in seen:
                continue
            seen.add(pk)
            merged.append(n)
    merged.sort(key=lambda n: n.created_at, reverse=True)
    return merged


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_bulk_notifications(request):
    user = request.user
    role = getattr(user, "role", None)

    if role == UserRole.SUPER_ADMIN:
        qs = BulkNotification.objects.all().select_related("restaurant").order_by("-created_at")
        rid = request.query_params.get("restaurant_id")
        if rid:
            qs = qs.filter(restaurant_id=rid)
        return Response(BulkNotificationListSerializer(qs[:300], many=True).data)

    if role == UserRole.STAFF:
        restaurant_id, err = _parse_restaurant_id(request)
        if err:
            return err
        if not user_can_access_restaurant(user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        restaurant_rows = list(
            BulkNotification.objects.filter(restaurant_id=restaurant_id)
            .select_related("restaurant")
            .order_by("-created_at")[:250]
        )
        platform_rows = list(
            BulkNotification.objects.filter(
                restaurant_id__isnull=True,
                type=BulkNotificationType.PUSH,
            )
            .select_related("restaurant")
            .order_by("-created_at")[:250]
        )
        merged = _merge_bulk_notification_rows_by_created(restaurant_rows, platform_rows)[:400]
        visible = _visible_bulk_notifications_for_user(user, merged)[:300]
        return Response(BulkNotificationListSerializer(visible, many=True).data)

    if role == UserRole.CUSTOMER:
        qs = (
            BulkNotification.objects.filter(restaurant_id__isnull=True, type=BulkNotificationType.PUSH)
            .select_related("restaurant")
            .order_by("-created_at")[:300]
        )
        visible = _visible_bulk_notifications_for_user(user, list(qs))
        return Response(BulkNotificationListSerializer(visible, many=True).data)

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    restaurant_rows = list(
        BulkNotification.objects.filter(restaurant_id=restaurant_id)
        .select_related("restaurant")
        .order_by("-created_at")[:250]
    )
    platform_rows = list(
        BulkNotification.objects.filter(restaurant_id__isnull=True, type=BulkNotificationType.PUSH)
        .select_related("restaurant")
        .order_by("-created_at")[:250]
    )
    platform_visible = _visible_bulk_notifications_for_user(user, platform_rows)
    combined = _merge_bulk_notification_rows_by_created(restaurant_rows, platform_visible)[:300]
    return Response(BulkNotificationListSerializer(combined, many=True).data)

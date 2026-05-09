from decimal import Decimal

from django.db import transaction
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.api.list_serializers import CategoryListSerializer, RawMaterialListSerializer
from core.api.read_views import _parse_restaurant_id
from core.auth.portal import user_can_manage_restaurant
from core.models import Category, RawMaterial, StockLog, StockLogType, Supplier, Unit
from core.services.vision_raw_material import scan_raw_material_from_image


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_categories(request):
    if request.method == "GET":
        restaurant_id, err = _parse_restaurant_id(request)
        if err:
            return err
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        qs = Category.objects.filter(restaurant_id=restaurant_id).select_related("restaurant").order_by("name")
        return Response(CategoryListSerializer(qs, many=True).data)

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    name = (request.data.get("name") or "").strip()
    if not name:
        return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

    parent_id = request.data.get("parent")
    parent = None
    if parent_id is not None and parent_id != "":
        try:
            pid = int(parent_id)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid parent."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            parent = Category.objects.get(pk=pid, restaurant_id=restaurant_id)
        except Category.DoesNotExist:
            return Response({"detail": "Parent category not found."}, status=status.HTTP_400_BAD_REQUEST)

    image = request.FILES.get("image")
    cat = Category.objects.create(restaurant_id=restaurant_id, name=name, parent=parent, image=image or None)
    return Response(CategoryListSerializer(cat).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def category_detail(request, pk: int):
    try:
        cat = Category.objects.select_related("restaurant").get(pk=pk)
    except Category.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not user_can_manage_restaurant(request.user, cat.restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        cat.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "name" in request.data:
        nm = (request.data.get("name") or "").strip()
        if nm:
            cat.name = nm
    if "parent" in request.data:
        parent_raw = request.data.get("parent")
        if parent_raw is None or parent_raw == "":
            cat.parent = None
        else:
            try:
                pid = int(parent_raw)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid parent."}, status=status.HTTP_400_BAD_REQUEST)
            if pid == cat.id:
                return Response({"detail": "Category cannot be its own parent."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                parent = Category.objects.get(pk=pid, restaurant_id=cat.restaurant_id)
            except Category.DoesNotExist:
                return Response({"detail": "Parent category not found."}, status=status.HTTP_400_BAD_REQUEST)
            cat.parent = parent
    if "is_active" in request.data:
        cat.is_active = bool(request.data.get("is_active"))
    image = request.FILES.get("image")
    if image:
        cat.image = image

    try:
        cat.save()
    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(CategoryListSerializer(cat).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def list_raw_materials(request):
    if request.method == "GET":
        restaurant_id, err = _parse_restaurant_id(request)
        if err:
            return err
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        qs = (
            RawMaterial.objects.filter(restaurant_id=restaurant_id)
            .select_related("restaurant", "supplier", "unit")
            .order_by("name")
        )
        return Response(RawMaterialListSerializer(qs, many=True).data)

    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    name = (request.data.get("name") or "").strip()
    if not name:
        return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        unit_id = int(request.data.get("unit"))
    except (TypeError, ValueError):
        return Response({"detail": "unit is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        unit = Unit.objects.get(pk=unit_id, restaurant_id=restaurant_id)
    except Unit.DoesNotExist:
        return Response({"detail": "Unit not found for this restaurant."}, status=status.HTTP_400_BAD_REQUEST)

    supplier = None
    raw_sup = request.data.get("supplier")
    if raw_sup is not None and raw_sup != "":
        try:
            sid = int(raw_sup)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid supplier."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            supplier = Supplier.objects.get(pk=sid, restaurant_id=restaurant_id)
        except Supplier.DoesNotExist:
            return Response({"detail": "Supplier not found for this restaurant."}, status=status.HTTP_400_BAD_REQUEST)

    def _dec(key: str, default: str = "0") -> Decimal:
        try:
            return Decimal(str(request.data.get(key, default)))
        except Exception:
            return Decimal(default)

    with transaction.atomic():
        rm = RawMaterial.objects.create(
            restaurant_id=restaurant_id,
            name=name,
            supplier=supplier,
            unit=unit,
            price=_dec("price", "0"),
            stock=_dec("stock", "0"),
            min_stock=_dec("min_stock", "0"),
        )
        if rm.stock != Decimal("0"):
            StockLog.objects.create(
                restaurant_id=restaurant_id,
                raw_material=rm,
                type=StockLogType.IN,
                quantity=rm.stock,
            )
    return Response(RawMaterialListSerializer(rm).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def recognize_raw_material(request):
    """
    Optional OpenAI vision for raw-ingredient photo (multipart: ``image`` + ``restaurant_id``).
    Returns suggested name, price, unit, and similar existing rows for the cashier to confirm.
    """
    restaurant_id, err = _parse_restaurant_id(request)
    if err:
        return err
    if not user_can_manage_restaurant(request.user, restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    up = request.FILES.get("image")
    if not up:
        return Response({"detail": "image file is required (multipart field 'image')."}, status=status.HTTP_400_BAD_REQUEST)
    data = up.read(10 * 1024 * 1024)
    if not data or len(data) < 20:
        return Response({"detail": "Image is empty or too small."}, status=status.HTTP_400_BAD_REQUEST)
    ct = getattr(up, "content_type", None) or "image/jpeg"
    out = scan_raw_material_from_image(
        image_bytes=data,
        content_type=ct,
        restaurant_id=restaurant_id,
    )
    return Response(out, status=status.HTTP_200_OK)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def raw_material_detail(request, pk: int):
    try:
        rm = RawMaterial.objects.select_related("restaurant", "supplier", "unit").get(pk=pk)
    except RawMaterial.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not user_can_manage_restaurant(request.user, rm.restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        try:
            with transaction.atomic():
                rm.delete()
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete raw material because it is referenced by other records."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    rid = rm.restaurant_id
    old_stock = rm.stock

    if "name" in request.data:
        nm = (request.data.get("name") or "").strip()
        if nm:
            rm.name = nm

    if "unit" in request.data:
        try:
            uid = int(request.data.get("unit"))
            unit = Unit.objects.get(pk=uid, restaurant_id=rid)
            rm.unit = unit
        except (TypeError, ValueError):
            return Response({"detail": "Invalid unit."}, status=status.HTTP_400_BAD_REQUEST)
        except Unit.DoesNotExist:
            return Response({"detail": "Unit not found for this restaurant."}, status=status.HTTP_404_NOT_FOUND)

    if "supplier" in request.data:
        raw_sup = request.data.get("supplier")
        if raw_sup is None or raw_sup == "":
            rm.supplier = None
        else:
            try:
                sid = int(raw_sup)
                rm.supplier = Supplier.objects.get(pk=sid, restaurant_id=rid)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid supplier."}, status=status.HTTP_400_BAD_REQUEST)
            except Supplier.DoesNotExist:
                return Response({"detail": "Supplier not found for this restaurant."}, status=status.HTTP_404_NOT_FOUND)

    for field, key in (("price", "price"), ("stock", "stock"), ("min_stock", "min_stock")):
        if key in request.data:
            try:
                setattr(rm, field, Decimal(str(request.data.get(key))))
            except Exception:
                return Response({"detail": f"Invalid {key}."}, status=status.HTTP_400_BAD_REQUEST)

    if "is_active" in request.data:
        rm.is_active = bool(request.data.get("is_active"))

    stock_delta = (rm.stock - old_stock) if "stock" in request.data else Decimal("0")

    with transaction.atomic():
        rm.save()
        if stock_delta != 0:
            StockLog.objects.create(
                restaurant_id=rid,
                raw_material=rm,
                type=StockLogType.IN if stock_delta > 0 else StockLogType.OUT,
                quantity=abs(stock_delta),
            )
    return Response(RawMaterialListSerializer(rm).data)

from decimal import Decimal
import json

from django.db import transaction
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.api.list_serializers import (
    ComboSetListSerializer,
    ProductItemListSerializer,
    ProductListSerializer,
    ProductRawMaterialListSerializer,
)
from core.api.read_views import _combo_total_for_products, _parse_restaurant_id
from core.api.write_views import _as_bool
from core.auth.portal import user_can_manage_restaurant
from core.models import Category, ComboSet, DiscountType, Product, ProductItem, ProductRawMaterial, RawMaterial, Unit


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def product_detail(request, pk: int):
    try:
        product = Product.objects.select_related("restaurant", "category").get(pk=pk)
    except Product.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not user_can_manage_restaurant(request.user, product.restaurant_id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        try:
            with transaction.atomic():
                product.delete()
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete product because it is referenced by other records."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    rid = product.restaurant_id

    if "name" in request.data:
        nm = (request.data.get("name") or "").strip()
        if nm:
            product.name = nm
    if "category" in request.data:
        raw_cat = request.data.get("category")
        if raw_cat is None or raw_cat == "":
            product.category = None
        else:
            try:
                cid = int(raw_cat)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid category."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                product.category = Category.objects.get(pk=cid, restaurant_id=rid)
            except Category.DoesNotExist:
                return Response({"detail": "Category not found."}, status=status.HTTP_400_BAD_REQUEST)
    if "is_veg" in request.data:
        product.is_veg = _as_bool(request.data.get("is_veg"), default=False)
    if "is_active" in request.data:
        product.is_active = _as_bool(request.data.get("is_active"), default=product.is_active)

    image = request.FILES.get("image")
    if image:
        product.image = image

    try:
        product.save()
    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(ProductListSerializer(product).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def product_item_detail(request, pk: int):
    try:
        item = ProductItem.objects.select_related("product", "product__restaurant", "unit").get(pk=pk)
    except ProductItem.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    rid = item.product.restaurant_id
    if not user_can_manage_restaurant(request.user, rid):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        try:
            with transaction.atomic():
                item.delete()
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete product item because it is referenced by other records."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "unit" in request.data:
        try:
            uid = int(request.data.get("unit"))
            unit = Unit.objects.get(pk=uid, restaurant_id=rid)
            item.unit = unit
        except (TypeError, ValueError):
            return Response({"detail": "Invalid unit."}, status=status.HTTP_400_BAD_REQUEST)
        except Unit.DoesNotExist:
            return Response({"detail": "Unit not found for this restaurant."}, status=status.HTTP_400_BAD_REQUEST)

    if "price" in request.data:
        try:
            item.price = Decimal(str(request.data.get("price")))
        except Exception:
            return Response({"detail": "Invalid price."}, status=status.HTTP_400_BAD_REQUEST)

    if "discount" in request.data:
        try:
            item.discount = Decimal(str(request.data.get("discount")))
        except Exception:
            return Response({"detail": "Invalid discount."}, status=status.HTTP_400_BAD_REQUEST)

    if "discount_type" in request.data:
        dt = (request.data.get("discount_type") or "").strip()
        if dt not in (DiscountType.FLAT, DiscountType.PERCENTAGE):
            return Response({"detail": "Invalid discount_type."}, status=status.HTTP_400_BAD_REQUEST)
        item.discount_type = dt

    if "is_active" in request.data:
        item.is_active = bool(request.data.get("is_active"))

    try:
        item.save()
    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(ProductItemListSerializer(item).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def product_raw_material_detail(request, pk: int):
    try:
        link = ProductRawMaterial.objects.select_related(
            "restaurant", "product", "product__restaurant", "raw_material", "product_item"
        ).get(pk=pk)
    except ProductRawMaterial.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    rid = link.restaurant_id
    if not user_can_manage_restaurant(request.user, rid):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "raw_material" in request.data:
        try:
            rmid = int(request.data.get("raw_material"))
            rm = RawMaterial.objects.get(pk=rmid, restaurant_id=rid)
            link.raw_material = rm
        except (TypeError, ValueError):
            return Response({"detail": "Invalid raw_material."}, status=status.HTTP_400_BAD_REQUEST)
        except RawMaterial.DoesNotExist:
            return Response({"detail": "Raw material not found for this restaurant."}, status=status.HTTP_400_BAD_REQUEST)

    if "raw_material_quantity" in request.data:
        try:
            link.raw_material_quantity = Decimal(str(request.data.get("raw_material_quantity")))
        except Exception:
            return Response({"detail": "Invalid raw_material_quantity."}, status=status.HTTP_400_BAD_REQUEST)
        if link.raw_material_quantity < 0:
            return Response({"detail": "raw_material_quantity must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)

    if "product_item" in request.data:
        raw_pi = request.data.get("product_item")
        if raw_pi in (None, ""):
            link.product_item = None
        else:
            try:
                pi_id = int(raw_pi)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid product_item."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                link.product_item = ProductItem.objects.get(
                    pk=pi_id, product_id=link.product_id, product__restaurant_id=rid
                )
            except ProductItem.DoesNotExist:
                return Response({"detail": "Product item not found for this product."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        link.save()
    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    link = ProductRawMaterial.objects.select_related("restaurant", "product", "raw_material").get(pk=link.pk)
    return Response(ProductRawMaterialListSerializer(link).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def combo_set_detail(request, pk: int):
    try:
        combo = ComboSet.objects.select_related("restaurant").prefetch_related("products").get(pk=pk)
    except ComboSet.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    rid = combo.restaurant_id
    if not user_can_manage_restaurant(request.user, rid):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        try:
            with transaction.atomic():
                combo.delete()
        except ProtectedError:
            return Response(
                {"detail": "Cannot delete combo set because it is referenced by other records."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "name" in request.data:
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
        combo.name = name
    if "description" in request.data:
        combo.description = (request.data.get("description") or "").strip()
    if "is_active" in request.data:
        combo.is_active = _as_bool(request.data.get("is_active"), combo.is_active)

    if "restaurant_id" in request.data:
        try:
            new_rid = int(request.data.get("restaurant_id"))
        except (TypeError, ValueError):
            return Response({"detail": "Invalid restaurant_id."}, status=status.HTTP_400_BAD_REQUEST)
        if not user_can_manage_restaurant(request.user, new_rid):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        if new_rid != rid:
            combo.restaurant_id = new_rid
            rid = new_rid
            kept = set(
                Product.objects.filter(
                    restaurant_id=rid,
                    id__in=combo.products.values_list("id", flat=True),
                ).values_list("id", flat=True)
            )
            combo.products.set(kept)

    product_ids = list(combo.products.values_list("id", flat=True))
    if "products" in request.data:
        raw_products = request.data.get("products") or []
        if isinstance(raw_products, str):
            try:
                raw_products = json.loads(raw_products)
            except Exception:
                return Response({"detail": "products must be an array of product ids."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(raw_products, list):
            return Response({"detail": "products must be an array of product ids."}, status=status.HTTP_400_BAD_REQUEST)
        product_ids = []
        for pid in raw_products:
            try:
                product_ids.append(int(pid))
            except (TypeError, ValueError):
                return Response({"detail": "products must contain valid product ids."}, status=status.HTTP_400_BAD_REQUEST)
        valid_product_ids = set(Product.objects.filter(restaurant_id=rid, id__in=product_ids).values_list("id", flat=True))
        if len(valid_product_ids) != len(set(product_ids)):
            return Response(
                {"detail": "One or more selected products are invalid for this restaurant."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        combo.products.set(valid_product_ids)
        product_ids = list(valid_product_ids)

    if "discount_type" in request.data:
        dt = (request.data.get("discount_type") or "").strip()
        if dt not in (DiscountType.FLAT, DiscountType.PERCENTAGE):
            return Response({"detail": "Invalid discount_type."}, status=status.HTTP_400_BAD_REQUEST)
        combo.discount_type = dt

    if "discount" in request.data:
        try:
            combo.discount = Decimal(str(request.data.get("discount")))
        except Exception:
            return Response({"detail": "Invalid discount."}, status=status.HTTP_400_BAD_REQUEST)
    if combo.discount < 0:
        return Response({"detail": "discount must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)
    if combo.discount_type == DiscountType.PERCENTAGE and combo.discount > Decimal("100"):
        return Response({"detail": "Percentage discount cannot exceed 100."}, status=status.HTTP_400_BAD_REQUEST)

    total_product_price = _combo_total_for_products(product_ids, rid)
    discount_value = (
        (total_product_price * combo.discount) / Decimal("100.00")
        if combo.discount_type == DiscountType.PERCENTAGE
        else combo.discount
    )
    combo.price = max(Decimal("0.00"), total_product_price - discount_value)

    image = request.FILES.get("image")
    if image:
        combo.image = image

    try:
        combo.save()
    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(ComboSetListSerializer(combo).data)

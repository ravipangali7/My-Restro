from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.auth.portal import portal_role_for_user, user_can_access_restaurant
from core.media_urls import absolute_media_url
from core.models import Category, ComboSet, Product, ProductItem, Restaurant, Staff, StaffRole, Table, UserRole


def _resolve_restaurant(request):
    restaurant_id = request.query_params.get("restaurant_id")
    if not restaurant_id:
        return None, Response({"detail": "Query param `restaurant_id` is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        restaurant = Restaurant.objects.get(id=restaurant_id)
    except Restaurant.DoesNotExist:
        return None, Response({"detail": "Restaurant not found."}, status=status.HTTP_404_NOT_FOUND)

    if not restaurant.is_active:
        return None, Response(
            {"detail": "This restaurant is inactive and is not available on the customer portal."},
            status=status.HTTP_404_NOT_FOUND,
        )

    return restaurant, None


def _assert_client_home_allowed(request, restaurant: Restaurant) -> Response | None:
    """Staff waiters may only load the public menu for venues where they work as a waiter."""
    user = request.user
    if not user.is_authenticated:
        return None
    role = getattr(user, "role", None)
    if role != UserRole.STAFF:
        return None
    if not user_can_access_restaurant(user, restaurant.id):
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    if portal_role_for_user(user) == "waiter":
        allowed = Staff.objects.filter(
            user=user,
            restaurant_id=restaurant.id,
            role=StaffRole.WAITER,
            restaurant__is_active=True,
        ).exists()
        if not allowed:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    return None


@api_view(["GET"])
@permission_classes([AllowAny])
def home_data(request):
    restaurant, error_response = _resolve_restaurant(request)
    if error_response is not None:
        return error_response

    denied = _assert_client_home_allowed(request, restaurant)
    if denied is not None:
        return denied

    categories = list(
        Category.objects.filter(restaurant=restaurant, is_active=True).values("id", "name", "parent_id", "image")
    )
    for row in categories:
        row["image"] = absolute_media_url(request, row.get("image"))

    products = list(
        Product.objects.filter(restaurant=restaurant, is_active=True).values(
            "id", "name", "category_id", "is_veg", "is_active", "image"
        )
    )
    for row in products:
        row["image"] = absolute_media_url(request, row.get("image"))
    product_items = list(
        ProductItem.objects.filter(product__restaurant=restaurant, is_active=True)
        .select_related("unit")
        .values("id", "product_id", "unit__name", "price", "discount_type", "discount")
    )
    tables = list(Table.objects.filter(restaurant=restaurant, is_active=True).values("id", "name", "capacity", "image"))
    for row in tables:
        row["image"] = absolute_media_url(request, row.get("image"))

    combo_sets = []
    for c in ComboSet.objects.filter(restaurant=restaurant, is_active=True).prefetch_related("products"):
        combo_sets.append(
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "price": str(c.price),
                "products": list(c.products.values_list("id", flat=True)),
                "image": absolute_media_url(request, c.image.name if c.image else None),
            }
        )

    payload = {
        "restaurant": {
            "id": restaurant.id,
            "name": restaurant.name,
            "slug": restaurant.slug,
            "is_open": restaurant.is_open,
        },
        "categories": categories,
        "products": products,
        "product_items": product_items,
        "tables": tables,
        "combo_sets": combo_sets,
    }
    return Response(payload)

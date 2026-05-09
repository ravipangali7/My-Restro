from django.http import JsonResponse
from django.views.decorators.http import require_GET

from core.models import Category, Product, ProductItem, Restaurant, Table


def _resolve_restaurant(request):
    restaurant_id = request.GET.get("restaurant_id")
    if not restaurant_id:
        return None, JsonResponse({"detail": "Query param `restaurant_id` is required."}, status=400)

    try:
        restaurant = Restaurant.objects.get(id=restaurant_id)
    except Restaurant.DoesNotExist:
        return None, JsonResponse({"detail": "Restaurant not found."}, status=404)

    return restaurant, None


@require_GET
def x_data(request):
    restaurant, error_response = _resolve_restaurant(request)
    if error_response is not None:
        return error_response

    categories = list(
        Category.objects.filter(restaurant=restaurant, is_active=True).values("id", "name", "parent_id")
    )
    products = list(
        Product.objects.filter(restaurant=restaurant, is_active=True).values(
            "id", "name", "category_id", "is_veg", "is_active", "image"
        )
    )
    product_items = list(
        ProductItem.objects.filter(product__restaurant=restaurant, is_active=True)
        .select_related("unit")
        .values("id", "product_id", "unit__name", "price", "discount_type", "discount")
    )
    tables = list(
        Table.objects.filter(restaurant=restaurant, is_active=True).values("id", "name", "capacity")
    )

    payload = {
        "restaurant": {"id": restaurant.id, "name": restaurant.name, "slug": restaurant.slug},
        "categories": categories,
        "products": products,
        "product_items": product_items,
        "tables": tables,
    }
    return JsonResponse(payload)

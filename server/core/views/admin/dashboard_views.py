from django.db.models import Count, Sum
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from core.models import Order, Restaurant, Transaction


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
def dashboard_data(request):
    restaurant, error_response = _resolve_restaurant(request)
    if error_response is not None:
        return error_response

    status_counts = dict(
        Order.objects.filter(restaurant=restaurant).values("status").annotate(total=Count("id")).values_list("status", "total")
    )
    totals = Transaction.objects.filter(restaurant=restaurant).aggregate(amount=Sum("amount"))

    recent_orders = list(
        Order.objects.filter(restaurant=restaurant)
        .select_related("table", "customer")
        .values("id", "order_id", "status", "total", "order_type", "created_at")[:10]
    )

    payload = {
        "restaurant": {"id": restaurant.id, "name": restaurant.name, "slug": restaurant.slug},
        "kpis": {
            "order_count": sum(status_counts.values()),
            "pending_orders": status_counts.get("pending", 0),
            "running_orders": status_counts.get("running", 0),
            "ready_orders": status_counts.get("ready", 0),
            "transaction_total": totals.get("amount") or 0,
        },
        "recent_orders": recent_orders,
    }
    return JsonResponse(payload)

from decimal import Decimal

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.api.serializers import OrderCreateSerializer, OrderSerializer
from core.auth.portal import parse_local_phone
from core.models import OrderType
from core.services import ValidationError as ServiceValidationError
from core.services.orders import create_order_with_items


def _normalize_public_order_type(raw) -> str | None:
    if raw is None:
        return OrderType.TABLE
    s = (getattr(raw, "value", raw) if raw is not None else "") or ""
    s = str(s).strip().lower()
    if not s:
        return OrderType.TABLE
    if s == "table":
        return OrderType.TABLE
    if s == "packing":
        return OrderType.PACKING
    return None


@api_view(["POST"])
@permission_classes([AllowAny])
def public_menu_order_create(request):
    """
    Guest checkout for menu QR / waiter-menu links (no auth).
    Restricted to table or packing; no delivery, no staff-assigned waiter, no account customer.
    """
    ser = OrderCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    d = ser.validated_data

    restaurant = d["restaurant"]
    ot = _normalize_public_order_type(d.get("order_type"))
    if ot is None:
        return Response(
            {"detail": "Menu QR orders only support dine-in (table) or takeout (packing)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    name = (d.get("guest_customer_name") or "").strip()
    phone_raw = (d.get("guest_customer_phone") or "").strip()
    if not name:
        return Response({"detail": "Name is required to place an order."}, status=status.HTTP_400_BAD_REQUEST)
    if not phone_raw:
        return Response({"detail": "Phone is required to place an order."}, status=status.HTTP_400_BAD_REQUEST)
    phone, phone_err = parse_local_phone(phone_raw, required=True)
    if phone_err:
        return Response({"detail": phone_err}, status=status.HTTP_400_BAD_REQUEST)

    if ot == OrderType.TABLE and d.get("table") is None:
        return Response({"detail": "Select a table for dine-in orders."}, status=status.HTTP_400_BAD_REQUEST)

    discount = d.get("order_discount")
    if discount is not None and discount != Decimal("0.00"):
        return Response({"detail": "Order discount is not allowed for menu QR orders."}, status=status.HTTP_400_BAD_REQUEST)

    if d.get("latitude") is not None or d.get("longitude") is not None:
        return Response({"detail": "Delivery is not available from this menu link."}, status=status.HTTP_400_BAD_REQUEST)

    lines = []
    for ln in d["lines"]:
        row = {"quantity": ln["quantity"]}
        if ln.get("product_item_id"):
            row["product_item_id"] = ln["product_item_id"]
        if ln.get("comboset_id"):
            row["comboset_id"] = ln["comboset_id"]
        lines.append(row)

    try:
        order = create_order_with_items(
            restaurant=restaurant,
            lines=lines,
            customer=None,
            guest_customer_name=name,
            guest_customer_phone=phone,
            table=d.get("table"),
            order_type=ot,
            address="",
            latitude=None,
            longitude=None,
            payment_method=d.get("payment_method") or None,
            fcm_token="",
            waiter=None,
            people_for=d.get("people_for") or 1,
            order_discount=Decimal("0.00"),
        )
    except ServiceValidationError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    out = OrderSerializer(order, context={"request": request})
    return Response(out.data, status=status.HTTP_201_CREATED)

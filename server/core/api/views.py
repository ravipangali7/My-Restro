import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.db.models import Prefetch, Q
from django.db.models.functions import Coalesce
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.api.renderers import OrderBillPNGRenderer
from core.auth.portal import portal_role_for_user, user_can_access_restaurant, user_can_manage_restaurant
from core.api.serializers import (
    AddBillLineSerializer,
    OrderCreateSerializer,
    OrderSerializer,
    OrderStatusSerializer,
    PurchaseSerializer,
    RejectWithdrawalSerializer,
    ShareholderWithdrawalCreateSerializer,
    ShareholderWithdrawalSerializer,
)
from core.models import (
    Order,
    OrderItem,
    OrderStaffPaymentRecord,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    Purchase,
    Restaurant,
    ShareholderWithdrawal,
    Staff,
    StaffPaymentChannel,
    StaffRole,
    StockLog,
    StockLogType,
    UserRole,
)
from core.services.vision_billing import scan_bill_item_from_image
from core.services.geo import haversine_distance_m
from core.services import (
    AlreadyPostedError,
    InsufficientStockError,
    ValidationError as ServiceValidationError,
    approve_shareholder_withdrawal,
    create_order_with_items,
    finalize_purchase,
    reject_shareholder_withdrawal,
    request_shareholder_withdrawal,
    transition_order_status,
)
from core.services.orders import add_cashier_line_to_order
from core.services.order_bill import attach_order_bill_image


_ORDER_ITEMS_PREFETCH = Prefetch(
    "items",
    queryset=OrderItem.objects.select_related(
        "product",
        "product_item",
        "product_item__product",
        "product_item__unit",
        "comboset",
    ),
)

_ORDER_STAFF_PAYMENTS_PREFETCH = Prefetch(
    "staff_payment_records",
    queryset=OrderStaffPaymentRecord.objects.select_related("recorded_by").order_by("-created_at"),
)


def _payment_alert_identity_key(order: Order) -> str:
    if order.customer_id is not None:
        return f"c:{order.customer_id}"
    ph = re.sub(r"\D", "", order.guest_customer_phone or "")
    if ph:
        return f"p:{ph}"
    nm = (order.guest_customer_name or "").strip().lower()
    if nm:
        return f"n:{nm}"
    return f"o:{order.pk}"


def _iter_latest_order_per_payment_alert_key(qs) -> list[Order]:
    """One row per customer: the most recent non-rejected order for that person (stays on list when paid)."""
    by_newest = qs.order_by("-created_at", "-pk")
    seen: set[str] = set()
    out: list[Order] = []
    for o in by_newest:
        k = _payment_alert_identity_key(o)
        if k in seen:
            continue
        seen.add(k)
        out.append(o)
    return out


def _restaurant_proximity_anchor(restaurant: Restaurant) -> tuple[float, float] | None:
    if restaurant.reference_latitude is not None and restaurant.reference_longitude is not None:
        return (float(restaurant.reference_latitude), float(restaurant.reference_longitude))
    if restaurant.latitude is not None and restaurant.longitude is not None:
        return (float(restaurant.latitude), float(restaurant.longitude))
    return None


def _payment_counter_may_access_restaurant(user, restaurant) -> bool:
    """Owner, cashier (non-waiter staff at restaurant), and super-admins: same as payment-pending list."""
    role = getattr(user, "role", None)
    if role == UserRole.SUPER_ADMIN:
        return True
    if role == UserRole.OWNER and restaurant.user_id == user.id:
        return True
    if role == UserRole.STAFF:
        if not Staff.objects.filter(user=user, restaurant_id=restaurant.id).exists():
            return False
        if portal_role_for_user(user) == "waiter":
            return False
        return True
    return False


class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = (
        Order.objects.all()
        .select_related("restaurant", "customer", "table", "waiter")
        .prefetch_related(_ORDER_ITEMS_PREFETCH, _ORDER_STAFF_PAYMENTS_PREFETCH)
    )
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = (
            Order.objects.all()
            .select_related("restaurant", "customer", "table", "waiter")
            .prefetch_related(_ORDER_ITEMS_PREFETCH, _ORDER_STAFF_PAYMENTS_PREFETCH)
        )
        user = self.request.user
        role = getattr(user, "role", None)
        if role == UserRole.SUPER_ADMIN:
            pass
        elif role == UserRole.CUSTOMER:
            qs = qs.filter(customer=user)
        elif role == UserRole.OWNER:
            qs = qs.filter(restaurant__user=user)
        elif role == UserRole.STAFF:
            qs = qs.filter(restaurant_id__in=Staff.objects.filter(user=user).values("restaurant_id"))
            portal = portal_role_for_user(user)
            if portal == StaffRole.WAITER:
                # Default: only orders this waiter created / is assigned (POS sets `waiter`).
                # Waiting Pickup uses ?for_waiter_pickup=1 so every waiter also sees customer
                # orders (no assigned waiter) in `waiting_pickup` status.
                raw_pickup = (self.request.query_params.get("for_waiter_pickup") or "").strip().lower()
                if raw_pickup in ("1", "true", "yes"):
                    qs = qs.filter(status=OrderStatus.WAITING_PICKUP).filter(Q(waiter=user) | Q(waiter__isnull=True))
                elif getattr(self, "action", None) in ("retrieve", "transition_status_action"):
                    # Rows from the pickup list must still resolve for GET detail and POST
                    # transition-status (those requests do not carry ?for_waiter_pickup=1).
                    qs = qs.filter(
                        Q(waiter=user)
                        | (Q(status=OrderStatus.WAITING_PICKUP) & Q(waiter__isnull=True))
                    )
                else:
                    qs = qs.filter(waiter=user)
            # Waiters and kitchen no longer list delivered orders; owners still see the full history.
            if portal in (StaffRole.WAITER, StaffRole.KITCHEN):
                qs = qs.exclude(status=OrderStatus.DELIVERED)
        else:
            return Order.objects.none()

        rid = self.request.query_params.get("restaurant_id")
        if rid and role in (UserRole.OWNER, UserRole.STAFF, UserRole.SUPER_ADMIN):
            qs = qs.filter(restaurant_id=rid)
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return OrderCreateSerializer
        return OrderSerializer

    def create(self, request, *args, **kwargs):
        ser = OrderCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        lines = []
        for ln in d["lines"]:
            row = {"quantity": ln["quantity"]}
            if ln.get("product_item_id"):
                row["product_item_id"] = ln["product_item_id"]
            if ln.get("comboset_id"):
                row["comboset_id"] = ln["comboset_id"]
            lines.append(row)
        if not user_can_access_restaurant(request.user, d["restaurant"].id):
            return Response({"detail": "You cannot create orders for this restaurant."}, status=status.HTTP_403_FORBIDDEN)

        waiter_for_order = d.get("waiter")
        if getattr(request.user, "role", None) == UserRole.STAFF and portal_role_for_user(request.user) == "waiter":
            waiter_for_order = request.user

        try:
            order = create_order_with_items(
                restaurant=d["restaurant"],
                lines=lines,
                customer=d.get("customer"),
                guest_customer_name=d.get("guest_customer_name") or "",
                guest_customer_phone=d.get("guest_customer_phone") or "",
                table=d.get("table"),
                order_type=d.get("order_type") or None,
                address=d.get("address") or "",
                latitude=d.get("latitude"),
                longitude=d.get("longitude"),
                payment_method=d.get("payment_method") or None,
                fcm_token=d.get("fcm_token") or "",
                waiter=waiter_for_order,
                people_for=d.get("people_for") or 1,
                order_discount=d.get("order_discount"),
            )
        except ServiceValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        out = OrderSerializer(order, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="transition-status")
    def transition_status_action(self, request, pk=None):
        order = self.get_object()
        user = request.user
        role = getattr(user, "role", None)
        if role == UserRole.SUPER_ADMIN:
            pass
        elif role == UserRole.OWNER:
            if order.restaurant.user_id != user.id:
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        elif role == UserRole.STAFF:
            if not Staff.objects.filter(user=user, restaurant_id=order.restaurant_id).exists():
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
            pr = portal_role_for_user(user)
            requested = (request.data.get("status") or "").strip()
            if requested == OrderStatus.DELIVERED:
                if pr != StaffRole.WAITER:
                    return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
                if order.status != OrderStatus.WAITING_PICKUP:
                    return Response(
                        {"detail": "Only orders waiting pickup can be marked delivered."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if order.waiter_id is not None and order.waiter_id != user.id:
                    return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
                pickup_queue = (
                    Order.objects.filter(
                        restaurant_id=order.restaurant_id,
                        status=OrderStatus.WAITING_PICKUP,
                    )
                    .filter(Q(waiter=user) | Q(waiter__isnull=True))
                    .annotate(
                        wait_anchor=Coalesce(
                            "waiting_pickup_at",
                            "updated_at",
                            "created_at",
                        )
                    )
                    .order_by("wait_anchor", "id")
                )
                front = pickup_queue.first()
                if front is not None and front.pk != order.pk:
                    return Response(
                        {
                            "detail": (
                                "Pickup queue orders must be marked delivered in waiting-time order "
                                "(oldest first)."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            elif pr != StaffRole.KITCHEN:
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        else:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        ser = OrderStatusSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        st = ser.validated_data["status"]
        try:
            transition_order_status(
                order,
                st,
                reject_reason=ser.validated_data.get("reject_reason") or "",
                consume_inventory_when_ready=ser.validated_data.get("consume_inventory_when_ready", True),
            )
        except InsufficientStockError as exc:
            return Response(
                {"detail": str(exc), "raw_material": exc.raw_material_name},
                status=status.HTTP_409_CONFLICT,
            )
        except ServiceValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        order.refresh_from_db()
        return Response(OrderSerializer(order, context={"request": request}).data)

    @action(
        detail=True,
        methods=["get"],
        url_path="bill-image",
        renderer_classes=[OrderBillPNGRenderer],
    )
    def bill_image_download(self, request, pk=None):
        """Authenticated download of the auto-generated bill PNG."""
        order = self.get_object()
        if not order.bill_image:
            return Response(
                {"detail": "No bill has been generated for this order."},
                status=status.HTTP_404_NOT_FOUND,
            )
        fh = order.bill_image.open("rb")
        filename = f"{order.order_id}-bill.png".replace("/", "-")
        return FileResponse(fh, as_attachment=True, filename=filename, content_type="image/png")

    @action(detail=True, methods=["post"], url_path="report-position")
    def report_position(self, request, pk=None):
        """Customer reports GPS; may raise an unpaid proximity alert for cashiers."""
        order = self.get_object()
        role = getattr(request.user, "role", None)
        if role != UserRole.CUSTOMER or order.customer_id != request.user.id:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        lat_raw = request.data.get("latitude")
        lng_raw = request.data.get("longitude")
        if lat_raw in (None, "") or lng_raw in (None, ""):
            return Response({"detail": "latitude and longitude are required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rlat = Decimal(str(lat_raw))
            rlng = Decimal(str(lng_raw))
        except Exception:
            return Response({"detail": "Invalid coordinates."}, status=status.HTTP_400_BAD_REQUEST)

        order.last_reported_latitude = rlat
        order.last_reported_longitude = rlng
        order.last_reported_at = timezone.now()
        update_fields = ["last_reported_latitude", "last_reported_longitude", "last_reported_at", "updated_at"]

        restaurant = order.restaurant
        anchor = _restaurant_proximity_anchor(restaurant)

        proximity_alert_triggered = False
        unpaid = order.payment_status != PaymentStatus.SUCCESS
        status_ok = order.status != OrderStatus.REJECTED
        if anchor and unpaid and status_ok:
            dist_m = haversine_distance_m(rlat, rlng, anchor[0], anchor[1])
            radius_m = float(restaurant.proximity_alert_radius_m)
            if dist_m <= radius_m:
                order.proximity_unpaid_alert_at = timezone.now()
                update_fields.append("proximity_unpaid_alert_at")
                proximity_alert_triggered = True
            elif order.proximity_unpaid_alert_at is not None:
                order.proximity_unpaid_alert_at = None
                update_fields.append("proximity_unpaid_alert_at")

        order.save(update_fields=update_fields)
        order.refresh_from_db()
        distance_m = (
            round(haversine_distance_m(rlat, rlng, anchor[0], anchor[1]), 2) if anchor is not None else None
        )
        return Response(
            {
                "order": OrderSerializer(order, context={"request": request}).data,
                "proximity_alert_triggered": proximity_alert_triggered,
                "distance_m": distance_m,
            }
        )

    @action(detail=False, methods=["get"], url_path="proximity-alerts")
    def proximity_alerts(self, request):
        """Unpaid orders whose last GPS is still inside the configured alert radius (staff / owner / super-admin)."""
        rid = request.query_params.get("restaurant_id")
        if not rid:
            return Response({"detail": "restaurant_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            restaurant_id = int(rid)
        except ValueError:
            return Response({"detail": "Invalid restaurant_id."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            restaurant = Restaurant.objects.get(pk=restaurant_id)
        except Restaurant.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        role = getattr(user, "role", None)
        if role == UserRole.SUPER_ADMIN:
            pass
        elif role == UserRole.OWNER:
            if restaurant.user_id != user.id:
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        elif role == UserRole.STAFF:
            if not Staff.objects.filter(user=user, restaurant_id=restaurant_id).exists():
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
            if portal_role_for_user(user) == "waiter":
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        else:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        anchor = _restaurant_proximity_anchor(restaurant)
        if anchor is None:
            return Response([])

        radius_m = float(restaurant.proximity_alert_radius_m)
        qs = (
            Order.objects.filter(
                restaurant_id=restaurant_id,
                proximity_unpaid_alert_at__isnull=False,
            )
            .exclude(payment_status=PaymentStatus.SUCCESS)
            .exclude(status=OrderStatus.REJECTED)
            .select_related("customer", "restaurant", "table", "waiter")
            .prefetch_related(_ORDER_ITEMS_PREFETCH, _ORDER_STAFF_PAYMENTS_PREFETCH)
            .order_by("-proximity_unpaid_alert_at")
        )

        active_orders: list[Order] = []
        for order in qs:
            if order.last_reported_latitude is None or order.last_reported_longitude is None:
                continue
            dist_m = haversine_distance_m(
                order.last_reported_latitude,
                order.last_reported_longitude,
                anchor[0],
                anchor[1],
            )
            if dist_m <= radius_m:
                active_orders.append(order)

        return Response(OrderSerializer(active_orders, many=True, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="payment-pending-alerts")
    def payment_pending_alerts(self, request):
        """
        Latest order per customer for the counter (not GPS-filtered). Includes fully paid
        customers so the row does not disappear after success; a new order for the same
        phone/customer supersedes with a fresh row.
        """
        rid = request.query_params.get("restaurant_id")
        if not rid:
            return Response({"detail": "restaurant_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            restaurant_id = int(rid)
        except ValueError:
            return Response({"detail": "Invalid restaurant_id."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            restaurant = Restaurant.objects.get(pk=restaurant_id)
        except Restaurant.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        role = getattr(user, "role", None)
        if role == UserRole.SUPER_ADMIN:
            pass
        elif role == UserRole.OWNER:
            if restaurant.user_id != user.id:
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        elif role == UserRole.STAFF:
            if not Staff.objects.filter(user=user, restaurant_id=restaurant_id).exists():
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
            if portal_role_for_user(user) == "waiter":
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        else:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        base = (
            Order.objects.filter(restaurant_id=restaurant_id)
            .exclude(status=OrderStatus.REJECTED)
            .select_related("customer", "restaurant", "table", "waiter")
            .prefetch_related(_ORDER_ITEMS_PREFETCH, _ORDER_STAFF_PAYMENTS_PREFETCH)
        )
        latest = _iter_latest_order_per_payment_alert_key(base)
        latest.sort(key=lambda o: o.created_at, reverse=True)
        return Response(OrderSerializer(latest, many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="dismiss-proximity-alert")
    def dismiss_proximity_alert(self, request, pk=None):
        order = self.get_object()
        role = getattr(request.user, "role", None)
        if role != UserRole.SUPER_ADMIN and not user_can_manage_restaurant(request.user, order.restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        order.proximity_unpaid_alert_at = None
        order.save(update_fields=["proximity_unpaid_alert_at", "updated_at"])
        order.refresh_from_db()
        return Response(OrderSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="record-payment-success")
    def record_payment_success(self, request, pk=None):
        """Staff/owner records counter cash or QR/UPI settlement; supports partial installments with audit rows."""
        order = self.get_object()
        role = getattr(request.user, "role", None)
        if role != UserRole.SUPER_ADMIN and not user_can_manage_restaurant(request.user, order.restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        if order.status == OrderStatus.REJECTED:
            return Response({"detail": "Rejected orders cannot be marked paid."}, status=status.HTTP_400_BAD_REQUEST)
        if order.payment_status == PaymentStatus.SUCCESS:
            return Response({"detail": "Payment is already recorded as successful."}, status=status.HTTP_400_BAD_REQUEST)

        channel_raw = (request.data.get("channel") if isinstance(request.data, dict) else None) or "cash"
        channel = str(channel_raw).strip().lower()
        if channel not in ("cash", "qr"):
            return Response({"detail": "channel must be cash or qr."}, status=status.HTTP_400_BAD_REQUEST)
        staff_channel = StaffPaymentChannel.CASH if channel == "cash" else StaffPaymentChannel.QR

        total = order.total if order.total is not None else Decimal("0.00")
        paid_so_far = order.amount_paid if order.amount_paid is not None else Decimal("0.00")
        remaining = (total - paid_so_far).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if remaining <= 0:
            return Response({"detail": "Nothing due on this order."}, status=status.HTTP_400_BAD_REQUEST)

        amount_raw = request.data.get("amount") if isinstance(request.data, dict) else None
        if amount_raw is None or amount_raw == "":
            pay_input = remaining
        else:
            try:
                pay_input = Decimal(str(amount_raw)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            except (InvalidOperation, TypeError, ValueError):
                return Response({"detail": "amount must be a decimal number."}, status=status.HTTP_400_BAD_REQUEST)
            if pay_input <= 0:
                return Response({"detail": "amount must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)

        applied = min(pay_input, remaining)
        actor = request.user if getattr(request.user, "is_authenticated", False) else None

        OrderStaffPaymentRecord.objects.create(
            order=order,
            amount=applied,
            channel=staff_channel,
            recorded_by=actor,
        )

        new_paid = (paid_so_far + applied).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        order.amount_paid = new_paid

        update_fields = ["amount_paid", "payment_status", "updated_at"]
        if new_paid >= total:
            order.payment_status = PaymentStatus.SUCCESS
            order.payment_method = PaymentMethod.CASH if channel == "cash" else PaymentMethod.QR
            update_fields.append("payment_method")
        else:
            order.payment_status = PaymentStatus.PARTIAL

        order.save(update_fields=update_fields)
        order.refresh_from_db()
        if order.payment_status == PaymentStatus.SUCCESS:
            attach_order_bill_image(order)
            order.refresh_from_db()
        return Response(OrderSerializer(order, context={"request": request}).data)

    @action(
        detail=False,
        methods=["post"],
        url_path="scan-bill-item",
        parser_classes=(MultiPartParser, FormParser, JSONParser),
    )
    def scan_bill_item(self, request):
        """
        Optional OpenAI vision + menu matching for the payment counter (multipart: ``image`` + ``restaurant_id``).
        """
        rid = request.POST.get("restaurant_id")
        if rid in (None, ""):
            rid = request.data.get("restaurant_id") if isinstance(request.data, dict) else None
        if not rid:
            return Response({"detail": "restaurant_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            restaurant_id = int(rid)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid restaurant_id."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            restaurant = Restaurant.objects.get(pk=restaurant_id)
        except Restaurant.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _payment_counter_may_access_restaurant(request.user, restaurant):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        up = request.FILES.get("image")
        if not up:
            return Response({"detail": "image file is required (multipart field 'image')."}, status=status.HTTP_400_BAD_REQUEST)
        data = up.read(10 * 1024 * 1024)
        if not data or len(data) < 20:
            return Response({"detail": "Image is empty or too small."}, status=status.HTTP_400_BAD_REQUEST)
        ct = getattr(up, "content_type", None) or "image/jpeg"
        out = scan_bill_item_from_image(
            image_bytes=data,
            content_type=ct,
            restaurant_id=restaurant.id,
        )
        return Response(out, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="add-bill-line")
    def add_bill_line(self, request, pk=None):
        order = self.get_object()
        try:
            restaurant = order.restaurant
        except Exception:  # noqa: BLE001
            restaurant = Restaurant.objects.get(pk=order.restaurant_id)
        if not _payment_counter_may_access_restaurant(request.user, restaurant):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        ser = AddBillLineSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        product_item_id = d.get("product_item_id")
        if product_item_id in ("",):
            product_item_id = None
        try:
            add_cashier_line_to_order(
                order=order,
                restaurant=restaurant,
                product_item_id=product_item_id,
                ad_hoc_label=d.get("ad_hoc_label") or "",
                unit_price=d.get("unit_price"),
                quantity=d["quantity"],
            )
        except ServiceValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        order.refresh_from_db()
        order = (
            Order.objects.filter(pk=order.pk)
            .select_related("restaurant", "customer", "table", "waiter")
            .prefetch_related(_ORDER_ITEMS_PREFETCH, _ORDER_STAFF_PAYMENTS_PREFETCH)
            .get()
        )
        return Response(OrderSerializer(order, context={"request": request}).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="customer-order-history")
    def customer_order_history(self, request):
        """Past orders for a customer at a restaurant (registered user or guest phone); staff/owner only."""
        rid = request.query_params.get("restaurant_id")
        if not rid:
            return Response({"detail": "restaurant_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            restaurant_id = int(rid)
        except ValueError:
            return Response({"detail": "Invalid restaurant_id."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            restaurant = Restaurant.objects.get(pk=restaurant_id)
        except Restaurant.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        role = getattr(user, "role", None)
        if role == UserRole.SUPER_ADMIN:
            pass
        elif role == UserRole.OWNER:
            if restaurant.user_id != user.id:
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        elif role == UserRole.STAFF:
            if not Staff.objects.filter(user=user, restaurant_id=restaurant_id).exists():
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
            if portal_role_for_user(user) == "waiter":
                return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        else:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        customer_id = request.query_params.get("customer")
        guest_phone = (request.query_params.get("guest_phone") or "").strip()

        if customer_id not in (None, ""):
            try:
                cid = int(customer_id)
            except ValueError:
                return Response({"detail": "Invalid customer id."}, status=status.HTTP_400_BAD_REQUEST)
            base = Order.objects.filter(restaurant_id=restaurant_id, customer_id=cid)
        elif guest_phone:
            base = Order.objects.filter(
                restaurant_id=restaurant_id,
                customer__isnull=True,
                guest_customer_phone__iexact=guest_phone,
            )
        else:
            return Response(
                {"detail": "customer or guest_phone is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = (
            base.select_related("restaurant", "customer", "table", "waiter")
            .prefetch_related(_ORDER_ITEMS_PREFETCH, _ORDER_STAFF_PAYMENTS_PREFETCH)
            .order_by("-created_at")
        )
        return Response(OrderSerializer(qs, many=True, context={"request": request}).data)


class PurchaseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Purchase.objects.all().select_related("restaurant", "supplier").prefetch_related("items")
    serializer_class = PurchaseSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Purchase.objects.all().select_related("restaurant", "supplier").prefetch_related("items")
        user = self.request.user
        role = getattr(user, "role", None)
        if role == UserRole.SUPER_ADMIN:
            pass
        elif role == UserRole.OWNER:
            qs = qs.filter(restaurant__user=user)
        elif role == UserRole.STAFF:
            if portal_role_for_user(user) == "waiter":
                return Purchase.objects.none()
            qs = qs.filter(restaurant_id__in=Staff.objects.filter(user=user).values("restaurant_id"))
        else:
            return Purchase.objects.none()
        rid = self.request.query_params.get("restaurant_id")
        if rid:
            qs = qs.filter(restaurant_id=rid)
        return qs

    def _parse_items(self, items_payload, restaurant_id: int):
        if not isinstance(items_payload, list) or len(items_payload) == 0:
            return None, Response({"detail": "items must be a non-empty array."}, status=status.HTTP_400_BAD_REQUEST)
        from decimal import Decimal
        from core.models import RawMaterial

        items = []
        subtotal = Decimal("0.00")
        for idx, row in enumerate(items_payload):
            if not isinstance(row, dict):
                return None, Response(
                    {"detail": f"items[{idx}] must be an object."}, status=status.HTTP_400_BAD_REQUEST
                )
            try:
                rm_id = int(row.get("raw_material"))
            except (TypeError, ValueError):
                return None, Response(
                    {"detail": f"items[{idx}].raw_material is required."}, status=status.HTTP_400_BAD_REQUEST
                )
            try:
                raw_material = RawMaterial.objects.get(pk=rm_id, restaurant_id=restaurant_id)
            except RawMaterial.DoesNotExist:
                return None, Response(
                    {"detail": f"items[{idx}] has invalid raw_material."}, status=status.HTTP_400_BAD_REQUEST
                )
            try:
                price = Decimal(str(row.get("price", "0")))
                quantity = Decimal(str(row.get("quantity", "0")))
            except Exception:
                return None, Response(
                    {"detail": f"items[{idx}] price/quantity must be valid numbers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if price < 0 or quantity <= 0:
                return None, Response(
                    {"detail": f"items[{idx}] price must be >= 0 and quantity must be > 0."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            total = price * quantity
            subtotal += total
            items.append(
                {
                    "raw_material": raw_material,
                    "price": price,
                    "quantity": quantity,
                    "total": total,
                }
            )
        return {"items": items, "subtotal": subtotal}, None

    def create(self, request, *args, **kwargs):
        from decimal import Decimal
        from core.models import DiscountType, PurchaseItem, Supplier
        from core.services import apply_discount_to_subtotal

        raw_restaurant = request.data.get("restaurant")
        if raw_restaurant not in (None, ""):
            try:
                restaurant_id = int(raw_restaurant)
            except (TypeError, ValueError):
                return Response({"detail": "Invalid restaurant."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            try:
                restaurant_id = int(request.query_params.get("restaurant_id"))
            except (TypeError, ValueError):
                return Response({"detail": "restaurant_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not user_can_manage_restaurant(request.user, restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        supplier = None
        raw_supplier = request.data.get("supplier")
        if raw_supplier not in (None, ""):
            try:
                supplier = Supplier.objects.get(pk=int(raw_supplier), restaurant_id=restaurant_id)
            except (ValueError, Supplier.DoesNotExist):
                return Response({"detail": "Invalid supplier."}, status=status.HTTP_400_BAD_REQUEST)

        discount_type = (request.data.get("discount_type") or DiscountType.FLAT).strip()
        if discount_type not in (DiscountType.FLAT, DiscountType.PERCENTAGE):
            return Response({"detail": "Invalid discount_type."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            discount = Decimal(str(request.data.get("discount", "0")))
        except Exception:
            return Response({"detail": "Invalid discount."}, status=status.HTTP_400_BAD_REQUEST)
        if discount < 0:
            return Response({"detail": "discount must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)

        parsed, err = self._parse_items(request.data.get("items"), restaurant_id)
        if err:
            return err

        purchase = Purchase.objects.create(
            restaurant_id=restaurant_id,
            supplier=supplier,
            discount_type=discount_type,
            discount=discount,
            subtotal=parsed["subtotal"],
            total=apply_discount_to_subtotal(parsed["subtotal"], discount_type, discount),
        )
        PurchaseItem.objects.bulk_create(
            [
                PurchaseItem(
                    purchase=purchase,
                    raw_material=item["raw_material"],
                    price=item["price"],
                    quantity=item["quantity"],
                    total=item["total"],
                )
                for item in parsed["items"]
            ]
        )
        purchase.refresh_from_db()
        return Response(PurchaseSerializer(purchase, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        from decimal import Decimal
        from django.db import transaction
        from core.models import DiscountType, PurchaseItem, Supplier
        from core.services import apply_discount_to_subtotal

        purchase = self.get_object()
        if not user_can_manage_restaurant(request.user, purchase.restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        if "restaurant" in request.data:
            raw_rid = request.data.get("restaurant")
            try:
                new_restaurant_id = int(raw_rid) if raw_rid not in (None, "") else purchase.restaurant_id
            except (TypeError, ValueError):
                return Response({"detail": "Invalid restaurant."}, status=status.HTTP_400_BAD_REQUEST)
            if new_restaurant_id != purchase.restaurant_id:
                if StockLog.objects.filter(purchase=purchase, type=StockLogType.IN).exists():
                    return Response(
                        {"detail": "Cannot change restaurant after this purchase is posted to stock."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if not user_can_manage_restaurant(request.user, new_restaurant_id):
                    return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
                purchase.restaurant_id = new_restaurant_id

        if "supplier" in request.data:
            raw_supplier = request.data.get("supplier")
            if raw_supplier in (None, ""):
                purchase.supplier = None
            else:
                try:
                    purchase.supplier = Supplier.objects.get(
                        pk=int(raw_supplier), restaurant_id=purchase.restaurant_id
                    )
                except (ValueError, Supplier.DoesNotExist):
                    return Response({"detail": "Invalid supplier."}, status=status.HTTP_400_BAD_REQUEST)
        if "discount_type" in request.data:
            discount_type = (request.data.get("discount_type") or "").strip()
            if discount_type not in (DiscountType.FLAT, DiscountType.PERCENTAGE):
                return Response({"detail": "Invalid discount_type."}, status=status.HTTP_400_BAD_REQUEST)
            purchase.discount_type = discount_type
        if "discount" in request.data:
            try:
                purchase.discount = Decimal(str(request.data.get("discount")))
            except Exception:
                return Response({"detail": "Invalid discount."}, status=status.HTTP_400_BAD_REQUEST)
            if purchase.discount < 0:
                return Response({"detail": "discount must be non-negative."}, status=status.HTTP_400_BAD_REQUEST)

        parsed = None
        if "items" in request.data:
            parsed, err = self._parse_items(request.data.get("items"), purchase.restaurant_id)
            if err:
                return err

        with transaction.atomic():
            if parsed is not None:
                PurchaseItem.objects.filter(purchase=purchase).delete()
                PurchaseItem.objects.bulk_create(
                    [
                        PurchaseItem(
                            purchase=purchase,
                            raw_material=item["raw_material"],
                            price=item["price"],
                            quantity=item["quantity"],
                            total=item["total"],
                        )
                        for item in parsed["items"]
                    ]
                )
                purchase.subtotal = parsed["subtotal"]
            purchase.total = apply_discount_to_subtotal(
                purchase.subtotal,
                purchase.discount_type,
                purchase.discount,
            )
            purchase.save()

        purchase.refresh_from_db()
        return Response(PurchaseSerializer(purchase, context={"request": request}).data)

    def destroy(self, request, *args, **kwargs):
        purchase = self.get_object()
        if not user_can_manage_restaurant(request.user, purchase.restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        purchase.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="finalize")
    def finalize(self, request, pk=None):
        purchase = self.get_object()
        if not user_can_manage_restaurant(request.user, purchase.restaurant_id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        try:
            finalize_purchase(purchase)
        except AlreadyPostedError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        purchase.refresh_from_db()
        return Response(PurchaseSerializer(purchase, context={"request": request}).data)


class ShareholderWithdrawalViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ShareholderWithdrawal.objects.all().select_related("user")
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = ShareholderWithdrawal.objects.all().select_related("user")
        user = self.request.user
        role = getattr(user, "role", None)
        if role == UserRole.SUPER_ADMIN:
            return qs
        if getattr(user, "is_shareholder", False):
            return qs.filter(user=user)
        return ShareholderWithdrawal.objects.none()

    def get_serializer_class(self):
        if self.action == "create":
            return ShareholderWithdrawalCreateSerializer
        return ShareholderWithdrawalSerializer

    def create(self, request, *args, **kwargs):
        ser = ShareholderWithdrawalCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.validated_data.get("user")
        if user is None and getattr(request.user, "is_authenticated", False):
            user = request.user
        if user is None:
            return Response(
                {"detail": "Provide `user` or authenticate as the requesting shareholder."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            w = request_shareholder_withdrawal(user, ser.validated_data["amount"], remarks=ser.validated_data["remarks"])
        except ServiceValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            ShareholderWithdrawalSerializer(w, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        if getattr(request.user, "role", None) != UserRole.SUPER_ADMIN:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        w = self.get_object()
        restaurant = None
        raw_rid = request.data.get("restaurant_id", request.data.get("restaurant"))
        if raw_rid is not None and raw_rid != "":
            try:
                rid = int(raw_rid)
            except (TypeError, ValueError):
                return Response({"detail": "restaurant_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)
            restaurant = Restaurant.objects.filter(pk=rid).first()
            if restaurant is None:
                return Response({"detail": "Invalid restaurant_id."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            approve_shareholder_withdrawal(w, restaurant=restaurant)
        except ServiceValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        w.refresh_from_db()
        return Response(ShareholderWithdrawalSerializer(w, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        if getattr(request.user, "role", None) != UserRole.SUPER_ADMIN:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
        w = self.get_object()
        ser = RejectWithdrawalSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            reject_shareholder_withdrawal(w, ser.validated_data["reason"])
        except ServiceValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        w.refresh_from_db()
        return Response(ShareholderWithdrawalSerializer(w, context={"request": request}).data)

from decimal import Decimal

from rest_framework import serializers

from core.auth.portal import parse_local_phone
from core.media_urls import absolute_media_url
from core.models import (
    Order,
    OrderItem,
    OrderStaffPaymentRecord,
    Purchase,
    PurchaseItem,
    Restaurant,
    ShareholderWithdrawal,
    Table,
    User,
)


class OrderLineWriteSerializer(serializers.Serializer):
    product_item_id = serializers.IntegerField(required=False, allow_null=True)
    comboset_id = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))

    def validate(self, data):
        pid = data.get("product_item_id")
        cid = data.get("comboset_id")
        has_pi = pid is not None
        has_cs = cid is not None
        if has_pi == has_cs:
            raise serializers.ValidationError("Each line must include exactly one of product_item_id or comboset_id.")
        return data


class OrderCreateSerializer(serializers.Serializer):
    restaurant = serializers.PrimaryKeyRelatedField(queryset=Restaurant.objects.filter(is_active=True))
    lines = OrderLineWriteSerializer(many=True)
    customer = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), allow_null=True, required=False)
    guest_customer_name = serializers.CharField(required=False, allow_blank=True, default="")
    guest_customer_phone = serializers.CharField(required=False, allow_blank=True, default="")
    table = serializers.PrimaryKeyRelatedField(queryset=Table.objects.all(), allow_null=True, required=False)
    order_type = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    latitude = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    payment_method = serializers.CharField(required=False, allow_blank=True)
    fcm_token = serializers.CharField(required=False, allow_blank=True)
    waiter = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), allow_null=True, required=False)
    people_for = serializers.IntegerField(min_value=1, default=1)
    order_discount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=Decimal("0.00")
    )

    def validate_guest_customer_phone(self, value):
        raw = (value or "").strip()
        if not raw:
            return ""
        digits, err = parse_local_phone(raw, required=True)
        if err:
            raise serializers.ValidationError(err)
        return digits or ""

    def validate(self, attrs):
        restaurant = attrs.get("restaurant")
        table = attrs.get("table")
        raw_type = attrs.get("order_type")
        if isinstance(raw_type, str):
            normalized = raw_type.strip().lower()
            attrs["order_type"] = normalized if normalized else ""
        if table is not None and restaurant is not None and table.restaurant_id != restaurant.id:
            raise serializers.ValidationError({"table": "Table must belong to the selected restaurant."})
        return attrs


class OrderItemSerializer(serializers.ModelSerializer):
    """Line totals use unit ``price`` × ``quantity``; ``line_label`` / ``line_image`` support staff UIs."""

    line_label = serializers.SerializerMethodField()
    line_image = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = (
            "id",
            "product",
            "product_item",
            "comboset",
            "price",
            "quantity",
            "total",
            "line_label",
            "line_image",
        )

    def get_line_label(self, obj):
        if getattr(obj, "ad_hoc_label", None):
            s = (obj.ad_hoc_label or "").strip()
            if s:
                return s
        if obj.comboset_id:
            return obj.comboset.name
        if obj.product_item_id:
            pi = obj.product_item
            prod = getattr(pi, "product", None)
            base = prod.name if prod is not None else "Item"
            unit = getattr(getattr(pi, "unit", None), "symbol", None) or ""
            return f"{base} ({unit})" if unit else base
        if obj.product_id:
            return obj.product.name
        return "Item"

    def get_line_image(self, obj):
        name = None
        if obj.comboset_id:
            name = self._image_storage_name(obj.comboset.image)
        elif obj.product_item_id and getattr(obj.product_item, "product_id", None):
            name = self._image_storage_name(obj.product_item.product.image)
        elif obj.product_id:
            name = self._image_storage_name(obj.product.image)
        if not name:
            return None
        request = self.context.get("request")
        if not request:
            return name
        return absolute_media_url(request, name)

    @staticmethod
    def _image_storage_name(fieldfile):
        if not fieldfile:
            return None
        name = getattr(fieldfile, "name", "") or ""
        return name or None


class OrderStaffPaymentRecordSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OrderStaffPaymentRecord
        fields = ("id", "amount", "channel", "recorded_by", "recorded_by_name", "created_at")

    def get_recorded_by_name(self, obj):
        u = getattr(obj, "recorded_by", None)
        return u.name if u is not None else None


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    staff_payment_records = OrderStaffPaymentRecordSerializer(many=True, read_only=True)
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    table_name = serializers.SerializerMethodField()
    table_image = serializers.SerializerMethodField()
    bill_available = serializers.SerializerMethodField()
    amount_remaining = serializers.SerializerMethodField()
    service_charge = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id",
            "order_id",
            "customer",
            "customer_name",
            "customer_phone",
            "guest_customer_name",
            "guest_customer_phone",
            "restaurant",
            "restaurant_name",
            "table",
            "table_name",
            "table_image",
            "order_type",
            "address",
            "latitude",
            "longitude",
            "last_reported_latitude",
            "last_reported_longitude",
            "last_reported_at",
            "proximity_unpaid_alert_at",
            "waiting_pickup_at",
            "status",
            "payment_status",
            "payment_method",
            "amount_paid",
            "amount_remaining",
            "fcm_token",
            "waiter",
            "people_for",
            "sub_total",
            "discount",
            "service_charge",
            "delivery_fee",
            "total",
            "reject_reason",
            "bill_available",
            "items",
            "staff_payment_records",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("order_id", "sub_total", "total", "amount_paid")

    def get_service_charge(self, obj):
        sub_total = obj.sub_total if obj.sub_total is not None else Decimal("0.00")
        discount = obj.discount if obj.discount is not None else Decimal("0.00")
        delivery_fee = obj.delivery_fee if obj.delivery_fee is not None else Decimal("0.00")
        total = obj.total if obj.total is not None else Decimal("0.00")
        before_service_charge = max(Decimal("0.00"), sub_total - discount) + delivery_fee
        service_charge = total - before_service_charge
        if service_charge < 0:
            service_charge = Decimal("0.00")
        return str(service_charge.quantize(Decimal("0.01")))

    def get_amount_remaining(self, obj):
        total = obj.total if obj.total is not None else Decimal("0.00")
        paid = obj.amount_paid if obj.amount_paid is not None else Decimal("0.00")
        rem = total - paid
        if rem < 0:
            rem = Decimal("0.00")
        return str(rem.quantize(Decimal("0.01")))

    def get_bill_available(self, obj):
        return bool(getattr(obj, "bill_image", None) and obj.bill_image.name)

    def get_customer_name(self, obj):
        if obj.customer_id:
            return obj.customer.name
        return None

    def get_customer_phone(self, obj):
        if obj.customer_id:
            return obj.customer.phone
        return None

    def get_table_name(self, obj):
        if obj.table_id:
            return obj.table.name
        return None

    def get_table_image(self, obj):
        if not obj.table_id:
            return None
        table = obj.table
        if not table or not getattr(table, "image", None) or not table.image:
            return None
        request = self.context.get("request")
        if not request:
            return None
        name = getattr(table.image, "name", "") or ""
        if not name:
            return None
        return absolute_media_url(request, name)


class AddBillLineSerializer(serializers.Serializer):
    """
    Add a line from catalog (``product_item_id``) or ad-hoc (``ad_hoc_label`` + ``unit_price``) at the counter.
    """

    product_item_id = serializers.IntegerField(required=False, allow_null=True)
    ad_hoc_label = serializers.CharField(required=False, allow_blank=True, default="")
    unit_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00"), required=False, allow_null=True
    )
    quantity = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal("0.01"), default=Decimal("1.00")
    )

    def validate(self, attrs):
        pid = attrs.get("product_item_id")
        if pid is not None:
            return attrs
        if not (attrs.get("ad_hoc_label") or "").strip():
            raise serializers.ValidationError("Provide product_item_id or a non-empty ad_hoc label.")
        if attrs.get("unit_price") is None:
            raise serializers.ValidationError("unit_price is required for ad-hoc lines.")
        return attrs


class OrderStatusSerializer(serializers.Serializer):
    status = serializers.CharField()
    reject_reason = serializers.CharField(required=False, allow_blank=True, default="")
    consume_inventory_when_ready = serializers.BooleanField(default=True)

    def validate(self, attrs):
        if attrs.get("status") == "rejected":
            reason = (attrs.get("reject_reason") or "").strip()
            if not reason:
                raise serializers.ValidationError(
                    {"reject_reason": "A reason is required when rejecting an order."},
                )
            attrs["reject_reason"] = reason
        return attrs


class PurchaseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseItem
        fields = ("id", "raw_material", "purchase", "price", "quantity", "total")


class PurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Purchase
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "supplier",
            "purchase_id",
            "subtotal",
            "discount_type",
            "discount",
            "total",
            "items",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("purchase_id", "subtotal", "total")


class ShareholderWithdrawalSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareholderWithdrawal
        fields = ("id", "user", "amount", "status", "reject_reason", "remarks", "created_at", "updated_at")


class ShareholderWithdrawalCreateSerializer(serializers.Serializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    remarks = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True, min_length=1)


class RejectWithdrawalSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)

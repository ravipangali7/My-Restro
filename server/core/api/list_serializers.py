from decimal import Decimal

from rest_framework import serializers

from core.models import (
    BulkNotification,
    Category,
    ComboSet,
    Expense,
    Ledger,
    Product,
    ProductItem,
    ProductRawMaterial,
    RawMaterial,
    Restaurant,
    Staff,
    StockLog,
    SuperSetting,
    Supplier,
    Table,
    Transaction,
    TransactionCategory,
    TransactionType,
    Unit,
    User,
    UserRole,
)


class RestaurantListSerializer(serializers.ModelSerializer):
    reference_distance_m = serializers.SerializerMethodField()
    effective_per_transaction_fee = serializers.SerializerMethodField()

    class Meta:
        model = Restaurant
        fields = (
            "id",
            "user",
            "slug",
            "name",
            "phone",
            "logo",
            "address",
            "latitude",
            "longitude",
            "reference_latitude",
            "reference_longitude",
            "reference_distance_m",
            "proximity_alert_radius_m",
            "due_balance",
            "subscription_start",
            "subscription_end",
            "is_open",
            "is_active",
            "per_transaction_fee",
            "effective_per_transaction_fee",
            "can_delivery",
            "delivery_fee_per_km",
            "delivery_radius_km",
            "created_at",
            "updated_at",
        )

    def get_effective_per_transaction_fee(self, obj: Restaurant):
        from core.services.transactions import effective_per_transaction_fee

        return effective_per_transaction_fee(obj)

    def get_reference_distance_m(self, obj: Restaurant):
        if obj.latitude is None or obj.longitude is None:
            return None
        if obj.reference_latitude is None or obj.reference_longitude is None:
            return None
        from core.services.geo import haversine_distance_m

        return round(
            haversine_distance_m(obj.latitude, obj.longitude, obj.reference_latitude, obj.reference_longitude),
            2,
        )


class CategoryListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Category
        fields = ("id", "restaurant", "restaurant_name", "name", "image", "parent", "is_active")


class ProductListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Product
        fields = ("id", "restaurant", "restaurant_name", "category", "name", "image", "is_veg", "is_active")


class ProductItemListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductItem
        fields = ("id", "product", "unit", "price", "discount_type", "discount", "is_active")


class UnitListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Unit
        fields = ("id", "restaurant", "restaurant_name", "name", "symbol")


class TableListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Table
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "name",
            "capacity",
            "floor",
            "near_by",
            "notes",
            "image",
            "latitude",
            "longitude",
            "is_active",
        )


class SupplierListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Supplier
        fields = ("id", "restaurant", "restaurant_name", "name", "phone", "image", "is_active")


class RawMaterialListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = RawMaterial
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "supplier",
            "unit",
            "name",
            "price",
            "stock",
            "min_stock",
            "is_active",
        )


class ExpenseListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Expense
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "expense_id",
            "category",
            "particular",
            "expense_date",
            "amount",
            "created_at",
        )


class TransactionListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)
    effective_per_transaction_fee = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "amount",
            "payment_status",
            "remarks",
            "transaction_type",
            "category",
            "ledger",
            "is_system",
            "created_at",
            "effective_per_transaction_fee",
        )

    def get_effective_per_transaction_fee(self, obj):
        """Venue-specific fee when set; otherwise the platform default (same rule as billing)."""
        platform_ptf = self.context.get("platform_ptf")
        r_fee = obj.restaurant.per_transaction_fee or Decimal("0.00")
        if r_fee > 0:
            return r_fee
        if platform_ptf is not None:
            return platform_ptf or Decimal("0.00")
        from core.services.transactions import effective_per_transaction_fee

        return effective_per_transaction_fee(obj.restaurant)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Venue register stores due settlement as OUT (cash leaving the restaurant). For the
        # platform register (super-admin list, shareholder_self), the same movement is IN to the platform pool.
        if self.context.get("platform_register") and instance.category == TransactionCategory.DUE_PAID:
            if data.get("transaction_type") == TransactionType.OUT:
                data["transaction_type"] = TransactionType.IN
        return data


class LedgerListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Ledger
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "party_type",
            "party_id",
            "particular",
            "amount",
            "type",
            "created_at",
        )


class StockLogListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = StockLog
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "raw_material",
            "type",
            "quantity",
            "purchase",
            "purchase_item",
            "order",
            "order_item",
            "created_at",
        )


class ComboSetListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)
    products = serializers.SerializerMethodField()
    total_product_price = serializers.SerializerMethodField()

    class Meta:
        model = ComboSet
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "name",
            "image",
            "description",
            "price",
            "discount_type",
            "discount",
            "total_product_price",
            "is_active",
            "products",
        )

    def get_products(self, obj):
        return list(obj.products.values_list("id", flat=True))

    def get_total_product_price(self, obj):
        total = 0
        for product in obj.products.all():
            best_item = product.items.order_by("price").first()
            if best_item is not None:
                total += best_item.discounted_price
        return total


class StaffListSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.name", read_only=True)
    user_phone = serializers.CharField(source="user.phone", read_only=True)
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Staff
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "user",
            "user_name",
            "user_phone",
            "role",
            "joined_at",
            "salary",
            "salary_per_day",
            "is_suspend",
        )


class UserListSerializer(serializers.ModelSerializer):
    """Includes `staff_placements` for users with role staff (waiter/cashier/kitchen per restaurant)."""

    staff_placements = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "phone",
            "name",
            "role",
            "is_shareholder",
            "share_percentage",
            "balance",
            "due_balance",
            "is_active",
            "image",
            "staff_placements",
        )

    def get_staff_placements(self, obj: User):
        if obj.role != UserRole.STAFF:
            return []
        cache = getattr(obj, "_prefetched_objects_cache", None)
        if cache and "staff_profiles" in cache:
            profiles = list(obj.staff_profiles.all())
        else:
            profiles = list(obj.staff_profiles.select_related("restaurant").all())
        return [
            {
                "restaurant_id": p.restaurant_id,
                "restaurant_name": p.restaurant.name,
                "staff_role": p.role,
            }
            for p in profiles
        ]


class SuperSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SuperSetting
        fields = (
            "id",
            "subscription_fee_per_month",
            "per_transaction_fee",
            "due_threshold",
            "sms_per_usage",
            "balance",
            "due_payment_qr",
            "created_at",
            "updated_at",
        )


class SuperSettingUpdateSerializer(serializers.ModelSerializer):
    """Editable platform fields (not balance — updated by ledger / accounting flows)."""

    class Meta:
        model = SuperSetting
        fields = (
            "subscription_fee_per_month",
            "per_transaction_fee",
            "due_threshold",
            "sms_per_usage",
            "due_payment_qr",
        )


class PlatformDefaultSerializer(serializers.ModelSerializer):
    """Public (authenticated) pricing defaults — excludes balance and ids."""

    class Meta:
        model = SuperSetting
        fields = (
            "subscription_fee_per_month",
            "per_transaction_fee",
            "due_threshold",
            "sms_per_usage",
            "due_payment_qr",
        )


class BulkNotificationListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.SerializerMethodField()

    class Meta:
        model = BulkNotification
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "title",
            "message",
            "link",
            "receivers",
            "image",
            "type",
            "created_at",
        )

    def get_restaurant_name(self, obj: BulkNotification):
        if obj.restaurant_id is None:
            return "Platform"
        return obj.restaurant.name


class ProductRawMaterialListSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = ProductRawMaterial
        fields = (
            "id",
            "restaurant",
            "restaurant_name",
            "product",
            "product_item",
            "raw_material",
            "raw_material_quantity",
        )

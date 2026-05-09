from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.db.models import Prefetch
from django.utils.html import format_html

from . import models


def image_tag(image_field):
    if image_field:
        return format_html(
            '<img src="{}" style="height:52px;width:52px;border-radius:8px;object-fit:cover;" />',
            image_field.url,
        )
    return "-"


class BaseAdmin(admin.ModelAdmin):
    list_per_page = 25
    date_hierarchy = "created_at"
    ordering = ("-created_at",)


class ProductItemInline(admin.StackedInline):
    model = models.ProductItem
    extra = 0
    show_change_link = True


class ProductRawMaterialInline(admin.StackedInline):
    model = models.ProductRawMaterial
    extra = 0
    autocomplete_fields = ("raw_material",)
    show_change_link = True


class OrderItemInline(admin.StackedInline):
    model = models.OrderItem
    extra = 0
    autocomplete_fields = ("product", "product_item", "comboset")


class PurchaseItemInline(admin.StackedInline):
    model = models.PurchaseItem
    extra = 0
    autocomplete_fields = ("raw_material",)


@admin.register(models.User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("-created_at",)
    list_display = (
        "id",
        "avatar",
        "name",
        "phone",
        "role",
        "staff_type_and_restaurant",
        "is_superadmin",
        "is_shareholder",
        "share_percentage",
        "balance",
        "due_balance",
        "is_staff",
        "is_active",
        "last_login",
    )
    search_fields = ("name", "phone")
    list_filter = ("role", "is_shareholder", "is_staff", "is_active", "created_at")
    readonly_fields = ("last_login", "created_at", "updated_at", "avatar", "is_superadmin")
    fieldsets = (
        (
            "Identity",
            {"fields": ("phone", "name", "role", "image", "avatar", "password")},
        ),
        (
            "Financial",
            {"fields": ("balance", "due_balance", "is_shareholder", "share_percentage")},
        ),
        ("Push", {"fields": ("fcm_token",)}),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superadmin",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Timestamps", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("phone", "name", "role", "password1", "password2", "is_active", "is_staff"),
            },
        ),
    )

    def avatar(self, obj):
        return image_tag(obj.image)

    avatar.short_description = "Image"

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.prefetch_related(
            Prefetch(
                "staff_profiles",
                queryset=models.Staff.objects.select_related("restaurant"),
            ),
            Prefetch("restaurants", queryset=models.Restaurant.objects.only("id", "name", "user_id")),
        )

    def staff_type_and_restaurant(self, obj):
        if obj.role == models.UserRole.STAFF:
            parts = []
            for p in obj.staff_profiles.all():
                parts.append(f"{p.get_role_display()} @ {p.restaurant.name}")
            return " · ".join(parts) if parts else "Staff (no placement)"
        if obj.role == models.UserRole.OWNER:
            names = [r.name for r in obj.restaurants.all()[:5]]
            if not names:
                return "Owner (no restaurant)"
            extra = obj.restaurants.count() - len(names)
            s = ", ".join(names)
            if extra > 0:
                s += f" (+{extra} more)"
            return f"Owner: {s}"
        return "—"

    staff_type_and_restaurant.short_description = "Staff type / restaurant"

    def is_superadmin(self, obj):
        if not obj or not getattr(obj, "pk", None):
            return False
        return obj.role == models.UserRole.SUPER_ADMIN

    is_superadmin.boolean = True
    is_superadmin.short_description = "Super admin"

    def save_model(self, request, obj, form, change):
        if obj.role == models.UserRole.SUPER_ADMIN:
            obj.is_staff = True
            obj.is_superuser = True
        else:
            obj.is_staff = False
            obj.is_superuser = False
        super().save_model(request, obj, form, change)


@admin.register(models.Otp)
class OtpAdmin(BaseAdmin):
    list_display = ("id", "phone", "purpose", "otp", "is_used", "created_at")
    search_fields = ("phone", "purpose", "otp")
    list_filter = ("purpose", "is_used", "created_at")
    autocomplete_fields = ("user",)


@admin.register(models.Restaurant)
class RestaurantAdmin(BaseAdmin):
    list_display = (
        "id",
        "logo_preview",
        "name",
        "slug",
        "user",
        "phone",
        "is_open",
        "can_delivery",
        "delivery_radius_km",
        "due_balance",
        "per_transaction_fee",
        "subscription_start",
        "subscription_end",
    )
    search_fields = ("name", "slug", "phone", "user__name", "user__phone")
    list_filter = ("is_open", "can_delivery", "is_active", "created_at")
    autocomplete_fields = ("user",)
    readonly_fields = ("logo_preview", "created_at", "updated_at")
    fieldsets = (
        ("Basic", {"fields": ("user", "name", "slug", "phone", "address")}),
        (
            "Operations",
            {
                "fields": (
                    "is_open",
                    "can_delivery",
                    "delivery_fee_per_km",
                    "delivery_radius_km",
                    "is_active",
                    "due_balance",
                    "per_transaction_fee",
                    "subscription_start",
                    "subscription_end",
                )
            },
        ),
        (
            "Location",
            {
                "fields": (
                    "latitude",
                    "longitude",
                    "reference_latitude",
                    "reference_longitude",
                    "proximity_alert_radius_m",
                )
            },
        ),
        ("Branding", {"fields": ("logo", "logo_preview")}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    def logo_preview(self, obj):
        return image_tag(obj.logo)

    logo_preview.short_description = "Logo"


@admin.register(models.Supplier)
class SupplierAdmin(BaseAdmin):
    list_display = ("id", "image_preview", "name", "restaurant", "phone", "is_active", "created_at")
    search_fields = ("name", "phone", "restaurant__name")
    list_filter = ("restaurant", "is_active", "created_at")
    autocomplete_fields = ("restaurant",)
    readonly_fields = ("image_preview", "created_at", "updated_at")
    fieldsets = (
        ("Basic", {"fields": ("restaurant", "name", "phone", "is_active")}),
        ("Media", {"fields": ("image", "image_preview")}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    def image_preview(self, obj):
        return image_tag(obj.image)

    image_preview.short_description = "Image"


@admin.register(models.Unit)
class UnitAdmin(BaseAdmin):
    list_display = ("id", "name", "symbol", "restaurant", "created_at")
    search_fields = ("name", "symbol", "restaurant__name")
    list_filter = ("restaurant", "created_at")
    autocomplete_fields = ("restaurant",)


@admin.register(models.Category)
class CategoryAdmin(BaseAdmin):
    list_display = (
        "id",
        "image_preview",
        "name",
        "restaurant",
        "parent",
        "is_active",
        "created_at",
    )
    search_fields = ("name", "restaurant__name", "parent__name")
    list_filter = ("restaurant", "is_active", "created_at")
    autocomplete_fields = ("restaurant", "parent")
    readonly_fields = ("image_preview", "created_at", "updated_at")

    def image_preview(self, obj):
        return image_tag(obj.image)

    image_preview.short_description = "Image"


@admin.register(models.Product)
class ProductAdmin(BaseAdmin):
    list_display = (
        "id",
        "image_preview",
        "name",
        "restaurant",
        "category",
        "is_veg",
        "is_active",
        "item_count",
        "created_at",
    )
    search_fields = ("name", "restaurant__name", "category__name")
    list_filter = ("restaurant", "category", "is_veg", "is_active", "created_at")
    autocomplete_fields = ("restaurant", "category")
    inlines = (ProductItemInline,)
    readonly_fields = ("image_preview", "item_count", "created_at", "updated_at")
    fieldsets = (
        ("Basic", {"fields": ("restaurant", "category", "name", "is_veg", "is_active")}),
        ("Media", {"fields": ("image", "image_preview")}),
        ("Insights", {"fields": ("item_count",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    def image_preview(self, obj):
        return image_tag(obj.image)

    image_preview.short_description = "Image"

    def item_count(self, obj):
        return obj.items.count()


@admin.register(models.ProductItem)
class ProductItemAdmin(BaseAdmin):
    list_display = (
        "id",
        "product",
        "unit",
        "price",
        "discount_type",
        "discount",
        "discounted_price_value",
        "is_active",
        "created_at",
    )
    search_fields = ("product__name", "unit__name", "unit__symbol")
    list_filter = ("discount_type", "is_active", "product__restaurant", "created_at")
    autocomplete_fields = ("product", "unit")
    inlines = (ProductRawMaterialInline,)
    readonly_fields = ("discounted_price_value", "created_at", "updated_at")

    def discounted_price_value(self, obj):
        return obj.discounted_price

    discounted_price_value.short_description = "Discounted Price"


@admin.register(models.RawMaterial)
class RawMaterialAdmin(BaseAdmin):
    list_display = (
        "id",
        "name",
        "restaurant",
        "supplier",
        "unit",
        "price",
        "stock",
        "min_stock",
        "is_low_stock",
        "is_active",
    )
    search_fields = ("name", "restaurant__name", "supplier__name")
    list_filter = ("restaurant", "supplier", "unit", "is_active", "created_at")
    autocomplete_fields = ("restaurant", "supplier", "unit")

    def is_low_stock(self, obj):
        return obj.stock <= obj.min_stock

    is_low_stock.boolean = True
    is_low_stock.short_description = "Low Stock"


@admin.register(models.ProductRawMaterial)
class ProductRawMaterialAdmin(BaseAdmin):
    list_display = (
        "id",
        "restaurant",
        "product",
        "product_item",
        "raw_material",
        "raw_material_quantity",
        "created_at",
    )
    search_fields = ("product__name", "raw_material__name", "restaurant__name")
    list_filter = ("restaurant", "created_at")
    autocomplete_fields = ("restaurant", "product", "product_item", "raw_material")


@admin.register(models.ComboSet)
class ComboSetAdmin(BaseAdmin):
    list_display = ("id", "image_preview", "name", "restaurant", "price", "product_count", "is_active")
    search_fields = ("name", "restaurant__name")
    list_filter = ("restaurant", "is_active", "created_at")
    autocomplete_fields = ("restaurant", "products")
    filter_horizontal = ("products",)
    readonly_fields = ("image_preview", "product_count", "created_at", "updated_at")

    def image_preview(self, obj):
        return image_tag(obj.image)

    image_preview.short_description = "Image"

    def product_count(self, obj):
        return obj.products.count()


@admin.register(models.Table)
class TableAdmin(BaseAdmin):
    list_display = (
        "id",
        "image_preview",
        "name",
        "restaurant",
        "capacity",
        "floor",
        "near_by",
        "is_active",
    )
    search_fields = ("name", "floor", "near_by", "restaurant__name")
    list_filter = ("restaurant", "is_active", "floor", "created_at")
    autocomplete_fields = ("restaurant",)
    readonly_fields = ("image_preview", "created_at", "updated_at")

    def image_preview(self, obj):
        return image_tag(obj.image)

    image_preview.short_description = "Image"


@admin.register(models.Staff)
class StaffAdmin(BaseAdmin):
    list_display = (
        "id",
        "restaurant",
        "user",
        "role",
        "joined_at",
        "salary",
        "salary_per_day",
        "is_suspend",
    )
    search_fields = ("user__name", "user__phone", "restaurant__name")
    list_filter = ("restaurant", "role", "is_suspend", "joined_at")
    autocomplete_fields = ("restaurant", "user")


@admin.register(models.Order)
class OrderAdmin(BaseAdmin):
    list_display = (
        "id",
        "order_id",
        "restaurant",
        "customer",
        "table",
        "order_type",
        "status",
        "payment_status",
        "payment_method",
        "item_count",
        "sub_total",
        "discount",
        "total",
        "created_at",
    )
    search_fields = ("order_id", "restaurant__name", "customer__name", "customer__phone")
    list_filter = ("restaurant", "order_type", "status", "payment_status", "payment_method", "created_at")
    autocomplete_fields = ("restaurant", "customer", "table", "waiter")
    inlines = (OrderItemInline,)
    readonly_fields = ("item_count", "created_at", "updated_at")
    fieldsets = (
        (
            "Core",
            {
                "fields": (
                    "restaurant",
                    "order_id",
                    "customer",
                    "waiter",
                    "table",
                    "order_type",
                    "status",
                    "reject_reason",
                )
            },
        ),
        ("Payment", {"fields": ("payment_status", "payment_method", "sub_total", "discount", "delivery_fee", "total")}),
        ("Delivery", {"fields": ("address", "latitude", "longitude", "people_for", "fcm_token")}),
        ("Insights", {"fields": ("item_count",)}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    def item_count(self, obj):
        return obj.items.count()


@admin.register(models.OrderItem)
class OrderItemAdmin(BaseAdmin):
    list_display = (
        "id",
        "order",
        "product",
        "product_item",
        "comboset",
        "price",
        "quantity",
        "total",
        "created_at",
    )
    search_fields = ("order__order_id", "product__name", "comboset__name")
    list_filter = ("order__restaurant", "created_at")
    autocomplete_fields = ("order", "product", "product_item", "comboset")


@admin.register(models.Purchase)
class PurchaseAdmin(BaseAdmin):
    list_display = (
        "id",
        "purchase_id",
        "restaurant",
        "supplier",
        "subtotal",
        "discount_type",
        "discount",
        "total",
        "item_count",
        "created_at",
    )
    search_fields = ("purchase_id", "restaurant__name", "supplier__name")
    list_filter = ("restaurant", "discount_type", "created_at")
    autocomplete_fields = ("restaurant", "supplier")
    inlines = (PurchaseItemInline,)
    readonly_fields = ("item_count", "created_at", "updated_at")

    def item_count(self, obj):
        return obj.items.count()


@admin.register(models.PurchaseItem)
class PurchaseItemAdmin(BaseAdmin):
    list_display = ("id", "purchase", "raw_material", "price", "quantity", "total", "created_at")
    search_fields = ("purchase__purchase_id", "raw_material__name")
    list_filter = ("purchase__restaurant", "created_at")
    autocomplete_fields = ("purchase", "raw_material")


@admin.register(models.Expense)
class ExpenseAdmin(BaseAdmin):
    list_display = ("id", "expense_id", "restaurant", "particular", "amount", "created_at")
    search_fields = ("expense_id", "particular", "restaurant__name")
    list_filter = ("restaurant", "created_at")
    autocomplete_fields = ("restaurant",)


@admin.register(models.Ledger)
class LedgerAdmin(BaseAdmin):
    list_display = (
        "id",
        "restaurant",
        "party_type",
        "party_id",
        "particular",
        "type",
        "amount",
        "created_at",
    )
    search_fields = ("party_id", "particular", "restaurant__name")
    list_filter = ("restaurant", "party_type", "type", "created_at")
    autocomplete_fields = ("restaurant",)


@admin.register(models.Transaction)
class TransactionAdmin(BaseAdmin):
    list_display = (
        "id",
        "restaurant",
        "created_by",
        "category",
        "transaction_type",
        "payment_status",
        "amount",
        "ledger",
        "is_system",
        "created_at",
    )
    search_fields = ("remarks", "restaurant__name", "ledger__party_id")
    list_filter = ("restaurant", "payment_status", "transaction_type", "category", "is_system", "created_at")
    autocomplete_fields = ("restaurant", "ledger", "created_by")


@admin.register(models.StockLog)
class StockLogAdmin(BaseAdmin):
    list_display = (
        "id",
        "restaurant",
        "raw_material",
        "type",
        "quantity",
        "purchase",
        "order",
        "created_at",
    )
    search_fields = ("raw_material__name", "restaurant__name")
    list_filter = ("restaurant", "type", "created_at")
    autocomplete_fields = ("restaurant", "raw_material", "purchase", "purchase_item", "order", "order_item")


@admin.register(models.SuperSetting)
class SuperSettingAdmin(BaseAdmin):
    list_display = (
        "id",
        "subscription_fee_per_month",
        "per_transaction_fee",
        "due_threshold",
        "sms_per_usage",
        "balance",
        "updated_at",
    )


@admin.register(models.ShareholderWithdrawal)
class ShareholderWithdrawalAdmin(BaseAdmin):
    list_display = ("id", "user", "amount", "status", "remarks_short", "created_at")
    search_fields = ("user__name", "user__phone", "remarks")
    list_filter = ("status", "created_at")
    autocomplete_fields = ("user",)

    def remarks_short(self, obj):
        return (obj.remarks or "")[:60]


@admin.register(models.BulkNotification)
class BulkNotificationAdmin(BaseAdmin):
    list_display = (
        "id",
        "image_preview",
        "restaurant",
        "type",
        "receiver_count",
        "message_short",
        "created_at",
    )
    search_fields = ("restaurant__name", "message")
    list_filter = ("restaurant", "type", "created_at")
    autocomplete_fields = ("restaurant",)
    readonly_fields = ("image_preview", "receiver_count", "created_at", "updated_at")

    def image_preview(self, obj):
        return image_tag(obj.image)

    image_preview.short_description = "Image"

    def receiver_count(self, obj):
        return len(obj.receivers or [])

    def message_short(self, obj):
        return (obj.message or "")[:80]

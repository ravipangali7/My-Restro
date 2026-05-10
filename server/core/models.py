from decimal import Decimal
from uuid import uuid4

from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ActiveModel(models.Model):
    is_active = models.BooleanField(default=True)

    class Meta:
        abstract = True


class UserRole(models.TextChoices):
    SUPER_ADMIN = "super_admin", "Super Admin"
    OWNER = "owner", "Owner"
    STAFF = "staff", "Staff"
    CUSTOMER = "customer", "Customer"


class DiscountType(models.TextChoices):
    FLAT = "flat", "Flat"
    PERCENTAGE = "percentage", "Percentage"


class PaymentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PARTIAL = "partial", "Partial"
    SUCCESS = "success", "Success"
    FAILED = "failed", "Failed"


class PaymentMethod(models.TextChoices):
    CASH = "cash", "Cash"
    E_WALLET = "e_wallet", "E-Wallet"
    QR = "qr", "QR / UPI"


class StaffPaymentChannel(models.TextChoices):
    """How the cashier recorded a counter-side payment (distinct from customer-selected ``PaymentMethod``)."""

    CASH = "cash", "Cash"
    QR = "qr", "QR / UPI"


class OrderType(models.TextChoices):
    TABLE = "table", "Table"
    PACKING = "packing", "Packing"
    DELIVERY = "delivery", "Delivery"


class OrderStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    RUNNING = "running", "Running"
    READY = "ready", "Ready"
    WAITING_PICKUP = "waiting_pickup", "Waiting pickup"
    DELIVERED = "delivered", "Delivered"
    REJECTED = "rejected", "Rejected"


class TransactionType(models.TextChoices):
    IN = "in", "In"
    OUT = "out", "Out"


class TransactionCategory(models.TextChoices):
    TRANSACTION_FEE = "transaction_fee", "Transaction Fee"
    ORDER_PAYMENT = "order_payment", "Order Payment"
    SUBSCRIPTION_FEE = "subscription_fee", "Subscription Fee"
    SMS_USAGE = "sms_usage", "SMS Usage"
    SHARE_DISTRIBUTION = "share_distribution", "Share Distribution"
    SHARE_WITHDRAWAL = "share_withdrawal", "Share Withdrawal"
    SHARE_BALANCE_ADJUSTMENT = "share_balance_adjustment", "Share Balance Adjustment"
    DUE_PAID = "due_paid", "Due Paid"
    LEDGER_CREDIT = "ledger_credit", "Ledger Credit"
    LEDGER_DEBIT = "ledger_debit", "Ledger Debit"
    SALARY = "salary", "Salary"


class StockLogType(models.TextChoices):
    IN = "in", "In"
    OUT = "out", "Out"


class WithdrawalStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class BulkNotificationType(models.TextChoices):
    SMS = "sms", "SMS"
    PUSH = "push", "Push"


class ExpenseCategory(models.TextChoices):
    UTILITIES = "utilities", "Utilities"
    SALARY = "salary", "Salary"
    RENT = "rent", "Rent"
    MAINTENANCE = "maintenance", "Maintenance"
    MARKETING = "marketing", "Marketing"
    OTHER = "other", "Other"


class StaffRole(models.TextChoices):
    WAITER = "waiter", "Waiter"
    CASHIER = "cashier", "Cashier"
    KITCHEN = "kitchen", "Kitchen"


class LedgerPartyType(models.TextChoices):
    CUSTOMER = "customer", "Customer"
    STAFF = "staff", "Staff"
    SUPPLIER = "supplier", "Supplier"


class LedgerType(models.TextChoices):
    DEBIT = "debit", "Debit"
    CREDIT = "credit", "Credit"


class UserManager(BaseUserManager):
    def create_user(self, phone, password=None, **extra_fields):
        if not phone:
            raise ValueError("Phone is required.")
        user = self.model(phone=phone, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra_fields):
        extra_fields.setdefault("name", "Super Admin")
        extra_fields.setdefault("role", UserRole.SUPER_ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(phone, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    phone = models.CharField(max_length=32, unique=True, db_index=True)
    name = models.CharField(max_length=150)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.CUSTOMER)
    is_shareholder = models.BooleanField(default=False)
    share_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))],
    )
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    due_balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    fcm_token = models.CharField(max_length=255, blank=True)
    image = models.ImageField(upload_to="users/", blank=True, null=True)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_users",
    )

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} ({self.phone})"


class Otp(TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otps", blank=True, null=True)
    phone = models.CharField(max_length=32, db_index=True)
    otp = models.CharField(max_length=10)
    purpose = models.CharField(max_length=50)
    is_used = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.phone} - {self.purpose}"


class Restaurant(TimeStampedModel, ActiveModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="restaurants")
    slug = models.SlugField(max_length=180, unique=True, blank=True)
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    logo = models.ImageField(upload_to="restaurants/logos/", blank=True, null=True)
    address = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)
    reference_latitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)
    reference_longitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)
    proximity_alert_radius_m = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("150.00"),
        validators=[MinValueValidator(Decimal("0.10")), MaxValueValidator(Decimal("5000.00"))],
    )
    due_balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    subscription_start = models.DateField(blank=True, null=True)
    subscription_end = models.DateField(blank=True, null=True)
    is_open = models.BooleanField(default=True)
    per_transaction_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    can_delivery = models.BooleanField(default=False)
    delivery_fee_per_km = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    delivery_radius_km = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("50.00"),
        validators=[MinValueValidator(Decimal("0.10"))],
    )

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:150] or f"restaurant-{uuid4().hex[:8]}"
            slug = base
            count = 1
            while Restaurant.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{count}"
                count += 1
            self.slug = slug
        super().save(*args, **kwargs)


class Supplier(TimeStampedModel, ActiveModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="suppliers")
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True)
    image = models.ImageField(upload_to="suppliers/", blank=True, null=True)

    class Meta:
        unique_together = ("restaurant", "name")
        ordering = ("name",)

    def __str__(self):
        return self.name


class Unit(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="units")
    name = models.CharField(max_length=50)
    symbol = models.CharField(max_length=20)

    class Meta:
        unique_together = ("restaurant", "name")
        ordering = ("name",)

    def __str__(self):
        return f"{self.name} ({self.symbol})"


class Category(TimeStampedModel, ActiveModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="categories")
    name = models.CharField(max_length=120)
    image = models.ImageField(upload_to="categories/", blank=True, null=True)
    parent = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="children"
    )

    class Meta:
        unique_together = ("restaurant", "name", "parent")
        ordering = ("name",)

    def __str__(self):
        return self.name


class Product(TimeStampedModel, ActiveModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="products")
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name="products")
    name = models.CharField(max_length=150)
    image = models.ImageField(upload_to="products/", blank=True, null=True)
    is_veg = models.BooleanField(default=False)

    class Meta:
        unique_together = ("restaurant", "name")
        ordering = ("name",)

    def __str__(self):
        return self.name


class ProductItem(TimeStampedModel, ActiveModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="items")
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="product_items")
    price = models.DecimalField(max_digits=12, decimal_places=2)
    discount_type = models.CharField(
        max_length=20, choices=DiscountType.choices, default=DiscountType.FLAT, blank=True
    )
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        ordering = ("product__name", "-price")

    def __str__(self):
        return f"{self.product.name} - {self.unit.symbol}"

    @property
    def discounted_price(self):
        if self.discount_type == DiscountType.PERCENTAGE:
            return max(Decimal("0.00"), self.price - ((self.price * self.discount) / Decimal("100.00")))
        return max(Decimal("0.00"), self.price - self.discount)


class RawMaterial(TimeStampedModel, ActiveModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="raw_materials")
    supplier = models.ForeignKey(
        Supplier, on_delete=models.SET_NULL, related_name="raw_materials", blank=True, null=True
    )
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="raw_materials")
    name = models.CharField(max_length=120)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    stock = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0.000"))
    min_stock = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0.000"))

    class Meta:
        unique_together = ("restaurant", "name")
        ordering = ("name",)

    def __str__(self):
        return self.name


class ProductRawMaterial(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="product_raw_materials")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="raw_material_links")
    product_item = models.ForeignKey(
        ProductItem, on_delete=models.CASCADE, related_name="raw_material_links", blank=True, null=True
    )
    raw_material = models.ForeignKey(
        RawMaterial, on_delete=models.CASCADE, related_name="product_links"
    )
    raw_material_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0.000"))

    class Meta:
        ordering = ("product__name",)

    def __str__(self):
        return f"{self.product.name} -> {self.raw_material.name}"


class ComboSet(TimeStampedModel, ActiveModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="combo_sets")
    name = models.CharField(max_length=180)
    image = models.ImageField(upload_to="combos/", blank=True, null=True)
    description = models.TextField(blank=True)
    products = models.ManyToManyField(Product, related_name="combo_sets", blank=True)
    discount_type = models.CharField(max_length=20, choices=DiscountType.choices, default=DiscountType.FLAT)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        unique_together = ("restaurant", "name")
        ordering = ("name",)

    def __str__(self):
        return self.name


class Table(TimeStampedModel, ActiveModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="tables")
    name = models.CharField(max_length=80)
    capacity = models.PositiveIntegerField(default=1)
    floor = models.CharField(max_length=80, blank=True)
    near_by = models.CharField(max_length=150, blank=True)
    notes = models.TextField(blank=True)
    image = models.ImageField(upload_to="tables/", blank=True, null=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)

    class Meta:
        unique_together = ("restaurant", "name")
        ordering = ("name",)

    def __str__(self):
        return self.name


class Staff(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="staff_members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="staff_profiles")
    role = models.CharField(max_length=20, choices=StaffRole.choices, default=StaffRole.WAITER)
    joined_at = models.DateField(default=timezone.now)
    salary = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    salary_per_day = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    is_suspend = models.BooleanField(default=False)

    class Meta:
        unique_together = ("restaurant", "user")
        ordering = ("-joined_at",)

    def __str__(self):
        return f"{self.user.name} - {self.get_role_display()}"


class Order(TimeStampedModel):
    customer = models.ForeignKey(
        User, on_delete=models.SET_NULL, blank=True, null=True, related_name="customer_orders"
    )
    guest_customer_name = models.CharField(max_length=150, blank=True)
    guest_customer_phone = models.CharField(max_length=32, blank=True)
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="orders")
    table = models.ForeignKey(Table, on_delete=models.SET_NULL, blank=True, null=True, related_name="orders")
    order_id = models.CharField(max_length=40, unique=True, db_index=True, default="")
    order_type = models.CharField(max_length=20, choices=OrderType.choices, default=OrderType.TABLE)
    address = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)
    last_reported_latitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)
    last_reported_longitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)
    last_reported_at = models.DateTimeField(blank=True, null=True)
    proximity_unpaid_alert_at = models.DateTimeField(blank=True, null=True, db_index=True)
    waiting_pickup_at = models.DateTimeField(
        blank=True,
        null=True,
        db_index=True,
        help_text="Set when the order moves to waiting_pickup; cleared on delivery.",
    )
    status = models.CharField(max_length=20, choices=OrderStatus.choices, default=OrderStatus.PENDING)
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING
    )
    payment_method = models.CharField(
        max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH
    )
    fcm_token = models.CharField(max_length=255, blank=True)
    waiter = models.ForeignKey(
        User, on_delete=models.SET_NULL, blank=True, null=True, related_name="served_orders"
    )
    people_for = models.PositiveIntegerField(default=1)
    sub_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    delivery_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Sum of staff-recorded counter payments toward this order (partial or full).",
    )
    reject_reason = models.CharField(max_length=255, blank=True)
    bill_image = models.ImageField(upload_to="order_bills/", blank=True, null=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.order_id

    def save(self, *args, **kwargs):
        if not self.order_id:
            self.order_id = f"ORD-{timezone.now().strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)


class OrderItem(TimeStampedModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    product_item = models.ForeignKey(ProductItem, on_delete=models.SET_NULL, null=True, blank=True)
    comboset = models.ForeignKey(ComboSet, on_delete=models.SET_NULL, null=True, blank=True)
    # Counter / scan lines without a catalog product_item (e.g. camera + AI at payment desk).
    ad_hoc_label = models.CharField(max_length=200, blank=True, default="")
    price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.order.order_id} item"


class OrderStaffPaymentRecord(TimeStampedModel):
    """Audit trail for cashier-recorded payments (cash counter or QR/UPI confirmation)."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="staff_payment_records")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    channel = models.CharField(max_length=20, choices=StaffPaymentChannel.choices)
    recorded_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_staff_payment_records",
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.order.order_id} {self.channel} {self.amount}"


class Purchase(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="purchases")
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True)
    purchase_id = models.CharField(max_length=40, unique=True, db_index=True, default="")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_type = models.CharField(max_length=20, choices=DiscountType.choices, default=DiscountType.FLAT)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.purchase_id

    def save(self, *args, **kwargs):
        if not self.purchase_id:
            self.purchase_id = f"PUR-{timezone.now().strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)


class PurchaseItem(TimeStampedModel):
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.PROTECT, related_name="purchase_items")
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name="items")
    price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0.000"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.purchase.purchase_id} material"


class Expense(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="expenses")
    expense_id = models.CharField(max_length=40, unique=True, db_index=True, default="")
    category = models.CharField(max_length=40, choices=ExpenseCategory.choices, default=ExpenseCategory.OTHER)
    particular = models.CharField(max_length=255)
    expense_date = models.DateField(default=timezone.now)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.expense_id

    def save(self, *args, **kwargs):
        if not self.expense_id:
            self.expense_id = f"EXP-{timezone.now().strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
        super().save(*args, **kwargs)


class Ledger(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="ledgers")
    party_type = models.CharField(max_length=20, choices=LedgerPartyType.choices)
    party_id = models.CharField(max_length=40, db_index=True)
    particular = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    type = models.CharField(max_length=20, choices=LedgerType.choices, default=LedgerType.DEBIT)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.party_type} - {self.party_id}"


class Transaction(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="transactions")
    created_by = models.ForeignKey(
        "User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_transactions",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING
    )
    remarks = models.CharField(max_length=255, blank=True)
    transaction_type = models.CharField(
        max_length=20, choices=TransactionType.choices, default=TransactionType.OUT
    )
    category = models.CharField(max_length=40, choices=TransactionCategory.choices)
    ledger = models.ForeignKey(Ledger, on_delete=models.SET_NULL, null=True, blank=True)
    is_system = models.BooleanField(default=False)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.category} - {self.amount}"


class StockLog(TimeStampedModel):
    restaurant = models.ForeignKey(Restaurant, on_delete=models.CASCADE, related_name="stock_logs")
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.CASCADE, related_name="stock_logs")
    type = models.CharField(max_length=20, choices=StockLogType.choices)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0.000"))
    purchase = models.ForeignKey(Purchase, on_delete=models.SET_NULL, blank=True, null=True)
    purchase_item = models.ForeignKey(PurchaseItem, on_delete=models.SET_NULL, blank=True, null=True)
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, blank=True, null=True)
    order_item = models.ForeignKey(OrderItem, on_delete=models.SET_NULL, blank=True, null=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.raw_material.name} - {self.type}"


class SuperSetting(TimeStampedModel):
    subscription_fee_per_month = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    per_transaction_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    due_threshold = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    sms_per_usage = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    due_payment_qr = models.ImageField(upload_to="platform/due_qr/", blank=True, null=True)

    def __str__(self):
        return "System Setting"


class ShareholderWithdrawal(TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="withdrawals")
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    status = models.CharField(
        max_length=20, choices=WithdrawalStatus.choices, default=WithdrawalStatus.PENDING
    )
    reject_reason = models.CharField(max_length=255, blank=True)
    remarks = models.TextField(blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.user.name} - {self.amount}"


class BulkNotification(TimeStampedModel):
    restaurant = models.ForeignKey(
        Restaurant, on_delete=models.CASCADE, related_name="bulk_notifications", null=True, blank=True
    )
    title = models.CharField(max_length=200, blank=True, default="")
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True, default="")
    receivers = models.JSONField(default=list, blank=True)
    image = models.ImageField(upload_to="notifications/", blank=True, null=True)
    type = models.CharField(
        max_length=20, choices=BulkNotificationType.choices, default=BulkNotificationType.PUSH
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        if self.restaurant_id is None:
            return f"Platform - {self.type}"
        return f"{self.restaurant.name} - {self.type}"

from decimal import Decimal

from django.core.management.base import BaseCommand

from core.models import (
    Category,
    ComboSet,
    Expense,
    Ledger,
    LedgerPartyType,
    LedgerType,
    Order,
    OrderItem,
    OrderStatus,
    OrderType,
    PaymentMethod,
    PaymentStatus,
    Product,
    ProductItem,
    ProductRawMaterial,
    RawMaterial,
    Restaurant,
    Staff,
    StaffRole,
    Supplier,
    Table,
    Transaction,
    TransactionCategory,
    TransactionType,
    Unit,
    User,
    UserRole,
)


class Command(BaseCommand):
    help = "Create demo users, restaurant, and sample catalog data for MyRestro."

    def handle(self, *args, **options):
        demo_password = "demo123"

        def upsert_user(phone: str, name: str, role: str, **extra):
            u, created = User.objects.get_or_create(phone=phone, defaults={"name": name, "role": role, **extra})
            if not created:
                u.name = name
                u.role = role
                for k, v in extra.items():
                    setattr(u, k, v)
                u.save()
            u.set_password(demo_password)
            u.save()
            return u

        sa = upsert_user("9999900001", "Admin User", UserRole.SUPER_ADMIN)
        owner = upsert_user("9999900002", "Rahul Sharma", UserRole.OWNER, is_shareholder=True, share_percentage=Decimal("25.00"))
        waiter = upsert_user("9999900003", "Priya Patel", UserRole.STAFF)
        kitchen = upsert_user("9999900005", "Ravi Kumar", UserRole.STAFF)
        customer = upsert_user("9999900006", "Amit Singh", UserRole.CUSTOMER)
        shareholder = upsert_user(
            "9999900007",
            "Sita Devi",
            UserRole.CUSTOMER,
            is_shareholder=True,
            share_percentage=Decimal("15.00"),
            balance=Decimal("5000.00"),
        )

        rest, _ = Restaurant.objects.get_or_create(
            user=owner,
            name="Spice Garden",
            defaults={
                "phone": "1123456789",
                "address": "123 MG Road, Mumbai",
                "latitude": Decimal("19.0760000"),
                "longitude": Decimal("72.8777000"),
                "is_open": True,
                "can_delivery": True,
                "delivery_fee_per_km": Decimal("12.00"),
                "per_transaction_fee": Decimal("2.50"),
            },
        )
        if rest.delivery_fee_per_km == 0 and rest.can_delivery:
            rest.delivery_fee_per_km = Decimal("12.00")
            rest.save(update_fields=["delivery_fee_per_km"])

        unit_pc, _ = Unit.objects.get_or_create(restaurant=rest, name="Piece", defaults={"symbol": "pc"})
        unit_full, _ = Unit.objects.get_or_create(restaurant=rest, name="Full", defaults={"symbol": "Full"})

        cat_starters, _ = Category.objects.get_or_create(restaurant=rest, name="Starters", parent=None, defaults={"is_active": True})
        cat_main, _ = Category.objects.get_or_create(restaurant=rest, name="Main Course", parent=None, defaults={"is_active": True})

        p_tikka, _ = Product.objects.get_or_create(
            restaurant=rest,
            name="Paneer Tikka",
            defaults={"category": cat_starters, "is_veg": True, "is_active": True},
        )
        p_biryani, _ = Product.objects.get_or_create(
            restaurant=rest,
            name="Chicken Biryani",
            defaults={"category": cat_main, "is_veg": False, "is_active": True},
        )

        ProductItem.objects.get_or_create(
            product=p_tikka,
            unit=unit_full,
            defaults={
                "price": Decimal("280.00"),
                "discount_type": "percentage",
                "discount": Decimal("0.00"),
                "is_active": True,
            },
        )
        ProductItem.objects.get_or_create(
            product=p_biryani,
            unit=unit_full,
            defaults={
                "price": Decimal("300.00"),
                "discount_type": "percentage",
                "discount": Decimal("5.00"),
                "is_active": True,
            },
        )

        Table.objects.get_or_create(restaurant=rest, name="T-01", defaults={"capacity": 4, "floor": "Ground", "is_active": True})
        Table.objects.get_or_create(restaurant=rest, name="T-02", defaults={"capacity": 6, "floor": "Ground", "is_active": True})

        Staff.objects.update_or_create(
            restaurant=rest,
            user=waiter,
            defaults={"role": StaffRole.WAITER, "salary": Decimal("18000.00"), "is_suspend": False},
        )
        Staff.objects.update_or_create(
            restaurant=rest,
            user=kitchen,
            defaults={"role": StaffRole.KITCHEN, "salary": Decimal("15000.00"), "is_suspend": False},
        )

        sup, _ = Supplier.objects.get_or_create(restaurant=rest, name="Fresh Farms", defaults={"phone": "9988776655"})
        rm_chicken, _ = RawMaterial.objects.get_or_create(
            restaurant=rest,
            name="Chicken",
            defaults={"supplier": sup, "unit": unit_pc, "price": Decimal("250.00"), "stock": Decimal("15.000"), "min_stock": Decimal("5.000")},
        )

        combo, _ = ComboSet.objects.get_or_create(
            restaurant=rest,
            name="Family Feast",
            defaults={"description": "Combo meal", "price": Decimal("599.00"), "is_active": True},
        )
        combo.products.set([p_tikka, p_biryani])

        Expense.objects.get_or_create(
            restaurant=rest,
            expense_id="EXP-SEED-001",
            defaults={"particular": "Kitchen gas refill", "amount": Decimal("1200.00")},
        )

        txn, _ = Transaction.objects.get_or_create(
            restaurant=rest,
            remarks="Seed transaction",
            category=TransactionCategory.TRANSACTION_FEE,
            defaults={
                "amount": Decimal("100.00"),
                "payment_status": PaymentStatus.SUCCESS,
                "transaction_type": TransactionType.IN,
                "is_system": False,
            },
        )

        Ledger.objects.get_or_create(
            restaurant=rest,
            party_type=LedgerPartyType.CUSTOMER,
            party_id=str(customer.id),
            particular="Order payment",
            defaults={"amount": Decimal("780.00"), "type": LedgerType.CREDIT},
        )

        order, _ = Order.objects.get_or_create(
            restaurant=rest,
            order_id="ORD-SEED-001",
            defaults={
                "customer": customer,
                "order_type": OrderType.TABLE,
                "status": OrderStatus.PENDING,
                "payment_status": PaymentStatus.PENDING,
                "payment_method": PaymentMethod.CASH,
                "people_for": 2,
                "sub_total": Decimal("580.00"),
                "discount": Decimal("0.00"),
                "total": Decimal("580.00"),
            },
        )
        OrderItem.objects.get_or_create(
            order=order,
            product=p_tikka,
            product_item=ProductItem.objects.filter(product=p_tikka).first(),
            defaults={"price": Decimal("280.00"), "quantity": Decimal("2.00"), "total": Decimal("560.00")},
        )

        ProductRawMaterial.objects.get_or_create(
            restaurant=rest,
            product=p_tikka,
            raw_material=rm_chicken,
            defaults={"raw_material_quantity": Decimal("0.500")},
        )

        self.stdout.write(self.style.SUCCESS(f"Seed complete. Demo password for all users: {demo_password}"))
        self.stdout.write(f"Restaurant id={rest.id} (use VITE_RESTAURANT_ID={rest.id})")
        self.stdout.write(f"Super admin: {sa.phone} | Owner: {owner.phone} | Waiter: {waiter.phone} | Customer: {customer.phone}")

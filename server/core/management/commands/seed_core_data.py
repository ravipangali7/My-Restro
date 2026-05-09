from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from core.models import (
    Category,
    ComboSet,
    Product,
    ProductItem,
    RawMaterial,
    Restaurant,
    Staff,
    Supplier,
    SuperSetting,
    Table,
    Unit,
)


class Command(BaseCommand):
    help = "Seed important baseline restaurant data for development."

    def add_arguments(self, parser):
        parser.add_argument(
            "--phone",
            default="9800000000",
            help="Owner phone used to create/find the default restaurant owner.",
        )
        parser.add_argument(
            "--password",
            default="Owner@1234",
            help="Password for owner user (used on create only).",
        )
        parser.add_argument("--restaurant", default="MyRestro Demo", help="Restaurant name.")

    def handle(self, *args, **options):
        user_model = get_user_model()
        owner_phone = options["phone"]
        owner_password = options["password"]
        restaurant_name = options["restaurant"]

        owner, owner_created = user_model.objects.get_or_create(
            phone=owner_phone,
            defaults={
                "name": "Demo Owner",
                "role": "owner",
                "is_staff": True,
            },
        )
        if owner_created:
            owner.set_password(owner_password)
            owner.save()

        restaurant, _ = Restaurant.objects.get_or_create(
            user=owner,
            name=restaurant_name,
            defaults={
                "phone": owner_phone,
                "address": "Demo Address",
                "latitude": Decimal("20.5937000"),
                "longitude": Decimal("78.9629000"),
                "can_delivery": True,
                "delivery_fee_per_km": Decimal("10.00"),
                "is_open": True,
                "per_transaction_fee": Decimal("2.50"),
            },
        )
        patch_fields: list[str] = []
        if restaurant.latitude is None:
            restaurant.latitude = Decimal("20.5937000")
            patch_fields.append("latitude")
        if restaurant.longitude is None:
            restaurant.longitude = Decimal("78.9629000")
            patch_fields.append("longitude")
        if restaurant.delivery_fee_per_km == 0 and restaurant.can_delivery:
            restaurant.delivery_fee_per_km = Decimal("10.00")
            patch_fields.append("delivery_fee_per_km")
        if patch_fields:
            restaurant.save(update_fields=patch_fields)

        kg, _ = Unit.objects.get_or_create(restaurant=restaurant, name="Kilogram", defaults={"symbol": "kg"})
        piece, _ = Unit.objects.get_or_create(restaurant=restaurant, name="Piece", defaults={"symbol": "pc"})

        supplier, _ = Supplier.objects.get_or_create(
            restaurant=restaurant,
            name="Default Supplier",
            defaults={"phone": "9811111111"},
        )

        main_category, _ = Category.objects.get_or_create(restaurant=restaurant, name="Main Course")
        beverage_category, _ = Category.objects.get_or_create(restaurant=restaurant, name="Beverage")

        rice, _ = RawMaterial.objects.get_or_create(
            restaurant=restaurant,
            name="Rice",
            defaults={"supplier": supplier, "unit": kg, "price": Decimal("120"), "stock": Decimal("100")},
        )
        chicken, _ = RawMaterial.objects.get_or_create(
            restaurant=restaurant,
            name="Chicken",
            defaults={"supplier": supplier, "unit": kg, "price": Decimal("420"), "stock": Decimal("50")},
        )

        biryani, _ = Product.objects.get_or_create(
            restaurant=restaurant,
            name="Chicken Biryani",
            defaults={"category": main_category, "is_veg": False},
        )
        biryani_item, _ = ProductItem.objects.get_or_create(
            product=biryani,
            unit=piece,
            defaults={"price": Decimal("350"), "discount_type": "flat", "discount": Decimal("0")},
        )

        cola, _ = Product.objects.get_or_create(
            restaurant=restaurant,
            name="Cola",
            defaults={"category": beverage_category, "is_veg": True},
        )
        cola_item, _ = ProductItem.objects.get_or_create(
            product=cola,
            unit=piece,
            defaults={"price": Decimal("80"), "discount_type": "flat", "discount": Decimal("0")},
        )

        combo, created_combo = ComboSet.objects.get_or_create(
            restaurant=restaurant,
            name="Lunch Combo",
            defaults={"description": "Biryani + Cola", "price": Decimal("400")},
        )
        if created_combo:
            combo.products.add(biryani, cola)

        Table.objects.get_or_create(
            restaurant=restaurant,
            name="T1",
            defaults={"capacity": 4, "floor": "Ground"},
        )

        staff_user, staff_created = user_model.objects.get_or_create(
            phone="9800000001",
            defaults={"name": "Default Waiter", "role": "staff"},
        )
        if staff_created:
            staff_user.set_password("Staff@1234")
            staff_user.save()

        Staff.objects.get_or_create(
            restaurant=restaurant,
            user=staff_user,
            defaults={"role": "waiter", "salary": Decimal("25000"), "salary_per_day": Decimal("833.33")},
        )

        SuperSetting.objects.get_or_create(
            id=1,
            defaults={
                "subscription_fee_per_month": Decimal("1500"),
                "per_transaction_fee": Decimal("2.50"),
                "due_threshold": Decimal("10000"),
                "sms_per_usage": Decimal("0.25"),
            },
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed data ready for '{restaurant.name}' with {biryani_item} and {cola_item}. "
                f"Materials: {rice.name}, {chicken.name}."
            )
        )

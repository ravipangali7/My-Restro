from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from core.models import OrderStatus, OrderType, PaymentMethod, Product
from core.services import create_order_with_items


class Command(BaseCommand):
    help = "Seed a realistic sample order flow for a restaurant."

    def add_arguments(self, parser):
        parser.add_argument("--restaurant-id", type=int, required=True, help="Restaurant ID.")
        parser.add_argument(
            "--customer-phone",
            default="9800000002",
            help="Phone of customer to use/create.",
        )

    def handle(self, *args, **options):
        from core.models import Restaurant  # local import avoids circular init issues

        restaurant_id = options["restaurant_id"]
        customer_phone = options["customer_phone"]
        user_model = get_user_model()

        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
        except Restaurant.DoesNotExist as exc:
            raise CommandError(f"Restaurant {restaurant_id} not found.") from exc

        product = Product.objects.filter(restaurant=restaurant, is_active=True).first()
        if not product:
            raise CommandError("No active product found for this restaurant. Run seed_core_data first.")

        product_item = product.items.filter(is_active=True).first()
        if not product_item:
            raise CommandError("No active product item found. Run seed_core_data first.")

        customer, created = user_model.objects.get_or_create(
            phone=customer_phone,
            defaults={"name": "Demo Customer", "role": "customer"},
        )
        if created:
            customer.set_password("Customer@1234")
            customer.save()

        order = create_order_with_items(
            restaurant=restaurant,
            lines=[{"product_item_id": product_item.pk, "quantity": "2"}],
            customer=customer,
            order_type=OrderType.TABLE,
            payment_method=PaymentMethod.CASH,
            people_for=2,
        )
        order.status = OrderStatus.ACCEPTED
        order.save(update_fields=["status", "updated_at"])

        self.stdout.write(self.style.SUCCESS(f"Sample order created: {order.order_id}"))

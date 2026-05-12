from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import (
    BulkNotification,
    BulkNotificationType,
    Category,
    ComboSet,
    DiscountType,
    OrderStaffPaymentRecord,
    OrderStatus,
    OrderType,
    PaymentMethod,
    PaymentStatus,
    Product,
    ProductItem,
    ProductRawMaterial,
    Purchase,
    PurchaseItem,
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
    UserRole,
    WithdrawalStatus,
)
from core.services import (
    ValidationError,
    approve_shareholder_withdrawal,
    create_order_with_items,
    finalize_purchase,
    reject_shareholder_withdrawal,
    request_shareholder_withdrawal,
    transition_order_status,
)
from core.services.super_settings import get_super_setting
from core.services.pricing import apply_discount_to_subtotal


class PricingTests(TestCase):
    def test_percentage_discount(self):
        sub = Decimal("100.00")
        self.assertEqual(
            apply_discount_to_subtotal(sub, DiscountType.PERCENTAGE, Decimal("10")),
            Decimal("90.00"),
        )

    def test_flat_discount_floors_at_zero(self):
        self.assertEqual(
            apply_discount_to_subtotal(Decimal("10.00"), DiscountType.FLAT, Decimal("50")),
            Decimal("0.00"),
        )


class OrderServiceTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000000001", name="Owner", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Test Cafe")
        self.unit = Unit.objects.create(restaurant=self.restaurant, name="Piece", symbol="pc")
        self.cat = Category.objects.create(restaurant=self.restaurant, name="Food")
        self.product = Product.objects.create(restaurant=self.restaurant, category=self.cat, name="Dish")
        self.item = ProductItem.objects.create(
            product=self.product,
            unit=self.unit,
            price=Decimal("200.00"),
            discount_type=DiscountType.PERCENTAGE,
            discount=Decimal("10.00"),
        )
        self.rm = RawMaterial.objects.create(
            restaurant=self.restaurant,
            unit=self.unit,
            name="Ingredient",
            stock=Decimal("10.000"),
        )
        ProductRawMaterial.objects.create(
            restaurant=self.restaurant,
            product=self.product,
            product_item=self.item,
            raw_material=self.rm,
            raw_material_quantity=Decimal("0.100"),
        )

    def test_create_order_uses_discounted_unit_price(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "2"}],
        )
        self.assertEqual(order.status, OrderStatus.PENDING)
        self.assertEqual(order.sub_total, Decimal("360.00"))
        self.assertEqual(order.total, Decimal("360.00"))
        line = order.items.first()
        self.assertEqual(line.price, Decimal("180.00"))

    def test_service_charge_is_included_in_order_total(self):
        setting = get_super_setting()
        setting.per_transaction_fee = Decimal("10.00")
        setting.save(update_fields=["per_transaction_fee", "updated_at"])

        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )

        self.assertEqual(order.sub_total, Decimal("180.00"))
        self.assertEqual(order.total, Decimal("190.00"))

    def test_menu_offer_savings_on_discounted_line(self):
        from core.services.order_bill import _line_menu_offer_savings

        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        it = order.items.first()
        assert it is not None
        self.assertEqual(_line_menu_offer_savings(it), Decimal("20.00"))

    def test_unicode_printable_preserves_non_ascii_name(self):
        from core.services.order_bill import _unicode_printable

        self.assertEqual(_unicode_printable("राम श्रेष्ठ"), "राम श्रेष्ठ")

    def test_create_order_generates_bill_image(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        order.refresh_from_db()
        self.assertTrue(bool(order.bill_image))

    def test_ready_creates_customer_bulk_notification_with_bill_image(self):
        User = get_user_model()
        cust = User.objects.create(phone="9000000777", name="Notify Cust", role=UserRole.CUSTOMER)
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            customer=cust,
        )
        transition_order_status(order, OrderStatus.ACCEPTED)
        transition_order_status(order, OrderStatus.RUNNING)
        before = BulkNotification.objects.count()
        transition_order_status(order, OrderStatus.READY)
        self.assertEqual(BulkNotification.objects.count(), before + 1)
        n = BulkNotification.objects.order_by("-id").first()
        self.assertIsNotNone(n)
        assert n is not None
        self.assertEqual(n.receivers, [str(cust.id)])
        self.assertTrue(bool(n.image))
        self.assertIn("/customer/notifications", n.link or "")
        self.assertIn(f"n-{n.id}", n.link or "")

    def test_create_order_creates_order_payment_transaction_row(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "2"}],
        )
        tx = Transaction.objects.filter(
            restaurant=self.restaurant,
            category=TransactionCategory.ORDER_PAYMENT,
        ).first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.amount, order.total)
        self.assertEqual(tx.payment_status, order.payment_status)
        self.assertEqual(tx.transaction_type, TransactionType.IN)

    def test_ready_consumes_stock(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        transition_order_status(order, OrderStatus.READY)
        self.rm.refresh_from_db()
        self.assertEqual(self.rm.stock, Decimal("9.900"))

    def test_ready_merges_product_level_bom_with_item_specific_overrides(self):
        """
        Item-specific rows must not hide product-level ingredients that are not
        re-declared on the item recipe (base + variant). Same raw material on
        both tiers uses the item amount only (override).
        """
        User = get_user_model()
        owner = User.objects.create(phone="9000000888", name="Merge Owner", role=UserRole.OWNER)
        restaurant = Restaurant.objects.create(user=owner, name="Merge Cafe")
        unit = Unit.objects.create(restaurant=restaurant, name="kg", symbol="kg")
        cat = Category.objects.create(restaurant=restaurant, name="Noodles")
        product = Product.objects.create(restaurant=restaurant, category=cat, name="Chowmein")
        item = ProductItem.objects.create(product=product, unit=unit, price=Decimal("100.00"))
        rm_noodle = RawMaterial.objects.create(
            restaurant=restaurant, unit=unit, name="chawmin", stock=Decimal("20.000")
        )
        rm_sauce = RawMaterial.objects.create(
            restaurant=restaurant, unit=unit, name="sauce", stock=Decimal("20.000")
        )
        ProductRawMaterial.objects.create(
            restaurant=restaurant,
            product=product,
            product_item=None,
            raw_material=rm_noodle,
            raw_material_quantity=Decimal("0.080"),
        )
        ProductRawMaterial.objects.create(
            restaurant=restaurant,
            product=product,
            product_item=None,
            raw_material=rm_sauce,
            raw_material_quantity=Decimal("0.050"),
        )
        ProductRawMaterial.objects.create(
            restaurant=restaurant,
            product=product,
            product_item=item,
            raw_material=rm_noodle,
            raw_material_quantity=Decimal("0.120"),
        )
        order = create_order_with_items(
            restaurant=restaurant,
            lines=[{"product_item_id": item.pk, "quantity": "1"}],
        )
        transition_order_status(order, OrderStatus.READY)
        rm_noodle.refresh_from_db()
        rm_sauce.refresh_from_db()
        self.assertEqual(rm_noodle.stock, Decimal("19.880"))
        self.assertEqual(rm_sauce.stock, Decimal("19.950"))

    def _enable_delivery(self):
        self.restaurant.can_delivery = True
        self.restaurant.latitude = Decimal("19.0000000")
        self.restaurant.longitude = Decimal("72.0000000")
        self.restaurant.delivery_radius_km = Decimal("50.00")
        self.restaurant.save(
            update_fields=["can_delivery", "latitude", "longitude", "delivery_radius_km", "updated_at"]
        )

    def test_delivery_online_payment_success_on_create(self):
        self._enable_delivery()
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            order_type=OrderType.DELIVERY,
            latitude=Decimal("19.1000000"),
            longitude=Decimal("72.1000000"),
            payment_method=PaymentMethod.E_WALLET,
        )
        self.assertEqual(order.payment_status, PaymentStatus.SUCCESS)

    def test_table_online_payment_success_on_create(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            order_type=OrderType.TABLE,
            payment_method=PaymentMethod.E_WALLET,
        )
        self.assertEqual(order.payment_status, PaymentStatus.SUCCESS)

    def test_delivery_cash_stays_pending_when_ready(self):
        self._enable_delivery()
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            order_type=OrderType.DELIVERY,
            latitude=Decimal("19.1000000"),
            longitude=Decimal("72.1000000"),
            payment_method=PaymentMethod.CASH,
        )
        self.assertEqual(order.payment_status, PaymentStatus.PENDING)
        transition_order_status(order, OrderStatus.READY)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, PaymentStatus.PENDING)
        tx = Transaction.objects.get(
            restaurant=self.restaurant,
            category=TransactionCategory.ORDER_PAYMENT,
        )
        self.assertEqual(tx.payment_status, PaymentStatus.PENDING)

    def test_delivery_rejects_when_customer_is_outside_delivery_radius(self):
        self._enable_delivery()
        self.restaurant.delivery_radius_km = Decimal("1.00")
        self.restaurant.save(update_fields=["delivery_radius_km", "updated_at"])
        with self.assertRaises(ValidationError):
            create_order_with_items(
                restaurant=self.restaurant,
                lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
                order_type=OrderType.DELIVERY,
                latitude=Decimal("19.1000000"),
                longitude=Decimal("72.1000000"),
                payment_method=PaymentMethod.CASH,
            )

    def test_table_cash_ready_does_not_auto_complete_payment(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
        )
        transition_order_status(order, OrderStatus.READY)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, PaymentStatus.PENDING)

    def test_ready_to_waiting_pickup(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        transition_order_status(order, OrderStatus.ACCEPTED)
        transition_order_status(order, OrderStatus.RUNNING)
        transition_order_status(order, OrderStatus.READY)
        transition_order_status(order, OrderStatus.WAITING_PICKUP)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.WAITING_PICKUP)

    def test_waiting_pickup_requires_ready(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        with self.assertRaises(ValidationError):
            transition_order_status(order, OrderStatus.WAITING_PICKUP)

    def test_waiting_pickup_to_delivered(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        transition_order_status(order, OrderStatus.ACCEPTED)
        transition_order_status(order, OrderStatus.RUNNING)
        transition_order_status(order, OrderStatus.READY)
        transition_order_status(order, OrderStatus.WAITING_PICKUP)
        order.refresh_from_db()
        self.assertIsNotNone(order.waiting_pickup_at)
        transition_order_status(order, OrderStatus.DELIVERED)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.DELIVERED)
        self.assertIsNone(order.waiting_pickup_at)

    def test_delivered_requires_waiting_pickup(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        with self.assertRaises(ValidationError):
            transition_order_status(order, OrderStatus.DELIVERED)

    def test_order_serializer_customer_display_fields(self):
        from core.api.serializers import OrderSerializer

        User = get_user_model()
        cust = User.objects.create(phone="9000000099", name="Cust One", role=UserRole.CUSTOMER)
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            customer=cust,
        )
        data = OrderSerializer(order).data
        self.assertEqual(data["customer_name"], "Cust One")
        self.assertEqual(data["customer_phone"], "9000000099")

    def test_order_serializer_guest_leaves_customer_display_fields_null(self):
        from core.api.serializers import OrderSerializer

        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            guest_customer_name="Walk-in Pat",
            guest_customer_phone="911",
        )
        data = OrderSerializer(order).data
        self.assertIsNone(data["customer_name"])
        self.assertIsNone(data["customer_phone"])
        self.assertEqual(data["guest_customer_name"], "Walk-in Pat")
        self.assertEqual(data["guest_customer_phone"], "911")

    def test_order_serializer_table_name_for_packing_with_table(self):
        from core.api.serializers import OrderSerializer

        tbl = Table.objects.create(restaurant=self.restaurant, name="Window 2", capacity=2)
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            table=tbl,
            order_type=OrderType.PACKING,
        )
        data = OrderSerializer(order).data
        self.assertEqual(data["order_type"], "packing")
        self.assertEqual(data["table"], tbl.pk)
        self.assertEqual(data["table_name"], "Window 2")

    def test_order_item_serializer_line_label_product_item(self):
        from core.api.serializers import OrderSerializer

        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1.5"}],
        )
        data = OrderSerializer(order).data
        self.assertEqual(len(data["items"]), 1)
        row = data["items"][0]
        self.assertEqual(row["line_label"], "Dish (pc)")
        self.assertEqual(row["line_image"], None)

    def test_order_item_serializer_line_label_combo(self):
        from core.api.serializers import OrderSerializer

        combo = ComboSet.objects.create(restaurant=self.restaurant, name="Lunch Box", price=Decimal("99.00"))
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"comboset_id": combo.pk, "quantity": "1"}],
        )
        data = OrderSerializer(order).data
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["line_label"], "Lunch Box")

    def test_order_create_serializer_rejects_table_from_other_restaurant(self):
        from core.api.serializers import OrderCreateSerializer

        User = get_user_model()
        other_owner = User.objects.create(phone="9000000088", name="Other Owner", role=UserRole.OWNER)
        other_r = Restaurant.objects.create(user=other_owner, name="Other Place")
        foreign_table = Table.objects.create(restaurant=other_r, name="Foreign", capacity=2)
        ser = OrderCreateSerializer(
            data={
                "restaurant": self.restaurant.pk,
                "lines": [{"product_item_id": self.item.pk, "quantity": "1"}],
                "order_type": "packing",
                "table": foreign_table.pk,
            }
        )
        self.assertFalse(ser.is_valid())
        self.assertIn("table", ser.errors)

    def test_per_order_platform_fee_increases_restaurant_due_balance(self):
        s = get_super_setting()
        s.per_transaction_fee = Decimal("10.00")
        s.due_threshold = Decimal("0.00")
        s.save(update_fields=["per_transaction_fee", "due_threshold", "updated_at"])
        self.assertEqual(self.restaurant.due_balance, Decimal("0.00"))
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, Decimal("10.00"))
        fee_tx = Transaction.objects.get(
            restaurant=self.restaurant,
            category=TransactionCategory.TRANSACTION_FEE,
            remarks=f"Transaction fee — order {order.order_id}",
        )
        self.assertEqual(fee_tx.amount, Decimal("10.00"))

    def test_per_order_fee_restaurant_override_over_super_setting(self):
        s = get_super_setting()
        s.per_transaction_fee = Decimal("10.00")
        s.save(update_fields=["per_transaction_fee", "updated_at"])
        self.restaurant.per_transaction_fee = Decimal("3.50")
        self.restaurant.save(update_fields=["per_transaction_fee", "updated_at"])
        create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, Decimal("3.50"))

    def test_platform_transaction_fee_is_idempotent_per_order(self):
        from core.services.transactions import record_platform_transaction_fee_for_order

        s = get_super_setting()
        s.per_transaction_fee = Decimal("10.00")
        s.save(update_fields=["per_transaction_fee", "updated_at"])
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        self.assertIsNone(record_platform_transaction_fee_for_order(order))
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, Decimal("10.00"))
        self.assertEqual(
            Transaction.objects.filter(category=TransactionCategory.TRANSACTION_FEE).count(),
            1,
        )

    def test_platform_fee_deactivates_restaurant_when_due_hits_threshold(self):
        s = get_super_setting()
        s.per_transaction_fee = Decimal("10.00")
        s.due_threshold = Decimal("10.00")
        s.save(update_fields=["per_transaction_fee", "due_threshold", "updated_at"])
        self.restaurant.is_active = True
        self.restaurant.save(update_fields=["is_active", "updated_at"])
        create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
        )
        self.restaurant.refresh_from_db()
        self.assertFalse(self.restaurant.is_active)


class WithdrawalServiceTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(
            phone="9000000002",
            name="Share Owner",
            role=UserRole.OWNER,
            is_shareholder=True,
            balance=Decimal("5000.00"),
        )
        Restaurant.objects.create(user=self.owner, name="R1")

    def test_request_pending_does_not_change_balance(self):
        before = self.owner.balance
        w = request_shareholder_withdrawal(self.owner, Decimal("100.00"), remarks="Hold please")
        self.assertEqual(w.status, WithdrawalStatus.PENDING)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.balance, before)

    def test_request_and_reject(self):
        w = request_shareholder_withdrawal(self.owner, Decimal("100.00"), remarks="Please process")
        self.assertEqual(w.status, WithdrawalStatus.PENDING)
        reject_shareholder_withdrawal(w, "Nope")
        w.refresh_from_db()
        self.assertEqual(w.status, WithdrawalStatus.REJECTED)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.balance, Decimal("5000.00"))

    def test_approve_deducts_balance(self):
        w = request_shareholder_withdrawal(self.owner, Decimal("1000.00"), remarks="Payout")
        approve_shareholder_withdrawal(w)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.balance, Decimal("4000.00"))
        w.refresh_from_db()
        self.assertEqual(w.status, WithdrawalStatus.APPROVED)
        tx = Transaction.objects.filter(category=TransactionCategory.SHARE_WITHDRAWAL).order_by("-id").first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.created_by_id, self.owner.pk)
        self.assertIn(f"Share withdrawal #{w.pk}", tx.remarks)
        self.assertIn("Payout", tx.remarks)

    def test_approve_investor_no_owned_restaurant_single_tenant_restaurant(self):
        User = get_user_model()
        investor = User.objects.create(
            phone="9000000099",
            name="Passive Investor",
            role=UserRole.CUSTOMER,
            is_shareholder=True,
            balance=Decimal("1000.00"),
        )
        w = request_shareholder_withdrawal(investor, Decimal("100.00"), remarks="Investor WD")
        approve_shareholder_withdrawal(w)
        investor.refresh_from_db()
        self.assertEqual(investor.balance, Decimal("900.00"))
        tx = Transaction.objects.filter(category=TransactionCategory.SHARE_WITHDRAWAL).order_by("-id").first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.restaurant_id, Restaurant.objects.get(name="R1").pk)
        self.assertEqual(tx.created_by_id, investor.pk)

    def test_approve_investor_multi_restaurant_without_explicit_restaurant(self):
        User = get_user_model()
        other = User.objects.create(phone="9000000098", name="Other Owner", role=UserRole.OWNER)
        Restaurant.objects.create(user=other, name="R2")
        investor = User.objects.create(
            phone="9000000097",
            name="Investor Two",
            role=UserRole.CUSTOMER,
            is_shareholder=True,
            balance=Decimal("500.00"),
        )
        w = request_shareholder_withdrawal(investor, Decimal("50.00"), remarks="Payout")
        approve_shareholder_withdrawal(w)
        investor.refresh_from_db()
        self.assertEqual(investor.balance, Decimal("450.00"))
        tx = Transaction.objects.filter(category=TransactionCategory.SHARE_WITHDRAWAL).order_by("-id").first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.restaurant_id, Restaurant.objects.order_by("pk").first().pk)

    def test_request_requires_remarks(self):
        with self.assertRaises(ValidationError):
            request_shareholder_withdrawal(self.owner, Decimal("10.00"), remarks="")
        with self.assertRaises(ValidationError):
            request_shareholder_withdrawal(self.owner, Decimal("10.00"), remarks="   ")

    def test_request_cannot_exceed_balance(self):
        with self.assertRaises(ValidationError):
            request_shareholder_withdrawal(self.owner, Decimal("5000.01"), remarks="Too much")

    def test_request_respects_pending_total(self):
        request_shareholder_withdrawal(self.owner, Decimal("2000.00"), remarks="First")
        with self.assertRaises(ValidationError):
            request_shareholder_withdrawal(self.owner, Decimal("3000.01"), remarks="Second")


class ShareholderTransactionsApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000001001", name="Own", role=UserRole.OWNER)
        self.sh_a = User.objects.create(
            phone="9000001002",
            name="ShA",
            role=UserRole.CUSTOMER,
            is_shareholder=True,
            balance=Decimal("1000.00"),
        )
        self.sh_b = User.objects.create(
            phone="9000001003",
            name="ShB",
            role=UserRole.CUSTOMER,
            is_shareholder=True,
            balance=Decimal("1000.00"),
        )
        self.restaurant = Restaurant.objects.create(user=self.owner, name="RSh")

    def test_shareholder_self_lists_only_own_rows_including_pending(self):
        Transaction.objects.create(
            restaurant=self.restaurant,
            created_by=self.sh_a,
            amount=Decimal("50.00"),
            payment_status=PaymentStatus.PENDING,
            transaction_type=TransactionType.OUT,
            category=TransactionCategory.SHARE_WITHDRAWAL,
            remarks="Pending payout",
        )
        Transaction.objects.create(
            restaurant=self.restaurant,
            created_by=self.sh_b,
            amount=Decimal("99.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.OUT,
            category=TransactionCategory.SHARE_WITHDRAWAL,
            remarks="Other shareholder",
        )
        Transaction.objects.create(
            restaurant=self.restaurant,
            created_by=self.sh_a,
            amount=Decimal("10.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.ORDER_PAYMENT,
            remarks="Order payment — A-1",
        )
        self.client.force_authenticate(user=self.sh_a)
        url = f"/api/transactions/?restaurant_id={self.restaurant.pk}&shareholder_self=1"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(Decimal(str(rows[0]["amount"])), Decimal("50.00"))
        self.assertEqual(rows[0]["payment_status"], PaymentStatus.PENDING)

    def test_shareholder_self_legacy_remarks_match_withdrawal(self):
        w = request_shareholder_withdrawal(self.sh_a, Decimal("25.00"), remarks="Legacy match test")
        Transaction.objects.create(
            restaurant=self.restaurant,
            created_by=None,
            amount=Decimal("25.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.OUT,
            category=TransactionCategory.SHARE_WITHDRAWAL,
            remarks=f"Share withdrawal #{w.pk}",
            is_system=True,
        )
        self.client.force_authenticate(user=self.sh_a)
        url = f"/api/transactions/?restaurant_id={self.restaurant.pk}&shareholder_self=1"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)

    def test_shareholder_self_matches_withdrawal_remarks_with_note_suffix(self):
        w = request_shareholder_withdrawal(self.sh_a, Decimal("25.00"), remarks="Payout note")
        Transaction.objects.create(
            restaurant=self.restaurant,
            created_by=None,
            amount=Decimal("25.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.OUT,
            category=TransactionCategory.SHARE_WITHDRAWAL,
            remarks=f"Share withdrawal #{w.pk} — Payout note",
            is_system=True,
        )
        self.client.force_authenticate(user=self.sh_a)
        url = f"/api/transactions/?restaurant_id={self.restaurant.pk}&shareholder_self=1"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)

    def test_superadmin_balance_deduction_lists_for_shareholder(self):
        User = get_user_model()
        admin = User.objects.create(
            phone="9000001999",
            name="Admin",
            role=UserRole.SUPER_ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=admin)
        patch = self.client.patch(
            f"/api/users/{self.sh_a.pk}/",
            {"balance": "700.00", "balance_adjustment_reason": "Duplicate entry reversal"},
            format="json",
        )
        self.assertEqual(patch.status_code, 200)
        self.sh_a.refresh_from_db()
        self.assertEqual(self.sh_a.balance, Decimal("700.00"))

        self.client.force_authenticate(user=self.sh_a)
        url = f"/api/transactions/?restaurant_id={self.restaurant.pk}&shareholder_self=1"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        adj = next((r for r in rows if r["category"] == "share_balance_adjustment"), None)
        self.assertIsNotNone(adj)
        self.assertEqual(Decimal(str(adj["amount"])), Decimal("300.00"))
        self.assertEqual(adj["transaction_type"], "out")
        self.assertIn("Duplicate", adj["remarks"])

    def test_shareholder_self_includes_due_paid(self):
        # Owner pay-due persists as OUT on the restaurant row; API should expose IN for shareholder/super-admin register.
        Transaction.objects.create(
            restaurant=self.restaurant,
            created_by=self.owner,
            amount=Decimal("120.50"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.OUT,
            category=TransactionCategory.DUE_PAID,
            remarks="Platform due settlement",
            is_system=True,
        )
        self.client.force_authenticate(user=self.sh_a)
        url = f"/api/transactions/?restaurant_id={self.restaurant.pk}&shareholder_self=1"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        due = next((r for r in rows if r["category"] == "due_paid"), None)
        self.assertIsNotNone(due)
        self.assertEqual(due["transaction_type"], "in")
        self.assertEqual(Decimal(str(due["amount"])), Decimal("120.50"))


class RestaurantPayDueApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000002001", name="O", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(
            user=self.owner, name="Due Cafe", due_balance=Decimal("55.00"), is_active=False
        )

    def _attach_due_payment_qr(self):
        setting = get_super_setting()
        f = SimpleUploadedFile("qr.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, content_type="image/png")
        setting.due_payment_qr.save("qr.png", f, save=True)

    def _clear_due_payment_qr(self):
        setting = get_super_setting()
        setting.due_payment_qr.delete(save=False)
        setting.due_payment_qr = None
        setting.save(update_fields=["due_payment_qr"])

    def test_pay_due_requires_platform_qr(self):
        self._clear_due_payment_qr()
        self.client.force_authenticate(user=self.owner)
        url = f"/api/restaurants/{self.restaurant.pk}/pay-due/"
        resp = self.client.post(url, {}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_pay_due_rejects_amount_mismatch(self):
        self._attach_due_payment_qr()
        self.client.force_authenticate(user=self.owner)
        url = f"/api/restaurants/{self.restaurant.pk}/pay-due/"
        resp = self.client.post(url, {"amount": "10.00"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_pay_due_creates_transaction_and_clears_balance(self):
        self._attach_due_payment_qr()
        setting = get_super_setting()
        before_bal = setting.balance
        self.client.force_authenticate(user=self.owner)
        url = f"/api/restaurants/{self.restaurant.pk}/pay-due/"
        resp = self.client.post(url, {"amount": "55.00", "remarks": "Paid via bank"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, Decimal("0.00"))
        self.assertTrue(self.restaurant.is_active)
        setting.refresh_from_db()
        self.assertEqual(setting.balance, before_bal + Decimal("55.00"))
        tx = Transaction.objects.filter(restaurant=self.restaurant, category=TransactionCategory.DUE_PAID).first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.transaction_type, TransactionType.OUT)
        self.assertEqual(tx.payment_status, PaymentStatus.SUCCESS)
        self.assertIn("Paid via bank", tx.remarks)
        self.assertIn("Platform due settlement", tx.remarks)

        self.client.force_authenticate(user=self.owner)
        owner_rows = self.client.get(f"/api/transactions/?restaurant_id={self.restaurant.pk}").json()
        due_owner = next((r for r in owner_rows if r["category"] == "due_paid"), None)
        self.assertIsNotNone(due_owner)
        self.assertEqual(due_owner["transaction_type"], "out")

        User = get_user_model()
        superu = User.objects.create(phone="9000002099", name="SuperList", role=UserRole.SUPER_ADMIN)
        self.client.force_authenticate(user=superu)
        admin_rows = self.client.get("/api/transactions/").json()
        due_admin = next((r for r in admin_rows if r.get("id") == tx.pk), None)
        self.assertIsNotNone(due_admin)
        self.assertEqual(due_admin["transaction_type"], "in")

        sh = User.objects.create(
            phone="9000002098",
            name="ShDue",
            role=UserRole.CUSTOMER,
            is_shareholder=True,
        )
        self.client.force_authenticate(user=sh)
        sh_rows = self.client.get(
            f"/api/transactions/?restaurant_id={self.restaurant.pk}&shareholder_self=1"
        ).json()
        due_sh = next((r for r in sh_rows if r.get("id") == tx.pk), None)
        self.assertIsNotNone(due_sh)
        self.assertEqual(due_sh["transaction_type"], "in")


class OwnerAllOwnedTransactionsApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000002002", name="O2", role=UserRole.OWNER)
        self.r1 = Restaurant.objects.create(user=self.owner, name="Venue A")
        self.r2 = Restaurant.objects.create(user=self.owner, name="Venue B")

    def test_all_owned_lists_transactions_across_restaurants(self):
        Transaction.objects.create(
            restaurant=self.r1,
            amount=Decimal("1.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.ORDER_PAYMENT,
            remarks="Order payment — X-1",
        )
        Transaction.objects.create(
            restaurant=self.r2,
            amount=Decimal("2.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.ORDER_PAYMENT,
            remarks="Order payment — Y-2",
        )
        Transaction.objects.create(
            restaurant=self.r1,
            amount=Decimal("5.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.TRANSACTION_FEE,
            remarks="Transaction fee — order TEST",
            is_system=True,
        )
        self.client.force_authenticate(user=self.owner)
        resp = self.client.get("/api/transactions/?all_owned=1")
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()
        self.assertEqual(len(rows), 2)
        rids = {r["restaurant"] for r in rows}
        self.assertSetEqual(rids, {self.r1.pk, self.r2.pk})


class OwnerTransactionRegisterPrivacyTests(APITestCase):
    """Owner-facing /api/transactions/ lists omit super-admin and shareholder activity."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000002003", name="OwnerPriv", role=UserRole.OWNER)
        self.superu = User.objects.create(phone="9000002004", name="Super", role=UserRole.SUPER_ADMIN)
        self.shareholder = User.objects.create(
            phone="9000002005",
            name="Investor",
            role=UserRole.CUSTOMER,
            is_shareholder=True,
        )
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Venue Priv")

    def test_owner_list_by_restaurant_id_hides_superadmin_shareholder_rows(self):
        visible = Transaction.objects.create(
            restaurant=self.restaurant,
            amount=Decimal("10.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.ORDER_PAYMENT,
            remarks="Cash sale",
            created_by=self.owner,
        )
        Transaction.objects.create(
            restaurant=self.restaurant,
            amount=Decimal("20.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.ORDER_PAYMENT,
            remarks="Touched by super",
            created_by=self.superu,
        )
        Transaction.objects.create(
            restaurant=self.restaurant,
            amount=Decimal("30.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.OUT,
            category=TransactionCategory.SHARE_WITHDRAWAL,
            remarks="Share withdrawal #1",
            created_by=self.shareholder,
        )
        Transaction.objects.create(
            restaurant=self.restaurant,
            amount=Decimal("40.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.ORDER_PAYMENT,
            remarks="Recorded by shareholder",
            created_by=self.shareholder,
        )
        self.client.force_authenticate(user=self.owner)
        resp = self.client.get(f"/api/transactions/?restaurant_id={self.restaurant.pk}")
        self.assertEqual(resp.status_code, 200)
        ids = {r["id"] for r in resp.json()}
        self.assertSetEqual(ids, {visible.pk})

    def test_owner_all_owned_hides_superadmin_shareholder_rows(self):
        r2 = Restaurant.objects.create(user=self.owner, name="Venue Priv B")
        keep = Transaction.objects.create(
            restaurant=self.restaurant,
            amount=Decimal("1.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.ORDER_PAYMENT,
            remarks="OK",
        )
        Transaction.objects.create(
            restaurant=r2,
            amount=Decimal("2.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.IN,
            category=TransactionCategory.ORDER_PAYMENT,
            remarks="Super row",
            created_by=self.superu,
        )
        Transaction.objects.create(
            restaurant=self.restaurant,
            amount=Decimal("3.00"),
            payment_status=PaymentStatus.SUCCESS,
            transaction_type=TransactionType.OUT,
            category=TransactionCategory.SHARE_DISTRIBUTION,
            remarks="Distribution",
        )
        self.client.force_authenticate(user=self.owner)
        resp = self.client.get("/api/transactions/?all_owned=1")
        self.assertEqual(resp.status_code, 200)
        ids = {r["id"] for r in resp.json()}
        self.assertSetEqual(ids, {keep.pk})


class PurchaseServiceTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000000003", name="O", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="R2")
        self.unit = Unit.objects.create(restaurant=self.restaurant, name="kg", symbol="kg")
        self.supplier = Supplier.objects.create(restaurant=self.restaurant, name="S")
        self.rm = RawMaterial.objects.create(
            restaurant=self.restaurant,
            supplier=self.supplier,
            unit=self.unit,
            name="Sugar",
            stock=Decimal("0.000"),
        )
        self.purchase = Purchase.objects.create(
            restaurant=self.restaurant,
            supplier=self.supplier,
            discount_type=DiscountType.FLAT,
            discount=Decimal("0.00"),
        )
        PurchaseItem.objects.create(
            purchase=self.purchase,
            raw_material=self.rm,
            price=Decimal("50.00"),
            quantity=Decimal("2.000"),
        )

    def test_finalize_increases_stock(self):
        finalize_purchase(self.purchase)
        self.rm.refresh_from_db()
        self.assertEqual(self.rm.stock, Decimal("2.000"))
        self.purchase.refresh_from_db()
        self.assertEqual(self.purchase.subtotal, Decimal("100.00"))


class ProximityAlertsApiTests(APITestCase):
    """GET /api/orders/proximity-alerts/ and GPS report clearing behavior."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000000701", name="Owner PA", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Alert Cafe")
        self.restaurant.latitude = Decimal("19.0000000")
        self.restaurant.longitude = Decimal("72.0000000")
        self.restaurant.proximity_alert_radius_m = Decimal("500.00")
        self.restaurant.save(
            update_fields=["latitude", "longitude", "proximity_alert_radius_m", "updated_at"]
        )
        self.unit = Unit.objects.create(restaurant=self.restaurant, name="Piece", symbol="pc")
        self.cat = Category.objects.create(restaurant=self.restaurant, name="Food")
        self.product = Product.objects.create(restaurant=self.restaurant, category=self.cat, name="Dish")
        self.item = ProductItem.objects.create(
            product=self.product,
            unit=self.unit,
            price=Decimal("200.00"),
            discount_type=DiscountType.PERCENTAGE,
            discount=Decimal("10.00"),
        )
        self.rm = RawMaterial.objects.create(
            restaurant=self.restaurant,
            unit=self.unit,
            name="Ingredient",
            stock=Decimal("10.000"),
        )
        ProductRawMaterial.objects.create(
            restaurant=self.restaurant,
            product=self.product,
            product_item=self.item,
            raw_material=self.rm,
            raw_material_quantity=Decimal("0.100"),
        )

    def _proximity_url(self):
        return f"/api/orders/proximity-alerts/?restaurant_id={self.restaurant.pk}"

    def test_lists_only_when_last_gps_still_inside_radius_and_unpaid(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
        )
        order.last_reported_latitude = Decimal("19.0020000")
        order.last_reported_longitude = Decimal("72.0000000")
        order.proximity_unpaid_alert_at = timezone.now()
        order.save(
            update_fields=[
                "last_reported_latitude",
                "last_reported_longitude",
                "proximity_unpaid_alert_at",
                "updated_at",
            ]
        )

        self.client.force_authenticate(user=self.owner)
        res = self.client.get(self._proximity_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)

        order.last_reported_latitude = Decimal("19.0200000")
        order.save(update_fields=["last_reported_latitude", "updated_at"])
        res = self.client.get(self._proximity_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 0)

        order.last_reported_latitude = Decimal("19.0020000")
        order.payment_status = PaymentStatus.SUCCESS
        order.save(update_fields=["last_reported_latitude", "payment_status", "updated_at"])
        res = self.client.get(self._proximity_url())
        self.assertEqual(len(res.json()), 0)

    def test_report_position_clears_alert_when_customer_leaves_radius(self):
        User = get_user_model()
        cust = User.objects.create(phone="9000000702", name="Walker", role=UserRole.CUSTOMER)
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            customer=cust,
            payment_method=PaymentMethod.CASH,
        )
        order.proximity_unpaid_alert_at = timezone.now()
        order.last_reported_latitude = Decimal("19.0020000")
        order.last_reported_longitude = Decimal("72.0000000")
        order.save(
            update_fields=[
                "proximity_unpaid_alert_at",
                "last_reported_latitude",
                "last_reported_longitude",
                "updated_at",
            ]
        )

        self.client.force_authenticate(user=cust)
        url = f"/api/orders/{order.pk}/report-position/"
        res = self.client.post(
            url,
            {"latitude": "19.0200000", "longitude": "72.0000000"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        order.refresh_from_db()
        self.assertIsNone(order.proximity_unpaid_alert_at)

    def test_staff_must_belong_to_restaurant(self):
        User = get_user_model()
        other_owner = User.objects.create(phone="9000000703", name="Other", role=UserRole.OWNER)
        other_r = Restaurant.objects.create(user=other_owner, name="Elsewhere")
        staff_user = User.objects.create(phone="9000000704", name="Cash", role=UserRole.STAFF)
        Staff.objects.create(restaurant=other_r, user=staff_user, role=StaffRole.CASHIER)

        self.client.force_authenticate(user=staff_user)
        res = self.client.get(self._proximity_url())
        self.assertEqual(res.status_code, 403)


class PaymentPendingAlertsApiTests(APITestCase):
    """GET /api/orders/payment-pending-alerts/ lists all non-rejected orders for the restaurant (no GPS filter)."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000000751", name="Owner PPA", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Pending Cafe")
        self.unit = Unit.objects.create(restaurant=self.restaurant, name="Piece", symbol="pc")
        self.cat = Category.objects.create(restaurant=self.restaurant, name="Food")
        self.product = Product.objects.create(restaurant=self.restaurant, category=self.cat, name="Dish")
        self.item = ProductItem.objects.create(
            product=self.product,
            unit=self.unit,
            price=Decimal("200.00"),
            discount_type=DiscountType.PERCENTAGE,
            discount=Decimal("10.00"),
        )
        self.rm = RawMaterial.objects.create(
            restaurant=self.restaurant,
            unit=self.unit,
            name="Ingredient",
            stock=Decimal("10.000"),
        )
        ProductRawMaterial.objects.create(
            restaurant=self.restaurant,
            product=self.product,
            product_item=self.item,
            raw_material=self.rm,
            raw_material_quantity=Decimal("0.100"),
        )

    def _pending_url(self):
        return f"/api/orders/payment-pending-alerts/?restaurant_id={self.restaurant.pk}"

    def test_lists_unpaid_without_proximity_or_gps(self):
        create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
        )
        self.client.force_authenticate(user=self.owner)
        res = self.client.get(self._pending_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)

    def test_includes_partial_payments(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "2"}],
            payment_method=PaymentMethod.CASH,
        )
        total = order.total
        half = str((total / 2).quantize(Decimal("0.01")))
        self.client.force_authenticate(user=self.owner)
        pay = self.client.post(
            f"/api/orders/{order.pk}/record-payment-success/",
            {"channel": "cash", "amount": half},
            format="json",
        )
        self.assertEqual(pay.status_code, 200)
        res = self.client.get(self._pending_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["payment_status"], PaymentStatus.PARTIAL)

    def test_paid_stays_visible_rejected_excluded(self):
        paid = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
        )
        paid.payment_status = PaymentStatus.SUCCESS
        paid.save(update_fields=["payment_status", "updated_at"])
        rejected = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
        )
        rejected.status = OrderStatus.REJECTED
        rejected.save(update_fields=["status", "updated_at"])
        self.client.force_authenticate(user=self.owner)
        res = self.client.get(self._pending_url())
        self.assertEqual(res.status_code, 200)
        # Rejected orders are dropped; the paid (success) order remains as the last bill for that row.
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["id"], paid.pk)
        self.assertEqual(res.json()[0]["payment_status"], PaymentStatus.SUCCESS)

    def test_same_guest_phone_shows_both_orders_newest_first(self):
        old = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
            guest_customer_phone="9000001999",
        )
        old.payment_status = PaymentStatus.SUCCESS
        old.save(update_fields=["payment_status", "updated_at"])
        new_order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
            guest_customer_phone="9000001999",
        )
        self.client.force_authenticate(user=self.owner)
        res = self.client.get(self._pending_url())
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["id"], new_order.pk)
        self.assertEqual(data[0]["payment_status"], PaymentStatus.PENDING)
        self.assertEqual(data[1]["id"], old.pk)
        self.assertEqual(data[1]["payment_status"], PaymentStatus.SUCCESS)

    def test_staff_must_belong_to_restaurant(self):
        User = get_user_model()
        other_owner = User.objects.create(phone="9000000752", name="Other PPA", role=UserRole.OWNER)
        other_r = Restaurant.objects.create(user=other_owner, name="Elsewhere PPA")
        staff_user = User.objects.create(phone="9000000753", name="Cash PPA", role=UserRole.STAFF)
        Staff.objects.create(restaurant=other_r, user=staff_user, role=StaffRole.CASHIER)

        self.client.force_authenticate(user=staff_user)
        res = self.client.get(self._pending_url())
        self.assertEqual(res.status_code, 403)

    def test_waiter_staff_forbidden(self):
        User = get_user_model()
        waiter = User.objects.create(phone="9000000754", name="Waiter PPA", role=UserRole.STAFF)
        Staff.objects.create(restaurant=self.restaurant, user=waiter, role=StaffRole.WAITER)
        create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
        )
        self.client.force_authenticate(user=waiter)
        res = self.client.get(self._pending_url())
        self.assertEqual(res.status_code, 403)


class CustomerOrderHistoryApiTests(APITestCase):
    """GET /api/orders/customer-order-history/ lists all orders for a customer at a restaurant."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000000851", name="Owner COH", role=UserRole.OWNER)
        self.cust = User.objects.create(phone="9000000852", name="Pat COH", role=UserRole.CUSTOMER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="History Cafe")
        self.unit = Unit.objects.create(restaurant=self.restaurant, name="Piece", symbol="pc")
        self.cat = Category.objects.create(restaurant=self.restaurant, name="Food")
        self.product = Product.objects.create(restaurant=self.restaurant, category=self.cat, name="Dish")
        self.item = ProductItem.objects.create(
            product=self.product,
            unit=self.unit,
            price=Decimal("100.00"),
            discount_type=DiscountType.PERCENTAGE,
            discount=Decimal("0.00"),
        )
        self.rm = RawMaterial.objects.create(
            restaurant=self.restaurant,
            unit=self.unit,
            name="Ingredient",
            stock=Decimal("10.000"),
        )
        ProductRawMaterial.objects.create(
            restaurant=self.restaurant,
            product=self.product,
            product_item=self.item,
            raw_material=self.rm,
            raw_material_quantity=Decimal("0.100"),
        )

    def _url(self, **params):
        q = "&".join(f"{k}={v}" for k, v in params.items())
        return f"/api/orders/customer-order-history/?{q}"

    def test_registered_customer_history(self):
        o1 = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            customer=self.cust,
            payment_method=PaymentMethod.CASH,
        )
        o1.payment_status = PaymentStatus.SUCCESS
        o1.save(update_fields=["payment_status", "updated_at"])
        o2 = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            customer=self.cust,
            payment_method=PaymentMethod.CASH,
        )
        self.client.force_authenticate(user=self.owner)
        res = self.client.get(
            self._url(restaurant_id=self.restaurant.pk, customer=self.cust.pk),
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2)
        ids = {row["id"] for row in data}
        self.assertSetEqual(ids, {o1.pk, o2.pk})

    def test_guest_phone_history(self):
        o1 = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            guest_customer_name="Walk",
            guest_customer_phone="9800012345",
            payment_method=PaymentMethod.CASH,
        )
        self.client.force_authenticate(user=self.owner)
        res = self.client.get(
            self._url(restaurant_id=self.restaurant.pk, guest_phone="9800012345"),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["id"], o1.pk)

    def test_waiter_forbidden(self):
        User = get_user_model()
        waiter = User.objects.create(phone="9000000853", name="W COH", role=UserRole.STAFF)
        Staff.objects.create(restaurant=self.restaurant, user=waiter, role=StaffRole.WAITER)
        self.client.force_authenticate(user=waiter)
        res = self.client.get(
            self._url(restaurant_id=self.restaurant.pk, customer=self.cust.pk),
        )
        self.assertEqual(res.status_code, 403)


class RecordOrderPaymentSuccessApiTests(APITestCase):
    """POST /api/orders/<id>/record-payment-success/ marks pending payment success and syncs ledger row."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000000761", name="Owner RPS", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Paid Cafe")
        self.unit = Unit.objects.create(restaurant=self.restaurant, name="Piece", symbol="pc")
        self.cat = Category.objects.create(restaurant=self.restaurant, name="Food")
        self.product = Product.objects.create(restaurant=self.restaurant, category=self.cat, name="Dish")
        self.item = ProductItem.objects.create(
            product=self.product,
            unit=self.unit,
            price=Decimal("100.00"),
            discount_type=DiscountType.PERCENTAGE,
            discount=Decimal("0.00"),
        )
        self.rm = RawMaterial.objects.create(
            restaurant=self.restaurant,
            unit=self.unit,
            name="Ingredient",
            stock=Decimal("10.000"),
        )
        ProductRawMaterial.objects.create(
            restaurant=self.restaurant,
            product=self.product,
            product_item=self.item,
            raw_material=self.rm,
            raw_material_quantity=Decimal("0.100"),
        )

    def test_owner_marks_cash_pending_paid_and_updates_transaction(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
        )
        self.assertEqual(order.payment_status, PaymentStatus.PENDING)
        tx_before = Transaction.objects.get(
            restaurant=self.restaurant,
            category=TransactionCategory.ORDER_PAYMENT,
        )
        self.assertEqual(tx_before.payment_status, PaymentStatus.PENDING)

        self.client.force_authenticate(user=self.owner)
        res = self.client.post(f"/api/orders/{order.pk}/record-payment-success/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, PaymentStatus.SUCCESS)
        self.assertEqual(order.payment_method, PaymentMethod.CASH)
        self.assertEqual(order.amount_paid, order.total)
        tx_before.refresh_from_db()
        self.assertEqual(tx_before.payment_status, PaymentStatus.SUCCESS)
        self.assertEqual(tx_before.transaction_type, TransactionType.IN)

    def test_partial_cash_then_remainder(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "2"}],
            payment_method=PaymentMethod.CASH,
        )
        total = order.total
        self.client.force_authenticate(user=self.owner)
        half = str((total / 2).quantize(Decimal("0.01")))
        res1 = self.client.post(
            f"/api/orders/{order.pk}/record-payment-success/",
            {"channel": "cash", "amount": half},
            format="json",
        )
        self.assertEqual(res1.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, PaymentStatus.PARTIAL)
        self.assertEqual(OrderStaffPaymentRecord.objects.filter(order=order).count(), 1)

        res2 = self.client.post(f"/api/orders/{order.pk}/record-payment-success/", {"channel": "cash"}, format="json")
        self.assertEqual(res2.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, PaymentStatus.SUCCESS)
        self.assertEqual(order.amount_paid, total)
        self.assertEqual(OrderStaffPaymentRecord.objects.filter(order=order).count(), 2)

    def test_qr_channel_sets_payment_method_qr(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
        )
        self.client.force_authenticate(user=self.owner)
        res = self.client.post(
            f"/api/orders/{order.pk}/record-payment-success/",
            {"channel": "qr"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.payment_method, PaymentMethod.QR)

    def test_paid_order_stays_on_payment_pending_alerts_list(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
        )
        self.client.force_authenticate(user=self.owner)
        self.assertEqual(len(self.client.get(f"/api/orders/payment-pending-alerts/?restaurant_id={self.restaurant.pk}").json()), 1)
        res = self.client.post(f"/api/orders/{order.pk}/record-payment-success/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        res2 = self.client.get(f"/api/orders/payment-pending-alerts/?restaurant_id={self.restaurant.pk}")
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(len(res2.json()), 1)
        self.assertEqual(res2.json()[0]["id"], order.pk)
        self.assertEqual(res2.json()[0]["payment_status"], PaymentStatus.SUCCESS)

    def test_waiter_forbidden(self):
        User = get_user_model()
        waiter = User.objects.create(phone="9000000762", name="Waiter RPS", role=UserRole.STAFF)
        Staff.objects.create(restaurant=self.restaurant, user=waiter, role=StaffRole.WAITER)
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
            waiter=waiter,
        )
        self.client.force_authenticate(user=waiter)
        res = self.client.post(f"/api/orders/{order.pk}/record-payment-success/", {}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_already_success_returns_400(self):
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            payment_method=PaymentMethod.CASH,
        )
        order.payment_status = PaymentStatus.SUCCESS
        order.save(update_fields=["payment_status", "updated_at"])
        self.client.force_authenticate(user=self.owner)
        res = self.client.post(f"/api/orders/{order.pk}/record-payment-success/", {}, format="json")
        self.assertEqual(res.status_code, 400)


class WaiterPickupDeliverFifoApiTests(APITestCase):
    """Waiters must mark waiting_pickup orders delivered oldest-first (matches staff pickup queue)."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000000801", name="Owner FIFO", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="FIFO Cafe")
        self.waiter = User.objects.create(phone="9000000802", name="Waiter FIFO", role=UserRole.STAFF)
        Staff.objects.create(restaurant=self.restaurant, user=self.waiter, role=StaffRole.WAITER)
        self.unit = Unit.objects.create(restaurant=self.restaurant, name="Piece", symbol="pc")
        self.cat = Category.objects.create(restaurant=self.restaurant, name="Food")
        self.product = Product.objects.create(restaurant=self.restaurant, category=self.cat, name="Dish")
        self.item = ProductItem.objects.create(
            product=self.product,
            unit=self.unit,
            price=Decimal("200.00"),
            discount_type=DiscountType.PERCENTAGE,
            discount=Decimal("10.00"),
        )
        self.rm = RawMaterial.objects.create(
            restaurant=self.restaurant,
            unit=self.unit,
            name="Ingredient",
            stock=Decimal("10.000"),
        )
        ProductRawMaterial.objects.create(
            restaurant=self.restaurant,
            product=self.product,
            product_item=self.item,
            raw_material=self.rm,
            raw_material_quantity=Decimal("0.100"),
        )

    def _to_waiting_pickup(self, order):
        transition_order_status(order, OrderStatus.ACCEPTED)
        transition_order_status(order, OrderStatus.RUNNING)
        transition_order_status(order, OrderStatus.READY)
        transition_order_status(order, OrderStatus.WAITING_PICKUP)

    def test_waiter_cannot_skip_older_waiting_pickup_order(self):
        older = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            waiter=self.waiter,
        )
        self._to_waiting_pickup(older)
        older.refresh_from_db()
        older.waiting_pickup_at = timezone.now() - timedelta(minutes=45)
        older.save(update_fields=["waiting_pickup_at", "updated_at"])

        newer = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            waiter=self.waiter,
        )
        self._to_waiting_pickup(newer)

        self.client.force_authenticate(user=self.waiter)
        url_new = f"/api/orders/{newer.pk}/transition-status/"
        res_skip = self.client.post(url_new, {"status": OrderStatus.DELIVERED}, format="json")
        self.assertEqual(res_skip.status_code, 400)
        self.assertIn("oldest first", res_skip.json().get("detail", "").lower())

        url_old = f"/api/orders/{older.pk}/transition-status/"
        res_ok = self.client.post(url_old, {"status": OrderStatus.DELIVERED}, format="json")
        self.assertEqual(res_ok.status_code, 200)

        res_second = self.client.post(url_new, {"status": OrderStatus.DELIVERED}, format="json")
        self.assertEqual(res_second.status_code, 200)

    def test_waiter_can_transition_unassigned_waiting_pickup_order(self):
        """Pickup queue lists customer orders with no waiter; detail/transition must not 404."""
        User = get_user_model()
        cust = User.objects.create(phone="9000000803", name="Pickup Cust", role=UserRole.CUSTOMER)
        order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            customer=cust,
        )
        self.assertIsNone(order.waiter_id)
        self._to_waiting_pickup(order)

        self.client.force_authenticate(user=self.waiter)
        url = f"/api/orders/{order.pk}/transition-status/"
        res = self.client.post(url, {"status": OrderStatus.DELIVERED}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        order.refresh_from_db()
        self.assertEqual(order.status, OrderStatus.DELIVERED)


class ClientHomeInactiveRestaurantApiTests(APITestCase):
    """Inactive venues must not expose menu data on the public client home endpoint."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000000901", name="Owner CH", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Inactive Menu Cafe", is_active=False)

    def test_inactive_restaurant_returns_404_with_inactive_detail(self):
        url = f"/api/client/home/?restaurant_id={self.restaurant.pk}"
        res = self.client.get(url)
        self.assertEqual(res.status_code, 404)
        body = res.json()
        self.assertIn("inactive", body.get("detail", "").lower())

    def test_active_restaurant_includes_is_open_on_restaurant_payload(self):
        self.restaurant.is_active = True
        self.restaurant.is_open = False
        self.restaurant.save(update_fields=["is_active", "is_open", "updated_at"])
        url = f"/api/client/home/?restaurant_id={self.restaurant.pk}"
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["restaurant"]["is_open"], False)


class RestaurantQrBrandImageApiTests(APITestCase):
    """GET /api/restaurants/<id>/qr-brand-image/ streams logo for canvas-safe compositing."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000000903", name="Owner Logo", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Logo Cafe", is_active=True)
        png_1px = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
            b"\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        self.restaurant.logo.save("logo.png", SimpleUploadedFile("logo.png", png_1px, content_type="image/png"), save=True)

    def test_owner_can_fetch_logo_bytes(self):
        self.client.force_authenticate(user=self.owner)
        url = f"/api/restaurants/{self.restaurant.pk}/qr-brand-image/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        body = b"".join(res.streaming_content)
        self.assertTrue(body.startswith(b"\x89PNG"))

    def test_unauthenticated_returns_401(self):
        url = f"/api/restaurants/{self.restaurant.pk}/qr-brand-image/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, 401)


class ClientPublicMenuOrderApiTests(APITestCase):
    """POST /api/client/orders/ allows anonymous guests to order from the menu QR flow."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000000902", name="Owner QR", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="QR Order Cafe", is_active=True)
        self.unit = Unit.objects.create(restaurant=self.restaurant, name="Piece", symbol="pc")
        self.cat = Category.objects.create(restaurant=self.restaurant, name="Mains")
        self.product = Product.objects.create(restaurant=self.restaurant, category=self.cat, name="Thali")
        self.item = ProductItem.objects.create(
            product=self.product,
            unit=self.unit,
            price=Decimal("100.00"),
            discount_type=DiscountType.PERCENTAGE,
            discount=Decimal("0.00"),
        )
        self.table = Table.objects.create(restaurant=self.restaurant, name="T1", capacity=4)

    def _payload(self, **overrides):
        base = {
            "restaurant": self.restaurant.pk,
            "lines": [{"product_item_id": self.item.pk, "quantity": "1"}],
            "order_type": "table",
            "table": self.table.pk,
            "people_for": 2,
            "payment_method": "cash",
            "guest_customer_name": "Guest Pat",
            "guest_customer_phone": "9800000000",
        }
        base.update(overrides)
        return base

    def test_anonymous_table_order_creates_guest_order(self):
        url = "/api/client/orders/"
        res = self.client.post(url, self._payload(), format="json")
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data.get("guest_customer_name"), "Guest Pat")
        self.assertEqual(data.get("guest_customer_phone"), "9800000000")
        self.assertIsNone(data.get("customer"))

    def test_delivery_rejected_for_public_endpoint(self):
        res = self.client.post(
            "/api/client/orders/",
            self._payload(order_type="delivery", table=None, latitude="27.71", longitude="85.32"),
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_table_order_without_table_returns_400(self):
        res = self.client.post("/api/client/orders/", self._payload(table=None), format="json")
        self.assertEqual(res.status_code, 400)


class AuthOtpSmsFallbackApiTests(APITestCase):
    """When SMS cannot be sent, DEBUG, SMS_OTP_ALLOW_INSECURE_FALLBACK, or SMS_OTP_DEV_AUTO_FALLBACK returns a verifiable OTP."""

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create(phone="9000002001", name="Otp User", role=UserRole.CUSTOMER)

    @patch("core.views.client.auth_views.send_otp_sms", return_value=False)
    @override_settings(DEBUG=True, SMS_OTP_ALLOW_INSECURE_FALLBACK=False)
    def test_request_otp_debug_returns_debug_otp_when_sms_skipped(self, _mock_send):
        res = self.client.post(
            "/api/auth/request-otp/",
            {"phone": self.user.phone, "purpose": "login"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertIn("debug_otp", body)
        self.assertEqual(len(body["debug_otp"]), 6)
        self.assertEqual(body.get("sms_sent"), False)

        verify = self.client.post(
            "/api/auth/verify-otp/",
            {
                "phone": self.user.phone,
                "otp": body["debug_otp"],
                "purpose": "login",
            },
            format="json",
        )
        self.assertEqual(verify.status_code, 200, verify.content)
        self.assertIn("token", verify.json())

    @patch("core.views.client.auth_views.send_otp_sms", return_value=False)
    @override_settings(DEBUG=False, SMS_OTP_ALLOW_INSECURE_FALLBACK=True)
    def test_request_otp_insecure_fallback_returns_debug_otp_when_sms_skipped(self, _mock_send):
        res = self.client.post(
            "/api/auth/request-otp/",
            {"phone": self.user.phone, "purpose": "login"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertIn("debug_otp", body)
        self.assertEqual(body.get("sms_sent"), False)

    @patch("core.views.client.auth_views.send_otp_sms", return_value=False)
    @override_settings(
        DEBUG=False,
        SMS_OTP_ALLOW_INSECURE_FALLBACK=False,
        SMS_OTP_DEV_AUTO_FALLBACK=False,
    )
    def test_request_otp_production_mode_503_when_sms_skipped(self, _mock_send):
        res = self.client.post(
            "/api/auth/request-otp/",
            {"phone": self.user.phone, "purpose": "login"},
            format="json",
        )
        self.assertEqual(res.status_code, 503, res.content)

    @patch("core.views.client.auth_views.send_otp_sms", return_value=False)
    @override_settings(
        DEBUG=False,
        SMS_OTP_ALLOW_INSECURE_FALLBACK=False,
        SMS_OTP_DEV_AUTO_FALLBACK=True,
    )
    def test_request_otp_dev_auto_fallback_returns_debug_otp_when_sms_skipped(self, _mock_send):
        res = self.client.post(
            "/api/auth/request-otp/",
            {"phone": self.user.phone, "purpose": "login"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertIn("debug_otp", body)
        self.assertEqual(body.get("sms_sent"), False)


class OtpSmsBillingApiTests(APITestCase):
    """sms_per_usage applies to successful owner/staff login OTP sends."""

    def setUp(self):
        User = get_user_model()
        s = get_super_setting()
        s.sms_per_usage = Decimal("2.50")
        s.due_threshold = Decimal("0.00")
        s.save(update_fields=["sms_per_usage", "due_threshold", "updated_at"])
        self.owner = User.objects.create(phone="9000001001", name="Sms Owner", role=UserRole.OWNER)
        self.staff_user = User.objects.create(phone="9000001002", name="Sms Staff", role=UserRole.STAFF)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Sms Cafe")
        Staff.objects.create(restaurant=self.restaurant, user=self.staff_user, role=StaffRole.WAITER)

    @patch("core.views.client.auth_views.send_otp_sms", return_value=True)
    def test_owner_login_otp_adds_to_owner_due_balance(self, _mock_send):
        before = self.owner.due_balance
        res = self.client.post(
            "/api/auth/request-otp/",
            {"phone": self.owner.phone, "purpose": "login"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.due_balance, before + Decimal("2.50"))

    @patch("core.views.client.auth_views.send_otp_sms", return_value=True)
    def test_staff_login_otp_adds_to_restaurant_due_and_sms_transaction(self, _mock_send):
        before = self.restaurant.due_balance
        res = self.client.post(
            "/api/auth/request-otp/",
            {"phone": self.staff_user.phone, "purpose": "login"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, before + Decimal("2.50"))
        tx = Transaction.objects.filter(
            restaurant=self.restaurant,
            category=TransactionCategory.SMS_USAGE,
            is_system=True,
        ).first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.amount, Decimal("2.50"))

    @patch("core.views.client.auth_views.send_otp_sms", return_value=True)
    def test_staff_login_otp_respects_restaurant_sms_override(self, _mock_send):
        self.restaurant.sms_per_usage = Decimal("0.40")
        self.restaurant.save(update_fields=["sms_per_usage", "updated_at"])
        before = self.restaurant.due_balance
        res = self.client.post(
            "/api/auth/request-otp/",
            {"phone": self.staff_user.phone, "purpose": "login"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, before + Decimal("0.40"))

    @patch("core.views.client.auth_views.send_otp_sms", return_value=True)
    def test_customer_login_otp_not_billed(self, _mock_send):
        User = get_user_model()
        cust = User.objects.create(phone="9000001003", name="Sms Cust", role=UserRole.CUSTOMER)
        before = cust.due_balance
        res = self.client.post(
            "/api/auth/request-otp/",
            {"phone": cust.phone, "purpose": "login"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        cust.refresh_from_db()
        self.assertEqual(cust.due_balance, before)


class OwnerRestaurantCreatePerTxApiTests(APITestCase):
    """New venues default per_transaction_fee to zero so the live platform fee always applies."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000001101", name="Ptf Owner", role=UserRole.OWNER)
        s = get_super_setting()
        s.per_transaction_fee = Decimal("7.00")
        s.save(update_fields=["per_transaction_fee", "updated_at"])

    def test_owner_post_restaurant_without_ptf_stores_zero_and_follows_updated_global(self):
        from core.services.platform_pricing import effective_per_transaction_fee

        self.client.force_authenticate(user=self.owner)
        res = self.client.post(
            "/api/restaurants/",
            {
                "name": "Dynamic Fee Cafe",
                "phone": self.owner.phone,
                "address": "Test Addr",
                "latitude": "12.9716000",
                "longitude": "77.5946000",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(Decimal(str(body["per_transaction_fee"])), Decimal("0.00"))
        r = Restaurant.objects.get(pk=body["id"])
        self.assertEqual(effective_per_transaction_fee(r), Decimal("7.00"))
        s = get_super_setting()
        s.per_transaction_fee = Decimal("11.00")
        s.save(update_fields=["per_transaction_fee", "updated_at"])
        self.assertEqual(effective_per_transaction_fee(r), Decimal("11.00"))


class OwnerProfileImagePatchTests(APITestCase):
    def test_owner_multipart_patch_saves_profile_image(self):
        User = get_user_model()
        owner = User.objects.create(phone="9000000555", name="Photo Owner", role=UserRole.OWNER)
        self.assertFalse(bool(owner.image))
        self.client.force_authenticate(user=owner)
        img = SimpleUploadedFile(
            "face.png",
            b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
            content_type="image/png",
        )
        resp = self.client.patch(
            f"/api/users/{owner.pk}/",
            {"name": "Photo Owner", "phone": owner.phone, "image": img},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertIsNotNone(body.get("image"))
        owner.refresh_from_db()
        self.assertTrue(bool(getattr(owner.image, "name", None)))


class OrderStatusCustomerSideEffectsTests(TestCase):
    """SMS + due billing when order status changes (post-commit helper)."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000001301", name="Status Owner", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Status Cafe")
        self.customer = User.objects.create(phone="9000001302", name="Status Cust", role=UserRole.CUSTOMER)
        self.unit = Unit.objects.create(restaurant=self.restaurant, name="Piece", symbol="pc")
        self.cat = Category.objects.create(restaurant=self.restaurant, name="Food")
        self.product = Product.objects.create(restaurant=self.restaurant, category=self.cat, name="Dish")
        self.item = ProductItem.objects.create(
            product=self.product,
            unit=self.unit,
            price=Decimal("100.00"),
            discount_type=DiscountType.PERCENTAGE,
            discount=Decimal("0.00"),
        )
        self.order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            customer=self.customer,
        )
        s = get_super_setting()
        s.sms_per_usage = Decimal("1.25")
        s.save(update_fields=["sms_per_usage", "updated_at"])

    @patch("core.services.order_status_customer_notify.send_plain_sms", return_value=True)
    def test_accepted_transition_sms_bills_restaurant_and_creates_push(self, mock_sms):
        from core.services.order_status_customer_notify import run_order_status_change_customer_side_effects

        before = self.restaurant.due_balance
        n_before = BulkNotification.objects.count()
        run_order_status_change_customer_side_effects(
            order_id=self.order.pk,
            old_status=OrderStatus.PENDING,
            new_status=OrderStatus.ACCEPTED,
        )
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, before + Decimal("1.25"))
        mock_sms.assert_called_once()
        self.assertGreater(BulkNotification.objects.count(), n_before)
        self.assertTrue(
            BulkNotification.objects.filter(type=BulkNotificationType.PUSH, title__icontains=self.order.order_id).exists()
        )

    @patch("core.services.order_status_customer_notify.send_plain_sms", return_value=True)
    def test_accepted_transition_sms_uses_restaurant_sms_override(self, mock_sms):
        from core.services.order_status_customer_notify import run_order_status_change_customer_side_effects

        self.restaurant.sms_per_usage = Decimal("9.99")
        self.restaurant.save(update_fields=["sms_per_usage", "updated_at"])
        before = self.restaurant.due_balance
        run_order_status_change_customer_side_effects(
            order_id=self.order.pk,
            old_status=OrderStatus.PENDING,
            new_status=OrderStatus.ACCEPTED,
        )
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, before + Decimal("9.99"))
        mock_sms.assert_called_once()

    @patch("core.services.order_status_customer_notify.send_plain_sms", return_value=False)
    def test_sms_failure_skips_billing(self, _mock_sms):
        from core.services.order_status_customer_notify import run_order_status_change_customer_side_effects

        before = self.restaurant.due_balance
        run_order_status_change_customer_side_effects(
            order_id=self.order.pk,
            old_status=OrderStatus.PENDING,
            new_status=OrderStatus.ACCEPTED,
        )
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, before)

    @patch("core.services.order_status_customer_notify.send_plain_sms", return_value=True)
    def test_ready_transition_sms_bills_without_extra_status_push(self, mock_sms):
        from core.services.order_status_customer_notify import run_order_status_change_customer_side_effects

        n_before = BulkNotification.objects.count()
        before = self.restaurant.due_balance
        run_order_status_change_customer_side_effects(
            order_id=self.order.pk,
            old_status=OrderStatus.RUNNING,
            new_status=OrderStatus.READY,
        )
        mock_sms.assert_called_once()
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, before + Decimal("1.25"))
        self.assertEqual(BulkNotification.objects.count(), n_before)


class OrderTransitionStatusApiSmsBillingTests(APITestCase):
    """Owner transition-status must run on_commit SMS billing (TestCase defers on_commit unless captured)."""

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000001501", name="Api Sms Owner", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Api Sms Cafe")
        self.customer = User.objects.create(phone="9000001502", name="Api Sms Cust", role=UserRole.CUSTOMER)
        self.unit = Unit.objects.create(restaurant=self.restaurant, name="Piece", symbol="pc")
        self.cat = Category.objects.create(restaurant=self.restaurant, name="Food")
        self.product = Product.objects.create(restaurant=self.restaurant, category=self.cat, name="Dish")
        self.item = ProductItem.objects.create(
            product=self.product,
            unit=self.unit,
            price=Decimal("100.00"),
            discount_type=DiscountType.PERCENTAGE,
            discount=Decimal("0.00"),
        )
        self.order = create_order_with_items(
            restaurant=self.restaurant,
            lines=[{"product_item_id": self.item.pk, "quantity": "1"}],
            customer=self.customer,
        )
        s = get_super_setting()
        s.sms_per_usage = Decimal("2.00")
        s.save(update_fields=["sms_per_usage", "updated_at"])

    @patch("core.services.order_status_customer_notify.send_plain_sms", return_value=True)
    def test_owner_accept_via_api_bills_sms_and_updates_restaurant_list(self, _mock_sms):
        self.client.force_authenticate(user=self.owner)
        url = f"/api/orders/{self.order.pk}/transition-status/"
        before = self.restaurant.due_balance
        with self.captureOnCommitCallbacks(execute=True):
            res = self.client.post(url, {"status": OrderStatus.ACCEPTED}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.restaurant.refresh_from_db()
        self.assertEqual(self.restaurant.due_balance, before + Decimal("2.00"))
        self.assertTrue(
            Transaction.objects.filter(
                restaurant_id=self.restaurant.pk,
                category=TransactionCategory.SMS_USAGE,
                transaction_type=TransactionType.IN,
                amount=Decimal("2.00"),
            ).exists()
        )
        list_res = self.client.get("/api/restaurants/")
        self.assertEqual(list_res.status_code, 200)
        row = next(r for r in list_res.json() if r["id"] == self.restaurant.pk)
        self.assertEqual(Decimal(str(row["due_sms_usage"])), Decimal("2.00"))
        self.assertGreater(
            BulkNotification.objects.filter(type=BulkNotificationType.PUSH).count(),
            0,
        )


class RestaurantListDueBreakdownApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(phone="9000001401", name="Break Owner", role=UserRole.OWNER)
        self.restaurant = Restaurant.objects.create(user=self.owner, name="Breakdown Cafe")

    def test_owner_list_includes_due_sms_and_service_charge(self):
        Transaction.objects.create(
            restaurant=self.restaurant,
            amount=Decimal("4.50"),
            payment_status=PaymentStatus.SUCCESS,
            remarks="SMS — test",
            transaction_type=TransactionType.IN,
            category=TransactionCategory.SMS_USAGE,
            is_system=True,
        )
        Transaction.objects.create(
            restaurant=self.restaurant,
            amount=Decimal("10.00"),
            payment_status=PaymentStatus.SUCCESS,
            remarks="Platform fee test",
            transaction_type=TransactionType.IN,
            category=TransactionCategory.TRANSACTION_FEE,
            is_system=True,
        )
        self.client.force_authenticate(user=self.owner)
        res = self.client.get("/api/restaurants/")
        self.assertEqual(res.status_code, 200, res.content)
        rows = res.json()
        self.assertTrue(isinstance(rows, list))
        row = next(r for r in rows if r["id"] == self.restaurant.pk)
        self.assertEqual(Decimal(str(row["due_sms_usage"])), Decimal("4.50"))
        self.assertEqual(Decimal(str(row["due_service_charge"])), Decimal("10.00"))

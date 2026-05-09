from rest_framework import serializers

from core.auth.portal import default_restaurant_id_for_user, portal_role_for_user, restaurant_ids_for_user
from core.models import Staff, User


class StaffMembershipSerializer(serializers.ModelSerializer):
    restaurant_name = serializers.CharField(source="restaurant.name", read_only=True)

    class Meta:
        model = Staff
        fields = ("id", "restaurant", "restaurant_name", "role", "joined_at", "is_suspend")


class UserMeSerializer(serializers.ModelSerializer):
    portal_role = serializers.SerializerMethodField()
    restaurant_ids = serializers.SerializerMethodField()
    default_restaurant_id = serializers.SerializerMethodField()
    staff_memberships = serializers.SerializerMethodField()

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
            "image",
            "portal_role",
            "restaurant_ids",
            "default_restaurant_id",
            "staff_memberships",
        )

    def get_portal_role(self, obj: User) -> str:
        return portal_role_for_user(obj)

    def get_restaurant_ids(self, obj: User) -> list[int]:
        return restaurant_ids_for_user(obj)

    def get_default_restaurant_id(self, obj: User) -> int | None:
        return default_restaurant_id_for_user(obj)

    def get_staff_memberships(self, obj: User):
        rows = Staff.objects.filter(user=obj).select_related("restaurant")
        return StaffMembershipSerializer(rows, many=True).data

from django.urls import path

from core.views.client.home_views import home_data
from core.views.client.order_views import public_menu_order_create

urlpatterns = [
    path("home/", home_data, name="client-home-data"),
    path("orders/", public_menu_order_create, name="client-public-menu-order"),
]

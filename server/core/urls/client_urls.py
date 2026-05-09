from django.urls import path

from core.views.client.home_views import home_data

urlpatterns = [
    path("home/", home_data, name="client-home-data"),
]

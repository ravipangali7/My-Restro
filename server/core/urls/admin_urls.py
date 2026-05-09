from django.urls import path

from core.views.admin.dashboard_views import dashboard_data
from core.views.admin.x_views import x_data

urlpatterns = [
    path("dashboard/", dashboard_data, name="admin-dashboard-data"),
    path("x/", x_data, name="admin-x-data"),
]

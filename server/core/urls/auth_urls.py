from django.urls import path

from core.views.client.auth_views import logout, me, request_otp, verify_otp

urlpatterns = [
    path("request-otp/", request_otp),
    path("verify-otp/", verify_otp),
    path("me/", me),
    path("logout/", logout),
]

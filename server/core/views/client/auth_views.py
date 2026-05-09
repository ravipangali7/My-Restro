import logging
import random
import string

from django.conf import settings
from django.db import transaction
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from core.auth.portal import normalize_phone
from core.models import Otp, User, UserRole
from core.serializers.me import UserMeSerializer
from core.services.sms import send_otp_sms
from core.services.sms_billing import record_sms_otp_charge_after_sent

logger = logging.getLogger(__name__)


def _issue_token(user: User) -> str:
    token, _ = Token.objects.get_or_create(user=user)
    return token.key


@api_view(["POST"])
@permission_classes([AllowAny])
def request_otp(request):
    phone = normalize_phone(request.data.get("phone", ""))
    purpose = (request.data.get("purpose") or "login").strip().lower()
    if purpose not in ("login", "register"):
        purpose = "login"
    if not phone:
        return Response({"detail": "phone is required."}, status=status.HTTP_400_BAD_REQUEST)

    existing = User.objects.filter(phone=phone).exists()
    if purpose == "login" and not existing:
        return Response({"detail": "No account exists for this phone."}, status=status.HTTP_404_NOT_FOUND)
    if purpose == "register" and existing:
        return Response({"detail": "This phone is already registered."}, status=status.HTTP_400_BAD_REQUEST)

    code = "".join(random.choices(string.digits, k=6))
    otp_row = Otp.objects.create(phone=phone, otp=code, purpose=purpose, is_used=False)

    sms_sent = send_otp_sms(phone, code)
    payload = {"detail": "OTP sent.", "phone": phone}

    if not sms_sent:
        if settings.DEBUG:
            payload["debug_otp"] = code
        else:
            otp_row.delete()
            return Response(
                {"detail": "Could not send verification SMS. Configure Twilio or try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    if sms_sent:
        try:
            with transaction.atomic():
                record_sms_otp_charge_after_sent(
                    phone=phone,
                    purpose=purpose,
                    restaurant_id_raw=request.data.get("restaurant_id"),
                )
        except Exception:
            logger.exception("SMS OTP usage billing failed for phone=%s purpose=%s", phone, purpose)

    return Response(payload, status=status.HTTP_201_CREATED)


def _validate_otp_code(phone: str, purpose: str, otp: str) -> bool:
    otp_row = (
        Otp.objects.filter(phone=phone, purpose=purpose, is_used=False, otp=otp)
        .order_by("-created_at")
        .first()
    )
    if otp_row:
        otp_row.is_used = True
        otp_row.save(update_fields=["is_used", "updated_at"])
        return True
    return False


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_otp(request):
    phone = normalize_phone(request.data.get("phone", ""))
    otp = (request.data.get("otp") or "").strip()
    purpose = (request.data.get("purpose") or "login").strip().lower()
    if purpose not in ("login", "register"):
        purpose = "login"
    name = (request.data.get("name") or "").strip()

    if not phone or not otp:
        return Response({"detail": "phone and otp are required."}, status=status.HTTP_400_BAD_REQUEST)

    if purpose == "register" and not name:
        return Response({"detail": "name is required for registration."}, status=status.HTTP_400_BAD_REQUEST)

    existing = User.objects.filter(phone=phone).first()

    if purpose == "login":
        if existing is None:
            return Response({"detail": "No account exists for this phone."}, status=status.HTTP_404_NOT_FOUND)
        user = existing
    else:
        if existing is not None:
            return Response({"detail": "This phone is already registered."}, status=status.HTTP_400_BAD_REQUEST)
        user = None

    valid = _validate_otp_code(phone, purpose, otp)
    if not valid:
        return Response({"detail": "Invalid or expired OTP."}, status=status.HTTP_400_BAD_REQUEST)

    if purpose == "register":
        user = User.objects.create(phone=phone, name=name, role=UserRole.CUSTOMER)

    token = _issue_token(user)
    data = UserMeSerializer(user, context={"request": request}).data
    return Response({"token": token, "user": data}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    data = UserMeSerializer(request.user, context={"request": request}).data
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response({"detail": "Logged out."}, status=status.HTTP_200_OK)

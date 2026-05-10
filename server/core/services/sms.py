"""Send OTP via Twilio SMS. Uses stdlib only (no extra packages)."""

from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from django.conf import settings

logger = logging.getLogger(__name__)

# Twilio SMS body length guard (well under segment limits).
_MAX_SMS_BODY_LEN = 1600


def phone_to_e164(normalized_phone: str) -> str:
    """Ensure E.164 (+ and digits) for SMS APIs."""
    digits = "".join(c for c in normalized_phone if c.isdigit())
    if not digits:
        return normalized_phone.strip()
    return f"+{digits}"


def _twilio_error_summary(raw: str) -> str:
    """Best-effort parse of Twilio REST error JSON for logs."""
    raw = (raw or "").strip()
    if not raw:
        return ""
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            msg = obj.get("message")
            code = obj.get("code")
            if msg and code is not None:
                return f"{code}: {msg}"
            if msg:
                return str(msg)
    except (json.JSONDecodeError, TypeError):
        pass
    return raw[:300]


def _twilio_send_sms(to_e164: str, body: str) -> bool:
    """Low-level Twilio send. Returns True on HTTP 200/201."""
    account_sid = (getattr(settings, "TWILIO_ACCOUNT_SID", None) or "").strip()
    auth_token = (getattr(settings, "TWILIO_AUTH_TOKEN", None) or "").strip()
    from_number = (getattr(settings, "TWILIO_FROM_NUMBER", None) or "").strip()
    messaging_service_sid = (getattr(settings, "TWILIO_MESSAGING_SERVICE_SID", None) or "").strip()

    if not account_sid or not auth_token:
        logger.info("Twilio SMS skipped: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set.")
        return False

    if not messaging_service_sid and not from_number:
        logger.info(
            "Twilio SMS skipped: set TWILIO_MESSAGING_SERVICE_SID and/or TWILIO_FROM_NUMBER "
            "(from number or sender ID for your Twilio number)."
        )
        return False

    form: dict[str, str] = {"To": to_e164, "Body": body}
    if messaging_service_sid:
        form["MessagingServiceSid"] = messaging_service_sid
    else:
        form["From"] = from_number

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = urllib.parse.urlencode(form).encode()

    req = urllib.request.Request(url, data=data, method="POST")
    credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode("ascii")
    req.add_header("Authorization", f"Basic {credentials}")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (200, 201):
                return True
            raw = resp.read().decode()
            logger.warning(
                "Twilio SMS unexpected status %s: %s", resp.status, _twilio_error_summary(raw) or raw[:500]
            )
            return False
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        summary = _twilio_error_summary(err_body) or err_body[:500]
        logger.warning("Twilio SMS HTTP error %s: %s", e.code, summary)
        return False
    except OSError as e:
        logger.warning("Twilio SMS network error: %s", e)
        return False


def send_plain_sms(to_phone_normalized: str, body: str) -> bool:
    """
    Send an arbitrary SMS body via Twilio (e.g. superadmin bulk messages).
    Returns False if Twilio is not configured, the body is empty, or the request fails.
    """
    text = (body or "").strip()
    if not text:
        return False
    if len(text) > _MAX_SMS_BODY_LEN:
        text = text[:_MAX_SMS_BODY_LEN]
    return _twilio_send_sms(phone_to_e164(to_phone_normalized), text)


def send_otp_sms(to_phone_normalized: str, code: str) -> bool:
    """
    Send OTP via Twilio. Returns True if the request succeeded.

    If Twilio is not configured (missing env), returns False without raising.
    """
    body = f"Your My Restro verification code is {code}. Do not share it with anyone."
    return _twilio_send_sms(phone_to_e164(to_phone_normalized), body)

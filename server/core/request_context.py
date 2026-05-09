"""Per-request user for code paths that run outside explicit view kwargs (e.g. model signals)."""

from contextvars import ContextVar

from rest_framework.authtoken.models import Token

_current_request_user: ContextVar = ContextVar("current_request_user", default=None)


def get_current_request_user():
    return _current_request_user.get()


def _user_from_authorization_header(request):
    """Match DRF TokenAuthentication so signals see the same user the API call uses."""
    raw = request.META.get("HTTP_AUTHORIZATION", "")
    if not raw.startswith("Token "):
        return None
    key = raw.removeprefix("Token ").strip()
    if not key:
        return None
    try:
        return Token.objects.select_related("user").get(key=key).user
    except Token.DoesNotExist:
        return None


class CurrentUserMiddleware:
    """Expose the authenticated user to signal/service code via get_current_request_user()."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            user = _user_from_authorization_header(request)
        if user is not None and user.is_authenticated:
            var_token = _current_request_user.set(user)
            try:
                return self.get_response(request)
            finally:
                _current_request_user.reset(var_token)
        return self.get_response(request)

"""Project middleware."""

from django.http import HttpResponseRedirect


class ApiTrailingSlashMiddleware:
    """
    Redirect /api/... paths without a trailing slash so they match urlpatterns
    that use path('foo/', ...). Otherwise the '' admin.site.urls catch-all can
    handle /api/users and send browsers to /login/.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        full = request.get_full_path()
        if "?" in full:
            path_part, _, qs = full.partition("?")
        else:
            path_part, qs = full, ""

        if (
            path_part.startswith("/api/")
            and len(path_part) > len("/api/")
            and not path_part.endswith("/")
        ):
            new_url = path_part + "/" + ("?" + qs if qs else "")
            return HttpResponseRedirect(new_url, status=308)

        return self.get_response(request)

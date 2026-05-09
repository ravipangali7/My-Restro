from django.conf import settings


def absolute_media_url(request, file_path: str | None) -> str | None:
    """Build an absolute URL for a stored media path (ImageField `.name` / `.values('image')`)."""
    if file_path in (None, ""):
        return None
    s = str(file_path).strip()
    if not s:
        return None
    if s.startswith("http://") or s.startswith("https://"):
        return s
    path = s.lstrip("/")
    media_url = settings.MEDIA_URL
    media_prefix = media_url if media_url.startswith("/") else f"/{media_url}"
    if not media_prefix.endswith("/"):
        media_prefix += "/"
    if path.startswith("media/"):
        relative_url = f"/{path}"
    else:
        relative_url = f"{media_prefix}{path}"
    while "//" in relative_url:
        relative_url = relative_url.replace("//", "/")
    return request.build_absolute_uri(relative_url)

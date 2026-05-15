"""Media storage: normalize uploaded images to WebP on disk."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from django.core.exceptions import SuspiciousFileOperation
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from PIL import Image, UnidentifiedImageError


def _normalize_for_webp(im: Image.Image) -> Image.Image:
    mode = im.mode
    if mode in ("RGB", "RGBA"):
        return im
    if mode == "P":
        if "transparency" in im.info:
            return im.convert("RGBA")
        return im.convert("RGB")
    if mode in ("L", "1"):
        return im.convert("RGB")
    if mode == "LA":
        return im.convert("RGBA")
    if mode == "CMYK":
        return im.convert("RGB")
    return im.convert("RGB")


class WebPImageStorage(FileSystemStorage):
    """Saves only WebP bytes; rejects unknown extensions before decode."""

    ALLOWED_EXTENSIONS = frozenset(
        {".png", ".jpg", ".jpeg", ".jfif", ".pjpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
    )

    def __init__(
        self,
        location=None,
        base_url=None,
        file_permissions_mode=None,
        directory_permissions_mode=None,
        *,
        webp_quality: int = 82,
    ):
        super().__init__(
            location=location,
            base_url=base_url,
            file_permissions_mode=file_permissions_mode,
            directory_permissions_mode=directory_permissions_mode,
        )
        self._webp_quality = webp_quality

    @staticmethod
    def _webp_relative_name(name: str) -> str:
        p = Path(str(name))
        stem = p.stem or "image"
        if p.parent == Path("."):
            return f"{stem}.webp"
        return str(p.parent / f"{stem}.webp")

    def save(self, name, content, max_length=None):
        path = Path(str(name))
        ext = path.suffix.lower()
        if ext and ext not in self.ALLOWED_EXTENSIONS:
            allowed = ", ".join(sorted(self.ALLOWED_EXTENSIONS))
            raise SuspiciousFileOperation(
                f"Unsupported image file extension {ext!r}. Allowed extensions: {allowed}."
            )

        raw = content.read()
        if hasattr(content, "seek"):
            content.seek(0)

        try:
            im = Image.open(BytesIO(raw))
            im.load()
        except UnidentifiedImageError as exc:
            raise SuspiciousFileOperation("Upload is not a valid image file.") from exc

        im = _normalize_for_webp(im)
        buf = BytesIO()
        save_kw: dict = {"format": "WEBP", "quality": self._webp_quality}
        if im.mode == "RGBA":
            save_kw["method"] = 6
        webp_name = self._webp_relative_name(str(name))
        try:
            im.save(buf, **save_kw)
            return super().save(webp_name, ContentFile(buf.getvalue()), max_length=max_length)
        except (OSError, KeyError, ValueError):
            # Pillow builds without libwebp cannot encode WEBP; store JPEG instead.
            buf = BytesIO()
            if im.mode == "RGBA":
                im = im.convert("RGB")
            im.save(buf, format="JPEG", quality=min(self._webp_quality + 8, 95))
            jpeg_name = str(Path(webp_name).with_suffix(".jpg"))
            return super().save(jpeg_name, ContentFile(buf.getvalue()), max_length=max_length)


webp_image_storage = WebPImageStorage()

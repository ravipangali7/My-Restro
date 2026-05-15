"""DRF renderers for non-JSON responses."""

from rest_framework.renderers import BaseRenderer


class OrderBillWebPRenderer(BaseRenderer):
    """Allows ``Accept: image/webp`` on bill download without coercing the body through JSON."""

    media_type = "image/webp"
    format = "webp"
    charset = None
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data if isinstance(data, (bytes, memoryview)) else b""


# Backwards-compatible alias for imports / API docs.
OrderBillPNGRenderer = OrderBillWebPRenderer

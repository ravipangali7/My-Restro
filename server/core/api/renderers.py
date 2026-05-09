"""DRF renderers for non-JSON responses."""

from rest_framework.renderers import BaseRenderer


class OrderBillPNGRenderer(BaseRenderer):
    """Allows ``Accept: image/png`` on bill download without coercing the body through JSON."""

    media_type = "image/png"
    format = "png"
    charset = None
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data if isinstance(data, (bytes, memoryview)) else b""

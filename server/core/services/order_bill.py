"""Generate a premium PNG bill image for an order (checkout + notifications)."""

from __future__ import annotations

import os
import unicodedata
from decimal import Decimal
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageDraw, ImageFont

from core.models import Order, OrderItem


WIDTH = 720
MARGIN_X = 28
PAGE_BG = (252, 252, 253)
TEXT_PRIMARY = (26, 26, 46)
TEXT_MUTED = (95, 99, 118)
RULE = (220, 224, 232)
SENDER_FILL = (245, 240, 255)
SENDER_BORDER = (198, 176, 235)
RECEIVER_FILL = (255, 248, 235)
RECEIVER_BORDER = (224, 192, 130)
DISCOUNT_FILL = (232, 245, 233)
DISCOUNT_BORDER = (76, 175, 80)
DISCOUNT_ACCENT = (46, 125, 50)
DELIVERY_FILL = (227, 242, 253)
DELIVERY_BORDER = (33, 150, 243)
DELIVERY_ACCENT = (13, 71, 161)
ITEM_STRIP = (247, 249, 252)
PLACEHOLDER_BG = (236, 238, 242)
TOTAL_BAR = (30, 35, 55)

_RESAMPLE = getattr(Image, "Resampling", Image).LANCZOS


def _party_card_height(detail_lines: list[str], phone: str, *, extra_sub: str | None) -> int:
    pad = 14
    line_h = 17
    h = pad * 2 + 18 + 22 + (20 if phone.strip() else 0) + max(1, len(detail_lines)) * line_h
    h += 20 if extra_sub else 8
    return h


def _safe_visual(text: str) -> str:
    """Keep receipt text compatible when bitmap/TTF lacks glyphs."""
    out: list[str] = []
    for ch in text:
        o = ord(ch)
        if ch == "\n" or 32 <= o <= 126:
            out.append(ch)
        else:
            out.append("?")
    return "".join(out)


def _unicode_printable(text: str, *, max_chars: int | None = None) -> str:
    """Strip C0 control characters but keep letters in any script for customer names and addresses."""
    out: list[str] = []
    for ch in text or "":
        if ch in "\r\n\t":
            out.append(" ")
        elif unicodedata.category(ch) == "Cc":
            continue
        else:
            out.append(ch)
    s = " ".join("".join(out).split())
    if max_chars is not None:
        s = s[:max_chars]
    return s


def _fmt_money(value: Decimal | float | str | None) -> str:
    if value is None:
        return "0.00"
    return f"{Decimal(str(value)):.2f}"


def _line_label(item: OrderItem) -> str:
    if getattr(item, "ad_hoc_label", None):
        s = (item.ad_hoc_label or "").strip()
        if s:
            return s
    if item.comboset_id and item.comboset:
        return item.comboset.name
    if item.product_item_id and item.product_item:
        pi = item.product_item
        prod = getattr(pi, "product", None)
        base = prod.name if prod is not None else "Item"
        unit = getattr(getattr(pi, "unit", None), "symbol", None) or ""
        return f"{base} ({unit})" if unit else base
    if item.product_id and item.product:
        return item.product.name
    return "Item"


def _product_item_list_unit(item: OrderItem) -> Decimal | None:
    pi = item.product_item
    if pi is None:
        return None
    list_u = pi.price
    paid_u = item.price
    if list_u > paid_u:
        return list_u
    return None


def _line_menu_offer_savings(item: OrderItem) -> Decimal:
    list_u = _product_item_list_unit(item)
    if list_u is None:
        return Decimal("0.00")
    return ((list_u - item.price) * item.quantity).quantize(Decimal("0.01"))


def _font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    paths: list[str] = []
    if bold:
        paths.extend(
            [
                "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
                "/usr/share/fonts/opentype/noto/NotoSans-Bold.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                r"C:\Windows\Fonts\arialbd.ttf",
                r"C:\Windows\Fonts\segoeuib.ttf",
            ]
        )
    paths.extend(
        [
            "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
            "/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\segoeui.ttf",
        ]
    )
    for path in paths:
        if path and os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def _wrap_lines(
    text: str,
    font: ImageFont.ImageFont,
    draw: ImageDraw.ImageDraw,
    max_width: int,
) -> list[str]:
    text = _unicode_printable((text or "").replace("\n", " ").strip())
    if not text:
        return []
    words = text.split()
    lines: list[str] = []
    cur: list[str] = []
    for w in words:
        test = (" ".join(cur + [w])).strip()
        tw, _ = _text_size(draw, test, font)
        if tw <= max_width or not cur:
            cur.append(w)
        else:
            lines.append(" ".join(cur))
            cur = [w]
    if cur:
        lines.append(" ".join(cur))
    return lines


def _open_field_image(field) -> Image.Image | None:
    if not field or not getattr(field, "name", None):
        return None
    try:
        with field.open("rb") as f:
            return Image.open(f).convert("RGBA")
    except OSError:
        return None


def _fit_cover(im: Image.Image, box_w: int, box_h: int) -> Image.Image:
    w, h = im.size
    scale = max(box_w / w, box_h / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = im.resize((nw, nh), _RESAMPLE)
    left = (nw - box_w) // 2
    top = (nh - box_h) // 2
    return resized.crop((left, top, left + box_w, top + box_h))


def _line_item_photo(item: OrderItem) -> Image.Image | None:
    if item.comboset_id and item.comboset:
        return _open_field_image(item.comboset.image)
    if item.product_item_id and item.product_item:
        prod = getattr(item.product_item, "product", None)
        if prod is not None:
            return _open_field_image(prod.image)
    if item.product_id and item.product:
        return _open_field_image(item.product.image)
    return None


def _customer_display(order: Order) -> tuple[str, str]:
    if order.customer_id and order.customer:
        return (order.customer.name or "Customer", order.customer.phone or "")
    name = (order.guest_customer_name or "").strip()
    phone = (order.guest_customer_phone or "").strip()
    if name or phone:
        return (name or "Guest", phone)
    return ("Guest customer", "")


def _draw_round_rect(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    *,
    radius: int,
    fill: tuple[int, int, int] | str,
    outline: tuple[int, int, int] | str | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def render_order_bill_png(order: Order) -> bytes:
    """Build a wide, structured PNG receipt with logo, photos, parties, and fee highlights."""
    order = (
        Order.objects.filter(pk=order.pk)
        .select_related("restaurant", "customer", "table")
        .first()
    )
    if order is None:
        raise Order.DoesNotExist

    items = list(
        OrderItem.objects.filter(order_id=order.pk).select_related(
            "product",
            "product_item",
            "product_item__product",
            "product_item__unit",
            "comboset",
        )
    )

    restaurant = order.restaurant
    rest_name = _unicode_printable((restaurant.name or "Restaurant"), max_chars=80)
    cust_name, cust_phone = _customer_display(order)

    font_xs = _font(11)
    font_sm = _font(13)
    font_md = _font(15)
    font_lg = _font(20, bold=True)
    font_xl = _font(26, bold=True)
    font_total = _font(22, bold=True)

    inner_w = WIDTH - 2 * MARGIN_X

    # --- measure dynamic heights (addresses) ---
    img_measure = Image.new("RGB", (WIDTH, 400), PAGE_BG)
    draw_m = ImageDraw.Draw(img_measure)

    sender_lines = _wrap_lines(
        (restaurant.address or "").strip() or "Address on file",
        font_sm,
        draw_m,
        inner_w - 36,
    )
    receiver_addr = (order.address or "").strip()
    if order.order_type == "delivery" and not receiver_addr:
        receiver_addr = "Same as contact / not provided"
    receiver_lines = _wrap_lines(receiver_addr, font_sm, draw_m, inner_w - 36)

    table_note_preview = ""
    if order.table_id and order.table:
        table_note_preview = f"Table: {order.table.name}"
    sender_block_h = _party_card_height(sender_lines, (restaurant.phone or "").strip(), extra_sub=None)
    receiver_block_h = _party_card_height(
        receiver_lines,
        cust_phone,
        extra_sub=table_note_preview or None,
    )
    thumb = 132
    row_gap = 14
    row_h = thumb + 20
    menu_offer_total = sum((_line_menu_offer_savings(it) for it in items), Decimal("0.00"))
    offer_summary_h = 30 if menu_offer_total > 0 else 0
    items_h = len(items) * (row_h + row_gap) if items else row_h + 24

    logo_max_h = 104
    logo_slot = logo_max_h + 28
    meta_h = 22 + 18 + 18
    section_title_h = 26

    height = (
        24
        + logo_slot
        + 8
        + 28
        + meta_h
        + 20
        + sender_block_h
        + 12
        + receiver_block_h
        + 22
        + section_title_h
        + items_h
        + offer_summary_h
        + 28
        + 26
        + 58
        + 58
        + 52
        + 36
        + 40
    )
    # Extra slack for font metrics / logo aspect ratios; trimmed after layout.
    canvas_h = height + 160

    img = Image.new("RGB", (WIDTH, canvas_h), PAGE_BG)
    draw = ImageDraw.Draw(img)
    y = 22

    # --- logo ---
    logo_img = _open_field_image(restaurant.logo)
    if logo_img is not None:
        lw, lh = logo_img.size
        scale = min(220 / lw, logo_max_h / lh, 1.0)
        nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
        logo_img = logo_img.resize((nw, nh), _RESAMPLE)
        lx = (WIDTH - nw) // 2
        img.paste(logo_img, (lx, y), logo_img)
        y += nh + 22
    else:
        badge_r = 44
        bx0 = WIDTH // 2 - badge_r
        by0 = y + 8
        _draw_round_rect(
            draw,
            (bx0, by0, bx0 + badge_r * 2, by0 + badge_r * 2),
            radius=badge_r,
            fill=(240, 242, 248),
            outline=RULE,
            width=2,
        )
        initial = (rest_name[:1] or "R").upper()
        iw, ih = _text_size(draw, initial, font_xl)
        draw.text((bx0 + badge_r - iw // 2, by0 + badge_r - ih // 2 - 2), initial, fill=TEXT_PRIMARY, font=font_xl)
        y += badge_r * 2 + 28

    # --- title & meta ---
    tw, th = _text_size(draw, rest_name, font_lg)
    draw.text(((WIDTH - tw) // 2, y), rest_name, fill=TEXT_PRIMARY, font=font_lg)
    y += th + 10

    meta1 = f"Bill  {order.order_id}"
    draw.text((MARGIN_X, y), meta1, fill=TEXT_MUTED, font=font_sm)
    y += 20
    type_label = order.get_order_type_display() if hasattr(order, "get_order_type_display") else order.order_type
    status_label = order.get_status_display() if hasattr(order, "get_status_display") else order.status
    meta2 = f"Type: {type_label}   |   Status: {status_label}"
    draw.text((MARGIN_X, y), _unicode_printable(meta2), fill=TEXT_MUTED, font=font_sm)
    y += 26

    draw.line((MARGIN_X, y, WIDTH - MARGIN_X, y), fill=RULE, width=1)
    y += 18

    # --- sender / receiver cards ---
    def party_card(
        *,
        title: str,
        name: str,
        phone: str,
        detail_lines: list[str],
        fill: tuple[int, int, int],
        border: tuple[int, int, int],
        extra_sub: str | None = None,
    ) -> None:
        nonlocal y
        pad = 14
        x0, x1 = MARGIN_X, WIDTH - MARGIN_X
        line_h = 17
        block_h = _party_card_height(detail_lines, phone, extra_sub=extra_sub)
        _draw_round_rect(draw, (x0, y, x1, y + block_h), radius=14, fill=fill, outline=border, width=2)
        ty = y + pad
        draw.text((x0 + pad, ty), title, fill=TEXT_MUTED, font=font_xs)
        ty += 18
        draw.text((x0 + pad, ty), _unicode_printable(name, max_chars=70), fill=TEXT_PRIMARY, font=font_md)
        ty += 22
        if phone:
            draw.text((x0 + pad, ty), _safe_visual(f"Phone: {phone}"), fill=TEXT_MUTED, font=font_sm)
            ty += 20
        for ln in detail_lines or [""]:
            draw.text((x0 + pad, ty), _unicode_printable(ln, max_chars=120), fill=TEXT_MUTED, font=font_sm)
            ty += line_h
        if extra_sub:
            draw.text((x0 + pad, ty + 2), _unicode_printable(extra_sub), fill=TEXT_MUTED, font=font_xs)
        y += block_h + 12

    party_card(
        title="FROM (RESTAURANT)",
        name=rest_name,
        phone=(restaurant.phone or "").strip(),
        detail_lines=sender_lines,
        fill=SENDER_FILL,
        border=SENDER_BORDER,
    )
    table_note = table_note_preview
    party_card(
        title="TO (CUSTOMER / DELIVERY)",
        name=_unicode_printable(cust_name, max_chars=70),
        phone=_safe_visual(cust_phone),
        detail_lines=receiver_lines,
        fill=RECEIVER_FILL,
        border=RECEIVER_BORDER,
        extra_sub=table_note or None,
    )

    draw.text((MARGIN_X, y), "Order items", fill=TEXT_PRIMARY, font=font_md)
    y += 28

    # --- line items with images ---
    for it in items:
        label = _unicode_printable(_line_label(it), max_chars=56)
        qty = _fmt_money(it.quantity)
        unit = _fmt_money(it.price)
        tot = _fmt_money(it.total)
        row_top = y
        _draw_round_rect(
            draw,
            (MARGIN_X, row_top, WIDTH - MARGIN_X, row_top + row_h),
            radius=12,
            fill=ITEM_STRIP,
            outline=RULE,
            width=1,
        )

        photo = _line_item_photo(it)
        ix, iy = MARGIN_X + 10, row_top + 10
        _draw_round_rect(draw, (ix, iy, ix + thumb, iy + thumb), radius=10, fill=PLACEHOLDER_BG, outline=RULE, width=1)
        if photo is not None:
            tile = _fit_cover(photo.convert("RGBA"), thumb, thumb)
            img.paste(tile, (ix, iy), tile)

        tx = ix + thumb + 16
        ty = row_top + 14
        draw.text((tx, ty), label, fill=TEXT_PRIMARY, font=font_md)
        ty += 24
        line2 = f"Qty {qty}  x  Unit price {unit}"
        draw.text((tx, ty), line2, fill=TEXT_MUTED, font=font_sm)
        list_u = _product_item_list_unit(it)
        if list_u is not None:
            ty += 18
            save_amt = _line_menu_offer_savings(it)
            offer_txt = f"List {_fmt_money(list_u)} - menu offer saves {_fmt_money(save_amt)}"
            draw.text((tx, ty), offer_txt, fill=DISCOUNT_ACCENT, font=font_xs)
        # right-aligned line total emphasis
        rt = f"{tot}"
        rtw, _ = _text_size(draw, rt, font_lg)
        draw.text((WIDTH - MARGIN_X - rtw - 14, row_top + thumb // 2 - 8), rt, fill=TEXT_PRIMARY, font=font_lg)

        y += row_h + row_gap

    y += 8
    draw.line((MARGIN_X, y, WIDTH - MARGIN_X, y), fill=RULE, width=1)
    y += 18

    if menu_offer_total > 0:
        banner_h = 30
        _draw_round_rect(
            draw,
            (MARGIN_X, y, WIDTH - MARGIN_X, y + banner_h),
            radius=10,
            fill=DISCOUNT_FILL,
            outline=DISCOUNT_BORDER,
            width=1,
        )
        draw.text(
            (MARGIN_X + 12, y + 7),
            "Menu offer savings (vs list price)",
            fill=DISCOUNT_ACCENT,
            font=font_sm,
        )
        sv = _fmt_money(menu_offer_total)
        svw, _ = _text_size(draw, sv, font_sm)
        draw.text((WIDTH - MARGIN_X - svw - 12, y + 7), sv, fill=DISCOUNT_ACCENT, font=font_sm)
        y += banner_h + 10

    # --- subtotal ---
    def money_row(left: str, right: str, font: ImageFont.ImageFont) -> None:
        nonlocal y
        draw.text((MARGIN_X, y), left, fill=TEXT_MUTED, font=font)
        rw, _ = _text_size(draw, right, font)
        draw.text((WIDTH - MARGIN_X - rw, y), right, fill=TEXT_PRIMARY, font=font)
        y += 24

    money_row("Subtotal", _fmt_money(order.sub_total), font_sm)
    svc = getattr(order, "service_charge", Decimal("0.00")) or Decimal("0.00")
    if svc > 0:
        money_row("Service charge", _fmt_money(svc), font_sm)
    y += 6

    # --- discount highlight (only when an order-level discount is present) ---
    disc = order.discount or Decimal("0.00")
    if disc > 0:
        disc_h = 52
        _draw_round_rect(
            draw,
            (MARGIN_X, y, WIDTH - MARGIN_X, y + disc_h),
            radius=12,
            fill=DISCOUNT_FILL,
            outline=DISCOUNT_BORDER,
            width=2,
        )
        draw.text((MARGIN_X + 14, y + 10), "Discount applied", fill=DISCOUNT_ACCENT, font=font_md)
        dv = f"- {_fmt_money(disc)}"
        dvw, _ = _text_size(draw, dv, font_md)
        draw.text((WIDTH - MARGIN_X - dvw - 14, y + 10), dv, fill=DISCOUNT_ACCENT, font=font_md)
        y += disc_h + 12

    # --- delivery highlight ---
    del_h = 52
    _draw_round_rect(
        draw,
        (MARGIN_X, y, WIDTH - MARGIN_X, y + del_h),
        radius=12,
        fill=DELIVERY_FILL,
        outline=DELIVERY_BORDER,
        width=2,
    )
    draw.text((MARGIN_X + 14, y + 10), "Delivery charge", fill=DELIVERY_ACCENT, font=font_md)
    dfv = _fmt_money(order.delivery_fee)
    dfw, _ = _text_size(draw, dfv, font_md)
    draw.text((WIDTH - MARGIN_X - dfw - 14, y + 10), dfv, fill=DELIVERY_ACCENT, font=font_md)
    y += del_h + 18

    # --- grand total ---
    total_h = 48
    _draw_round_rect(
        draw,
        (MARGIN_X, y, WIDTH - MARGIN_X, y + total_h),
        radius=12,
        fill=TOTAL_BAR,
        outline=TOTAL_BAR,
        width=0,
    )
    draw.text((MARGIN_X + 16, y + 12), "Total Price", fill=(255, 255, 255), font=font_md)
    tv = _fmt_money(order.total)
    tvw, _ = _text_size(draw, tv, font_total)
    draw.text((WIDTH - MARGIN_X - tvw - 16, y + 10), tv, fill=(255, 255, 255), font=font_total)
    y += total_h + 22

    ft = "Thank you for your order."
    ftw, fth = _text_size(draw, ft, font_sm)
    draw.text(((WIDTH - ftw) // 2, y), ft, fill=TEXT_MUTED, font=font_sm)
    y += fth + 20

    img = img.crop((0, 0, WIDTH, min(y + 24, canvas_h)))

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def ensure_order_bill_image(order: Order) -> None:
    """Generate and persist ``bill_image`` if missing."""
    if order.bill_image:
        return
    attach_order_bill_image(order)


def attach_order_bill_image(order: Order) -> None:
    """Render bill PNG and save to ``order.bill_image`` (overwrites if present)."""
    png = render_order_bill_png(order)
    safe_id = (order.order_id or f"order-{order.pk}").replace("/", "-")
    order.bill_image.save(f"{safe_id}.png", ContentFile(png), save=True)

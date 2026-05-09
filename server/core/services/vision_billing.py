"""Counter camera scan: optional OpenAI vision + local menu name matching."""

from __future__ import annotations

import base64
import json
import os
import re
import urllib.error
import urllib.request
from decimal import InvalidOperation
from typing import Any

from django.conf import settings
from django.db.models import Q

from core.models import ProductItem, Restaurant
from core.services.orders import _line_unit_and_product


def _openai_key() -> str:
    s = (getattr(settings, "OPENAI_API_KEY", None) or "").strip()
    if s:
        return s
    return (os.environ.get("OPENAI_API_KEY") or "").strip()


def suggest_menu_matches(*, restaurant_id: int, name_hint: str, limit: int = 5) -> list[dict[str, Any]]:
    """Fuzzy match on product name for the restaurant (for staff to pick catalog pricing)."""
    try:
        restaurant = Restaurant.objects.get(pk=restaurant_id)
    except Exception:  # noqa: BLE001
        return []
    q = (name_hint or "").strip()
    if not q:
        return []
    words = [w for w in re.split(r"\s+", q.lower()) if len(w) > 1][:4]
    qs = ProductItem.objects.filter(product__restaurant_id=restaurant_id, is_active=True).select_related(
        "product", "unit"
    )
    if words:
        flt = Q()
        for w in words:
            flt |= Q(product__name__icontains=w)
        qs = qs.filter(flt)
    out: list[dict[str, Any]] = []
    for pi in qs[: max(limit * 3, 12)]:
        try:
            u, _prod, _pii, _ = _line_unit_and_product(
                restaurant=restaurant, product_item_id=pi.id, comboset_id=None
            )
        except Exception:  # noqa: BLE001
            u = pi.discounted_price
        base = pi.product.name if pi.product else "Item"
        unit = pi.unit.symbol if pi.unit else ""
        label = f"{base} ({unit})" if unit else base
        out.append(
            {
                "product_item_id": pi.id,
                "label": label,
                "unit_price": str(u),
            }
        )
        if len(out) >= limit:
            break
    return out


def _parse_vision_json(text: str) -> dict[str, Any]:
    t = (text or "").strip()
    try:
        return json.loads(t) if t else {}
    except json.JSONDecodeError:
        # Model sometimes wraps JSON in prose
        m = re.search(r"\{[^{}]*\}", t, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {}


def _call_openai_vision_jpeg(*, image_bytes: bytes) -> dict[str, Any] | None:
    api_key = _openai_key()
    if not api_key:
        return None
    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    model = (getattr(settings, "OPENAI_VISION_MODEL", None) or "gpt-4o-mini").strip() or "gpt-4o-mini"
    system_prompt = (
        "You are helping a retail cashier. Look at the product photo. "
        "Respond with JSON only: "
        '{"item_name": string, "estimated_price": number or null, "currency": "INR", "confidence": number 0-1, '
        '"notes": string}. Price should be a reasonable retail unit price in INR if you can guess from packaging; '
        "else null. item_name: short product name. If the image is unreadable, set item_name to empty string."
    )
    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": 300,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Identify the product and suggest a likely retail unit price in India."},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{b64}",
                            "detail": "low",
                        },
                    },
                ],
            },
        ],
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
    except (urllib.error.HTTPError, urllib.error.URLError, OSError) as e:
        return None
    try:
        data = json.loads(raw)
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return None
    return _parse_vision_json(str(content))


def scan_bill_item_from_image(
    *, image_bytes: bytes, content_type: str, restaurant_id: int
) -> dict[str, Any]:
    """
    Return suggested item name, price, menu matches, and whether OpenAI was used.
    """
    # Normalize to JPEG for vision when possible
    img = image_bytes
    ct = (content_type or "").lower()
    if "png" in ct or image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        try:
            from io import BytesIO

            from PIL import Image

            im = Image.open(BytesIO(image_bytes))
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            buf = BytesIO()
            im.save(buf, format="JPEG", quality=85)
            img = buf.getvalue()
        except Exception:  # noqa: BLE001
            pass

    ai: dict[str, Any] = {}
    used = False
    v = _call_openai_vision_jpeg(image_bytes=img)
    if v is not None:
        used = True
        ai = v
    item_name = (ai.get("item_name") or "").strip() if isinstance(ai.get("item_name"), str) else ""
    if not item_name and isinstance(ai.get("notes"), str):
        item_name = (ai.get("notes") or "").strip()[:120]

    est = ai.get("estimated_price")
    estimated_price: float | None = None
    if est is not None:
        try:
            estimated_price = float(est)
        except (TypeError, ValueError, InvalidOperation):
            estimated_price = None

    conf = ai.get("confidence")
    try:
        confidence = float(conf) if conf is not None else 0.5 if used else 0.0
    except (TypeError, ValueError):
        confidence = 0.5

    if not used:
        item_name = item_name or ""
        out_detail = "AI vision is not configured (set OPENAI_API_KEY) or the request failed. Enter the item below."
    else:
        if not item_name and estimated_price is None:
            out_detail = "Could not read the product clearly. Try a closer photo or add manually."
        else:
            out_detail = ""

    if item_name:
        menu_matches = suggest_menu_matches(restaurant_id=restaurant_id, name_hint=item_name, limit=5)
    else:
        menu_matches = []
    suggested: dict[str, Any] | None = menu_matches[0] if menu_matches else None

    return {
        "item_name": item_name,
        "estimated_price": estimated_price,
        "confidence": confidence,
        "suggested_menu_item": suggested,
        "used_ai": used,
        "menu_matches": menu_matches,
        "detail": out_detail,
    }

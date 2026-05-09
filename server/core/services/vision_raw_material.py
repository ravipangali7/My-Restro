"""Cashier camera scan for raw ingredients: optional OpenAI vision + unit / catalog hints."""

from __future__ import annotations

import base64
import json
import re
import urllib.error
import urllib.request
from decimal import InvalidOperation
from typing import Any

from django.conf import settings
from django.db.models import Q

from core.models import RawMaterial, Unit
from core.services.vision_billing import _openai_key, _parse_vision_json


def suggest_existing_raw_materials(*, restaurant_id: int, name_hint: str, limit: int = 5) -> list[dict[str, Any]]:
    q = (name_hint or "").strip()
    if not q:
        return []
    words = [w for w in re.split(r"\s+", q.lower()) if len(w) > 2][:4]
    qs = RawMaterial.objects.filter(restaurant_id=restaurant_id).select_related("unit").order_by("name")
    if words:
        flt = Q()
        for w in words:
            flt |= Q(name__icontains=w)
        qs = qs.filter(flt)
    out: list[dict[str, Any]] = []
    for rm in qs[: max(limit * 2, 10)]:
        out.append(
            {
                "id": rm.id,
                "name": rm.name,
                "stock": str(rm.stock),
                "unit_symbol": rm.unit.symbol if rm.unit else "",
            }
        )
        if len(out) >= limit:
            break
    return out


def _resolve_suggested_unit(*, restaurant_id: int, unit_hint: str | None) -> tuple[Unit | None, str]:
    hint = (unit_hint or "").strip().lower()
    qs = Unit.objects.filter(restaurant_id=restaurant_id).order_by("name")
    first = qs.first()
    if not hint:
        return first, ""

    aliases = {
        "liter": "l",
        "litre": "l",
        "ltr": "l",
        "liters": "l",
        "kilogram": "kg",
        "kilograms": "kg",
        "gram": "g",
        "grams": "g",
        "milliliter": "ml",
        "millilitre": "ml",
        "piece": "pcs",
        "pieces": "pcs",
        "packet": "pkt",
        "pack": "pkt",
    }
    hint = aliases.get(hint, hint)

    exact: Unit | None = None
    partial: Unit | None = None
    for u in qs:
        sym = (u.symbol or "").strip().lower()
        nm = u.name.strip().lower()
        if sym == hint or nm == hint:
            exact = u
            break
        if hint in sym or hint in nm or sym in hint or nm in hint:
            partial = partial or u
    chosen = exact or partial
    if chosen:
        label = (chosen.symbol or chosen.name).strip()
        return chosen, label
    return first, (first.symbol or first.name).strip() if first else ""


def _call_openai_raw_material_jpeg(*, image_bytes: bytes) -> dict[str, Any] | None:
    api_key = _openai_key()
    if not api_key:
        return None
    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    model = (getattr(settings, "OPENAI_VISION_MODEL", None) or "gpt-4o-mini").strip() or "gpt-4o-mini"
    system_prompt = (
        "You identify restaurant kitchen raw ingredients from a photo — bulk staples (salt, sugar, flour), "
        "cooking oils, spices, pulses, rice, packaged commodities, produce, dairy, etc. "
        "Respond with JSON only: "
        '{"item_name": string, "estimated_price": number or null, "currency": "INR", "confidence": number 0-1, '
        '"unit_hint": string or null, "notes": string}. '
        "estimated_price: plausible purchase price per stocking unit in INR for India when inferable from packaging or typical bulk pricing; else null. "
        "unit_hint: short token matching common inventory units: kg, g, L, ml, pcs, pkt — pick the most likely stocking unit. "
        "If the photo is unclear or not food inventory, set item_name to empty string."
    )
    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": 320,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "What raw ingredient or kitchen supply is shown? Suggest name, unit, and likely INR unit price.",
                    },
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
    except (urllib.error.HTTPError, urllib.error.URLError, OSError):
        return None
    try:
        data = json.loads(raw)
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return None
    return _parse_vision_json(str(content))


def scan_raw_material_from_image(
    *, image_bytes: bytes, content_type: str, restaurant_id: int
) -> dict[str, Any]:
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
    v = _call_openai_raw_material_jpeg(image_bytes=img)
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
        confidence = float(conf) if conf is not None else (0.55 if used else 0.0)
    except (TypeError, ValueError):
        confidence = 0.55

    unit_hint = ai.get("unit_hint")
    uh = unit_hint.strip().lower() if isinstance(unit_hint, str) else None
    unit_row, unit_label = _resolve_suggested_unit(restaurant_id=restaurant_id, unit_hint=uh)

    notes = ai.get("notes") if isinstance(ai.get("notes"), str) else ""

    if not used:
        detail = "AI vision is not configured (set OPENAI_API_KEY) or the request failed. Use manual entry below."
    elif not item_name and estimated_price is None:
        detail = "Could not identify the ingredient clearly. Try a closer photo or add manually."
    else:
        detail = ""

    existing_matches: list[dict[str, Any]] = []
    if item_name:
        existing_matches = suggest_existing_raw_materials(restaurant_id=restaurant_id, name_hint=item_name, limit=5)

    return {
        "item_name": item_name,
        "estimated_price": estimated_price,
        "confidence": confidence,
        "notes": notes,
        "unit_hint": uh or "",
        "suggested_unit_id": unit_row.id if unit_row else None,
        "suggested_unit_label": unit_label or None,
        "existing_matches": existing_matches,
        "used_ai": used,
        "detail": detail,
    }

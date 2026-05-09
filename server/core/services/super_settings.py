"""Canonical access to the singleton platform SuperSetting row."""

from __future__ import annotations

from django.db import transaction

from core.models import SuperSetting


def get_super_setting() -> SuperSetting:
    """Return the primary platform settings row (lowest id), creating one if missing."""
    with transaction.atomic():
        rows = list(SuperSetting.objects.select_for_update().order_by("id")[:1])
        if rows:
            return rows[0]
        return SuperSetting.objects.create()

"""Geodesic helpers for proximity checks (WGS84 sphere approximation)."""

from __future__ import annotations

import math
from decimal import Decimal


def haversine_distance_m(
    lat1: float | Decimal,
    lon1: float | Decimal,
    lat2: float | Decimal,
    lon2: float | Decimal,
) -> float:
    """Great-circle distance between two WGS84 coordinates in meters."""
    r = 6371000.0
    p1 = math.radians(float(lat1))
    p2 = math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlmb = math.radians(float(lon2) - float(lon1))
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return r * c


def haversine_distance_km(
    lat1: float | Decimal,
    lon1: float | Decimal,
    lat2: float | Decimal,
    lon2: float | Decimal,
) -> float:
    """Great-circle distance in kilometers (used for delivery pricing)."""
    return haversine_distance_m(lat1, lon1, lat2, lon2) / 1000.0

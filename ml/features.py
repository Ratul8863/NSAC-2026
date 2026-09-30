"""Shared feature helpers for the prototype susceptibility models.

Rainfall, slope, and river proximity are normalized to the 0–1 range used by the
landslide and flood functions. The thresholds are scenario scales for Rasuwa,
not universal physical constants.
"""

from __future__ import annotations

from dataclasses import dataclass


def clip(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def sigmoid(value: float) -> float:
    if value > 20:
        return 1.0
    if value < -20:
        return 0.0
    from math import exp

    return 1.0 / (1.0 + exp(-value))


@dataclass(frozen=True)
class TerrainSample:
    rain_24h: float
    rain_48h: float
    rain_72h: float
    rain_7d: float
    slope_deg: float
    elevation_m: float
    concavity: float
    cover_susceptibility: float
    river_km: float
    historical_landslides: int
    deformation: float
    satellite_change: float
    release_exposure: float


def rainfall_index(rain_72h: float) -> float:
    """0 at 40 mm / 72 h, 1 at 220 mm / 72 h."""
    return clip((rain_72h - 40.0) / 180.0)


def slope_index(slope_deg: float) -> float:
    return clip(slope_deg / 45.0)


def river_proximity(river_km: float) -> float:
    return clip(1.0 - river_km / 2.0)


def valley_index(elevation_m: float) -> float:
    """Higher in lower valleys within this mountainous AOI."""
    return clip((2600.0 - elevation_m) / 1900.0)


def history_index(count: int) -> float:
    return clip(count / 5.0)

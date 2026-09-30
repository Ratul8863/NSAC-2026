"""Flood susceptibility from rainfall, valley position, and river proximity.

An upstream-release scenario adds an extra term on zones that sit on the
Trishuli main stem. That term is a what-if input, not a measured discharge.
"""

from __future__ import annotations

from ml.features import TerrainSample, rainfall_index, river_proximity, sigmoid, valley_index

FLOOD_BIAS = -2.15

WEIGHTS = {
    "rainfall": 1.40,
    "river": 1.35,
    "terrain": 0.55,
    "upstream_release": 0.95,
}

LABELS = {
    "rainfall": "72-hour rainfall",
    "river": "River proximity",
    "terrain": "Valley terrain",
    "upstream_release": "Upstream release",
}


def flood_terms(sample: TerrainSample, upstream_release: bool) -> dict[str, float]:
    terms = {
        "rainfall": WEIGHTS["rainfall"] * rainfall_index(sample.rain_72h),
        "river": WEIGHTS["river"] * river_proximity(sample.river_km),
        "terrain": WEIGHTS["terrain"] * valley_index(sample.elevation_m),
        "bias": FLOOD_BIAS,
    }
    if upstream_release and sample.release_exposure > 0:
        terms["upstream_release"] = WEIGHTS["upstream_release"] * sample.release_exposure
    return terms


def flood_probability(sample: TerrainSample, upstream_release: bool) -> tuple[float, dict[str, float]]:
    terms = flood_terms(sample, upstream_release)
    return sigmoid(sum(terms.values())), terms

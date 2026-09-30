"""Interpretable landslide susceptibility.

This is the MVP stand-in for a later inventory-trained gradient-boosted model.
Each term is a documented weight times a normalized feature. The probability is
a logistic function of those terms, so the bars in the dashboard are the model,
not a post-hoc explanation of a black box.
"""

from __future__ import annotations

from ml.features import TerrainSample, history_index, rainfall_index, sigmoid, slope_index

# Logistic bias chosen so the Rasuwa scenario separates ridge villages from
# steep, rain-loaded valley and highway slopes.
LANDSLIDE_BIAS = -2.35

WEIGHTS = {
    "rainfall": 1.55,
    "slope": 1.25,
    "deformation": 0.85,
    "historical": 0.70,
    "land_cover": 0.45,
    "curvature": 0.30,
    "satellite_change": 0.40,
}

LABELS = {
    "rainfall": "72-hour rainfall",
    "slope": "Slope",
    "deformation": "Ground deformation",
    "historical": "Historical events",
    "land_cover": "Land cover",
    "curvature": "Curvature",
    "satellite_change": "Surface change",
}


def landslide_terms(sample: TerrainSample) -> dict[str, float]:
    terms = {
        "rainfall": WEIGHTS["rainfall"] * rainfall_index(sample.rain_72h),
        "slope": WEIGHTS["slope"] * slope_index(sample.slope_deg),
        "deformation": WEIGHTS["deformation"] * sample.deformation,
        "historical": WEIGHTS["historical"] * history_index(sample.historical_landslides),
        "land_cover": WEIGHTS["land_cover"] * sample.cover_susceptibility,
        "curvature": WEIGHTS["curvature"] * sample.concavity,
        "satellite_change": WEIGHTS["satellite_change"] * sample.satellite_change,
        "bias": LANDSLIDE_BIAS,
    }
    return terms


def landslide_probability(sample: TerrainSample) -> tuple[float, dict[str, float]]:
    terms = landslide_terms(sample)
    score = sigmoid(sum(terms.values()))
    return score, terms

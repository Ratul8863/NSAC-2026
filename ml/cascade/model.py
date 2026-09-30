"""Conditional cascade on top of the landslide and flood probabilities.

Relationships follow the chain in the project brief:

rainfall → slope instability → landslide → blockage / debris flow → flash flood
→ bridge failure → isolation

Isolation from the road network is passed in, because it depends on the route
graph rather than on a single slope cell.
"""

from __future__ import annotations

from ml.features import clip, rainfall_index, river_proximity, slope_index


def cascade_probabilities(
    *,
    landslide: float,
    flood: float,
    rain_72h: float,
    slope_deg: float,
    river_km: float,
    bridges: int,
    isolation: float,
) -> list[dict[str, float | str]]:
    rain_n = rainfall_index(rain_72h)
    slope_n = slope_index(slope_deg)
    prox = river_proximity(river_km)
    instability = clip(0.50 * slope_n + 0.50 * rain_n)
    blockage = clip(landslide * (0.20 + 0.80 * prox) * 0.90)
    debris = clip(landslide * (0.30 + 0.70 * slope_n) * (0.25 + 0.75 * rain_n))
    flash = max(flood, clip(0.50 * blockage + 0.62 * debris))
    if bridges > 0:
        bridge = clip((0.25 + 0.15 * min(bridges, 3)) * flash)
    else:
        bridge = clip(0.12 * flash)
    return [
        {"id": "rainfall", "label": "Extreme rainfall", "probability": round(rain_n, 3)},
        {"id": "instability", "label": "Slope instability", "probability": round(instability, 3)},
        {"id": "landslide", "label": "Landslide", "probability": round(landslide, 3)},
        {"id": "blockage", "label": "River blockage", "probability": round(blockage, 3)},
        {"id": "debris", "label": "Debris flow", "probability": round(debris, 3)},
        {"id": "flood", "label": "Flash flood", "probability": round(flash, 3)},
        {"id": "bridge", "label": "Bridge failure", "probability": round(bridge, 3)},
        {"id": "isolation", "label": "Community isolation", "probability": round(isolation, 3)},
    ]

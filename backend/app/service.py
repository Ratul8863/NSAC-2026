"""Scenario orchestration: hazard, cascade, impact, priority, and routes."""

from __future__ import annotations

from ml.cascade.model import cascade_probabilities
from ml.deformation.indicators import deformation_note
from ml.features import TerrainSample, clip, rainfall_index
from ml.flood.model import LABELS as FLOOD_LABELS
from ml.flood.model import flood_probability
from ml.landslide.model import LABELS as SLIDE_LABELS
from ml.landslide.model import landslide_probability
from geospatial.routing.router import edge_hazard, risk_cost, shortest_path

from backend.app.data.scenario import (
    DEFAULT_WEIGHTS,
    FACILITIES,
    LIMITATIONS,
    OBSERVED_EVENT_ZONES,
    ORIGIN_ID,
    REPLAY_STEPS,
    ROADS,
    ZONES,
)

EXPOSED_THRESHOLD = 0.55
CRITICAL_THRESHOLD = 0.75

LEVELS = (
    (0.75, "critical"),
    (0.55, "high"),
    (0.35, "moderate"),
    (0.0, "low"),
)


def risk_level(probability: float) -> str:
    for threshold, name in LEVELS:
        if probability >= threshold:
            return name
    return "low"


def _sample(zone: dict, rainfall_scale: float) -> TerrainSample:
    return TerrainSample(
        rain_24h=zone["rainfall_24h"] * rainfall_scale,
        rain_48h=zone["rainfall_48h"] * rainfall_scale,
        rain_72h=zone["rainfall_72h"] * rainfall_scale,
        rain_7d=zone["rainfall_7d"] * rainfall_scale,
        slope_deg=zone["slope_deg"],
        elevation_m=zone["elevation_m"],
        concavity=zone["concavity"],
        cover_susceptibility=zone["cover_susceptibility"],
        river_km=zone["river_km"],
        historical_landslides=zone["historical_landslides"],
        deformation=zone["deformation"],
        satellite_change=zone["satellite_change"],
        release_exposure=zone["release_exposure"],
    )


def _bars(terms: dict[str, float], labels: dict[str, str]) -> list[dict[str, float | str]]:
    ranked = [(key, value) for key, value in terms.items() if key != "bias" and value > 0.001]
    peak = max((value for _, value in ranked), default=1.0)
    ranked.sort(key=lambda item: item[1], reverse=True)
    return [
        {"id": key, "name": labels.get(key, key), "value": round(value, 3), "share": round(value / peak, 3)}
        for key, value in ranked
    ]


def _confidence(sample: TerrainSample, landslide: float) -> dict:
    evidence: list[str] = []
    if rainfall_index(sample.rain_72h) >= 0.55:
        evidence.append("High rainfall")
    if sample.slope_deg >= 28:
        evidence.append("Steep terrain")
    if sample.historical_landslides >= 2:
        evidence.append("Historical susceptibility")
    if sample.deformation >= 0.40:
        evidence.append("Ground deformation indicator")
    if sample.river_km <= 0.6:
        evidence.append("River proximity")
    count = len(evidence)
    if count >= 4:
        level, score = "Moderate–high", 0.72
    elif count >= 2:
        level, score = "Moderate", 0.58
    else:
        level, score = "Low", 0.40
    # Strong model scores do not remove the data gaps, so confidence never reads as certain.
    if landslide < 0.35 and count < 2:
        level, score = "Low", 0.36
    return {
        "confidence": level,
        "confidence_score": score,
        "evidence": evidence,
        "limitations": [
            "Satellite observation gap",
            "Sparse ground observations",
            "Prototype model uncertainty",
        ],
        "deformation_note": deformation_note(sample.deformation),
    }


def _normalize_weights(weights: dict[str, float] | None) -> dict[str, float]:
    base = dict(DEFAULT_WEIGHTS)
    if weights:
        for key in base:
            if key in weights:
                base[key] = max(0.0, float(weights[key]))
    total = sum(base.values()) or 1.0
    return {key: value / total for key, value in base.items()}


def _priority(components: dict[str, float], weights: dict[str, float]) -> tuple[float, list[dict], str]:
    factors = []
    for key, weight in weights.items():
        factors.append(
            {
                "id": key,
                "name": {
                    "hazard": "Hazard",
                    "population": "Population exposure",
                    "isolation": "Isolation risk",
                    "infrastructure": "Infrastructure risk",
                    "accessibility": "Accessibility constraint",
                }[key],
                "weight": round(weight, 3),
                "value": round(components[key], 3),
                "contribution": round(weight * components[key], 3),
            }
        )
    factors.sort(key=lambda item: item["contribution"], reverse=True)
    score = clip(sum(item["contribution"] for item in factors))
    lead = [item["name"].lower() for item in factors[:2] if item["contribution"] > 0.02]
    if lead:
        reason = "Higher priority because " + " and ".join(lead) + " contribute most under the current weights."
    else:
        reason = "Priority stays low because hazard and exposure are both limited."
    return score, factors, reason


def _path_payload(node_ids: list[str], zones: dict[str, dict], hazards: dict[str, float]) -> dict:
    lookup = {(edge.a, edge.b): edge for edge in ROADS}
    lookup.update({(edge.b, edge.a): edge for edge in ROADS})
    coordinates = [zones[node_ids[0]]["center"]]
    distance = 0.0
    edge_hazards: list[float] = []
    edge_ids: list[str] = []
    for left, right in zip(node_ids, node_ids[1:]):
        edge = lookup[(left, right)]
        distance += edge.distance_km
        edge_hazards.append(hazards[edge.id])
        edge_ids.append(edge.id)
        coordinates.append(zones[right]["center"])
    return {
        "node_ids": node_ids,
        "names": [zones[node]["name"] for node in node_ids],
        "edge_ids": edge_ids,
        "distance_km": round(distance, 1),
        "max_hazard": round(max(edge_hazards), 3) if edge_hazards else 0.0,
        "mean_hazard": round(sum(edge_hazards) / len(edge_hazards), 3) if edge_hazards else 0.0,
        "coordinates": [[lon, lat] for lon, lat in coordinates],
    }


def _resources(zone_rows: list[dict]) -> list[dict]:
    advice = []
    for zone in zone_rows:
        if zone["priority"] >= 0.62 and zone["exposure"]["population"] >= 800:
            items = ["Rescue team", "Medical team", "Emergency supplies"]
        elif zone["priority"] >= 0.45:
            items = ["Food and water", "Monitoring"]
        elif zone["dominant"] >= 0.35:
            items = ["Monitoring"]
        else:
            continue
        if zone["features"]["hydropower"] and zone["flood"] >= 0.45:
            items = items + ["Hydropower site check"]
        advice.append(
            {
                "zone_id": zone["id"],
                "zone_name": zone["name"],
                "priority": zone["priority"],
                "level": zone["level"],
                "recommendations": items,
                "note": "Recommendation for human review, not a deployment order.",
            }
        )
    return advice[:6]


def _replay_score(zone_rows: list[dict], step: dict | None) -> dict | None:
    if step is None:
        return None
    predicted = {zone["id"] for zone in zone_rows if zone["dominant"] >= EXPOSED_THRESHOLD}
    observed = set(OBSERVED_EVENT_ZONES)
    hits = predicted & observed
    precision = len(hits) / len(predicted) if predicted else 0.0
    recall = len(hits) / len(observed) if observed else 0.0
    return {
        "step": step["id"],
        "label": step["label"],
        "hours_before": step["hours_before"],
        "rainfall_scale": step["rainfall_scale"],
        "predicted_ids": sorted(predicted),
        "observed_ids": sorted(observed),
        "hits": sorted(hits),
        "false_alarms": sorted(predicted - observed),
        "misses": sorted(observed - predicted),
        "precision": round(precision, 2),
        "recall": round(recall, 2),
        "note": (
            "Demonstration scores against a fixed reference footprint. "
            "They show how the evaluation would be reported. They are not an independent validation."
        ),
    }


def _empty_path(origin: str, zones: dict[str, dict]) -> dict:
    return {
        "node_ids": [origin],
        "names": [zones[origin]["name"]],
        "edge_ids": [],
        "distance_km": 0.0,
        "max_hazard": 0.0,
        "mean_hazard": 0.0,
        "coordinates": [zones[origin]["center"]],
    }


def run_scenario(
    *,
    rainfall_scale: float = 1.0,
    upstream_release: bool = False,
    destination_id: str = "syabrubesi",
    replay_step: str | None = None,
    weights: dict[str, float] | None = None,
) -> dict:
    rainfall_scale = clip(rainfall_scale, 0.40, 1.80)
    step = next((item for item in REPLAY_STEPS if item["id"] == replay_step), None)
    if step is not None:
        rainfall_scale = step["rainfall_scale"]
    weights = _normalize_weights(weights)
    zones = {zone["id"]: zone for zone in ZONES}
    if destination_id not in zones:
        destination_id = "syabrubesi"

    samples = {zone["id"]: _sample(zone, rainfall_scale) for zone in ZONES}
    landslide: dict[str, float] = {}
    flood: dict[str, float] = {}
    slide_terms: dict[str, dict] = {}
    flood_terms: dict[str, dict] = {}
    for zone_id, sample in samples.items():
        landslide[zone_id], slide_terms[zone_id] = landslide_probability(sample)
        flood[zone_id], flood_terms[zone_id] = flood_probability(sample, upstream_release)

    road_hazard = {edge.id: round(edge_hazard(edge, landslide, flood), 3) for edge in ROADS}

    def hazard_of(edge) -> float:
        return road_hazard[edge.id]

    def aware_weight(edge) -> float:
        return risk_cost(edge.distance_km, hazard_of(edge))

    def short_weight(edge) -> float:
        return edge.distance_km

    if destination_id == ORIGIN_ID:
        aware_nodes = [ORIGIN_ID]
        short_nodes = [ORIGIN_ID]
    else:
        aware_nodes = shortest_path(ROADS, ORIGIN_ID, destination_id, aware_weight) or [ORIGIN_ID]
        short_nodes = shortest_path(ROADS, ORIGIN_ID, destination_id, short_weight) or [ORIGIN_ID]

    # Isolation uses the least-hazard path from the rescue base. The base itself is the origin.
    access_hazard: dict[str, float] = {ORIGIN_ID: 0.0}
    for zone in ZONES:
        if zone["id"] == ORIGIN_ID:
            continue
        path = shortest_path(ROADS, ORIGIN_ID, zone["id"], aware_weight)
        if not path or len(path) == 1:
            access_hazard[zone["id"]] = 1.0
            continue
        stats = _path_payload(path, zones, road_hazard)
        access_hazard[zone["id"]] = stats["max_hazard"]

    max_pop = max(zone["population"] for zone in ZONES)
    rows = []
    for zone in ZONES:
        sample = samples[zone["id"]]
        slide = landslide[zone["id"]]
        fld = flood[zone["id"]]
        chain = cascade_probabilities(
            landslide=slide,
            flood=fld,
            rain_72h=sample.rain_72h,
            slope_deg=sample.slope_deg,
            river_km=sample.river_km,
            bridges=zone["bridges"],
            isolation=0.0,
        )
        by_id = {item["id"]: float(item["probability"]) for item in chain}
        isolation = clip(0.15 * by_id["flood"] + 0.85 * access_hazard[zone["id"]])
        chain = cascade_probabilities(
            landslide=slide,
            flood=fld,
            rain_72h=sample.rain_72h,
            slope_deg=sample.slope_deg,
            river_km=sample.river_km,
            bridges=zone["bridges"],
            isolation=isolation,
        )
        by_id = {item["id"]: float(item["probability"]) for item in chain}
        dominant = max(slide, fld, by_id["debris"])
        facility_load = (
            zone["hospitals"] * 1.0
            + zone["health_posts"] * 0.35
            + zone["schools"] * 0.12
            + zone["shelters"] * 0.16
            + zone["bridges"] * 0.22
            + zone["hydropower"] * 0.45
        )
        components = {
            "hazard": dominant,
            "population": clip(zone["population"] / max_pop) * dominant,
            "isolation": isolation,
            "infrastructure": clip(facility_load / 2.4) * dominant,
            "accessibility": access_hazard[zone["id"]],
        }
        priority, factors, reason = _priority(components, weights)
        uncertainty = _confidence(sample, slide)
        uncertainty["risk"] = round(dominant, 3)
        exposed = dominant >= EXPOSED_THRESHOLD
        rows.append(
            {
                "id": zone["id"],
                "name": zone["name"],
                "summary": zone["summary"],
                "polygon": zone["polygon"],
                "center": zone["center"],
                "rainfall": {
                    "h24": round(sample.rain_24h, 1),
                    "h48": round(sample.rain_48h, 1),
                    "h72": round(sample.rain_72h, 1),
                    "d7": round(sample.rain_7d, 1),
                },
                "features": {
                    "elevation_m": zone["elevation_m"],
                    "slope_deg": zone["slope_deg"],
                    "aspect_deg": zone["aspect_deg"],
                    "land_cover": zone["land_cover"],
                    "soil": zone["soil"],
                    "river_km": zone["river_km"],
                    "historical_landslides": zone["historical_landslides"],
                    "deformation": zone["deformation"],
                    "satellite_change": zone["satellite_change"],
                    "hydropower": zone["hydropower"],
                },
                "landslide": round(slide, 3),
                "flood": round(fld, 3),
                "debris": by_id["debris"],
                "blockage": by_id["blockage"],
                "isolation": round(isolation, 3),
                "bridge_failure": by_id["bridge"],
                "dominant": round(dominant, 3),
                "level": risk_level(dominant),
                "priority": round(priority, 3),
                "priority_level": risk_level(priority),
                "contributors": _bars(slide_terms[zone["id"]], SLIDE_LABELS),
                "flood_contributors": _bars(flood_terms[zone["id"]], FLOOD_LABELS),
                "priority_factors": factors,
                "priority_reason": reason,
                "uncertainty": uncertainty,
                "cascade": chain,
                "exposed": exposed,
                "exposure": {
                    "population": zone["population"] if exposed else 0,
                    "buildings": zone["buildings"] if exposed else 0,
                    "schools": zone["schools"] if exposed else 0,
                    "hospitals": zone["hospitals"] if exposed else 0,
                    "health_posts": zone["health_posts"] if exposed else 0,
                    "bridges": zone["bridges"] if exposed else 0,
                    "shelters": zone["shelters"] if exposed else 0,
                },
                "assets": {
                    "population": zone["population"],
                    "buildings": zone["buildings"],
                    "schools": zone["schools"],
                    "hospitals": zone["hospitals"],
                    "health_posts": zone["health_posts"],
                    "bridges": zone["bridges"],
                    "shelters": zone["shelters"],
                },
            }
        )

    rows.sort(key=lambda item: item["priority"], reverse=True)
    roads_at_risk = [edge.id for edge in ROADS if road_hazard[edge.id] >= EXPOSED_THRESHOLD]
    kpis = {
        "critical_zones": sum(1 for zone in rows if zone["level"] == "critical"),
        "high_zones": sum(1 for zone in rows if zone["level"] == "high"),
        "population_exposed": sum(zone["exposure"]["population"] for zone in rows),
        "buildings_exposed": sum(zone["exposure"]["buildings"] for zone in rows),
        "roads_at_risk": len(roads_at_risk),
        "bridges_at_risk": sum(zone["exposure"]["bridges"] for zone in rows),
        "schools_exposed": sum(zone["exposure"]["schools"] for zone in rows),
        "hospitals_exposed": sum(zone["exposure"]["hospitals"] for zone in rows),
        "health_posts_exposed": sum(zone["exposure"]["health_posts"] for zone in rows),
    }

    critical = [zone for zone in rows if zone["level"] == "critical"]
    alert = None
    if critical:
        top = max(critical, key=lambda zone: zone["priority"])
        primary = "Landslide" if top["landslide"] >= top["flood"] else "Flood"
        cascade_name = "Debris flow" if top["debris"] >= top["blockage"] else "River blockage"
        alert = {
            "level": "HIGH-RISK ALERT",
            "zone_id": top["id"],
            "zone_name": top["name"],
            "primary_hazard": primary,
            "factors": "Rainfall, slope, and deformation indicators",
            "cascading_hazard": cascade_name,
            "confidence": top["uncertainty"]["confidence"],
            "channel": "Simulated dashboard alert. No SMS or external notification is sent.",
        }

    route_note = "Lower estimated exposure along this path. It is not a guarantee of safe passage."
    if aware_nodes == short_nodes:
        route_note = "At this intensity the shorter road also has the lower estimated risk. Field checks are still required."

    return {
        "meta": {
            "system": "HIMALAYA-SHIELD",
            "aoi": "Rasuwa, Nepal",
            "model": "Interpretable susceptibility model with a conditional cascade",
            "rainfall_source": "Reconstructed Rasuwa monsoon field. Live NASA GPM IMERG is the intended operational source.",
            "disclaimer": "Decision-support estimate. Not an official warning. A risk score is not a guarantee that an event will occur.",
            "limitations": LIMITATIONS,
            "weights": {key: round(value, 3) for key, value in weights.items()},
            "rainfall_scale": round(rainfall_scale, 3),
            "upstream_release": upstream_release,
            "replay_step": step["id"] if step else None,
            "origin_id": ORIGIN_ID,
            "destination_id": destination_id,
            "stages": ["Detect", "Forecast", "Simulate", "Prioritize", "Respond"],
        },
        "kpis": kpis,
        "zones": rows,
        "roads": [
            {
                "id": edge.id,
                "a": edge.a,
                "b": edge.b,
                "distance_km": edge.distance_km,
                "kind": edge.kind,
                "hazard": road_hazard[edge.id],
                "level": risk_level(road_hazard[edge.id]),
                "at_risk": road_hazard[edge.id] >= EXPOSED_THRESHOLD,
            }
            for edge in ROADS
        ],
        "facilities": FACILITIES,
        "route": {
            "origin_id": ORIGIN_ID,
            "destination_id": destination_id,
            "shortest": _path_payload(short_nodes, zones, road_hazard) if len(short_nodes) > 1 else _empty_path(ORIGIN_ID, zones),
            "risk_aware": _path_payload(aware_nodes, zones, road_hazard) if len(aware_nodes) > 1 else _empty_path(ORIGIN_ID, zones),
            "note": route_note,
        },
        "resources": _resources(rows),
        "replay": _replay_score(rows, step),
        "replay_steps": [
            {"id": item["id"], "label": item["label"], "hours_before": item["hours_before"]}
            for item in REPLAY_STEPS
        ],
        "alert": alert,
    }

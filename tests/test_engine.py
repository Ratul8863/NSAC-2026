"""Behavior tests for the Rasuwa prototype."""

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.service import run_scenario


def _zone(result: dict, zone_id: str) -> dict:
    return next(zone for zone in result["zones"] if zone["id"] == zone_id)


def test_probabilities_stay_inside_unit_interval():
    result = run_scenario()
    for zone in result["zones"]:
        for key in ("landslide", "flood", "debris", "isolation", "priority", "dominant"):
            assert 0.0 <= zone[key] <= 1.0
        for link in zone["cascade"]:
            assert 0.0 <= link["probability"] <= 1.0


def test_heavier_rain_raises_valley_landslide_risk():
    dry = run_scenario(rainfall_scale=0.6)
    wet = run_scenario(rainfall_scale=1.3)
    assert _zone(wet, "syabrubesi")["landslide"] > _zone(dry, "syabrubesi")["landslide"]
    assert _zone(wet, "ramche")["landslide"] > _zone(dry, "ramche")["landslide"]


def test_ridge_stays_below_valley_at_baseline():
    result = run_scenario()
    assert _zone(result, "gatlang")["dominant"] < _zone(result, "syabrubesi")["dominant"]
    assert _zone(result, "goljung")["flood"] < _zone(result, "syabrubesi")["flood"]


def test_upstream_release_raises_downstream_flood_only():
    base = run_scenario()
    released = run_scenario(upstream_release=True)
    assert _zone(released, "syabrubesi")["flood"] > _zone(base, "syabrubesi")["flood"]
    assert _zone(released, "gatlang")["flood"] == _zone(base, "gatlang")["flood"]


VALLEY = ["dhunche", "syabrubesi"]
RIDGE = ["dhunche", "gatlang", "chilime", "syabrubesi"]


def _hazard_cost(result: dict, node_ids: list[str]) -> float:
    from backend.app.data.scenario import ROADS
    from geospatial.routing.router import risk_cost

    hazard = {road["id"]: road["hazard"] for road in result["roads"]}
    edges = {(edge.a, edge.b): edge for edge in ROADS}
    edges.update({(edge.b, edge.a): edge for edge in ROADS})
    total = 0.0
    for left, right in zip(node_ids, node_ids[1:]):
        edge = edges[(left, right)]
        total += risk_cost(edge.distance_km, hazard[edge.id])
    return total


def test_default_storm_keeps_the_direct_valley_road():
    result = run_scenario(destination_id="syabrubesi", rainfall_scale=1.0)
    route = result["route"]["risk_aware"]
    assert route["node_ids"] == VALLEY
    assert route["distance_km"] == 12.0
    assert _hazard_cost(result, VALLEY) < _hazard_cost(result, RIDGE)


def test_thirty_percent_more_rain_switches_to_the_ridge():
    baseline = run_scenario(destination_id="syabrubesi", rainfall_scale=1.0)
    wet = run_scenario(destination_id="syabrubesi", rainfall_scale=1.3)
    route = wet["route"]["risk_aware"]
    assert wet["route"]["shortest"]["node_ids"] == VALLEY
    assert route["node_ids"] == RIDGE
    assert route["node_ids"] != baseline["route"]["risk_aware"]["node_ids"]
    assert route["distance_km"] == 30.5
    assert abs(route["max_hazard"] - 0.44) < 0.02
    assert route["max_hazard"] < wet["route"]["shortest"]["max_hazard"]
    valley_hazard = next(road["hazard"] for road in wet["roads"] if road["id"] == "dhu_sya")
    baseline_hazard = next(road["hazard"] for road in baseline["roads"] if road["id"] == "dhu_sya")
    assert valley_hazard > baseline_hazard
    assert _hazard_cost(wet, RIDGE) < _hazard_cost(wet, VALLEY)


def test_lighter_rain_lets_the_shorter_road_stand():
    result = run_scenario(destination_id="syabrubesi", rainfall_scale=0.55)
    assert result["route"]["risk_aware"]["node_ids"] == VALLEY


def test_priority_names_its_leading_factors():
    result = run_scenario()
    top = result["zones"][0]
    assert top["priority_reason"].startswith("Higher priority because")
    assert abs(sum(result["meta"]["weights"].values()) - 1.0) < 0.02


def test_confidence_is_never_presented_as_certain():
    result = run_scenario(rainfall_scale=1.6, upstream_release=True)
    for zone in result["zones"]:
        assert zone["uncertainty"]["confidence"] in {"Low", "Moderate", "Moderate–high"}
        assert "Sparse ground observations" in zone["uncertainty"]["limitations"]


def test_replay_progresses_from_partial_to_full_recall():
    early = run_scenario(replay_step="t72")
    mid = run_scenario(replay_step="t48")
    day = run_scenario(replay_step="t24")
    late = run_scenario(replay_step="t6")
    event = run_scenario(replay_step="event")
    observed = {"ramche", "syabrubesi", "timure", "chilime"}
    assert early["replay"]["recall"] == 0.5
    assert early["replay"]["recall"] < mid["replay"]["recall"] < day["replay"]["recall"]
    assert day["replay"]["recall"] == 1.0
    assert set(day["replay"]["hits"]) == observed
    assert set(day["replay"]["observed_ids"]) == observed
    assert late["kpis"]["critical_zones"] < event["kpis"]["critical_zones"]
    assert "not an independent validation" in event["replay"]["note"]


def test_api_scenario_and_route_contract():
    client = TestClient(app)
    health = client.get("/api/health")
    assert health.status_code == 200
    scenario = client.post("/api/scenario", json={"destination_id": "timure", "rainfall_scale": 1.0})
    assert scenario.status_code == 200
    body = scenario.json()
    assert body["meta"]["aoi"] == "Rasuwa, Nepal"
    assert body["kpis"]["population_exposed"] > 0
    route = client.post("/api/routes/rescue", json={"destination_id": "syabrubesi"})
    assert route.status_code == 200
    assert route.json()["risk_aware"]["names"][0] == "Dhunche"

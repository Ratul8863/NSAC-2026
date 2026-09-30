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


def test_risk_aware_route_leaves_the_river_road_when_the_valley_is_hot():
    result = run_scenario(destination_id="syabrubesi", rainfall_scale=1.15)
    assert result["route"]["shortest"]["node_ids"] == ["dhunche", "syabrubesi"]
    assert result["route"]["risk_aware"]["node_ids"][0] == "dhunche"
    assert "gatlang" in result["route"]["risk_aware"]["node_ids"]
    assert result["route"]["risk_aware"]["max_hazard"] < result["route"]["shortest"]["max_hazard"]


def test_lighter_rain_lets_the_shorter_road_stand():
    result = run_scenario(destination_id="syabrubesi", rainfall_scale=0.55)
    assert result["route"]["risk_aware"]["node_ids"] == ["dhunche", "syabrubesi"]


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


def test_replay_event_recalls_the_reference_footprint():
    early = run_scenario(replay_step="t72")
    event = run_scenario(replay_step="event")
    assert early["replay"]["recall"] < event["replay"]["recall"]
    assert event["replay"]["recall"] >= 0.75
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

"""HIMALAYA-SHIELD API.

The endpoints estimate risk for the Rasuwa prototype scenario. They do not issue
official warnings.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.app.service import run_scenario

app = FastAPI(
    title="HIMALAYA-SHIELD",
    summary="Cascading hazard decision support for Rasuwa, Nepal",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScenarioRequest(BaseModel):
    rainfall_scale: float = Field(1.0, ge=0.4, le=1.8)
    upstream_release: bool = False
    destination_id: str = "syabrubesi"
    replay_step: str | None = None
    weights: dict[str, float] | None = None


def _run(body: ScenarioRequest) -> dict:
    return run_scenario(
        rainfall_scale=body.rainfall_scale,
        upstream_release=body.upstream_release,
        destination_id=body.destination_id,
        replay_step=body.replay_step,
        weights=body.weights,
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "system": "HIMALAYA-SHIELD"}


@app.post("/api/scenario")
def scenario(body: ScenarioRequest) -> dict:
    return _run(body)


@app.get("/api/risk")
def risk(lat: float = Query(...), lon: float = Query(...), rainfall_scale: float = 1.0) -> dict:
    result = run_scenario(rainfall_scale=rainfall_scale)
    nearest = min(
        result["zones"],
        key=lambda zone: (zone["center"][1] - lat) ** 2 + (zone["center"][0] - lon) ** 2,
    )
    return {
        "query": {"lat": lat, "lon": lon},
        "zone": nearest,
        "disclaimer": result["meta"]["disclaimer"],
    }


@app.post("/api/predict/landslide")
def predict_landslide(body: ScenarioRequest) -> dict:
    result = _run(body)
    return {
        "model": result["meta"]["model"],
        "zones": [
            {
                "id": zone["id"],
                "name": zone["name"],
                "probability": zone["landslide"],
                "level": zone["level"],
                "contributors": zone["contributors"],
                "uncertainty": zone["uncertainty"],
            }
            for zone in result["zones"]
        ],
    }


@app.post("/api/simulate/flood")
def simulate_flood(body: ScenarioRequest) -> dict:
    result = _run(body)
    return {
        "upstream_release": body.upstream_release,
        "rainfall_scale": result["meta"]["rainfall_scale"],
        "zones": [
            {
                "id": zone["id"],
                "name": zone["name"],
                "flood": zone["flood"],
                "contributors": zone["flood_contributors"],
                "exposed_population": zone["exposure"]["population"],
            }
            for zone in result["zones"]
        ],
    }


@app.post("/api/simulate/cascade")
def simulate_cascade(body: ScenarioRequest) -> dict:
    result = _run(body)
    return {
        "disclaimer": result["meta"]["disclaimer"],
        "zones": [
            {
                "id": zone["id"],
                "name": zone["name"],
                "cascade": zone["cascade"],
                "priority": zone["priority"],
                "priority_reason": zone["priority_reason"],
            }
            for zone in result["zones"]
        ],
    }


@app.get("/api/impact/population")
def impact_population(rainfall_scale: float = 1.0, upstream_release: bool = False) -> dict:
    result = run_scenario(rainfall_scale=rainfall_scale, upstream_release=upstream_release)
    return {
        "kpis": result["kpis"],
        "zones": [
            {
                "id": zone["id"],
                "name": zone["name"],
                "exposed": zone["exposed"],
                "population": zone["exposure"]["population"],
                "buildings": zone["exposure"]["buildings"],
                "dominant": zone["dominant"],
            }
            for zone in result["zones"]
        ],
        "note": "Counts include zones whose dominant risk is high or critical. Figures are model exposure, not a census.",
    }


@app.post("/api/routes/rescue")
def rescue_route(body: ScenarioRequest) -> dict:
    result = _run(body)
    if result["route"]["destination_id"] not in {zone["id"] for zone in result["zones"]}:
        raise HTTPException(status_code=404, detail="Unknown destination")
    return result["route"]


_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST.is_dir():
    app.frontend("/", directory=str(_DIST), fallback="index.html")

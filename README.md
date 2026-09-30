# HIMALAYA-SHIELD

Decision-support prototype for cascading landslide and flood risk in Rasuwa, Nepal.

The app estimates evolving risk, shows how a landslide and a flood can reinforce each other, counts who and what sit in the higher-risk zones, and compares a shorter road with a route that avoids the higher-hazard corridor. Every figure is a model output. It is not an official warning and it is not a statement that a disaster will occur.

## What this MVP runs

- Interpretable landslide and flood susceptibility, with the weighted evidence shown directly
- A conditional cascade from rainfall through isolation
- Population, building, school, hospital, and bridge exposure for high and critical zones
- Configurable priority weights and a written reason for each score
- Risk-aware routing from Dhunche, compared with the shorter road
- A rainfall what-if control and an upstream-release scenario
- A historical replay that scores the estimate against a fixed reference footprint

The rainfall field is a reconstructed monsoon scenario so the dashboard works offline. NASA GPM IMERG is the intended live precipitation source. Swapping that feed in means scaling the same 24 h, 48 h, 72 h, and 7-day accumulations.

## Run it

From the repository root, in two terminals:

```powershell
python -m uvicorn backend.app.main:app --port 8080
```

```powershell
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173

Tests:

```powershell
python -m pytest
```

## API

- `POST /api/scenario` — full dashboard payload
- `GET /api/risk?lat=&lon=` — nearest analysis zone
- `POST /api/predict/landslide`
- `POST /api/simulate/flood`
- `POST /api/simulate/cascade`
- `GET /api/impact/population`
- `POST /api/routes/rescue`

## Layout

- `ml/` — landslide, flood, cascade, and deformation notes
- `geospatial/routing/` — thresholded route search
- `backend/app/` — Rasuwa scenario and FastAPI service
- `frontend/` — map, forecast, simulation, response, and replay
- `tests/` — engine and API checks

Analysis zones follow real Rasuwa settlements, but the polygons are scenario cells, not district boundaries. Population and building counts are illustrative exposure inputs, not a census.

## Limits

Satellite scenes are not ground truth. The rainfall product in this build is reconstructed. Mountain terrain, cloud cover, and sparse sensors all reduce confidence, so the interface caps confidence below certainty. Deformation is an indicator, not evidence that a landslide is imminent. Routes still need someone on the ground to confirm them. The system is there to help a qualified team look at options.

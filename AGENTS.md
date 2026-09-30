## Learned User Preferences

- Keep HIMALAYA-SHIELD a demo-data hackathon MVP. Do not rebuild it, change the stack, or add live NASA ingestion, trained models, PostGIS, OSMnx, or a new database unless explicitly asked.
- Present the product as a scientific geospatial command center with a calmer NASA / earth-observation feel, not a dark dense gaming HUD.
- Use a map-first layout (map about 65–70% of the screen), compact left controls, and a contextual right intelligence panel as a drawer.
- Draw hazard zones as irregular organic polygons with a contour or heat feel. Do not use rectangular zone boxes. Keep settlements as markers.
- Use a colorful satellite basemap that needs no paid API key, with attribution and a fallback. The user rejected gray tiles and CARTO “API KEY REQUIRED” watermarks.
- Keep the full interface light, with controls and buttons clearly placed so they are easy to use, including on mobile where map interaction must not block scrolling.

## Learned Workspace Facts

- HIMALAYA-SHIELD is a cascading-disaster decision-support MVP for Rasuwa, Nepal: landslide, flood, debris-flow, isolation cascade, exposure of people, buildings, roads, bridges, and schools, rainfall what-if, historical replay, explainability, and risk-aware rescue routing.
- The product stages are DETECT, FORECAST, SIMULATE, PRIORITIZE, and RESPOND. Mock services are structured so NASA GPM, GIS, and ML can replace them later.
- The stack is React 18, TypeScript, Vite, Leaflet / react-leaflet, and hand-written CSS on the frontend, and FastAPI, Python, and pytest on the backend. Local dev is the frontend at http://localhost:5173 and the backend at http://localhost:8080.
- Risk calculations and Dijkstra rescue routing run on reconstructed demo scenario data, not live satellite feeds.
- Production is the Vercel project himalaya-shield at https://himalaya-shield.vercel.app. The FastAPI entrypoint is `index:app` (`index.py` re-exports `backend.app.main:app`), and the Vite build is served from `frontend/dist`.
- The map uses Esri World Imagery as the primary satellite tiles, with OpenStreetMap as the fallback.

import { useEffect, useState } from "react";
import { fetchScenario } from "./api";
import { Inspector } from "./components/Inspector";
import { RiskMap, riskColor } from "./components/RiskMap";
import { formatCount, formatPct } from "./format";
import type { LayerId, Scenario, TabId } from "./types";

const LAYERS: { id: LayerId; label: string; swatch: string }[] = [
  { id: "landslide", label: "Landslide", swatch: "#f97316" },
  { id: "flood", label: "Flood", swatch: "#38bdf8" },
  { id: "debris", label: "Debris flow", swatch: "#c2410c" },
  { id: "priority", label: "Priority", swatch: "#fb7185" },
];

const TABS: { id: TabId; label: string }[] = [
  { id: "forecast", label: "Forecast" },
  { id: "simulation", label: "Simulation" },
  { id: "response", label: "Response" },
  { id: "replay", label: "Replay" },
];

const WEIGHT_FIELDS = [
  ["hazard", "Hazard"],
  ["population", "Population"],
  ["isolation", "Isolation"],
  ["infrastructure", "Infrastructure"],
  ["accessibility", "Access"],
] as const;

export function App() {
  const [rainfallScale, setRainfallScale] = useState(1);
  const [upstreamRelease, setUpstreamRelease] = useState(false);
  const [destinationId, setDestinationId] = useState("syabrubesi");
  const [replayStep, setReplayStep] = useState("t24");
  const [tab, setTab] = useState<TabId>("forecast");
  const [layer, setLayer] = useState<LayerId>("landslide");
  const [selectedId, setSelectedId] = useState("syabrubesi");
  const [weights, setWeights] = useState({
    hazard: 30,
    population: 25,
    isolation: 20,
    infrastructure: 15,
    accessibility: 10,
  });
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [baseline, setBaseline] = useState<Scenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeReplay = tab === "replay" ? replayStep : null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchScenario(
      {
        rainfall_scale: rainfallScale,
        upstream_release: upstreamRelease,
        destination_id: destinationId,
        replay_step: activeReplay,
        weights: {
          hazard: weights.hazard,
          population: weights.population,
          isolation: weights.isolation,
          infrastructure: weights.infrastructure,
          accessibility: weights.accessibility,
        },
      },
      controller.signal,
    )
      .then((next) => {
        setScenario(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError("Start the API on port 8080, then reload this page.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [rainfallScale, upstreamRelease, destinationId, activeReplay, weights]);

  useEffect(() => {
    const controller = new AbortController();
    fetchScenario(
      {
        rainfall_scale: 1,
        upstream_release: false,
        destination_id: destinationId,
        replay_step: null,
        weights: {
          hazard: weights.hazard,
          population: weights.population,
          isolation: weights.isolation,
          infrastructure: weights.infrastructure,
          accessibility: weights.accessibility,
        },
      },
      controller.signal,
    )
      .then(setBaseline)
      .catch(() => undefined);
    return () => controller.abort();
  }, [destinationId, weights]);

  const zone = scenario?.zones.find((item) => item.id === selectedId) ?? scenario?.zones[0];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">Earth-observation decision support</p>
          <h1>HIMALAYA-SHIELD</h1>
        </div>
        <ol className="stages">
          {["Detect", "Forecast", "Simulate", "Prioritize", "Respond"].map((stage) => (
            <li key={stage} className={stageActive(tab, stage) ? "on" : ""}>
              {stage}
            </li>
          ))}
        </ol>
        <div className="aoi">
          <span>Rasuwa, Nepal</span>
          <small>Estimate · not an official warning</small>
        </div>
      </header>

      {scenario?.alert && (
        <button className="alert" type="button" onClick={() => setSelectedId(scenario.alert!.zone_id)}>
          <strong>{scenario.alert.level}</strong>
          <span>{scenario.alert.zone_name}</span>
          <span>{scenario.alert.primary_hazard}</span>
          <span>Cascade: {scenario.alert.cascading_hazard}</span>
          <span>Confidence: {scenario.alert.confidence}</span>
        </button>
      )}

      <div className="workspace">
        <aside className="panel controls">
          <section>
            <h2>Storm intensity</h2>
            <div className="scale-readout">
              <strong>{Math.round((activeReplay ? scenario?.meta.rainfall_scale ?? rainfallScale : rainfallScale) * 100)}%</strong>
              <span>of the reconstructed monsoon pulse</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={1.7}
              step={0.05}
              value={rainfallScale}
              disabled={activeReplay !== null}
              onChange={(event) => setRainfallScale(Number(event.target.value))}
              aria-label="Storm intensity"
            />
            <div className="presets">
              <button type="button" onClick={() => setRainfallScale(1)} disabled={activeReplay !== null}>
                Baseline
              </button>
              <button type="button" onClick={() => setRainfallScale(1.3)} disabled={activeReplay !== null}>
                +30%
              </button>
              <button type="button" onClick={() => setRainfallScale(1.6)} disabled={activeReplay !== null}>
                Extreme
              </button>
            </div>
            {activeReplay && <p className="note">The replay timeline is setting rainfall for this view.</p>}
          </section>

          <label className="checkline">
            <input
              type="checkbox"
              checked={upstreamRelease}
              onChange={(event) => setUpstreamRelease(event.target.checked)}
            />
            Upstream water release
          </label>

          <label className="field">
            Destination
            <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
              {(scenario?.zones ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              {scenario === null && <option value="syabrubesi">Syabrubesi</option>}
            </select>
          </label>

          <section>
            <h2>Map layer</h2>
            <div className="layers">
              {LAYERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={layer === item.id ? "layer on" : "layer"}
                  onClick={() => setLayer(item.id)}
                >
                  <i style={{ background: item.swatch }} />
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          {tab === "replay" && (
            <section>
              <h2>Timeline</h2>
              <div className="presets">
                {(scenario?.replay_steps ?? []).map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    className={replayStep === step.id ? "on" : ""}
                    onClick={() => setReplayStep(step.id)}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <details>
            <summary>Priority weights</summary>
            {WEIGHT_FIELDS.map(([key, label]) => (
              <label key={key} className="field compact">
                {label}
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={weights[key]}
                  onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))}
                  aria-label={`${label} weight`}
                />
              </label>
            ))}
            <p className="note">Weights are rescaled to sum to 1 on the server.</p>
          </details>

          <section className="zone-list">
            <h2>Zones</h2>
            <ul>
              {(scenario?.zones ?? []).map((item) => (
                <li key={item.id}>
                  <button type="button" className={item.id === selectedId ? "on" : ""} onClick={() => setSelectedId(item.id)}>
                    <i style={{ background: riskColor(layer === "priority" ? item.priority : item.dominant) }} />
                    <span>{item.name}</span>
                    <b>{formatPct(layer === "priority" ? item.priority : layerValue(item, layer))}</b>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <main className="map-stage">
          {scenario ? (
            <RiskMap
              scenario={scenario}
              layer={layer}
              selectedId={selectedId}
              showObserved={tab === "replay"}
              onSelect={setSelectedId}
            />
          ) : (
            <div className="map-hold">{error ?? "Loading the Rasuwa scenario…"}</div>
          )}
          <div className="legend">
            <span><i style={{ background: "#2dd4bf" }} /> Low</span>
            <span><i style={{ background: "#eab308" }} /> Moderate</span>
            <span><i style={{ background: "#f97316" }} /> High</span>
            <span><i style={{ background: "#fb7185" }} /> Critical</span>
            <span><i className="line" /> Risk-aware route</span>
          </div>
          {loading && scenario && <div className="updating">Updating</div>}
        </main>

        <aside className="panel inspector">
          <div className="tabs">
            {TABS.map((item) => (
              <button key={item.id} type="button" className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          {scenario && zone ? (
            <Inspector tab={tab} scenario={scenario} baseline={baseline} zone={zone} />
          ) : (
            <p className="note">Waiting for the scenario service.</p>
          )}
        </aside>
      </div>

      <footer className="kpis">
        <Kpi label="Critical zones" value={scenario ? String(scenario.kpis.critical_zones) : "—"} />
        <Kpi label="Population exposure" value={scenario ? formatCount(scenario.kpis.population_exposed) : "—"} />
        <Kpi label="Buildings" value={scenario ? formatCount(scenario.kpis.buildings_exposed) : "—"} />
        <Kpi label="Roads at risk" value={scenario ? String(scenario.kpis.roads_at_risk) : "—"} />
        <Kpi label="Bridges at risk" value={scenario ? String(scenario.kpis.bridges_at_risk) : "—"} />
        <Kpi label="Schools" value={scenario ? String(scenario.kpis.schools_exposed) : "—"} />
        <Kpi label="Hospitals" value={scenario ? String(scenario.kpis.hospitals_exposed) : "—"} />
      </footer>
      <p className="disclaimer">
        {scenario?.meta.disclaimer ??
          "Decision-support estimate. Not an official warning. A risk score is not a guarantee that an event will occur."}
      </p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function layerValue(zone: { landslide: number; flood: number; debris: number; priority: number }, layer: LayerId): number {
  if (layer === "landslide") return zone.landslide;
  if (layer === "flood") return zone.flood;
  if (layer === "debris") return zone.debris;
  return zone.priority;
}

function stageActive(tab: TabId, stage: string): boolean {
  if (tab === "forecast") return stage === "Forecast";
  if (tab === "simulation") return stage === "Simulate";
  if (tab === "response") return stage === "Prioritize" || stage === "Respond";
  return stage === "Detect";
}

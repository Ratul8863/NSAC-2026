import { useEffect, useState } from "react";
import { fetchScenario } from "./api";
import { Inspector } from "./components/Inspector";
import { RiskMap, riskColor } from "./components/RiskMap";
import { formatPct } from "./format";
import type { LayerId, Scenario, TabId } from "./types";

const LAYERS: { id: LayerId; label: string }[] = [
  { id: "landslide", label: "Landslide" },
  { id: "flood", label: "Flood" },
  { id: "debris", label: "Debris flow" },
  { id: "priority", label: "Priority" },
];

const MODES: { id: TabId; label: string }[] = [
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

const DEFAULT_WEIGHTS = {
  hazard: 30,
  population: 25,
  isolation: 20,
  infrastructure: 15,
  accessibility: 10,
};

export function App() {
  const [rainfallScale, setRainfallScale] = useState(1);
  const [upstreamRelease, setUpstreamRelease] = useState(false);
  const [destinationId, setDestinationId] = useState("syabrubesi");
  const [replayStep, setReplayStep] = useState("t24");
  const [tab, setTab] = useState<TabId>("forecast");
  const [layer, setLayer] = useState<LayerId>("landslide");
  const [selectedId, setSelectedId] = useState("syabrubesi");
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [baseline, setBaseline] = useState<Scenario | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [viewToken, setViewToken] = useState(0);
  const [leftOpen, setLeftOpen] = useState(() => window.matchMedia("(min-width: 801px)").matches);
  const [rightOpen, setRightOpen] = useState(() => window.matchMedia("(min-width: 801px)").matches);

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
        weights: { ...weights },
      },
      controller.signal,
    )
      .then((next) => {
        setScenario(next);
        setError(false);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        console.error(reason);
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [rainfallScale, upstreamRelease, destinationId, activeReplay, weights, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    fetchScenario(
      {
        rainfall_scale: 1,
        upstream_release: false,
        destination_id: destinationId,
        replay_step: null,
        weights: { ...weights },
      },
      controller.signal,
    )
      .then(setBaseline)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        console.error(reason);
      });
    return () => controller.abort();
  }, [destinationId, weights, attempt]);

  const zone = scenario?.zones.find((item) => item.id === selectedId) ?? null;
  const scaleNow = activeReplay ? scenario?.meta.rainfall_scale ?? rainfallScale : rainfallScale;
  const scenarioTitle = scenarioLabel(scaleNow, upstreamRelease, activeReplay ? scenario?.replay?.label ?? "Replay" : null);
  const routesDiffer =
    scenario !== null &&
    scenario.route.shortest.node_ids.join(">") !== scenario.route.risk_aware.node_ids.join(">");
  const showRouteCard = scenario !== null && (routesDiffer || tab === "response" || tab === "simulation");

  function fitMap() {
    setViewToken((value) => value + 1);
  }

  function resetScenario() {
    setRainfallScale(1);
    setUpstreamRelease(false);
    setDestinationId("syabrubesi");
    setReplayStep("t24");
    setTab("forecast");
    setLayer("landslide");
    setSelectedId("syabrubesi");
    setWeights(DEFAULT_WEIGHTS);
    setViewToken((value) => value + 1);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>HIMALAYA-SHIELD</h1>
          <p className="subtitle">AI Disaster Intelligence • Rasuwa Prototype</p>
        </div>
        <div className="mode-block">
          <button className="drawer-toggle" type="button" aria-expanded={leftOpen} onClick={() => setLeftOpen((open) => !open)}>
            {leftOpen ? "Close" : "Controls"}
          </button>
          <nav className="modes" aria-label="Decision modes">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={tab === mode.id ? "on" : ""}
                aria-pressed={tab === mode.id}
                onClick={() => setTab(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="status">
          <span>Rasuwa, Nepal</span>
          <span className="pill">Reconstructed data</span>
          <strong>{scenarioTitle}</strong>
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

      {error && (
        <div className="service-error" role="alert">
          <p>Decision-support service is temporarily unavailable.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}

      <div className={`workspace${leftOpen ? "" : " collapse-left"}${rightOpen ? "" : " collapse-right"}`}>
        {leftOpen && (
          <button className="sheet-scrim" type="button" aria-label="Close controls" onClick={() => setLeftOpen(false)} />
        )}
        <aside className={leftOpen ? "panel controls" : "panel controls is-closed"}>
          <button className="rail-open" type="button" onClick={() => setLeftOpen(true)}>
            Controls
          </button>
          <div className="panel-body">
          <div className="panel-bar">
            <h2>Controls</h2>
            <button type="button" onClick={() => setLeftOpen(false)}>
              Minimize
            </button>
          </div>
          <section className="control-card">
            <h2>Scenario</h2>
            <div className="segment" role="group" aria-label="Rainfall scenario">
              <button
                type="button"
                className={presetOn(rainfallScale, 1, activeReplay) ? "on" : ""}
                aria-pressed={presetOn(rainfallScale, 1, activeReplay)}
                disabled={activeReplay !== null}
                onClick={() => setRainfallScale(1)}
              >
                Baseline
              </button>
              <button
                type="button"
                className={presetOn(rainfallScale, 1.3, activeReplay) ? "on" : ""}
                aria-pressed={presetOn(rainfallScale, 1.3, activeReplay)}
                disabled={activeReplay !== null}
                onClick={() => setRainfallScale(1.3)}
              >
                +30%
              </button>
              <button
                type="button"
                className={presetOn(rainfallScale, 1.6, activeReplay) ? "on" : ""}
                aria-pressed={presetOn(rainfallScale, 1.6, activeReplay)}
                disabled={activeReplay !== null}
                onClick={() => setRainfallScale(1.6)}
              >
                Extreme
              </button>
            </div>
            <button
              type="button"
              className={upstreamRelease ? "switch on" : "switch"}
              aria-pressed={upstreamRelease}
              onClick={() => setUpstreamRelease((value) => !value)}
            >
              <i />
              Upstream release
            </button>
            <label className="field compact">
              Fine tune 72-hour storm
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
            </label>
            <p className="scale-readout">
              <strong>{Math.round(scaleNow * 100)}%</strong>
              <span>72-hour pulse</span>
            </p>
            {activeReplay && <p className="note">Replay is setting rainfall.</p>}
          </section>

          <section className="control-card">
          <label className="field">
            Destination
            <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} aria-label="Destination">
              {(scenario?.zones ?? [{ id: "syabrubesi", name: "Syabrubesi" }]).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <span className="note">From Dhunche to {destinationName(scenario, destinationId)}</span>
          </label>
          </section>

          <section className="control-card">
            <h2>Layer</h2>
            <div className="segment layers" role="group" aria-label="Risk layer">
              {LAYERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={layer === item.id ? "layer on" : "layer"}
                  aria-pressed={layer === item.id}
                  onClick={() => setLayer(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

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

          <section className="control-card zone-list">
            <h2>Places</h2>
            <ul>
              {(scenario?.zones ?? []).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.id === selectedId ? "on" : ""}
                    onClick={() => {
                      setSelectedId(item.id);
                      if (window.matchMedia("(max-width: 800px)").matches) setLeftOpen(false);
                    }}
                  >
                    <i style={{ background: riskColor(layer === "priority" ? item.priority : item.dominant) }} />
                    <span>{item.name}</span>
                    <b>{formatPct(layer === "priority" ? item.priority : layerValue(item, layer))}</b>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          </div>
        </aside>

        <main className="map-stage">
          {scenario ? (
            <RiskMap
              scenario={scenario}
              layer={layer}
              selectedId={zone?.id ?? selectedId}
              showObserved={tab === "replay"}
              viewToken={viewToken}
              layoutKey={`${tab}-${leftOpen ? "L" : "l"}-${rightOpen ? "R" : "r"}`}
              onSelect={setSelectedId}
            />
          ) : (
            <div className="map-hold" aria-busy={loading}>
              {error ? "Decision-support service is temporarily unavailable." : "Loading Rasuwa decision support…"}
            </div>
          )}
          <div className="map-toolbar">
            <button type="button" onClick={fitMap}>
              Fit Rasuwa
            </button>
            <button type="button" onClick={resetScenario}>
              Reset
            </button>
          </div>
          <div className="legend">
            <span><i style={{ background: "#2dd4bf" }} /> Low</span>
            <span><i style={{ background: "#eab308" }} /> Moderate</span>
            <span><i style={{ background: "#f97316" }} /> High</span>
            <span><i style={{ background: "#fb7185" }} /> Critical</span>
            <span><i className="dash" /> Direct route</span>
            <span><i className="line" /> Risk-aware route</span>
          </div>
          {showRouteCard && scenario && <RouteCard scenario={scenario} routesDiffer={routesDiffer} />}
          {tab === "replay" && (
            <ol className="replay-bar">
              {(scenario?.replay_steps ?? []).map((step) => (
                <li key={step.id}>
                  <button type="button" className={replayStep === step.id ? "on" : ""} aria-pressed={replayStep === step.id} onClick={() => setReplayStep(step.id)}>
                    {step.label.replace(" h", "h")}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {loading && scenario && <div className="updating">Updating</div>}
        </main>

        <aside className={rightOpen ? "panel inspector" : "panel inspector is-closed"}>
          <button className="rail-open" type="button" onClick={() => setRightOpen(true)}>
            Intelligence
          </button>
          <div className="panel-body">
          <div className="panel-bar">
            <h2>Intelligence</h2>
            <button type="button" onClick={() => setRightOpen(false)}>
              Minimize
            </button>
          </div>
          {scenario && zone ? (
            <Inspector tab={tab} scenario={scenario} baseline={baseline} zone={zone} />
          ) : loading && !error ? (
            <div className="skeleton" aria-busy="true">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <p className="note">Select a zone on the map to inspect risk intelligence.</p>
          )}
          </div>
        </aside>
      </div>

      <footer className="kpis">
        <Kpi label="Critical zones" value={scenario ? String(scenario.kpis.critical_zones) : "—"} />
        <Kpi label="Population exposure" value={scenario ? scenario.kpis.population_exposed.toLocaleString("en-US") : "—"} />
        <Kpi label="Buildings" value={scenario ? scenario.kpis.buildings_exposed.toLocaleString("en-US") : "—"} />
        <Kpi label="Roads at risk" value={scenario ? String(scenario.kpis.roads_at_risk) : "—"} />
        <Kpi label="Bridges at risk" value={scenario ? String(scenario.kpis.bridges_at_risk) : "—"} />
        <Kpi label="Schools" value={scenario ? String(scenario.kpis.schools_exposed) : "—"} />
        <Kpi label="Hospitals" value={scenario ? String(scenario.kpis.hospitals_exposed) : "—"} />
      </footer>
      <p className="disclaimer" title={scenario?.meta.disclaimer}>
        Reconstructed rainfall · scenario estimates · NASA GPM IMERG is not connected · route needs field verification
      </p>
    </div>
  );
}

function RouteCard({ scenario, routesDiffer }: { scenario: Scenario; routesDiffer: boolean }) {
  const route = scenario.route;
  return (
    <aside className={routesDiffer ? "route-float" : "route-float single"} aria-live="polite">
      {routesDiffer && (
        <div>
          <h4>Direct route</h4>
          <p>{route.shortest.distance_km} km</p>
          <p>{formatPct(route.shortest.max_hazard)} peak hazard</p>
        </div>
      )}
      <div>
        <h4>{routesDiffer ? "Risk-aware route" : "Lower estimated-risk route"}</h4>
        <p>{route.risk_aware.distance_km} km</p>
        <p>{formatPct(route.risk_aware.max_hazard)} peak hazard</p>
      </div>
      <p className="note">{route.note}</p>
    </aside>
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

function layerValue(zone: { landslide: number; flood: number; debris: number }, layer: LayerId): number {
  if (layer === "landslide") return zone.landslide;
  if (layer === "flood") return zone.flood;
  if (layer === "debris") return zone.debris;
  return zone.landslide;
}

function presetOn(scale: number, target: number, replay: string | null): boolean {
  return replay === null && Math.abs(scale - target) < 0.001;
}

function scenarioLabel(scale: number, upstream: boolean, replay: string | null): string {
  if (replay) return replay;
  const base =
    Math.abs(scale - 1) < 0.001
      ? "Baseline"
      : Math.abs(scale - 1.3) < 0.001
        ? "+30% rainfall"
        : Math.abs(scale - 1.6) < 0.001
          ? "Extreme"
          : `Storm ${Math.round(scale * 100)}%`;
  return upstream ? `${base} · upstream release` : base;
}

function destinationName(scenario: Scenario | null, id: string): string {
  return scenario?.zones.find((zone) => zone.id === id)?.name ?? "Syabrubesi";
}


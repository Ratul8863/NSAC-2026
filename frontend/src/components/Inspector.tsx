import { formatCount, formatDelta, formatPct, formatPoints } from "../format";
import type { Scenario, TabId, Zone } from "../types";
import { riskColor } from "./RiskMap";

type Props = {
  tab: TabId;
  scenario: Scenario;
  baseline: Scenario | null;
  zone: Zone;
};

export function Inspector({ tab, scenario, baseline, zone }: Props) {
  if (tab === "forecast") return <Forecast zone={zone} />;
  if (tab === "simulation") return <Simulation scenario={scenario} baseline={baseline} zone={zone} />;
  if (tab === "response") return <Response scenario={scenario} zone={zone} />;
  return <Replay scenario={scenario} />;
}

function Forecast({ zone }: { zone: Zone }) {
  const ranked = [...zone.contributors].sort((a, b) => b.share - a.share);
  return (
    <div className="stack" key={zone.id}>
      <header className="zone-head">
        <div>
          <p className="eyebrow">Selected area</p>
          <h2>{zone.name}</h2>
          <p className="muted">Dominant hazard: {dominantHazard(zone)}</p>
        </div>
        <LevelBadge level={zone.level} />
      </header>
      <section>
        <h3>Hazard snapshot</h3>
        <Meter label="Landslide" value={zone.landslide} />
        <Meter label="Flood" value={zone.flood} />
        <Meter label="Debris flow" value={zone.debris} />
        <Meter label="Isolation" value={zone.isolation} />
      </section>
      <section>
        <h3>Risk contributors</h3>
        <Bars items={ranked.slice(0, 3).map((item) => ({ label: item.name, share: item.share, text: item.value.toFixed(2) }))} />
        {ranked.length > 3 && (
          <details>
            <summary>More factors</summary>
            <Bars items={ranked.slice(3).map((item) => ({ label: item.name, share: item.share, text: item.value.toFixed(2) }))} />
          </details>
        )}
      </section>
      <section>
        <h3>Cascade</h3>
        <Cascade zone={zone} />
      </section>
      <section>
        <h3>Confidence</h3>
        <p>
          <strong>{zone.uncertainty.confidence}</strong>
        </p>
        <p className="note">Evidence strength in this prototype, not a statistical interval.</p>
        <details>
          <summary>Deformation note</summary>
          <p className="note">{zone.uncertainty.deformation_note}</p>
        </details>
      </section>
    </div>
  );
}

function Simulation({ scenario, baseline, zone }: { scenario: Scenario; baseline: Scenario | null; zone: Zone }) {
  const baseZone = baseline?.zones.find((item) => item.id === zone.id);
  const valley = roadHazard(scenario, "dhu_sya");
  const baseValley = baseline ? roadHazard(baseline, "dhu_sya") : undefined;
  const routeChanged =
    baseline !== null &&
    scenario.route.risk_aware.node_ids.join(">") !== baseline.route.risk_aware.node_ids.join(">");
  return (
    <div className="stack" key={`${zone.id}-${scenario.meta.rainfall_scale}-${scenario.meta.upstream_release}`}>
      <header className="zone-head">
        <div>
          <p className="eyebrow">What changed</p>
          <h2>{zone.name}</h2>
        </div>
        <div>
          <strong className="score">{zone.rainfall.h72.toFixed(0)}</strong>
          <span className="muted">mm / 72 h</span>
        </div>
      </header>
      {baseline && (
        <ul className="deltas">
          <li>Critical zones {formatDelta(scenario.kpis.critical_zones, baseline.kpis.critical_zones)}</li>
          {baseZone && <li>Landslide {formatPoints(zone.landslide, baseZone.landslide)}</li>}
          {valley !== undefined && baseValley !== undefined && (
            <li>
              Direct valley hazard {formatPct(baseValley)} → {formatPct(valley)}
            </li>
          )}
          <li>{routeChanged ? "Route changed" : "Route unchanged"}</li>
        </ul>
      )}
      <p className="note">72-hour total drives the score. Other windows are context.</p>
      <section>
        <h3>Flood evidence</h3>
        <Bars
          items={zone.flood_contributors.map((item) => ({
            label: item.name,
            share: item.share,
            text: item.value.toFixed(2),
          }))}
        />
        <p className="note">
          {scenario.meta.upstream_release
            ? "Upstream release is added as a flood term on main-stem zones."
            : "Upstream release is off. Turn it on to add a main-stem flood term."}
        </p>
      </section>
      <section>
        <h3>Cascade</h3>
        <Cascade zone={zone} />
      </section>
    </div>
  );
}

function Response({ scenario, zone }: { scenario: Scenario; zone: Zone }) {
  const route = scenario.route;
  const same = route.shortest.node_ids.join(">") === route.risk_aware.node_ids.join(">");
  const advice = scenario.resources.find((item) => item.zone_id === zone.id);
  return (
    <div className="stack" key={zone.id}>
      <header className="zone-head">
        <div>
          <p className="eyebrow">Response priority</p>
          <h2>{zone.name}</h2>
        </div>
        <div>
          <strong className="score" style={{ color: riskColor(zone.priority) }}>
            {formatPct(zone.priority)}
          </strong>
          <span className="muted">priority</span>
        </div>
      </header>
      <p>{zone.priority_reason}</p>
      <section>
        <h3>Route comparison</h3>
        <div className={same ? "compare single" : "compare"}>
          {!same && (
            <article className="route-card dim">
              <h4>Direct route</h4>
              <p>{route.shortest.names.join(" → ")}</p>
              <p className="muted">
                {route.shortest.distance_km} km · {formatPct(route.shortest.max_hazard)} peak hazard
              </p>
            </article>
          )}
          <article className="route-card">
            <h4>{same ? "Lower estimated-risk route" : "Risk-aware route"}</h4>
            <p>{route.risk_aware.names.join(" → ")}</p>
            <p className="muted">
              {route.risk_aware.distance_km} km · {formatPct(route.risk_aware.max_hazard)} peak hazard
            </p>
          </article>
        </div>
        <p className="note">{route.note}</p>
        <Elevation scenario={scenario} />
      </section>
      <section>
        <h3>Suggested focus</h3>
        {advice ? (
          <>
            <ul className="check">
              {advice.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="note">{advice.note}</p>
          </>
        ) : (
          <p className="note">This zone stays on monitoring under the current weights.</p>
        )}
      </section>
      <section>
        <h3>This zone</h3>
        <ul className="plain">
          <li>{formatCount(zone.exposure.population)} people counted when the zone is high or critical</li>
          <li>
            {formatCount(zone.assets.buildings)} buildings · {zone.assets.bridges} bridges · {zone.assets.schools} schools ·{" "}
            {zone.assets.hospitals} hospitals
          </li>
        </ul>
      </section>
    </div>
  );
}

function Replay({ scenario }: { scenario: Scenario }) {
  const replay = scenario.replay;
  const nameOf = (id: string) => scenario.zones.find((zone) => zone.id === id)?.name ?? id;
  if (!replay) return <p className="note">Choose a replay step to compare detection with the reference footprint.</p>;
  return (
    <div className="stack" key={replay.step}>
      <header className="zone-head">
        <div>
          <p className="eyebrow">How early risk was flagged</p>
          <h2>{replay.label}</h2>
        </div>
        <div>
          <strong className="score">{replay.hours_before}h</strong>
          <span className="muted">before reference</span>
        </div>
      </header>
      <dl className="split-metrics">
        <div>
          <dt>Detected</dt>
          <dd>{replay.hits.length}</dd>
        </div>
        <div>
          <dt>Missed</dt>
          <dd>{replay.misses.length}</dd>
        </div>
        <div>
          <dt>False alarm</dt>
          <dd>{replay.false_alarms.length}</dd>
        </div>
        <div>
          <dt>Recall</dt>
          <dd>{replay.recall.toFixed(2)}</dd>
        </div>
      </dl>
      <section>
        <h3>Reference footprint</h3>
        <p>{replay.observed_ids.map(nameOf).join(", ")}</p>
        <p className="note">Outlined on the map. This footprint is a fixed demonstration set, not an official disaster polygon.</p>
      </section>
      <section>
        <h3>This step</h3>
        <p>Detected: {replay.hits.map(nameOf).join(", ") || "none"}</p>
        <p>Missed: {replay.misses.map(nameOf).join(", ") || "none"}</p>
        <p>False alarm: {replay.false_alarms.map(nameOf).join(", ") || "none"}</p>
      </section>
      <p className="note">{replay.note}</p>
    </div>
  );
}

function Cascade({ zone }: { zone: Zone }) {
  return (
    <ol className="flow">
      {zone.cascade.map((link) => (
        <li key={link.id}>
          <span>{link.label}</span>
          <b>{formatPct(link.probability)}</b>
        </li>
      ))}
    </ol>
  );
}

function Elevation({ scenario }: { scenario: Scenario }) {
  const points = scenario.route.risk_aware.node_ids.map((id) => {
    const zone = scenario.zones.find((item) => item.id === id);
    return { id, name: zone?.name ?? id, meters: zone?.features.elevation_m ?? 0 };
  });
  const peak = Math.max(...points.map((point) => point.meters), 1);
  return (
    <div className="elev" aria-label="Risk-aware route elevation">
      {points.map((point) => (
        <div key={point.id} title={`${point.name} ${point.meters} m`}>
          <span style={{ height: `${Math.max(18, (point.meters / peak) * 100)}%` }} />
          <small>{point.meters}</small>
        </div>
      ))}
    </div>
  );
}

function Bars({ items }: { items: { label: string; share: number; text: string }[] }) {
  const peak = Math.max(...items.map((item) => item.share), 0.01);
  return (
    <ul className="bars">
      {items.map((item, index) => (
        <li key={item.label}>
          <div className="bar-label">
            <span>{item.label}</span>
            <span>{item.text}</span>
          </div>
          <div className="bar-track">
            <div
              className={index === 0 ? "bar-fill lead" : "bar-fill"}
              style={{ width: `${Math.max(8, (item.share / peak) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <div className="bar-label">
        <span>{label}</span>
        <b>{formatPct(value)}</b>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(4, Math.round(value * 100))}%`, background: riskColor(value) }} />
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: Zone["level"] }) {
  return <span className={`level ${level}`}>{level}</span>;
}

function dominantHazard(zone: Zone): string {
  const options = [
    ["Landslide", zone.landslide],
    ["Flood", zone.flood],
    ["Debris flow", zone.debris],
  ] as const;
  return options.reduce((best, item) => (item[1] > best[1] ? item : best))[0];
}

function roadHazard(scenario: Scenario, id: string): number | undefined {
  return scenario.roads.find((road) => road.id === id)?.hazard;
}

import { formatCount, formatDelta, formatPct } from "../format";
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
  return (
    <div className="stack">
      <header className="zone-head">
        <div>
          <p className="eyebrow">{zone.summary}</p>
          <h2>{zone.name}</h2>
        </div>
        <div>
          <strong className="score" style={{ color: riskColor(zone.dominant) }}>
            {formatPct(zone.dominant)}
          </strong>
          <span className="muted">dominant risk</span>
        </div>
      </header>
      <dl className="split-metrics">
        <div>
          <dt>Landslide</dt>
          <dd>{formatPct(zone.landslide)}</dd>
        </div>
        <div>
          <dt>Flood</dt>
          <dd>{formatPct(zone.flood)}</dd>
        </div>
        <div>
          <dt>Debris flow</dt>
          <dd>{formatPct(zone.debris)}</dd>
        </div>
        <div>
          <dt>Isolation</dt>
          <dd>{formatPct(zone.isolation)}</dd>
        </div>
      </dl>
      <section>
        <h3>Risk contributors</h3>
        <Bars items={zone.contributors.map((item) => ({ label: item.name, share: item.share, text: item.value.toFixed(2) }))} />
        <p className="note">Bar length is the weighted evidence term in the susceptibility model.</p>
      </section>
      <section>
        <h3>Cascade</h3>
        <Cascade zone={zone} />
      </section>
      <section className="uncertainty">
        <h3>Uncertainty</h3>
        <p>
          Confidence: <strong>{zone.uncertainty.confidence}</strong>
        </p>
        <p className="note">{zone.uncertainty.deformation_note}</p>
        <ul className="check">
          {zone.uncertainty.evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <ul className="gap">
          {zone.uncertainty.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Simulation({ scenario, baseline, zone }: { scenario: Scenario; baseline: Scenario | null; zone: Zone }) {
  const baseZone = baseline?.zones.find((item) => item.id === zone.id);
  return (
    <div className="stack">
      <header className="zone-head">
        <div>
          <p className="eyebrow">What-if</p>
          <h2>{zone.name}</h2>
        </div>
        <div>
          <strong className="score">{zone.rainfall.h72.toFixed(0)}</strong>
          <span className="muted">mm / 72 h</span>
        </div>
      </header>
      <dl className="split-metrics">
        <div>
          <dt>24 h</dt>
          <dd>{zone.rainfall.h24.toFixed(0)} mm</dd>
        </div>
        <div>
          <dt>48 h</dt>
          <dd>{zone.rainfall.h48.toFixed(0)} mm</dd>
        </div>
        <div>
          <dt>7 day</dt>
          <dd>{zone.rainfall.d7.toFixed(0)} mm</dd>
        </div>
        <div>
          <dt>Storm scale</dt>
          <dd>{Math.round(scenario.meta.rainfall_scale * 100)}%</dd>
        </div>
      </dl>
      {baseline && (
        <section>
          <h3>Change from the baseline pulse</h3>
          <ul className="plain">
            <li>Critical zones {formatDelta(scenario.kpis.critical_zones, baseline.kpis.critical_zones)}</li>
            <li>Population exposure {formatDelta(scenario.kpis.population_exposed, baseline.kpis.population_exposed)}</li>
            <li>Bridges at risk {formatDelta(scenario.kpis.bridges_at_risk, baseline.kpis.bridges_at_risk)}</li>
            {baseZone && <li>{zone.name} dominant risk {formatDelta(Math.round(zone.dominant * 100), Math.round(baseZone.dominant * 100))} points</li>}
          </ul>
        </section>
      )}
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
            ? "Upstream release is included as an added flood term on main-stem zones."
            : "Turn on an upstream release to add a main-stem flood term."}
        </p>
      </section>
      <section>
        <h3>Updated cascade</h3>
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
    <div className="stack">
      <header className="zone-head">
        <div>
          <p className="eyebrow">Priority</p>
          <h2>{zone.name}</h2>
        </div>
        <div>
          <strong className="score" style={{ color: riskColor(zone.priority) }}>
            {formatPct(zone.priority)}
          </strong>
          <span className="muted">priority score</span>
        </div>
      </header>
      <p>{zone.priority_reason}</p>
      <Bars
        items={zone.priority_factors.map((item) => ({
          label: `${item.name} · w ${item.weight.toFixed(2)}`,
          share: item.contribution / Math.max(...zone.priority_factors.map((factor) => factor.contribution), 0.01),
          text: item.contribution.toFixed(2),
        }))}
      />
      <section>
        <h3>Rescue route from Dhunche</h3>
        <article className="route-card">
          <h4>Risk-aware</h4>
          <p>{route.risk_aware.names.join(" → ")}</p>
          <p className="muted">
            {route.risk_aware.distance_km} km · peak hazard {formatPct(route.risk_aware.max_hazard)}
          </p>
        </article>
        {!same && (
          <article className="route-card dim">
            <h4>Shorter road</h4>
            <p>{route.shortest.names.join(" → ")}</p>
            <p className="muted">
              {route.shortest.distance_km} km · peak hazard {formatPct(route.shortest.max_hazard)}
            </p>
          </article>
        )}
        <p className="note">{route.note}</p>
      </section>
      <section>
        <h3>Resource suggestion</h3>
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
        <h3>Exposure inside high and critical zones</h3>
        <ul className="plain">
          <li>{formatCount(zone.exposure.population)} people in this zone if it is high or critical</li>
          <li>{formatCount(zone.assets.buildings)} buildings in the zone inventory</li>
          <li>{zone.assets.bridges} bridges · {zone.assets.schools} schools · {zone.assets.hospitals} hospitals</li>
        </ul>
      </section>
    </div>
  );
}

function Replay({ scenario }: { scenario: Scenario }) {
  const replay = scenario.replay;
  const nameOf = (id: string) => scenario.zones.find((zone) => zone.id === id)?.name ?? id;
  if (!replay) return null;
  return (
    <div className="stack">
      <header className="zone-head">
        <div>
          <p className="eyebrow">Historical method demonstration</p>
          <h2>{replay.label}</h2>
        </div>
        <div>
          <strong className="score">{replay.hours_before}h</strong>
          <span className="muted">before reference event</span>
        </div>
      </header>
      <dl className="split-metrics">
        <div>
          <dt>Precision</dt>
          <dd>{replay.precision.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Recall</dt>
          <dd>{replay.recall.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Hits</dt>
          <dd>{replay.hits.length}</dd>
        </div>
        <div>
          <dt>Misses</dt>
          <dd>{replay.misses.length}</dd>
        </div>
      </dl>
      <section>
        <h3>Reference footprint</h3>
        <p>{replay.observed_ids.map(nameOf).join(", ")}</p>
        <p className="note">Outlined on the map. This footprint is a fixed demonstration set, not an official disaster polygon.</p>
      </section>
      <section>
        <h3>This timestep</h3>
        <p>Flagged: {replay.predicted_ids.map(nameOf).join(", ") || "none"}</p>
        <p>False alarms: {replay.false_alarms.map(nameOf).join(", ") || "none"}</p>
        <p>Misses: {replay.misses.map(nameOf).join(", ") || "none"}</p>
      </section>
      <p className="note">{replay.note}</p>
    </div>
  );
}

function Cascade({ zone }: { zone: Zone }) {
  return (
    <ol className="cascade">
      {zone.cascade.map((link) => (
        <li key={link.id}>
          <span>{link.label}</span>
          <b>{formatPct(link.probability)}</b>
        </li>
      ))}
    </ol>
  );
}

function Bars({ items }: { items: { label: string; share: number; text: string }[] }) {
  return (
    <ul className="bars">
      {items.map((item) => (
        <li key={item.label}>
          <div className="bar-label">
            <span>{item.label}</span>
            <span>{item.text}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(6, item.share * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

import { useEffect, useRef } from "react";
import { CircleMarker, GeoJSON, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { LayerId, Scenario, Zone } from "../types";

const LEVEL_COLOR = {
  low: "#2dd4bf",
  moderate: "#eab308",
  high: "#f97316",
  critical: "#fb7185",
};

export function riskColor(value: number): string {
  if (value >= 0.75) return LEVEL_COLOR.critical;
  if (value >= 0.55) return LEVEL_COLOR.high;
  if (value >= 0.35) return LEVEL_COLOR.moderate;
  return LEVEL_COLOR.low;
}

const FACILITY_COLOR: Record<string, string> = {
  hospital: "#fb7185",
  health_post: "#fdba74",
  school: "#fde68a",
  shelter: "#5eead4",
  bridge: "#93c5fd",
  hydropower: "#c4b5fd",
};

function layerValue(zone: Zone, layer: LayerId): number {
  if (layer === "landslide") return zone.landslide;
  if (layer === "flood") return zone.flood;
  if (layer === "debris") return zone.debris;
  return zone.priority;
}

function toLatLng(coordinates: [number, number][]): [number, number][] {
  return coordinates.map(([lon, lat]) => [lat, lon]);
}

function FitOnce({ zones }: { zones: Zone[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || zones.length === 0) return;
    const points = zones.flatMap((zone) => zone.polygon.map(([lon, lat]) => [lat, lon] as [number, number]));
    map.fitBounds(points, { padding: [30, 30] });
    fitted.current = true;
  }, [map, zones]);
  return null;
}

type Props = {
  scenario: Scenario;
  layer: LayerId;
  selectedId: string;
  showObserved: boolean;
  onSelect: (zoneId: string) => void;
};

export function RiskMap({ scenario, layer, selectedId, showObserved, onSelect }: Props) {
  const observed = new Set(scenario.replay?.observed_ids ?? []);
  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features: scenario.zones.map((zone) => {
      const feature: Feature = {
        type: "Feature",
        properties: {
          id: zone.id,
          name: zone.name,
          display: layerValue(zone, layer),
          selected: zone.id === selectedId,
          observed: showObserved && observed.has(zone.id),
        },
        geometry: { type: "Polygon", coordinates: [zone.polygon] },
      };
      return feature;
    }),
  };

  const sameRoute =
    scenario.route.shortest.node_ids.join(">") === scenario.route.risk_aware.node_ids.join(">");
  const geoKey = [
    layer,
    scenario.meta.rainfall_scale,
    scenario.meta.upstream_release,
    scenario.meta.replay_step ?? "live",
    selectedId,
    showObserved ? "obs" : "est",
  ].join(":");

  return (
    <MapContainer
      center={[28.12, 85.28]}
      zoom={10}
      zoomControl
      style={{ height: "100%", width: "100%", background: "#071016" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FitOnce zones={scenario.zones} />
      <GeoJSON
        key={geoKey}
        data={collection}
        style={(feature) => {
          const props = feature?.properties as {
            display: number;
            selected: boolean;
            observed: boolean;
          };
          const style: PathOptions = {
            color: props.observed ? "#f8fafc" : props.selected ? "#ffffff" : "rgba(232, 244, 246, 0.35)",
            weight: props.selected || props.observed ? 2.4 : 1,
            dashArray: props.observed ? "5 4" : undefined,
            fillColor: riskColor(props.display),
            fillOpacity: props.selected ? 0.78 : 0.62,
          };
          return style;
        }}
        onEachFeature={(feature, leafletLayer) => {
          const props = feature.properties as { id: string; name: string; display: number };
          leafletLayer.bindTooltip(`${props.name} · ${Math.round(props.display * 100)}%`, { sticky: true });
          leafletLayer.on("click", () => onSelect(props.id));
        }}
      />
      {!sameRoute && (
        <Polyline
          positions={toLatLng(scenario.route.shortest.coordinates)}
          pathOptions={{ color: "#fb923c", weight: 3, dashArray: "7 7", opacity: 0.9 }}
        >
          <Tooltip>Shorter road · higher estimated hazard</Tooltip>
        </Polyline>
      )}
      <Polyline
        positions={toLatLng(scenario.route.risk_aware.coordinates)}
        pathOptions={{ color: "#5eead4", weight: 5, opacity: 0.95 }}
      >
        <Tooltip>Risk-aware route · estimated lower exposure</Tooltip>
      </Polyline>
      {scenario.facilities.map((facility) => (
        <CircleMarker
          key={facility.id}
          center={[facility.lat, facility.lon]}
          radius={facility.type === "hospital" || facility.type === "hydropower" ? 6 : 4}
          pathOptions={{
            color: "#071016",
            weight: 1,
            fillColor: FACILITY_COLOR[facility.type] ?? "#e7f0f2",
            fillOpacity: 0.95,
          }}
        >
          <Tooltip>{facility.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

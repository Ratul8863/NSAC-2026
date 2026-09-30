import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import { hazardRing } from "../hazardShape";
import type { LayerId, Scenario, Zone } from "../types";

const LEVEL_COLOR = {
  low: "#34d399",
  moderate: "#d6b24a",
  high: "#e8943a",
  critical: "#e85d5d",
};

export function riskColor(value: number): string {
  if (value >= 0.75) return LEVEL_COLOR.critical;
  if (value >= 0.55) return LEVEL_COLOR.high;
  if (value >= 0.35) return LEVEL_COLOR.moderate;
  return LEVEL_COLOR.low;
}

function layerValue(zone: Zone, layer: LayerId): number {
  if (layer === "landslide") return zone.landslide;
  if (layer === "flood") return zone.flood;
  if (layer === "debris") return zone.debris;
  return zone.priority;
}

function toLatLng(coordinates: [number, number][]): [number, number][] {
  return coordinates.map(([lon, lat]) => [lat, lon]);
}

const ESRI_SATELLITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function Basemap() {
  const [useFallback, setUseFallback] = useState(false);

  if (useFallback) {
    return <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILES} maxZoom={19} />;
  }

  return (
    <>
      <TileLayer
        attribution={ESRI_ATTRIBUTION}
        url={ESRI_SATELLITE}
        maxNativeZoom={18}
        maxZoom={18}
        eventHandlers={{ tileerror: () => setUseFallback(true) }}
      />
      <TileLayer url={ESRI_LABELS} maxNativeZoom={18} maxZoom={18} opacity={0.9} />
    </>
  );
}

function zonePoints(zones: Zone[], layer: LayerId): [number, number][] {
  return zones.flatMap((zone) => hazardRing(zone, layerValue(zone, layer), 1.12).map(([lon, lat]) => [lat, lon] as [number, number]));
}

function MobileScrollPass() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const onTouchStart = (event: TouchEvent) => {
      if (window.innerWidth > 800) {
        if (!map.dragging.enabled()) map.dragging.enable();
        return;
      }
      if (event.touches.length >= 2) map.dragging.enable();
      else map.dragging.disable();
    };
    container.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    return () => {
      container.removeEventListener("touchstart", onTouchStart, { capture: true });
      if (!map.dragging.enabled()) map.dragging.enable();
    };
  }, [map]);

  return null;
}

function MapController({ zones, layer, viewToken, layoutKey }: { zones: Zone[]; layer: LayerId; viewToken: number; layoutKey: string }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || zones.length === 0) return;
    map.fitBounds(zonePoints(zones, layer), { padding: [28, 28] });
    fitted.current = true;
  }, [map, zones, layer]);

  useEffect(() => {
    if (viewToken === 0 || zones.length === 0) return;
    map.fitBounds(zonePoints(zones, layer), { padding: [28, 28] });
  }, [map, viewToken, zones, layer]);

  useEffect(() => {
    const frame = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(frame);
  }, [map, layoutKey]);

  useEffect(() => {
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [map]);

  return null;
}

function SettlementLabels({ zones, selectedId }: { zones: Zone[]; selectedId: string }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map]);

  return (
    <>
      {zones.map((zone) => {
        if (zoom < 12 && zone.id !== selectedId) return null;
        const [lon, lat] = zone.center;
        return (
          <CircleMarker
            key={zone.id}
            center={[lat, lon]}
            radius={zone.id === selectedId ? 5 : 3.5}
            pathOptions={{
              color: "#07111a",
              weight: 1,
              fillColor: zone.id === selectedId ? "#f4fbff" : "#9fd8d2",
              fillOpacity: 1,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -2]} className={zone.id === selectedId ? "settle-label on" : "settle-label"}>
              {zone.name}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

type Props = {
  scenario: Scenario;
  layer: LayerId;
  selectedId: string;
  showObserved: boolean;
  viewToken: number;
  layoutKey: string;
  onSelect: (zoneId: string) => void;
};

export function RiskMap({ scenario, layer, selectedId, showObserved, viewToken, layoutKey, onSelect }: Props) {
  const observedKey = scenario.replay?.observed_ids.join(",") ?? "";
  const collection = useMemo<FeatureCollection>(() => {
    const observed = new Set(scenario.replay?.observed_ids ?? []);
    const features: Feature[] = [];
    for (const zone of scenario.zones) {
      const display = layerValue(zone, layer);
      const properties = {
        id: zone.id,
        name: zone.name,
        display,
        selected: zone.id === selectedId,
        observed: showObserved && observed.has(zone.id),
      };
      features.push({
        type: "Feature",
        properties: { ...properties, ring: "halo" },
        geometry: { type: "Polygon", coordinates: [hazardRing(zone, display, 1.22)] },
      });
      features.push({
        type: "Feature",
        properties: { ...properties, ring: "core" },
        geometry: { type: "Polygon", coordinates: [hazardRing(zone, display, 1)] },
      });
    }
    return { type: "FeatureCollection", features };
  }, [scenario, layer, selectedId, showObserved, observedKey]);

  const sameRoute = scenario.route.shortest.node_ids.join(">") === scenario.route.risk_aware.node_ids.join(">");
  const aware = scenario.route.risk_aware.coordinates;
  const origin = aware[0];
  const destination = aware[aware.length - 1];
  const geoKey = [
    layer,
    scenario.meta.rainfall_scale,
    scenario.meta.upstream_release,
    scenario.meta.replay_step ?? "live",
    selectedId,
    showObserved ? "obs" : "est",
  ].join(":");

  return (
    <MapContainer center={[28.12, 85.3]} zoom={11} zoomControl style={{ height: "100%", width: "100%", background: "#d7e0e4" }}>
      <Basemap />
      <MobileScrollPass />
      <MapController zones={scenario.zones} layer={layer} viewToken={viewToken} layoutKey={layoutKey} />
      <GeoJSON
        key={geoKey}
        data={collection}
        style={(feature) => {
          const props = feature?.properties as {
            display: number;
            selected: boolean;
            observed: boolean;
            ring: string;
          };
          const halo = props.ring === "halo";
          const style: PathOptions = {
            className: halo ? "hazard-halo" : "hazard-core",
            color: props.observed && !halo ? "#f4fbff" : props.selected && !halo ? "#f4fbff" : riskColor(props.display),
            weight: halo ? 0 : props.selected ? 2.2 : 1,
            dashArray: props.observed && !halo ? "4 4" : undefined,
            fillColor: riskColor(props.display),
            fillOpacity: halo ? 0.14 : props.selected ? 0.5 : 0.32,
          };
          return style;
        }}
        onEachFeature={(feature, leafletLayer) => {
          const props = feature.properties as { id: string; name: string; display: number; ring: string };
          if (props.ring === "halo") return;
          leafletLayer.bindTooltip(`${props.name} · ${Math.round(props.display * 100)}% modeled`, { sticky: true });
          leafletLayer.on("click", () => onSelect(props.id));
        }}
      />
      <SettlementLabels zones={scenario.zones} selectedId={selectedId} />
      {!sameRoute && (
        <Polyline
          positions={toLatLng(scenario.route.shortest.coordinates)}
          pathOptions={{ className: "route-direct", color: "#e8943a", weight: 2.5, dashArray: "6 7", opacity: 0.95 }}
        >
          <Tooltip>Direct route · higher estimated hazard</Tooltip>
        </Polyline>
      )}
      <Polyline
        positions={toLatLng(aware)}
        pathOptions={{ className: "route-aware", color: "#2dd4bf", weight: sameRoute ? 4 : 5, opacity: 0.95 }}
      >
        <Tooltip>{sameRoute ? "Lower estimated-risk route" : "Risk-aware route · lower estimated hazard"}</Tooltip>
      </Polyline>
      {origin && (
        <CircleMarker center={[origin[1], origin[0]]} radius={6} pathOptions={{ color: "#f4fbff", weight: 2, fillColor: "#2dd4bf", fillOpacity: 1 }}>
          <Tooltip>Start · Dhunche</Tooltip>
        </CircleMarker>
      )}
      {destination && (
        <CircleMarker center={[destination[1], destination[0]]} radius={6} pathOptions={{ color: "#f4fbff", weight: 2, fillColor: "#e7eef4", fillOpacity: 1 }}>
          <Tooltip>Destination</Tooltip>
        </CircleMarker>
      )}
      {scenario.facilities.map((facility) => (
        <CircleMarker
          key={facility.id}
          center={[facility.lat, facility.lon]}
          radius={facility.type === "hospital" ? 4.5 : 3}
          pathOptions={{
            color: "#07111a",
            weight: 1,
            fillColor: facility.type === "hospital" ? "#e85d5d" : "#8fb9c4",
            fillOpacity: 0.95,
          }}
        >
          <Tooltip>{facility.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

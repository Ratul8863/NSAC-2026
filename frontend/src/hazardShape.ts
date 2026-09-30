import type { Zone } from "./types";

function unit(seed: number, index: number): number {
  const value = Math.sin(seed * 0.017 + index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function chaikinClosed(points: [number, number][]): [number, number][] {
  const next: [number, number][] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const following = points[(index + 1) % points.length];
    next.push([current[0] * 0.75 + following[0] * 0.25, current[1] * 0.75 + following[1] * 0.25]);
    next.push([current[0] * 0.25 + following[0] * 0.75, current[1] * 0.25 + following[1] * 0.75]);
  }
  return next;
}

/** Modeled surface around a settlement. Extent comes from the demo zone, not an administrative boundary. */
export function hazardRing(zone: Zone, risk: number, grow = 1): [number, number][] {
  const longitudes = zone.polygon.map((point) => point[0]);
  const latitudes = zone.polygon.map((point) => point[1]);
  const radiusX = (Math.max(...longitudes) - Math.min(...longitudes)) / 2;
  const radiusY = (Math.max(...latitudes) - Math.min(...latitudes)) / 2;
  const [centerLon, centerLat] = zone.center;
  let seed = 0;
  for (const character of zone.id) seed = (seed * 33 + character.charCodeAt(0)) >>> 0;
  const scale = (0.56 + 0.36 * Math.min(Math.max(risk, 0), 1)) * grow;
  const raw: [number, number][] = [];
  const count = 12;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const lobe = 0.64 + unit(seed, index) * 0.48;
    const squash = 0.72 + unit(seed, index + 5) * 0.38;
    raw.push([
      centerLon + Math.cos(angle) * radiusX * scale * lobe,
      centerLat + Math.sin(angle) * radiusY * scale * squash,
    ]);
  }
  const smooth = chaikinClosed(chaikinClosed(raw));
  return [...smooth, smooth[0]];
}

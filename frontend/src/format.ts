export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatDelta(current: number, baseline: number): string {
  const delta = current - baseline;
  if (delta === 0) return "no change";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatCount(Math.abs(delta))}`;
}

export function formatPoints(current: number, baseline: number): string {
  const delta = Math.round(current * 100) - Math.round(baseline * 100);
  if (delta === 0) return "no change";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta)} pts`;
}

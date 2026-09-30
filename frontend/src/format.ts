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

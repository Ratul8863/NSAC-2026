import type { Scenario, ScenarioQuery } from "./types";

export async function fetchScenario(query: ScenarioQuery, signal?: AbortSignal): Promise<Scenario> {
  const response = await fetch("/api/scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
    signal,
  });
  if (!response.ok) {
    throw new Error("The scenario service did not respond.");
  }
  return response.json() as Promise<Scenario>;
}

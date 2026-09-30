export type RiskLevel = "low" | "moderate" | "high" | "critical";

export type Contributor = {
  id: string;
  name: string;
  value: number;
  share: number;
};

export type CascadeLink = {
  id: string;
  label: string;
  probability: number;
};

export type Zone = {
  id: string;
  name: string;
  summary: string;
  polygon: number[][];
  center: [number, number];
  rainfall: { h24: number; h48: number; h72: number; d7: number };
  features: {
    elevation_m: number;
    slope_deg: number;
    aspect_deg: number;
    land_cover: string;
    soil: string;
    river_km: number;
    historical_landslides: number;
    deformation: number;
    satellite_change: number;
    hydropower: number;
  };
  landslide: number;
  flood: number;
  debris: number;
  blockage: number;
  isolation: number;
  bridge_failure: number;
  dominant: number;
  level: RiskLevel;
  priority: number;
  priority_level: RiskLevel;
  contributors: Contributor[];
  flood_contributors: Contributor[];
  priority_factors: {
    id: string;
    name: string;
    weight: number;
    value: number;
    contribution: number;
  }[];
  priority_reason: string;
  uncertainty: {
    risk: number;
    confidence: string;
    confidence_score: number;
    evidence: string[];
    limitations: string[];
    deformation_note: string;
  };
  cascade: CascadeLink[];
  exposed: boolean;
  exposure: {
    population: number;
    buildings: number;
    schools: number;
    hospitals: number;
    health_posts: number;
    bridges: number;
    shelters: number;
  };
  assets: {
    population: number;
    buildings: number;
    schools: number;
    hospitals: number;
    health_posts: number;
    bridges: number;
    shelters: number;
  };
};

export type PathEstimate = {
  node_ids: string[];
  names: string[];
  edge_ids: string[];
  distance_km: number;
  max_hazard: number;
  mean_hazard: number;
  coordinates: [number, number][];
};

export type Scenario = {
  meta: {
    system: string;
    aoi: string;
    model: string;
    rainfall_source: string;
    disclaimer: string;
    limitations: string[];
    weights: Record<string, number>;
    rainfall_scale: number;
    upstream_release: boolean;
    replay_step: string | null;
    origin_id: string;
    destination_id: string;
    stages: string[];
  };
  kpis: {
    critical_zones: number;
    high_zones: number;
    population_exposed: number;
    buildings_exposed: number;
    roads_at_risk: number;
    bridges_at_risk: number;
    schools_exposed: number;
    hospitals_exposed: number;
    health_posts_exposed: number;
  };
  zones: Zone[];
  roads: {
    id: string;
    a: string;
    b: string;
    distance_km: number;
    kind: string;
    hazard: number;
    level: RiskLevel;
    at_risk: boolean;
  }[];
  facilities: {
    id: string;
    type: string;
    name: string;
    zone_id: string;
    lon: number;
    lat: number;
  }[];
  route: {
    origin_id: string;
    destination_id: string;
    shortest: PathEstimate;
    risk_aware: PathEstimate;
    note: string;
  };
  resources: {
    zone_id: string;
    zone_name: string;
    priority: number;
    level: RiskLevel;
    recommendations: string[];
    note: string;
  }[];
  replay: {
    step: string;
    label: string;
    hours_before: number;
    rainfall_scale: number;
    predicted_ids: string[];
    observed_ids: string[];
    hits: string[];
    false_alarms: string[];
    misses: string[];
    precision: number;
    recall: number;
    note: string;
  } | null;
  replay_steps: { id: string; label: string; hours_before: number }[];
  alert: {
    level: string;
    zone_id: string;
    zone_name: string;
    primary_hazard: string;
    factors: string;
    cascading_hazard: string;
    confidence: string;
    channel: string;
  } | null;
};

export type LayerId = "landslide" | "flood" | "debris" | "priority";
export type TabId = "forecast" | "simulation" | "response" | "replay";

export type ScenarioQuery = {
  rainfall_scale: number;
  upstream_release: boolean;
  destination_id: string;
  replay_step: string | null;
  weights?: Record<string, number>;
};

import type {
  Algorithm, BenchmarkResponse, ComplianceResponse, DashboardResponse,
  FuelSandboxResponse, FuelSpec, ModelPerformance, ObjectiveWeights,
  OptimizeResult, OptimizeStatus, ParetoResponse, PredictionResponse,
  RouteRecord, RunHistoryRow, ScenarioSummary, Vessel, VesselClassSpec,
} from "@/types/api";

const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export class ApiError extends Error {
  problems: { field: string; message: string }[];
  status: number;
  constructor(status: number, message: string, problems: { field: string; message: string }[] = []) {
    super(message);
    this.status = status;
    this.problems = problems;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("greenfleet_auth_token") : null;
  const headers: Record<string, string> = {};
  if (!(init?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (init?.headers) {
    Object.assign(headers, init.headers);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the VATES API. Is the backend running on port 8000?");
  }
  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, body.detail || body.error || `Request failed (${res.status})`, body.problems || []);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
const put = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
const del = <T,>(path: string) => request<T>(path, { method: "DELETE" });

// ---------------------------------------------------------------- system

export const getHealth = () => get<{
  status: string; database: string; dataset: string;
  optimization_engine: string; ml_model: string; compute: string;
}>("/health");

// ------------------------------------------------------------- reference

export const listFuels = () => get<{ fuels: FuelSpec[] }>("/fuels");
export const listVesselClasses = () => get<{ classes: VesselClassSpec[] }>("/vessel-classes");

// ---------------------------------------------------------------- fleet

export const listVessels = () => get<{ count: number; vessels: Vessel[] }>("/vessels");
export const createVessel = (body: Partial<Vessel>) => post<{ id: number }>("/vessels", body);
export const updateVessel = (id: number, body: Partial<Vessel>) => put<{ id: number }>(`/vessels/${id}`, body);
export const deleteVessel = (id: number) => del<{ deleted: number }>(`/vessels/${id}`);
export const listRoutes = () => get<{ routes: RouteRecord[] }>("/routes");

export const uploadFleetCsv = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return post<{ added: number; skipped_existing: number; errors: string[]; error_count: number }>("/upload", undefined)
    .catch(() => request<{ added: number; skipped_existing: number; errors: string[]; error_count: number }>(
      "/upload", { method: "POST", body: fd }));
};

export const downloadDatasetUrl = () => `${BASE}/dataset/download`;

// ------------------------------------------------------------- dashboard

export const getDashboard = () => get<DashboardResponse>("/dashboard");

// ------------------------------------------------------------ prediction

export interface PredictionInput {
  vessel_class: string; dwt: number; engine_kw?: number; vessel_age_years?: number;
  speed_kn: number; cargo_tonnes: number; distance_nm: number; route?: string;
  port_hours?: number; fuel_type: string; weather?: string; wind_speed_kn?: number;
  wave_height_m?: number; current_speed_kn?: number; fuel_price_usd_per_tonne?: number;
  carbon_price_usd_per_tonne?: number;
}
export const predictFuel = (body: PredictionInput) => post<PredictionResponse>("/predict/fuel", body);
export const getModelPerformance = () => get<ModelPerformance>("/model/performance");
export const retrainModel = (nSamples = 6000) => post<{ best_model: string; metrics: unknown }>(`/model/train?n_samples=${nSamples}`);

// ---------------------------------------------------------- optimization

export interface OptimizeInput {
  scenario_id?: number;
  algorithm: Algorithm;
  population_size?: number;
  iterations?: number;
  seed?: number;
  refine_speeds?: boolean;
  weights?: ObjectiveWeights;
  async_run?: boolean;
}
export const optimize = (body: OptimizeInput) => post<OptimizeResult | { run_id: number; status: string; poll: string }>("/optimize", body);
export const getRunStatus = (runId: number) => get<OptimizeStatus>(`/optimize/status/${runId}`);
export const listRuns = () => get<{ runs: RunHistoryRow[] }>("/optimize/runs");

export const runBenchmark = (body: {
  scenario_id?: number; runs?: number; population_size?: number; iterations?: number; algorithms?: Algorithm[];
}) => post<BenchmarkResponse>("/benchmark", body);

export const runPareto = (body: {
  scenario_id?: number; samples?: number; population_size?: number; iterations?: number;
  min_cargo_fulfilment_pct?: number; max_emissions_tonnes?: number; max_cost_usd?: number;
}) => post<ParetoResponse>("/pareto", body);

// ---------------------------------------------------------------- fuels

export const fuelSandbox = (body: {
  vessel_class?: string; dwt?: number; speed_kn?: number; cargo_tonnes?: number;
  distance_nm?: number; annual_operating_hours?: number; carbon_price_usd_per_tonne?: number;
  fuel_prices?: Record<string, number>; incumbent?: string; horizon_years?: number; weather?: string;
}) => post<FuelSandboxResponse>("/fuels/sandbox", body);

// ---------------------------------------------------------- compliance

export const getComplianceLatest = () => get<ComplianceResponse>("/compliance");
export const assessCompliance = (body: { run_id?: number; carbon_price_usd_per_tonne?: number; ets_year?: number }) =>
  post<ComplianceResponse>("/compliance", body);

// ---------------------------------------------------------------- scenarios

export const listScenarios = () => get<{ scenarios: ScenarioSummary[] }>("/scenarios");
export const getScenario = (id: number) => get<{ id: number; name: string; payload: any }>(`/scenarios/${id}`);
export const createScenario = (body: { name: string; description?: string; tag?: string; payload: any }) =>
  post<{ id: number; name: string }>("/scenarios", body);
export const duplicateScenario = (id: number) => post<{ id: number; name: string }>(`/scenarios/${id}/duplicate`);
export const deleteScenario = (id: number) => del<{ deleted: number }>(`/scenarios/${id}`);
export const compareScenarios = (ids: number[], algorithm: Algorithm = "QGA") =>
  post<{ algorithm: string; scenarios: { scenario_id: number; name: string; summary: unknown; comparison: unknown }[] }>(
    `/scenarios/compare?algorithm=${algorithm}`, ids);

// ------------------------------------------------------------------ reports

export const generateReport = (body: {
  run_id?: number; scenario_id?: number; include_benchmark?: boolean;
  include_pareto?: boolean; include_fuel_sandbox?: boolean;
  benchmark_runs?: number; pareto_samples?: number;
}) => post<{ report_id: number; filename: string; size_bytes: number; download: string }>("/reports/generate", body);
export const listReports = () => get<{ reports: { id: number; filename: string; title: string; size_bytes: number; created_at: string }[] }>("/reports");
export const reportDownloadUrl = (id: number) => `${BASE}/reports/${id}/download`;

// ---------------------------------------------------------------- demo

export const loadDemo = () => post<{
  seeded: Record<string, number>;
  scenarios: { id: number; name: string; tag: string; description: string }[];
  suggested_flow: string[];
  notice: string;
}>("/demo/load");

// ------------------------------------------------------------------ map

export const listMapRoutes = () => get<{ count: number; routes: import("@/types/api").MapRoute[]; source_note: string }>("/map/routes");
export const listMapPorts = () => get<{ count: number; ports: import("@/types/api").MapPort[] }>("/map/ports");
export const getMapBestRoute = (runId?: number) =>
  get<import("@/types/api").MapBestRouteResponse>(runId ? `/map/best-route/${runId}` : "/map/best-route");

export interface QuantumPredictRequest {
  route_code?: string;
  fuel_type?: string;
  fuel_price_usd?: number;
  vessel_class?: string;
  cargo_demand_tonnes?: number;
  weather_severity?: string;
  algorithm?: string;
  objective?: string;
}

export interface CandidateRoute {
  id: string;
  title: string;
  color: string;
  route_code: string;
  origin: { name: string; latitude: number; longitude: number };
  destination: { name: string; latitude: number; longitude: number };
  waypoints: [number, number][];
  distance_nm: number;
  speed_kn: number;
  fuel_type: string;
  fuel_tonnes: number;
  total_cost_usd: number;
  fuel_cost_usd: number;
  lifecycle_co2e_tonnes: number;
  voyage_hours: number;
  engine_load_pct: number;
  quantum_fitness: number;
  risk_level: string;
  is_feasible?: boolean;
  feasibility_status?: string;
  explanation: string;
}

export interface QuantumPredictResponse {
  quantum_algorithm: string;
  objective?: string;
  parameters: Record<string, any>;
  algorithm_metadata?: Record<string, any>;
  data_provenance?: Record<string, any>;
  candidate_count: number;
  candidates: CandidateRoute[];
  best_recommendation: CandidateRoute;
}

export const predictMapRoutes = (body?: QuantumPredictRequest) =>
  post<QuantumPredictResponse>("/map/predict", body ?? {});

// ------------------------------------------------------------- live weather

export interface LiveMarineWeather {
  latitude: number;
  longitude: number;
  wave_height_m: number;
  wave_period_s: number;
  wave_direction_deg?: number;
  wind_wave_height_m: number;
  swell_wave_height_m: number;
  swell_wave_period_s: number;
  ocean_current_velocity_kn: number;
  ocean_current_direction_deg?: number;
  wind_speed_kn: number;
  wind_gusts_kn: number;
  wind_direction_deg?: number;
  temperature_c: number;
  surface_pressure_hpa: number;
  sea_state: "CALM" | "MODERATE" | "ROUGH" | "EXTREME";
  source: string;
  cached: boolean;
  fetched_at: string;
}

export interface RouteWeatherProfile {
  route_code: string;
  sampled_waypoints_count: number;
  summary: {
    avg_wave_height_m: number;
    max_wave_height_m: number;
    avg_wind_speed_kn: number;
    max_wind_speed_kn: number;
    avg_current_kn: number;
    dominant_sea_state: string;
  };
  waypoint_observations: LiveMarineWeather[];
}

export const getLiveWeather = (lat: number, lon: number) =>
  get<LiveMarineWeather>(`/weather/live?lat=${lat}&lon=${lon}`);

export const getRouteWeather = (routeCode: string) =>
  get<RouteWeatherProfile>(`/weather/route/${encodeURIComponent(routeCode)}`);

// ------------------------------------------------------------- telemetry

export interface TelemetryRequest {
  Ship_SpeedOverGround: number;
  Consumer_Total_ShaftPower: number;
  Weather_OceanCurrentVelocity?: number;
  Weather_WaveHeight?: number;
  Weather_WavePeriod?: number;
  Weather_Temperature2M?: number;
  Weather_SurfacePressure?: number;
  Weather_WindSpeed10M?: number;
  Weather_WindWaveHeight?: number;
  Weather_SwellWaveHeight?: number;
  Weather_SwellWavePeriod?: number;
  Weather_WindGusts10M?: number;
  vessel_id?: string;
  distance_nm?: number;
}

export interface TelemetryResponse {
  predicted_momentary_fuel_kg_s: number;
  predicted_fuel_rate_mt_per_day: number;
  estimated_sfoc_g_per_kwh: number | null;
  interval_low_kg_s: number;
  interval_high_kg_s: number;
  model_r2: number;
  vessel_id: string;
  estimated_voyage_hours?: number;
  estimated_voyage_fuel_tonnes?: number;
}

export const predictTelemetry = (body: TelemetryRequest) =>
  post<TelemetryResponse>("/predict/telemetry", body);

// ------------------------------------------------------------- authentication

import type { AuthUser, DemoUserProfile, LoginResponse } from "@/types/auth";

export const loginApi = (body: { username: string; password: string }) =>
  post<LoginResponse>("/auth/login", body);

export const registerApi = (body: {
  username: string;
  password: string;
  display_name: string;
  email?: string;
  role?: string;
}) => post<LoginResponse>("/auth/register", body);

export const getMeApi = () => get<AuthUser>("/auth/me");

export const listDemoUsersApi = () => get<{ users: DemoUserProfile[] }>("/auth/demo-users");

// ------------------------------------------------------------- heterogeneous fleet & contracts

export const listFleet = (params?: { vessel_type?: string; size_class?: string; fuel?: string; search?: string }) => {
  const q = new URLSearchParams();
  if (params?.vessel_type && params.vessel_type !== "ALL") q.set("vessel_type", params.vessel_type);
  if (params?.size_class && params.size_class !== "ALL") q.set("size_class", params.size_class);
  if (params?.fuel && params.fuel !== "ALL") q.set("fuel", params.fuel);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return get<{ count: number; vessels: Vessel[] }>(`/fleet${qs ? `?${qs}` : ""}`);
};

export const getFleetVessel = (id: number) => get<Vessel>(`/fleet/${id}`);

export const getFleetMeta = () => get<import("@/types/api").FleetMetaResponse>("/fleet/meta");

export const getFleetAnalytics = () => get<import("@/types/api").FleetAnalyticsResponse>("/fleet/analytics");

export const listContracts = (status?: string) =>
  get<{ count: number; contracts: import("@/types/api").Contract[]; data_type: string }>(status ? `/contracts?status=${status}` : "/contracts");

export const getContract = (id: number) => get<import("@/types/api").Contract>(`/contracts/${id}`);

export const createContract = (body: import("@/types/api").ContractCreateInput) =>
  post<import("@/types/api").Contract>("/contracts", body);

export const updateContract = (id: number, body: Partial<import("@/types/api").ContractCreateInput>) =>
  put<import("@/types/api").Contract>(`/contracts/${id}`, body);

export const deleteContract = (id: number) => del<{ deleted: number; contract_id: number }>(`/contracts/${id}`);

// ------------------------------------------------------------- voyage engine & emissions

export interface VoyageCalculateRequest {
  vessel_id?: number;
  vessel_class?: string;
  speed_kn: number;
  distance_nm: number;
  fuel_type?: string;
  weather?: string;
  cargo_tonnes?: number;
  contract_deadline_hours?: number;
  penalty_per_day?: number;
}

export const calculateVoyage = (body: VoyageCalculateRequest) =>
  post<import("@/types/api").VoyageCalculationResult>("/voyages/calculate", body);

export const calculateEmissions = (body: { fuel_type: string; fuel_consumed_tonnes: number }) =>
  post<import("@/types/api").EmissionsProfile>("/emissions/calculate", body);

export interface WhatIfRequest {
  baseline: {
    vessel_id?: number;
    vessel_class?: string;
    route_name?: string;
    distance_nm: number;
    speed_kn: number;
    fuel_type?: string;
    weather?: string;
    deadline_hours?: number;
    penalty_per_day?: number;
  };
  scenario: {
    vessel_id?: number;
    vessel_class?: string;
    route_name?: string;
    distance_nm: number;
    speed_kn: number;
    fuel_type?: string;
    weather?: string;
    deadline_hours?: number;
    penalty_per_day?: number;
  };
}

export const simulateWhatIf = (body: WhatIfRequest) =>
  post<import("@/types/api").WhatIfComparisonResponse>("/simulation/what-if", body);

export const getWeatherImpact = (routeCode: string, speedKn = 14.0, vesselClass = "PANAMAX") =>
  get<import("@/types/api").WeatherImpactResponse>(`/weather/impact?route_code=${encodeURIComponent(routeCode)}&speed_kn=${speedKn}&vessel_class=${vesselClass}`);




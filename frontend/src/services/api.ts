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
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the GreenFleet API. Is the backend running on port 8000?");
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



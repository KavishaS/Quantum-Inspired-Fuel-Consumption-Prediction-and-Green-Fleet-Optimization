// Mirrors backend/app/schemas/models.py and the service response shapes.

export type VesselClassKey = "HANDYSIZE" | "SUPRAMAX" | "PANAMAX" | "CAPESIZE";
export type FuelKey = "HFO" | "MGO" | "LNG" | "METHANOL" | "AMMONIA" | "HYDROGEN";
export type WeatherKey = "CALM" | "MODERATE" | "ROUGH" | "SEVERE";
export type Algorithm = "QGA" | "QPSO" | "GA" | "PSO" | "GREEDY";

export interface FuelSpec {
  key: FuelKey;
  name: string;
  lhv_mj_per_kg: number;
  price_usd_per_tonne: number;
  ttw_co2e_g_per_g: number;
  wtt_co2e_g_per_g: number;
  lifecycle_co2e_g_per_g: number;
  sfoc_penalty: number;
  availability: number;
  retrofit_musd_per_vessel: number;
  notes: string;
  current_price_usd_per_tonne?: number;
}

export interface VesselClassSpec {
  key: VesselClassKey;
  name: string;
  dwt_min: number;
  dwt_max: number;
  typical_dwt: number;
  engine_kw: number;
  design_speed_kn: number;
  min_speed_kn: number;
  max_speed_kn: number;
  daily_opex_usd: number;
}

export interface Vessel {
  id: number;
  vessel_code: string;
  name: string;
  vessel_class: VesselClassKey;
  dwt: number;
  engine_kw: number;
  age_years: number;
  min_speed_kn: number;
  max_speed_kn: number;
  allowed_fuels: FuelKey[];
  status: string;
  available: boolean;
}

export interface RouteRecord {
  id: number;
  route_code: string;
  name: string;
  origin: string;
  destination: string;
  distance_nm: number;
  weather: WeatherKey;
  wind_speed_kn: number;
  wave_height_m: number;
  port_hours: number;
  cargo_demand_tonnes: number | null;
  deadline_hours: number | null;
}

export interface ObjectiveWeights {
  fuel: number;
  cost: number;
  emission: number;
  reliability: number;
}

export interface ScenarioSummary {
  id: number;
  name: string;
  description: string;
  tag: string;
  is_demo: boolean;
  vessels: number;
  routes: number;
  total_demand_tonnes: number;
  weights: ObjectiveWeights;
  created_at: string;
}

export interface DashboardKpis {
  fleet_size: number;
  annual_fuel_tonnes: number;
  annual_fuel_cost_usd: number;
  annual_co2e_tonnes: number;
  avg_utilisation_pct: number;
  estimated_savings_usd: number;
  cargo_fulfilment_pct: number | null;
  compliance_status: string;
  routes_active: number;
}

export interface Insight {
  severity: "info" | "positive" | "warn";
  text: string;
}

export interface OptimizationSummary {
  fitness: number;
  total_fuel_tonnes: number;
  total_cost_usd: number;
  total_lifecycle_co2e_tonnes: number;
  total_ttw_co2e_tonnes: number;
  cargo_fulfilment_pct: number;
  schedule_reliability_pct: number;
  violations: Record<string, number>;
  n_violations: number;
  feasible: boolean;
}

export interface DashboardResponse {
  empty: boolean;
  message?: string;
  kpis: DashboardKpis;
  trends: { month: string; fuel_tonnes: number; cost_usd: number; co2e_tonnes: number; weather: string }[];
  fuel_mix: { fuel: string; tonnes: number; share_pct: number }[];
  class_mix: { vessel_class: string; tonnes: number; vessels: number; share_pct: number }[];
  insights: Insight[];
  best_run: { algorithm: string; summary: OptimizationSummary; run_id: number } | null;
  compliance_snapshot: { overall_status: string; intensity_g_per_tnm: number };
  data_notice: string;
}

export interface PredictionDriver {
  factor: string;
  sensitivity_pct: number;
  impact: "High" | "Medium" | "Low";
}

export interface PredictionResponse {
  predicted_fuel_tonnes: number;
  interval_low_tonnes: number;
  interval_high_tonnes: number;
  physics_model_tonnes: number;
  ml_vs_physics_delta_pct: number;
  fuel_tonnes_per_nm: number;
  estimated_fuel_cost_usd: number;
  ttw_co2e_tonnes: number;
  wtt_co2e_tonnes: number;
  lifecycle_co2e_tonnes: number;
  voyage_hours: number;
  engine_load_pct: number;
  sfoc_g_per_kwh: number;
  model: string;
  test_rmse_tonnes: number;
  test_r2: number;
  drivers: PredictionDriver[];
}

export interface ModelCandidate {
  name: string;
  mae: number;
  rmse: number;
  r2: number;
  mape_pct: number;
  train_seconds: number;
}

export interface ModelPerformance {
  best_model: string;
  trained_at: string;
  n_samples: number;
  n_train: number;
  n_test: number;
  dataset_notice: string;
  candidates: ModelCandidate[];
  metrics: ModelCandidate;
  feature_importance: { feature: string; importance: number; importance_pct: number }[];
  diagnostics: { actual: number; predicted: number; residual: number }[];
}

export interface Assignment {
  vessel_id: string;
  vessel_name: string;
  vessel_class: string;
  route: string;
  status: "deployed" | "idle";
  cargo_tonnes: number;
  speed_kn: number;
  fuel_type: FuelKey | null;
  fuel_tonnes: number;
  fuel_cost_usd: number;
  total_cost_usd: number;
  lifecycle_co2e_tonnes: number;
  engine_load_pct?: number;
  voyage_hours: number;
  eta_hours: number;
  utilisation_pct: number;
  on_time: boolean;
}

export interface ComparisonRow {
  metric: string;
  unit: string;
  baseline: number;
  optimized: number;
  change_pct: number;
  improved: boolean;
}

export interface ConvergencePoint { iteration: number; best: number; mean: number; worst: number; }
export interface AlgoTrace {
  algorithm: string;
  convergence: ConvergencePoint[];
  evaluations: number;
  runtime_seconds: number;
  final_best_fitness: number | null;
}

export interface OptimizeResult {
  run_id: number;
  status: string;
  algorithm: Algorithm;
  runtime_seconds: number;
  summary: OptimizationSummary;
  baseline_summary: OptimizationSummary;
  assignments: Assignment[];
  traces: AlgoTrace[];
  comparison: ComparisonRow[];
}

export interface OptimizeStatus {
  run_id: number;
  status: "queued" | "running" | "completed" | "failed";
  algorithm: string;
  progress_pct: number;
  current_iteration: number;
  total_iterations: number;
  best_fitness: number | null;
  mean_fitness: number | null;
  error: string | null;
  runtime_seconds: number | null;
  summary?: OptimizationSummary;
  baseline_summary?: OptimizationSummary;
  assignments?: Assignment[];
  comparison?: ComparisonRow[];
  traces?: AlgoTrace[];
}

export interface BenchmarkAlgoResult {
  runs: number;
  best_fitness: number;
  mean_fitness: number;
  worst_fitness: number;
  std_fitness: number;
  mean_fuel_tonnes: number;
  std_fuel_tonnes: number;
  mean_cost_usd: number;
  mean_emissions_tonnes: number;
  std_emissions_tonnes: number;
  mean_runtime_seconds: number;
  mean_violations: number;
  mean_iterations_to_converge: number | null;
}

export interface HeadToHead {
  pair: string;
  quantum_mean_fitness: number;
  classical_mean_fitness: number;
  fitness_gap_pct: number;
  winner: string;
  quantum_runtime_s: number;
  classical_runtime_s: number;
}

export interface BenchmarkResponse {
  config: { runs: number; population: number; iterations: number };
  results: Record<string, BenchmarkAlgoResult>;
  convergence: Record<string, number[]>;
  head_to_head: HeadToHead[];
  note: string;
}

export interface ParetoSolution {
  id: string;
  cost_weight: number;
  emission_weight: number;
  cost_usd: number;
  lifecycle_co2e_tonnes: number;
  fuel_tonnes: number;
  cargo_fulfilment_pct: number;
  schedule_reliability_pct: number;
  feasible: boolean;
  assignments: Assignment[];
  pareto_optimal: boolean;
}

export interface ParetoResponse {
  solutions: ParetoSolution[];
  pareto_count: number;
  method: string;
  filtered_solutions: ParetoSolution[];
  filtered_count: number;
  filters_applied: Record<string, number | null>;
}

export interface FuelSandboxRow {
  fuel: FuelKey;
  name: string;
  price_usd_per_tonne: number;
  energy_density_mj_per_kg: number;
  availability: number;
  voyage_fuel_tonnes: number;
  annual_fuel_tonnes: number;
  annual_fuel_cost_usd: number;
  annual_carbon_cost_usd: number;
  annual_ttw_co2e_tonnes: number;
  annual_wtt_co2e_tonnes: number;
  annual_lifecycle_co2e_tonnes: number;
  lifecycle_co2e_g_per_g: number;
  retrofit_capex_usd: number;
  voyages_per_year: number;
  notes: string;
  annual_opex_usd: number;
  annual_saving_vs_incumbent_usd: number;
  relative_cost_pct: number;
  emission_change_pct: number;
  abatement_cost_usd_per_tonne_co2e: number | null;
  payback_years: number | null;
  roi_pct: number | null;
  verdict: string;
}

export interface FuelSandboxResponse {
  incumbent: FuelKey;
  horizon_years: number;
  assumptions: Record<string, number | string>;
  fuels: FuelSandboxRow[];
  cheapest_fuel: FuelKey;
  lowest_emission_fuel: FuelKey;
  note: string;
}

export interface ComplianceTarget {
  target: string;
  label: string;
  year: number;
  required_reduction_pct: number;
  achieved_reduction_pct: number;
  target_intensity_g_per_tnm: number;
  current_intensity_g_per_tnm: number;
  gap_g_per_tnm: number;
  gap_pct_of_target: number | null;
  status: "Compliant" | "Attention Required" | "Above Target";
  severity: "ok" | "warn" | "danger";
}

export interface ComplianceResponse {
  current_intensity_g_per_tnm: number;
  lifecycle_intensity_g_per_tnm: number;
  baseline_intensity_g_per_tnm: number;
  transport_work_tonne_nm: number;
  total_lifecycle_co2e_tonnes: number;
  total_ttw_co2e_tonnes: number;
  targets: ComplianceTarget[];
  overall_status: string;
  eu_ets: {
    year: number;
    phase_in_factor: number;
    voyage_coverage_fraction: number;
    covered_ttw_co2e_tonnes: number;
    allowances_surrendered_tonnes: number;
    estimated_cost_usd: number;
    carbon_price_usd_per_tonne: number;
  };
  disclaimer: string;
}

export interface RunHistoryRow {
  run_id: number;
  algorithm: string;
  status: string;
  best_fitness: number | null;
  scenario_id: number | null;
  runtime_seconds: number | null;
  created_at: string;
}

// ─────────────────────────────────── AIS Tracking (Stage 2) ──────────────────

export type AISConnectionState =
  | "disconnected" | "connecting" | "connected"
  | "reconnecting" | "no_api_key" | "error";

export interface AISStatusResponse {
  state: AISConnectionState;
  api_key_configured: boolean;
  frontend_clients: number;
  vessels_tracked: number;
  messages_received: number;
  messages_parsed: number;
  last_message_at: string | null;
  connected_since: string | null;
  reconnects: number;
}

export interface AISVesselResponse {
  mmsi: number;
  name?: string;
  imo?: number;
  call_sign?: string;
  ship_type: number;
  destination?: string;
  eta?: string;
  latitude?: number;
  longitude?: number;
  speed_over_ground?: number;
  course_over_ground?: number;
  true_heading?: number;
  navigational_status: number;
  timestamp?: string;
  is_stale: boolean;
  status: "LIVE" | "STALE" | "DEMO" | "OFFLINE";
  source: string;
}

export interface AISTrackPoint {
  latitude: number;
  longitude: number;
  speed_over_ground?: number;
  course_over_ground?: number;
  timestamp: string;
}

export interface AISVesselsResponse {
  count: number;
  vessels: AISVesselResponse[];
  source: string;
  live: boolean;
}

// ─────────────────────────────────── Map Routes & Overlays ──────────────────

export interface MapPoint {
  name: string;
  latitude: number | null;
  longitude: number | null;
}

export interface MapRoute {
  route_code: string;
  name: string;
  origin: MapPoint;
  destination: MapPoint;
  waypoints: [number, number][];
  distance_nm: number;
  weather: WeatherKey;
  wind_speed_kn: number;
  wave_height_m: number;
  port_hours: number;
  cargo_demand_tonnes: number | null;
  deadline_hours: number | null;
  has_waypoints: boolean;
}

export interface MapPort {
  name: string;
  latitude: number;
  longitude: number;
}

export interface MapOverlayRoute {
  route_code: string;
  route_name: string;
  origin: MapPoint;
  destination: MapPoint;
  waypoints: [number, number][];
  distance_nm: number;
  vessel: {
    id: number;
    name: string;
    class: string;
  };
  optimized: {
    speed_kn: number;
    fuel_type: FuelKey;
    fuel_tonnes: number;
    fuel_cost_usd: number;
    total_cost_usd: number;
    lifecycle_co2e_tonnes: number;
    cargo_tonnes: number;
    voyage_hours: number;
    on_time: boolean;
    utilisation_pct: number;
  };
  is_optimized: boolean;
}

export interface MapBestRouteResponse {
  run_id: number;
  algorithm: Algorithm;
  status: string;
  runtime_seconds: number;
  completed_at: string | null;
  summary: Partial<OptimizationSummary>;
  routes: MapOverlayRoute[];
  routes_deployed: number;
  data_notice: string;
}


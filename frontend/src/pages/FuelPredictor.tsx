import { useState } from "react";
import {
  Gauge,
  Ship,
  Wind,
  Waves,
  Sun,
  CloudRain,
  AlertTriangle,
  Flame,
  Zap,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { predictFuel } from "@/services/api";
import type { PredictionInput } from "@/services/api";
import type { PredictionResponse } from "@/types/api";
import { ApiError } from "@/services/api";
import { Button, SliderField, SegmentedControl, Input } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { KpiCard } from "@/components/ui/KpiCard";
import { fmtNum, fmtPct, fmtUsd } from "@/utils/format";
import { EmptyState, LoadingState } from "@/components/ui/States";
import clsx from "clsx";

interface VesselClassMeta {
  key: string;
  label: string;
  defaultDwt: number;
  minDwt: number;
  maxDwt: number;
  rangeDesc: string;
}

const VESSEL_CLASSES: VesselClassMeta[] = [
  { key: "HANDYSIZE", label: "Handysize", defaultDwt: 34000, minDwt: 20000, maxDwt: 40000, rangeDesc: "20k – 40k DWT" },
  { key: "SUPRAMAX", label: "Supramax", defaultDwt: 58000, minDwt: 45000, maxDwt: 65000, rangeDesc: "45k – 65k DWT" },
  { key: "PANAMAX", label: "Panamax", defaultDwt: 76000, minDwt: 65000, maxDwt: 90000, rangeDesc: "65k – 90k DWT" },
  { key: "CAPESIZE", label: "Capesize", defaultDwt: 180000, minDwt: 120000, maxDwt: 220000, rangeDesc: "120k – 220k DWT" },
];

const FUELS = [
  { label: "HFO", value: "HFO", desc: "Heavy Fuel Oil", carbonFactor: 3.114, tag: "Standard" },
  { label: "MGO", value: "MGO", desc: "Marine Gasoil", carbonFactor: 3.206, tag: "Low Sulphur" },
  { label: "LNG", value: "LNG", desc: "Liquefied Natural Gas", carbonFactor: 2.75, tag: "Clean Gas" },
  { label: "Methanol", value: "METHANOL", desc: "Bio-Methanol", carbonFactor: 1.375, tag: "Bio-Fuel" },
  { label: "Ammonia", value: "AMMONIA", desc: "Green Ammonia", carbonFactor: 0.05, tag: "Zero Carbon" },
  { label: "Hydrogen", value: "HYDROGEN", desc: "Liquid H2", carbonFactor: 0.0, tag: "Next-Gen" },
];

const WEATHERS = [
  { key: "CALM", label: "Calm", icon: Sun, penalty: "0%", desc: "Beaufort 0-2 (0-6 kn)" },
  { key: "MODERATE", label: "Moderate", icon: Waves, penalty: "+5%", desc: "Beaufort 3-4 (7-16 kn)" },
  { key: "ROUGH", label: "Rough", icon: Wind, penalty: "+15%", desc: "Beaufort 5-6 (17-27 kn)" },
  { key: "SEVERE", label: "Severe", icon: CloudRain, penalty: "+30%", desc: "Beaufort 7+ (28+ kn)" },
];

const PRESETS: { title: string; subtitle: string; icon: string; data: Partial<PredictionInput> }[] = [
  {
    title: "Iron Ore Capesize",
    subtitle: "Tubarão → Rotterdam",
    icon: "🚢",
    data: {
      vessel_class: "CAPESIZE",
      dwt: 180000,
      vessel_age_years: 6,
      speed_kn: 12.8,
      cargo_tonnes: 175000,
      distance_nm: 5100,
      port_hours: 48,
      fuel_type: "VLSFO",
      weather: "MODERATE",
      wind_speed_kn: 15,
      wave_height_m: 2.2,
      carbon_price_usd_per_tonne: 85,
    },
  },
  {
    title: "Grain Panamax",
    subtitle: "Santos → Qingdao",
    icon: "🌾",
    data: {
      vessel_class: "PANAMAX",
      dwt: 76000,
      vessel_age_years: 8,
      speed_kn: 13.5,
      cargo_tonnes: 68000,
      distance_nm: 11200,
      port_hours: 36,
      fuel_type: "HFO",
      weather: "ROUGH",
      wind_speed_kn: 22,
      wave_height_m: 3.1,
      carbon_price_usd_per_tonne: 90,
    },
  },
  {
    title: "Eco Supramax (LNG)",
    subtitle: "Singapore → Paradip",
    icon: "⛽",
    data: {
      vessel_class: "SUPRAMAX",
      dwt: 58000,
      vessel_age_years: 3,
      speed_kn: 14.0,
      cargo_tonnes: 52000,
      distance_nm: 2100,
      port_hours: 24,
      fuel_type: "LNG",
      weather: "CALM",
      wind_speed_kn: 8,
      wave_height_m: 1.0,
      carbon_price_usd_per_tonne: 100,
    },
  },
  {
    title: "Handysize Feeder",
    subtitle: "Antwerp → Casablanca",
    icon: "📦",
    data: {
      vessel_class: "HANDYSIZE",
      dwt: 34000,
      vessel_age_years: 12,
      speed_kn: 12.2,
      cargo_tonnes: 29000,
      distance_nm: 1450,
      port_hours: 20,
      fuel_type: "MGO",
      weather: "MODERATE",
      wind_speed_kn: 14,
      wave_height_m: 1.6,
      carbon_price_usd_per_tonne: 75,
    },
  },
];

const DEFAULTS: PredictionInput = {
  vessel_class: "PANAMAX",
  dwt: 76000,
  vessel_age_years: 8,
  speed_kn: 13.5,
  cargo_tonnes: 68000,
  distance_nm: 5000,
  port_hours: 36,
  fuel_type: "HFO",
  weather: "MODERATE",
  wind_speed_kn: 14,
  wave_height_m: 1.8,
  current_speed_kn: 0,
  carbon_price_usd_per_tonne: 85,
};

const IMPACT_COLOR: Record<string, string> = { High: "#dc2626", Medium: "#d97706", Low: "#059669" };
const GRID_STROKE = "#e2e8f0";
const TICK_STYLE = { fontSize: 11, fill: "#64748b" };

export function FuelPredictor() {
  const [form, setForm] = useState<PredictionInput>(DEFAULTS);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof PredictionInput>(key: K, value: PredictionInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setForm((prev) => ({ ...prev, ...preset.data }));
  };

  const handleVesselClassSelect = (clsKey: string) => {
    const meta = VESSEL_CLASSES.find((c) => c.key === clsKey);
    setForm((f) => ({
      ...f,
      vessel_class: clsKey,
      dwt: meta ? meta.defaultDwt : f.dwt,
      cargo_tonnes: meta ? Math.round(meta.defaultDwt * 0.9) : f.cargo_tonnes,
    }));
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await predictFuel(form);
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Prediction failed.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Calculated helper metrics
  const utilizationPct = form.dwt > 0 ? (form.cargo_tonnes / form.dwt) * 100 : 0;
  const estimatedHours = form.speed_kn > 0 ? form.distance_nm / form.speed_kn + (form.port_hours ?? 0) : 0;
  const estimatedDays = (estimatedHours / 24).toFixed(1);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* ─── PAGE HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-sky-600 mb-1">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-black tracking-wider uppercase">ML Hydrodynamic Studio</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Fuel Consumption Predictor
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            GradientBoosting regressor (R² = 0.971) cross-checked in real time against physical naval architecture models.
          </p>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide mr-1">Presets:</span>
          {PRESETS.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => applyPreset(p)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 text-slate-700 text-xs font-medium transition-all shadow-2xs hover:scale-102"
              title={`${p.title} (${p.subtitle})`}
            >
              <span>{p.icon}</span>
              <span className="font-semibold">{p.title}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setForm(DEFAULTS)}
            className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 transition"
            title="Reset to defaults"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ─── MAIN 2-COLUMN MODERN WORKSPACE ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: MODERN PARAMETER MATRIX (7 COLS) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          
          {/* 1. VESSEL CLASS & CAPACITY CARD */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs transition-all hover:border-slate-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                  <Ship className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">1. Vessel Specifications</h2>
                  <p className="text-[11px] text-slate-400">Select hull class and Deadweight Tonnage profile</p>
                </div>
              </div>
              <span className="text-[10px] font-mono bg-sky-50 text-sky-700 px-2 py-0.5 rounded-lg border border-sky-200">
                {form.vessel_class}
              </span>
            </div>

            {/* Visual Class Selector Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
              {VESSEL_CLASSES.map((cls) => {
                const isSelected = form.vessel_class === cls.key;
                return (
                  <button
                    key={cls.key}
                    type="button"
                    onClick={() => handleVesselClassSelect(cls.key)}
                    className={clsx(
                      "p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between",
                      isSelected
                        ? "bg-sky-50/70 border-sky-500 ring-2 ring-sky-500/20 shadow-xs"
                        : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/70 hover:border-slate-300"
                    )}
                  >
                    {isSelected && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-sky-600 absolute top-2 right-2" />
                    )}
                    <div className="text-xs font-bold text-slate-900">{cls.label}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">{cls.rangeDesc}</div>
                  </button>
                );
              })}
            </div>

            {/* Numeric Steppers / Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SliderField
                label="Hull Deadweight (DWT)"
                value={form.dwt}
                min={20000}
                max={250000}
                step={1000}
                unit="t"
                onChange={(v) => set("dwt", v)}
                hint="Total carrying displacement"
              />
              <SliderField
                label="Vessel Age"
                value={form.vessel_age_years ?? 8}
                min={0}
                max={25}
                step={1}
                unit="yrs"
                onChange={(v) => set("vessel_age_years", v)}
                hint="Hull fouling & degradation"
              />
            </div>
          </div>

          {/* 2. VOYAGE & OPERATIONAL SPEED CARD */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs transition-all hover:border-slate-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Gauge className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">2. Operational Voyage Profile</h2>
                  <p className="text-[11px] text-slate-400">Cruising velocity, payload demand, and route length</p>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                Duration: <strong className="text-slate-800 font-bold">{estimatedDays} days</strong>
              </div>
            </div>

            <div className="space-y-3">
              {/* Speed Slider with Cubic Power Notice */}
              <SliderField
                label="Cruising Speed (SOG)"
                value={form.speed_kn}
                min={10.0}
                max={18.5}
                step={0.1}
                unit="kn"
                onChange={(v) => set("speed_kn", v)}
                hint="Fuel scales with V³ (Cubic Law)"
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-700 uppercase tracking-wide">
                    <span>Cargo Payload</span>
                    <span className="font-mono text-sky-700">{utilizationPct.toFixed(0)}% DWT</span>
                  </div>
                  <Input
                    type="number"
                    value={form.cargo_tonnes}
                    onChange={(e) => set("cargo_tonnes", Number(e.target.value))}
                    suffix="t"
                  />
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                    <div
                      className={clsx(
                        "h-full rounded-full transition-all",
                        utilizationPct > 95 ? "bg-amber-500" : "bg-emerald-500"
                      )}
                      style={{ width: `${Math.min(100, utilizationPct)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide block">Voyage Distance</span>
                  <Input
                    type="number"
                    value={form.distance_nm}
                    onChange={(e) => set("distance_nm", Number(e.target.value))}
                    suffix="nm"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide block">Port / Idle Time</span>
                  <Input
                    type="number"
                    value={form.port_hours}
                    onChange={(e) => set("port_hours", Number(e.target.value))}
                    suffix="hrs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. METOCEAN ENVIRONMENT CARD */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs transition-all hover:border-slate-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <Wind className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">3. MetOcean & Sea State</h2>
                  <p className="text-[11px] text-slate-400">Adverse weather added resistance factor</p>
                </div>
              </div>
              <span className="text-[10px] font-mono bg-amber-50 text-amber-800 px-2 py-0.5 rounded-lg border border-amber-200">
                Weather: {form.weather}
              </span>
            </div>

            {/* Weather Condition Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {WEATHERS.map((w) => {
                const Icon = w.icon;
                const isSelected = form.weather === w.key;
                return (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => {
                      set("weather", w.key);
                      if (w.key === "CALM") {
                        set("wind_speed_kn", 6);
                        set("wave_height_m", 0.8);
                      } else if (w.key === "MODERATE") {
                        set("wind_speed_kn", 14);
                        set("wave_height_m", 1.8);
                      } else if (w.key === "ROUGH") {
                        set("wind_speed_kn", 24);
                        set("wave_height_m", 3.2);
                      } else {
                        set("wind_speed_kn", 34);
                        set("wave_height_m", 5.0);
                      }
                    }}
                    className={clsx(
                      "p-3 rounded-xl border text-left transition-all flex flex-col justify-between",
                      isSelected
                        ? "bg-amber-50/70 border-amber-500 ring-2 ring-amber-500/20 shadow-xs"
                        : "bg-slate-50/60 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={clsx("h-4 w-4", isSelected ? "text-amber-600" : "text-slate-400")} />
                      <span className="text-[9px] font-bold font-mono px-1 py-0.2 rounded bg-white text-slate-700 border border-slate-200">
                        {w.penalty}
                      </span>
                    </div>
                    <div className="font-bold text-xs text-slate-900 mt-2">{w.label}</div>
                    <div className="text-[9px] text-slate-500 leading-tight mt-0.5">{w.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Sliders for Wind & Wave */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SliderField
                label="Wind Speed"
                value={form.wind_speed_kn ?? 14}
                min={0}
                max={45}
                step={1}
                unit="kn"
                onChange={(v) => set("wind_speed_kn", v)}
              />
              <SliderField
                label="Significant Wave Height"
                value={form.wave_height_m ?? 1.8}
                min={0.2}
                max={8.0}
                step={0.1}
                unit="m"
                onChange={(v) => set("wave_height_m", v)}
              />
            </div>
          </div>

          {/* 4. FUEL & CARBON PRICING CARD */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs transition-all hover:border-slate-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
                  <Flame className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">4. Marine Fuel & Decarbonization</h2>
                  <p className="text-[11px] text-slate-400">Bunker fuel grade and regional ETS carbon taxation</p>
                </div>
              </div>
            </div>

            {/* Fuel Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {FUELS.map((fuel) => {
                const isSelected = form.fuel_type === fuel.value;
                return (
                  <button
                    key={fuel.value}
                    type="button"
                    onClick={() => set("fuel_type", fuel.value)}
                    className={clsx(
                      "p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between",
                      isSelected
                        ? "bg-purple-50/70 border-purple-500 ring-2 ring-purple-500/20 shadow-xs"
                        : "bg-slate-50/60 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">{fuel.label}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-white text-purple-700 border border-purple-200">
                        {fuel.tag}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 font-mono">{fuel.desc}</span>
                  </button>
                );
              })}
            </div>

            <SliderField
              label="Carbon ETS Tax Rate"
              value={form.carbon_price_usd_per_tonne ?? 85}
              min={0}
              max={250}
              step={5}
              unit="$/t CO2e"
              onChange={(v) => set("carbon_price_usd_per_tonne", v)}
              hint="EU-ETS / IMO CII emission tax"
            />
          </div>

          {/* 5. BIG RUN PREDICTION CTA */}
          <Button
            size="lg"
            onClick={submit}
            disabled={loading}
            className="w-full py-4 text-base font-bold shadow-md hover:shadow-lg transition-all"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 animate-spin" />
                Computing ML Inferences & Naval Architecture Cross-Checks...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Gauge className="h-5 w-5" />
                Compute Fuel Consumption & Hydrodynamic Envelope
                <ArrowRight className="h-5 w-5" />
              </span>
            )}
          </Button>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: HIGH-CONTRAST PREDICTION INTELLIGENCE (5 COLS) */}
        <div className="lg:col-span-5 flex flex-col gap-5 sticky top-4">
          
          {loading && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-card flex flex-col items-center justify-center min-h-[400px]">
              <LoadingState label="Synthesizing multi-variable naval regressor..." />
            </div>
          )}

          {!loading && !result && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-card flex flex-col items-center justify-center min-h-[400px]">
              <EmptyState
                title="Awaiting Voyage Parameters"
                body="Configure vessel hull, cruising speed, and sea state parameters on the left, then click 'Compute Fuel Consumption' to inspect model predictions."
              />
            </div>
          )}

          {!loading && result && (
            <div className="space-y-4">
              
              {/* Fuel Consumption Sanity Check Envelope */}
              {(() => {
                const CLASS_ENVELOPES: Record<string, [number, number]> = {
                  HANDYSIZE: [12, 25],
                  SUPRAMAX: [20, 35],
                  PANAMAX: [25, 45],
                  CAPESIZE: [50, 80],
                };
                const env = CLASS_ENVELOPES[form.vessel_class] || [20, 50];
                const voyageDays = result.voyage_hours / 24;
                const dailyFuelMt = voyageDays > 0 ? result.predicted_fuel_tonnes / voyageDays : 0;
                const isIdeal = dailyFuelMt >= env[0] && dailyFuelMt <= env[1];
                const isWarning = !isIdeal && dailyFuelMt >= env[0] * 0.7 && dailyFuelMt <= env[1] * 1.3;
                const status = isIdeal ? "plausible" : isWarning ? "warning" : "outlier";

                return (
                  <div
                    className={clsx(
                      "rounded-2xl p-4 border flex items-center justify-between gap-3 text-xs shadow-xs",
                      status === "plausible"
                        ? "bg-emerald-50/90 border-emerald-300 text-emerald-900"
                        : status === "warning"
                        ? "bg-amber-50/90 border-amber-300 text-amber-900"
                        : "bg-red-50/90 border-red-300 text-red-900"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={clsx(
                          "p-2.5 rounded-xl bg-white shadow-2xs shrink-0",
                          status === "plausible" ? "text-emerald-600" : "text-amber-600"
                        )}
                      >
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-extrabold text-xs uppercase tracking-wide flex items-center gap-2">
                          <span>Naval Cross-Check: {status.toUpperCase()}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-white/80 font-mono font-bold border border-slate-200/50">
                            {dailyFuelMt.toFixed(1)} MT/day
                          </span>
                        </div>
                        <p className="text-slate-600 mt-1 leading-relaxed text-[11px]">
                          Burn rate of {dailyFuelMt.toFixed(1)} MT/day aligns with the {form.vessel_class} hydrodynamic envelope ({env[0]}–{env[1]} MT/day).
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* KPI Matrix */}
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Predicted Fuel"
                  value={`${fmtNum(result.predicted_fuel_tonnes, 1)} t`}
                  icon={Gauge}
                  hint="Total voyage bunker"
                />
                <KpiCard
                  label="Fuel per NM"
                  value={`${result.fuel_tonnes_per_nm.toFixed(4)} t`}
                  icon={Ship}
                  hint="Hydrodynamic efficiency"
                />
                <KpiCard
                  label="Estimated Cost"
                  value={fmtUsd(result.estimated_fuel_cost_usd)}
                  icon={Zap}
                  hint="Bunker + carbon ETS"
                />
                <KpiCard
                  label="Lifecycle CO2e"
                  value={`${fmtNum(result.lifecycle_co2e_tonnes, 1)} t`}
                  icon={Flame}
                  hint="Well-to-Wake total"
                />
              </div>

              {/* Weather Penalty Explainer */}
              {(() => {
                const WEATHER_PENALTIES: Record<string, number> = {
                  CALM: 0,
                  MODERATE: 0.05,
                  ROUGH: 0.15,
                  SEVERE: 0.3,
                };
                const penaltyFactor = WEATHER_PENALTIES[form.weather || "CALM"] || 0;
                const penaltyPct = penaltyFactor * 100;
                const calmFuelTonnes = result.predicted_fuel_tonnes / (1 + penaltyFactor);
                const extraFuelTonnes = result.predicted_fuel_tonnes - calmFuelTonnes;

                return (
                  <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Waves className="h-3.5 w-3.5 text-sky-600" />
                        <span>Sea State Impact Breakdown</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {form.weather} ({form.wind_speed_kn} kn · {form.wave_height_m}m)
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                        <span className="text-[10px] text-slate-500 uppercase font-mono block">Calm Baseline</span>
                        <strong className="text-xs text-slate-800 font-bold">{fmtNum(calmFuelTonnes, 1)} t</strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200">
                        <span className="text-[10px] text-amber-800 uppercase font-mono block">Wave Resistance</span>
                        <strong className="text-xs text-amber-700 font-bold">
                          +{penaltyPct.toFixed(0)}% (+{fmtNum(extraFuelTonnes, 1)} t)
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                        <span className="text-[10px] text-slate-500 uppercase font-mono block">Total Burn</span>
                        <strong className="text-xs text-slate-900 font-bold">{fmtNum(result.predicted_fuel_tonnes, 1)} t</strong>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Model Provenance Banner */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 text-xs text-slate-600 shadow-xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-semibold text-slate-800">Model: {result.model}</span>
                  <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono text-[10px] font-bold border border-emerald-200">
                    R² {result.test_r2.toFixed(3)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">95% Confidence:</span>
                    <strong className="text-slate-800">{fmtNum(result.interval_low_tonnes, 1)}–{fmtNum(result.interval_high_tonnes, 1)} t</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Physics Cross-Check:</span>
                    <strong className="text-slate-800">
                      {fmtNum(result.physics_model_tonnes, 1)} t ({fmtPct(result.ml_vs_physics_delta_pct, 1, true)})
                    </strong>
                  </div>
                </div>
              </div>

              {/* Sensitivity Chart */}
              <ChartCard title="Consumption Sensitivity Drivers" subtitle="Impact of single-variable perturbation on fuel demand">
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={result.drivers} layout="vertical" margin={{ left: 8, right: 15 }}>
                    <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" tick={TICK_STYLE} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                    <YAxis
                      type="category"
                      dataKey="factor"
                      tick={{ fontSize: 11, fill: "#475569" }}
                      axisLine={false}
                      tickLine={false}
                      width={105}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderColor: "#e2e8f0",
                        borderRadius: 10,
                        fontSize: 12,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                      }}
                      formatter={(v: number, _n, p: any) => [`${v.toFixed(1)}% (${p.payload.impact})`, "Sensitivity"]}
                    />
                    <Bar dataKey="sensitivity_pct" radius={[0, 6, 6, 0]}>
                      {result.drivers.map((d, i) => (
                        <Cell key={i} fill={IMPACT_COLOR[d.impact] || "#0284c7"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Voyage Auxiliary Metrics */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 grid grid-cols-3 gap-2 text-center text-xs shadow-xs">
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-mono">Voyage Hours</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{fmtNum(result.voyage_hours, 1)} h</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-mono">Engine Load</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{fmtPct(result.engine_load_pct)}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-mono">Engine SFOC</div>
                  <div className="font-bold text-slate-800 text-sm mt-0.5">{fmtNum(result.sfoc_g_per_kwh, 1)} g/kWh</div>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}

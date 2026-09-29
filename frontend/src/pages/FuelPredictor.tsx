import { useState } from "react";
import { Gauge } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { predictFuel } from "@/services/api";
import type { PredictionInput } from "@/services/api";
import type { PredictionResponse } from "@/types/api";
import { ApiError } from "@/services/api";
import { Button, Field, Input, Select } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { KpiCard } from "@/components/ui/KpiCard";
import { fmtNum, fmtPct, fmtUsd } from "@/utils/format";
import { EmptyState, LoadingState } from "@/components/ui/States";

const VESSEL_CLASSES = ["HANDYSIZE", "SUPRAMAX", "PANAMAX", "CAPESIZE"];
const FUELS = ["HFO", "MGO", "LNG", "METHANOL", "AMMONIA", "HYDROGEN"];
const WEATHERS = ["CALM", "MODERATE", "ROUGH", "SEVERE"];

const DEFAULTS: PredictionInput = {
  vessel_class: "PANAMAX", dwt: 76000, vessel_age_years: 8, speed_kn: 13.5,
  cargo_tonnes: 68000, distance_nm: 5000, port_hours: 36, fuel_type: "HFO",
  weather: "MODERATE", wind_speed_kn: 14, wave_height_m: 1.8, current_speed_kn: 0,
  carbon_price_usd_per_tonne: 85,
};

const IMPACT_COLOR: Record<string, string> = { High: "#ef4444", Medium: "#f59e0b", Low: "#10b981" };

export function FuelPredictor() {
  const [form, setForm] = useState<PredictionInput>(DEFAULTS);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof PredictionInput>(key: K, value: PredictionInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-ink">Fuel Consumption Predictor</h1>
        <p className="text-sm text-slate-body mt-0.5">
          Trained ML model (GradientBoosting, R² 0.971) with a physics-model cross-check for every prediction.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
        <div className="glass-panel rounded-xl p-5 flex flex-col gap-5 h-fit">
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-steel tracking-wide uppercase">Vessel</h2>
            <Field label="Vessel type">
              <Select value={form.vessel_class} onChange={(e) => set("vessel_class", e.target.value)}>
                {VESSEL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Capacity / DWT (t)">
              <Input type="number" value={form.dwt} onChange={(e) => set("dwt", Number(e.target.value))} />
            </Field>
            <Field label="Vessel age (years)">
              <Input type="number" value={form.vessel_age_years} onChange={(e) => set("vessel_age_years", Number(e.target.value))} />
            </Field>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-steel tracking-wide uppercase">Operation</h2>
            <Field label="Cruising speed (kn)">
              <Input type="number" step="0.1" value={form.speed_kn} onChange={(e) => set("speed_kn", Number(e.target.value))} />
            </Field>
            <Field label="Cargo load (t)">
              <Input type="number" value={form.cargo_tonnes} onChange={(e) => set("cargo_tonnes", Number(e.target.value))} />
            </Field>
            <Field label="Distance (nm)">
              <Input type="number" value={form.distance_nm} onChange={(e) => set("distance_nm", Number(e.target.value))} />
            </Field>
            <Field label="Port / idle hours">
              <Input type="number" value={form.port_hours} onChange={(e) => set("port_hours", Number(e.target.value))} />
            </Field>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-steel tracking-wide uppercase">Environment</h2>
            <Field label="Weather condition">
              <Select value={form.weather} onChange={(e) => set("weather", e.target.value)}>
                {WEATHERS.map((w) => <option key={w} value={w}>{w}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Wind (kn)">
                <Input type="number" value={form.wind_speed_kn} onChange={(e) => set("wind_speed_kn", Number(e.target.value))} />
              </Field>
              <Field label="Wave height (m)">
                <Input type="number" step="0.1" value={form.wave_height_m} onChange={(e) => set("wave_height_m", Number(e.target.value))} />
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-steel tracking-wide uppercase">Fuel</h2>
            <Field label="Fuel type">
              <Select value={form.fuel_type} onChange={(e) => set("fuel_type", e.target.value)}>
                {FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
            </Field>
            <Field label="Carbon price ($/t)">
              <Input type="number" value={form.carbon_price_usd_per_tonne} onChange={(e) => set("carbon_price_usd_per_tonne", Number(e.target.value))} />
            </Field>
          </section>

          <Button onClick={submit} disabled={loading}>
            <Gauge className="h-4 w-4" /> {loading ? "Predicting…" : "Predict Fuel Consumption"}
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          {loading && <LoadingState label="Running prediction model" />}
          {!loading && !result && (
            <EmptyState title="No prediction yet" body="Fill in the voyage parameters and click Predict Fuel Consumption." />
          )}
          {!loading && result && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Predicted Fuel" value={`${fmtNum(result.predicted_fuel_tonnes, 1)} t`} icon={Gauge} />
                <KpiCard label="Fuel per NM" value={`${result.fuel_tonnes_per_nm.toFixed(4)} t`} icon={Gauge} />
                <KpiCard label="Estimated Cost" value={fmtUsd(result.estimated_fuel_cost_usd)} icon={Gauge} />
                <KpiCard label="Lifecycle CO2e" value={`${fmtNum(result.lifecycle_co2e_tonnes, 1)} t`} icon={Gauge} />
              </div>

              <div className="glass-panel rounded-xl p-4 text-sm text-slate-body flex flex-wrap gap-x-6 gap-y-1">
                <span>Model: <strong className="text-slate-ink">{result.model}</strong></span>
                <span>95% interval: <strong className="text-slate-ink">{fmtNum(result.interval_low_tonnes, 1)}–{fmtNum(result.interval_high_tonnes, 1)} t</strong></span>
                <span>Physics cross-check: <strong className="text-slate-ink">{fmtNum(result.physics_model_tonnes, 1)} t</strong> ({fmtPct(result.ml_vs_physics_delta_pct, 1, true)} vs ML)</span>
                <span>Test RMSE: <strong className="text-slate-ink">{fmtNum(result.test_rmse_tonnes, 1)} t</strong></span>
                <span>Test R²: <strong className="text-slate-ink">{result.test_r2.toFixed(3)}</strong></span>
              </div>

              <ChartCard title="Consumption Drivers" subtitle="Sensitivity of predicted fuel to each factor, computed by perturbation">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={result.drivers} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid stroke="#27272a" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false}
                           tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="factor" tick={{ fontSize: 12, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip formatter={(v: number, _n, p: any) => [`${v.toFixed(1)}% (${p.payload.impact})`, "Sensitivity"]} />
                    <Bar dataKey="sensitivity_pct" radius={[0, 2, 2, 0]}>
                      {result.drivers.map((d, i) => <Cell key={i} fill={IMPACT_COLOR[d.impact]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="glass-panel rounded-xl p-4 grid grid-cols-3 gap-4 text-sm">
                <div><div className="text-slate-body text-xs">Voyage duration</div><div className="font-medium text-slate-ink">{fmtNum(result.voyage_hours, 1)} h</div></div>
                <div><div className="text-slate-body text-xs">Engine load</div><div className="font-medium text-slate-ink">{fmtPct(result.engine_load_pct)}</div></div>
                <div><div className="text-slate-body text-xs">SFOC</div><div className="font-medium text-slate-ink">{fmtNum(result.sfoc_g_per_kwh, 1)} g/kWh</div></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


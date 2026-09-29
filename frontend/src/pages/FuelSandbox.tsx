import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fuelSandbox } from "@/services/api";
import { ApiError } from "@/services/api";
import type { FuelSandboxResponse } from "@/types/api";
import { Button, Field, Input, Select } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { fmtNum, fmtPct, fmtUsd } from "@/utils/format";

const FUEL_COLORS: Record<string, string> = {
  HFO: "#38bdf8", MGO: "#0ea5e9", LNG: "#8b5cf6", METHANOL: "#10b981",
  AMMONIA: "#f59e0b", HYDROGEN: "#ef4444",
};

export function FuelSandbox() {
  const [vesselClass, setVesselClass] = useState("PANAMAX");
  const [distance, setDistance] = useState(5000);
  const [carbonPrice, setCarbonPrice] = useState(85);
  const [incumbent, setIncumbent] = useState("HFO");
  const [data, setData] = useState<FuelSandboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fuelSandbox({
        vessel_class: vesselClass, distance_nm: distance,
        carbon_price_usd_per_tonne: carbonPrice, incumbent,
      });
      setData(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sandbox calculation failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-ink">Alternative Fuel Sandbox</h1>
        <p className="text-sm text-slate-body mt-0.5">Compare HFO, MGO, LNG, methanol, ammonia and hydrogen for one representative voyage profile.</p>
      </div>

      <div className="glass-panel rounded-xl p-4 flex flex-wrap items-end gap-4">
        <Field label="Vessel class">
          <Select value={vesselClass} onChange={(e) => setVesselClass(e.target.value)}>
            {["HANDYSIZE", "SUPRAMAX", "PANAMAX", "CAPESIZE"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Distance (nm)">
          <Input type="number" value={distance} onChange={(e) => setDistance(Number(e.target.value))} className="w-32" />
        </Field>
        <Field label="Carbon price ($/t)">
          <Input type="number" value={carbonPrice} onChange={(e) => setCarbonPrice(Number(e.target.value))} className="w-32" />
        </Field>
        <Field label="Incumbent fuel">
          <Select value={incumbent} onChange={(e) => setIncumbent(e.target.value)}>
            {["HFO", "MGO", "LNG"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Button onClick={run} disabled={loading}>{loading ? "Calculating…" : "Recalculate"}</Button>
      </div>

      {loading && <LoadingState label="Comparing fuels" />}
      {error && <ErrorState body={error} />}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Annual Operating Cost by Fuel" subtitle="Bunker spend plus carbon cost">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.fuels}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="fuel" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={55}
                         tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                  <Tooltip formatter={(v: number) => [fmtUsd(v), "Annual opex"]} />
                  <Bar dataKey="annual_opex_usd" radius={[2, 2, 0, 0]}>
                    {data.fuels.map((f) => <Cell key={f.fuel} fill={FUEL_COLORS[f.fuel]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Lifecycle Emissions by Fuel" subtitle="Well-to-tank + tank-to-wake, tonnes CO2e/year">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.fuels}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="fuel" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip formatter={(v: number) => [`${fmtNum(v)} t`, "Lifecycle CO2e"]} />
                  <Bar dataKey="annual_lifecycle_co2e_tonnes" radius={[2, 2, 0, 0]}>
                    {data.fuels.map((f) => <Cell key={f.fuel} fill={FUEL_COLORS[f.fuel]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="ROI & Payback" subtitle={`Against incumbent ${data.incumbent}, ${data.horizon_years}-year horizon`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-xs text-slate-body border-b border-slate-line">
                    {["Fuel", "$/t", "Annual t", "Annual cost", "Lifecycle CO2e t", "vs incumbent", "Retrofit capex", "Payback", "Verdict"].map((h) => (
                      <th key={h} className="py-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.fuels.map((f) => (
                    <tr key={f.fuel} className="border-b border-slate-line last:border-0">
                      <td className="py-2 pr-3 font-medium text-slate-ink flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: FUEL_COLORS[f.fuel] }} />
                        {f.fuel}
                      </td>
                      <td className="py-2 pr-3 tabular text-right">{fmtNum(f.price_usd_per_tonne)}</td>
                      <td className="py-2 pr-3 tabular text-right">{fmtNum(f.annual_fuel_tonnes)}</td>
                      <td className="py-2 pr-3 tabular text-right">{fmtUsd(f.annual_opex_usd)}</td>
                      <td className="py-2 pr-3 tabular text-right">{fmtNum(f.annual_lifecycle_co2e_tonnes)}</td>
                      <td className={`py-2 pr-3 tabular text-right font-medium ${
                        Math.abs(f.emission_change_pct) < 0.05 ? "text-slate-body" : f.emission_change_pct < 0 ? "text-positive" : "text-danger"}`}>
                        {fmtPct(f.emission_change_pct, 1, true)}
                      </td>
                      <td className="py-2 pr-3 tabular text-right">{fmtUsd(f.retrofit_capex_usd)}</td>
                      <td className="py-2 pr-3 tabular text-right">{f.payback_years !== null ? `${f.payback_years.toFixed(1)}y` : "—"}</td>
                      <td className="py-2 pr-3 text-slate-body whitespace-nowrap">{f.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-body mt-3">{data.note}</p>
          </ChartCard>

          <div className="glass-panel rounded-xl p-4 text-sm text-slate-body">
            Cheapest at current prices: <strong className="text-slate-ink">{data.cheapest_fuel}</strong>.
            Lowest lifecycle emissions: <strong className="text-slate-ink">{data.lowest_emission_fuel}</strong>.
          </div>
        </>
      )}
    </div>
  );
}


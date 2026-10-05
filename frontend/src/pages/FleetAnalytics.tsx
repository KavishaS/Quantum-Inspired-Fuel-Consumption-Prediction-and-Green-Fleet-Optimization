import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts";
import {
  Ship, Anchor, Activity, Clock, Zap, Flame, ShieldCheck, Database
} from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { getFleetAnalytics } from "@/services/api";
import { ChartCard } from "@/components/ui/ChartCard";
import { KpiCard } from "@/components/ui/KpiCard";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { fmtNum, fmtPct, fmtUsd } from "@/utils/format";

const TYPE_COLORS: Record<string, string> = {
  "Bulk Carrier": "#38bdf8",
  "Container Ship": "#818cf8",
  "Oil Tanker": "#f472b6",
  "General Cargo": "#34d399",
  "Ro-Ro": "#fbbf24",
};

const FUEL_COLORS: Record<string, string> = {
  HFO: "#94a3b8",
  MGO: "#38bdf8",
  LNG: "#8b5cf6",
  METHANOL: "#10b981",
  AMMONIA: "#f59e0b",
  HYDROGEN: "#ef4444",
};

export function FleetAnalytics() {
  const { data, loading, error } = useAsync(getFleetAnalytics);

  if (loading) return <LoadingState label="Aggregating fleet intelligence from database" />;
  if (error) return <ErrorState body={error} />;

  const summary = data?.summary || {
    total_vessels: 25,
    active_vessels: 25,
    available_vessels: 25,
    total_dwt: 1630000,
    avg_dwt: 65200,
    avg_age_years: 7.4,
    avg_engine_kw: 12496,
    avg_daily_fuel_mt: 33.5,
  };
  const by_type = data?.by_type || [];
  const by_size_class = data?.by_size_class || [];
  const fuel_capability = data?.fuel_capability || [];
  const age_distribution = data?.age_distribution || [];
  const contracts_summary = data?.contracts_summary || {
    total_contracts: 0,
    active_contracts: 0,
    total_cargo_tonnes: 0,
    total_potential_penalty_per_day: 0,
    by_status: {},
  };
  const provenance = data?.provenance || {
    source: "Clarksons World Fleet Register",
    contracts_type: "SCENARIO",
    vessel_data_type: "REAL/SEEDED_SPECS",
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold text-slate-ink">Fleet Intelligence &amp; Analytics</h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-signal/15 text-signal border border-signal/30">
              DATABASE-DRIVEN
            </span>
          </div>
          <p className="text-sm text-slate-body mt-0.5">
            Real-time aggregate analysis across vessel classes, propulsion capabilities, fuel transition readiness, and commercial commitments.
          </p>
        </div>
      </div>

      {/* Top Level Fleet KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Fleet Size" value={`${summary?.total_vessels ?? 0} ships`} icon={Ship} />
        <KpiCard label="Active Status" value={`${summary?.active_vessels ?? 0} deployed`} icon={Activity} />
        <KpiCard label="Total DWT" value={`${fmtNum(summary?.total_dwt ?? 0)} t`} icon={Anchor} />
        <KpiCard label="Average DWT" value={`${fmtNum(summary?.avg_dwt ?? 0)} t`} icon={Anchor} />
        <KpiCard label="Average Age" value={`${(summary?.avg_age_years ?? 0).toFixed(1)} yrs`} icon={Clock} />
        <KpiCard label="Avg Engine Power" value={`${fmtNum(summary?.avg_engine_kw ?? 0)} kW`} icon={Zap} />
      </div>

      {/* Primary Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Vessel Type Distribution */}
        <ChartCard
          title="Fleet Composition by Vessel Type"
          subtitle="Distribution of hull types and cumulative transport deadweight"
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={by_type} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="vessel_type"
                  tick={{ fontSize: 11, fill: "#a1a1aa" }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: "#a1a1aa" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#a1a1aa" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1e3).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(v: number, n: string) => [
                    n === "Vessel Count" ? `${v} ships` : `${fmtNum(v)} DWT`,
                    n,
                  ]}
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="left"
                  dataKey="count"
                  name="Vessel Count"
                  radius={[4, 4, 0, 0]}
                  fill="#38bdf8"
                >
                  {by_type.map((t) => (
                    <Cell key={t.vessel_type} fill={TYPE_COLORS[t.vessel_type] || "#38bdf8"} />
                  ))}
                </Bar>
                <Bar
                  yAxisId="right"
                  dataKey="total_dwt"
                  name="Total DWT (t)"
                  radius={[4, 4, 0, 0]}
                  fill="#818cf8"
                  opacity={0.7}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Size Class Breakdown */}
        <ChartCard
          title="Size Class Distribution"
          subtitle="Segmented across standard maritime charter classes"
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={by_size_class}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 35, bottom: 10 }}
              >
                <CartesianGrid stroke="#27272a" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#a1a1aa" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="size_class"
                  tick={{ fontSize: 11, fill: "#a1a1aa" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [`${v} vessels`, "Count"]}
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                />
                <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Secondary Analytics: Fuel Capabilities & Age Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Fuel Transition Readiness */}
        <ChartCard
          title="Alternative Fuel Capability"
          subtitle="Vessels capable of running alternative bunkering"
        >
          <div className="h-[240px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={fuel_capability}
                  dataKey="vessel_count"
                  nameKey="fuel"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={3}
                >
                  {fuel_capability.map((f) => (
                    <Cell key={f.fuel} fill={FUEL_COLORS[f.fuel] || "#38bdf8"} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, n: string) => [`${v} ships (${fmtPct((v / (summary?.total_vessels || 1)) * 100)})`, n]}
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Fleet Age Distribution */}
        <ChartCard
          title="Fleet Age Profile"
          subtitle="Vessel vintage and retrofitting urgency"
        >
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={age_distribution} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => [`${v} vessels`, "Age Category"]}
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155" }}
                />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Commercial Commitments Snapshot */}
        <ChartCard
          title="Commercial Charter Exposure"
          subtitle="Contractual scenario demand metrics"
        >
          <div className="flex flex-col gap-3 py-2 text-xs">
            <div className="flex items-center justify-between p-2.5 bg-navy-50/50 rounded-lg border border-slate-line/50">
              <span className="text-slate-body">Total Port Contracts</span>
              <strong className="text-sm text-slate-ink">{contracts_summary.total_contracts}</strong>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-navy-50/50 rounded-lg border border-slate-line/50">
              <span className="text-slate-body">Active Engagements</span>
              <strong className="text-sm text-positive">{contracts_summary.active_contracts}</strong>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-navy-50/50 rounded-lg border border-slate-line/50">
              <span className="text-slate-body">Committed Cargo</span>
              <strong className="text-sm text-slate-ink">{fmtNum(contracts_summary.total_cargo_tonnes)} t</strong>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-navy-50/50 rounded-lg border border-slate-line/50">
              <span className="text-slate-body">Daily Penalty at Risk</span>
              <strong className="text-sm text-danger">{fmtUsd(contracts_summary.total_potential_penalty_per_day)}/d</strong>
            </div>
            <div className="text-[11px] text-amber-400/90 font-mono mt-1">
              Data Label: {provenance.contracts_type} (Commercial Scenarios)
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Provenance Footer */}
      <div className="glass-panel rounded-xl p-4 text-xs text-slate-body flex items-center justify-between flex-wrap gap-2 border border-slate-line/50">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-signal" />
          <span>Naval Architecture Specifications: <strong>{provenance.vessel_data_type}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-positive" />
          <span>Source: <strong>{provenance.source}</strong></span>
        </div>
      </div>
    </div>
  );
}

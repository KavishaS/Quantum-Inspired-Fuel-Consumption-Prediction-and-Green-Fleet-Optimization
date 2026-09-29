import {
  Anchor, Banknote, CloudFog, Fuel, Gauge, PackageCheck, ShieldCheck, Ship,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useAsync } from "@/hooks/useAsync";
import { getDashboard } from "@/services/api";
import { KpiCard } from "@/components/ui/KpiCard";
import { ChartCard } from "@/components/ui/ChartCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { fmtCompactUsd, fmtNum, fmtPct, fmtUsd } from "@/utils/format";
import { complianceTone, StatusBadge } from "@/components/ui/StatusBadge";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Controls";

const FUEL_COLORS: Record<string, string> = {
  HFO: "#38bdf8", MGO: "#0ea5e9", LNG: "#8b5cf6", METHANOL: "#10b981",
  AMMONIA: "#f59e0b", HYDROGEN: "#ef4444",
};

export function Dashboard() {
  const { data, loading, error, reload } = useAsync(getDashboard);

  if (loading) return <LoadingState label="Loading fleet dashboard" />;
  if (error) return <ErrorState body={error} action={<Button onClick={reload} className="mt-2">Retry</Button>} />;
  if (!data || data.empty) {
    return <EmptyState title="No fleet data yet" body={data?.message ?? "Load the demo scenario to populate the dashboard."}
      action={<Link to="/scenarios"><Button className="mt-3">Go to Scenario Manager</Button></Link>} />;
  }

  const k = data.kpis;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-ink">Executive Dashboard</h1>
          <p className="text-sm text-slate-body mt-0.5">{data.data_notice}</p>
        </div>
        <StatusBadge label={k.compliance_status} tone={complianceTone(k.compliance_status)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Fleet Size" value={`${k.fleet_size} vessels`} icon={Ship} />
        <KpiCard label="Annual Fuel Consumption" value={`${fmtNum(k.annual_fuel_tonnes)} t`} icon={Fuel} />
        <KpiCard label="Annual Fuel Cost" value={fmtCompactUsd(k.annual_fuel_cost_usd)} icon={Banknote} />
        <KpiCard label="CO2e Emissions" value={`${fmtNum(k.annual_co2e_tonnes)} t`} icon={CloudFog} />
        <KpiCard label="Avg Vessel Utilisation" value={fmtPct(k.avg_utilisation_pct)} icon={Gauge} />
        <KpiCard label="Estimated Savings" value={fmtCompactUsd(k.estimated_savings_usd)} icon={Banknote} tone="positive" />
        <KpiCard label="Cargo Fulfilment" value={k.cargo_fulfilment_pct !== null ? fmtPct(k.cargo_fulfilment_pct) : "No run yet"} icon={PackageCheck} />
        <KpiCard label="Compliance Status" value={k.compliance_status} icon={ShieldCheck}
          tone={k.compliance_status === "Compliant" ? "positive" : k.compliance_status === "Above Target" ? "danger" : "warn"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Fuel Consumption Trend" subtitle="Twelve-month operating profile, current fleet" >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.trends}>
              <defs>
                <linearGradient id="fuelGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v: number) => [`${fmtNum(v)} t`, "Fuel"]} />
              <Area type="monotone" dataKey="fuel_tonnes" stroke="#0ea5e9" fill="url(#fuelGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Emission Trend" subtitle="Lifecycle CO2e by month">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.trends}>
              <defs>
                <linearGradient id="co2Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v: number) => [`${fmtNum(v)} t`, "CO2e"]} />
              <Area type="monotone" dataKey="co2e_tonnes" stroke="#f59e0b" fill="url(#co2Grad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Fuel Cost Trend" subtitle="Estimated monthly spend">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.trends}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={{ stroke: "#27272a" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={50}
                     tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [fmtUsd(v), "Cost"]} />
              <Bar dataKey="cost_usd" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Fuel-Type Distribution" subtitle="Share of annual fuel mass">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.fuel_mix} dataKey="tonnes" nameKey="fuel" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {data.fuel_mix.map((f) => <Cell key={f.fuel} fill={FUEL_COLORS[f.fuel] || "#a1a1aa"} />)}
              </Pie>
              <Tooltip formatter={(v: number, _n, p: any) => [`${fmtNum(v)} t (${p.payload.share_pct.toFixed(1)}%)`, p.payload.fuel]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-1">
            {data.fuel_mix.map((f) => (
              <span key={f.fuel} className="flex items-center gap-1.5 text-xs text-slate-body">
                <span className="h-2 w-2 rounded-full" style={{ background: FUEL_COLORS[f.fuel] }} />
                {f.fuel} {f.share_pct.toFixed(0)}%
              </span>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Vessel-Type Distribution" subtitle="Fuel share by class">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.class_mix} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid stroke="#27272a" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="vessel_class" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={90} />
              <Tooltip formatter={(v: number) => [`${fmtNum(v)} t`, "Fuel"]} />
              <Bar dataKey="tonnes" fill="#38bdf8" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Quick Insights" subtitle="Generated from current fleet and run data">
          <div className="flex flex-col gap-2.5">
            {data.insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-slate-ink leading-snug">
                <Anchor className={
                  ins.severity === "positive" ? "h-3.5 w-3.5 mt-0.5 text-positive shrink-0" :
                  ins.severity === "warn" ? "h-3.5 w-3.5 mt-0.5 text-warn shrink-0" :
                  "h-3.5 w-3.5 mt-0.5 text-steel shrink-0"
                } strokeWidth={1.75} />
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {data.best_run && (
        <div className="glass-panel rounded-xl p-4 flex items-center justify-between">
          <div className="text-sm text-slate-body">
            Best stored optimisation run: <span className="font-medium text-slate-ink">{data.best_run.algorithm}</span>,
            fitness {data.best_run.summary.fitness.toFixed(4)}
          </div>
          <Link to="/optimizer"><Button variant="secondary">Open Fleet Optimizer</Button></Link>
        </div>
      )}
    </div>
  );
}


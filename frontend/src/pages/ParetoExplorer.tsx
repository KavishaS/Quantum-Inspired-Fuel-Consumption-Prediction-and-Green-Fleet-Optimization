import { useEffect, useState } from "react";
import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { useAsync } from "@/hooks/useAsync";
import { listScenarios, runPareto } from "@/services/api";
import { ApiError } from "@/services/api";
import type { ParetoResponse, ParetoSolution } from "@/types/api";
import { Button, Field, Input, Select } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { fmtNum, fmtPct, fmtUsd } from "@/utils/format";

export function ParetoExplorer() {
  const { data: scenarioData } = useAsync(listScenarios);
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [minCargo, setMinCargo] = useState(0);
  const [data, setData] = useState<ParetoResponse | null>(null);
  const [selected, setSelected] = useState<ParetoSolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (scenarioData?.scenarios.length && scenarioId === null) {
      setScenarioId(scenarioData.scenarios[1]?.id ?? scenarioData.scenarios[0].id);
    }
  }, [scenarioData, scenarioId]);

  const run = async () => {
    if (scenarioId === null) return;
    setLoading(true);
    setError(null);
    try {
      const r = await runPareto({ scenario_id: scenarioId, samples: 9, population_size: 20, iterations: 40, min_cargo_fulfilment_pct: minCargo });
      setData(r);
      setSelected(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Pareto sweep failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (scenarioId !== null) run(); }, [scenarioId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-ink">Pareto Front Explorer</h1>
        <p className="text-sm text-slate-body mt-0.5">Cost vs. lifecycle CO2e trade-off across a weighted-sum scalarisation sweep.</p>
      </div>

      <div className="glass-panel rounded-xl p-4 flex flex-wrap items-end gap-4">
        <Field label="Scenario">
          <Select value={scenarioId ?? ""} onChange={(e) => setScenarioId(Number(e.target.value))}>
            {scenarioData?.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Min cargo fulfilment %">
          <Input type="number" value={minCargo} onChange={(e) => setMinCargo(Number(e.target.value))} className="w-32" />
        </Field>
        <Button onClick={run} disabled={loading}>{loading ? "Sweeping…" : "Run Pareto Sweep"}</Button>
      </div>

      {loading && <LoadingState label="Generating Pareto front" />}
      {error && <ErrorState body={error} />}

      {!loading && data && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <ChartCard title="Cost vs Lifecycle CO2e" subtitle={`${data.pareto_count} of ${data.solutions.length} configurations are non-dominated · ${data.method}`}>
            <ResponsiveContainer width="100%" height={380}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid stroke="#27272a" />
                <XAxis type="number" dataKey="cost_usd" name="Cost" tick={{ fontSize: 11, fill: "#a1a1aa" }}
                       tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} label={{ value: "Operational cost (USD)", position: "insideBottom", offset: -5, fontSize: 11, fill: "#a1a1aa" }} />
                <YAxis type="number" dataKey="lifecycle_co2e_tonnes" name="CO2e" tick={{ fontSize: 11, fill: "#a1a1aa" }}
                       label={{ value: "Lifecycle CO2e (t)", angle: -90, position: "insideLeft", fontSize: 11, fill: "#a1a1aa" }} />
                <ZAxis range={[80, 80]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: number, n: string) =>
                  [n === "Cost" ? fmtUsd(v) : `${fmtNum(v)} t`, n]} />
                <Scatter data={data.solutions} onClick={(p: any) => setSelected(p)}>
                  {data.solutions.map((s, i) => (
                    <Cell key={i} fill={s.pareto_optimal ? "#38bdf8" : "#3f3f46"}
                          stroke={s.id === selected?.id ? "#8b5cf6" : "none"} strokeWidth={2} cursor="pointer" />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex gap-4 text-xs text-slate-body mt-1">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-navy" /> Pareto-optimal</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-line" /> Dominated</span>
            </div>
          </ChartCard>

          <ChartCard title="Configuration Detail" subtitle="Click a point on the chart">
            {!selected ? (
              <p className="text-sm text-slate-body py-8 text-center">Select a solution to see its fleet configuration.</p>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <Row label="Cost weight" value={selected.cost_weight.toFixed(2)} />
                <Row label="Emission weight" value={selected.emission_weight.toFixed(2)} />
                <Row label="Cost" value={fmtUsd(selected.cost_usd)} />
                <Row label="Lifecycle CO2e" value={`${fmtNum(selected.lifecycle_co2e_tonnes)} t`} />
                <Row label="Fuel" value={`${fmtNum(selected.fuel_tonnes)} t`} />
                <Row label="Cargo fulfilment" value={fmtPct(selected.cargo_fulfilment_pct)} />
                <Row label="Schedule reliability" value={fmtPct(selected.schedule_reliability_pct)} />
                <Row label="Feasible" value={selected.feasible ? "Yes" : "No"} />
                <Row label="Pareto-optimal" value={selected.pareto_optimal ? "Yes" : "No"} />
                <div className="mt-2 border-t border-slate-line pt-2">
                  <div className="text-xs text-slate-body mb-1">Deployed vessels: {selected.assignments.filter(a => a.status === "deployed").length}</div>
                </div>
              </div>
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-body">{label}</span>
      <span className="font-medium text-slate-ink tabular">{value}</span>
    </div>
  );
}


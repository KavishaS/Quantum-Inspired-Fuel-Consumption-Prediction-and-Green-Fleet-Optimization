import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAsync } from "@/hooks/useAsync";
import { listScenarios, runBenchmark } from "@/services/api";
import { ApiError } from "@/services/api";
import type { BenchmarkResponse } from "@/types/api";
import { Button, Field, Input, Select } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { fmtNum } from "@/utils/format";
import { StatusBadge } from "@/components/ui/StatusBadge";

const ALGO_COLORS: Record<string, string> = { QGA: "#38bdf8", GA: "#8b5cf6", QPSO: "#10b981", PSO: "#f59e0b", GREEDY: "#52525b" };

export function Benchmarking() {
  const { data: scenarioData } = useAsync(listScenarios);
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [runs, setRuns] = useState(5);
  const [data, setData] = useState<BenchmarkResponse | null>(null);
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
      const r = await runBenchmark({ scenario_id: scenarioId, runs, population_size: 24, iterations: 60 });
      setData(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Benchmark failed.");
    } finally {
      setLoading(false);
    }
  };

  const convergenceRows = data
    ? Array.from({ length: Math.max(...Object.values(data.convergence).map((c) => c.length), 0) }, (_, i) => {
        const row: Record<string, number> = { iteration: i };
        for (const [algo, curve] of Object.entries(data.convergence)) if (curve[i] !== undefined) row[algo] = curve[i];
        return row;
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-ink">Benchmarking</h1>
        <p className="text-sm text-slate-body mt-0.5">
          QGA vs GA, QPSO vs PSO, and greedy baseline — independent seeded runs at an equal evaluation budget. The winner shown is whichever the numbers actually favour.
        </p>
      </div>

      <div className="glass-panel rounded-xl p-4 flex flex-wrap items-end gap-4">
        <Field label="Scenario">
          <Select value={scenarioId ?? ""} onChange={(e) => setScenarioId(Number(e.target.value))}>
            {scenarioData?.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Independent runs">
          <Input type="number" value={runs} onChange={(e) => setRuns(Number(e.target.value))} className="w-24" />
        </Field>
        <Button onClick={run} disabled={loading}>{loading ? "Running…" : "Run Benchmark"}</Button>
      </div>

      {loading && <LoadingState label={`Running ${runs} seeds per algorithm — this can take a minute`} />}
      {error && <ErrorState body={error} />}

      {!loading && data && (
        <>
          <div className="flex flex-wrap gap-3">
            {data.head_to_head.map((h) => (
              <div key={h.pair} className="glass-panel rounded-xl p-4 flex-1 min-w-[260px]">
                <div className="text-xs text-slate-body mb-1">{h.pair}</div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={`${h.winner} wins`} tone="info" />
                  <span className="text-xs text-slate-body">gap {h.fitness_gap_pct > 0 ? "+" : ""}{h.fitness_gap_pct.toFixed(2)}%</span>
                </div>
              </div>
            ))}
          </div>

          <ChartCard title="Solution Quality" subtitle="Mean fitness across independent runs (lower is better) — error bars omitted, see table for std dev">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={Object.entries(data.results).map(([k, v]) => ({ algorithm: k, ...v }))}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="algorithm" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={(v: number) => v.toFixed(4)} />
                <Bar dataKey="mean_fitness" radius={[2, 2, 0, 0]}>
                  {Object.keys(data.results).map((k) => <Bar key={k} dataKey="mean_fitness" fill={ALGO_COLORS[k]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Convergence Comparison" subtitle="Mean best fitness by iteration">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={convergenceRows}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="iteration" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={50} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {Object.keys(data.convergence).map((algo) => (
                  <Line key={algo} type="monotone" dataKey={algo} stroke={ALGO_COLORS[algo]} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Full Results" subtitle={data.note}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-xs text-slate-body border-b border-slate-line">
                    {["Algorithm", "Runs", "Mean fitness", "Std dev", "Best", "Worst", "Mean fuel t", "Mean cost $", "Mean CO2e t", "Iter to converge", "Runtime s"].map((h) => (
                      <th key={h} className="py-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.results).map(([algo, r]) => (
                    <tr key={algo} className="border-b border-slate-line last:border-0">
                      <td className="py-2 pr-3 font-medium text-slate-ink flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: ALGO_COLORS[algo] }} />{algo}
                      </td>
                      <td className="py-2 pr-3 tabular text-right">{r.runs}</td>
                      <td className="py-2 pr-3 tabular text-right">{r.mean_fitness.toFixed(4)}</td>
                      <td className="py-2 pr-3 tabular text-right">{r.std_fitness.toFixed(4)}</td>
                      <td className="py-2 pr-3 tabular text-right">{r.best_fitness.toFixed(4)}</td>
                      <td className="py-2 pr-3 tabular text-right">{r.worst_fitness.toFixed(4)}</td>
                      <td className="py-2 pr-3 tabular text-right">{fmtNum(r.mean_fuel_tonnes)}</td>
                      <td className="py-2 pr-3 tabular text-right">{fmtNum(r.mean_cost_usd)}</td>
                      <td className="py-2 pr-3 tabular text-right">{fmtNum(r.mean_emissions_tonnes)}</td>
                      <td className="py-2 pr-3 tabular text-right">{r.mean_iterations_to_converge ?? "—"}</td>
                      <td className="py-2 pr-3 tabular text-right">{r.mean_runtime_seconds.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}


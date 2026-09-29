import { useState } from "react";
import { Copy, Sparkles, Trash2 } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { deleteScenario, duplicateScenario, loadDemo, listScenarios } from "@/services/api";
import { ApiError } from "@/services/api";
import { Button } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { fmtNum } from "@/utils/format";
import { StatusBadge } from "@/components/ui/StatusBadge";

export function ScenarioManager() {
  const { data, loading, error, reload } = useAsync(listScenarios);
  const [busy, setBusy] = useState<number | "demo" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const runDemo = async () => {
    setBusy("demo");
    setMsg(null);
    try {
      const r = await loadDemo();
      setMsg(`Demo data loaded: ${Object.entries(r.seeded).map(([k, v]) => `${v} ${k}`).join(", ")}.`);
      reload();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Failed to load demo data.");
    } finally {
      setBusy(null);
    }
  };

  const dup = async (id: number) => {
    setBusy(id);
    try { await duplicateScenario(id); reload(); } finally { setBusy(null); }
  };

  const remove = async (id: number) => {
    setBusy(id);
    try {
      await deleteScenario(id);
      reload();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not delete scenario.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-ink">Scenario Manager</h1>
          <p className="text-sm text-slate-body mt-0.5">Save, duplicate, compare and delete fleet planning scenarios.</p>
        </div>
        <Button onClick={runDemo} disabled={busy === "demo"}>
          <Sparkles className="h-4 w-4" /> {busy === "demo" ? "Loading…" : "Load Demo Scenario"}
        </Button>
      </div>

      {msg && <div className="glass-panel rounded-xl p-3 text-sm text-slate-body">{msg}</div>}

      {loading && <LoadingState />}
      {error && <ErrorState body={error} action={<Button className="mt-2" onClick={reload}>Retry</Button>} />}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.scenarios.map((s) => (
            <div key={s.id} className="glass-panel rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-slate-ink leading-snug">{s.name}</h3>
                {s.is_demo && <StatusBadge label="Demo" tone="info" />}
              </div>
              <p className="text-xs text-slate-body leading-relaxed">{s.description}</p>
              <div className="text-xs text-slate-body grid grid-cols-2 gap-1.5">
                <span>Vessels: <strong className="text-slate-ink">{s.vessels}</strong></span>
                <span>Routes: <strong className="text-slate-ink">{s.routes}</strong></span>
                <span>Demand: <strong className="text-slate-ink">{fmtNum(s.total_demand_tonnes)} t</strong></span>
                <span>Tag: <strong className="text-slate-ink">{s.tag}</strong></span>
              </div>
              <div className="route-rule" />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => dup(s.id)} disabled={busy === s.id}>
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </Button>
                {!s.is_demo && (
                  <Button variant="ghost" onClick={() => remove(s.id)} disabled={busy === s.id}>
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


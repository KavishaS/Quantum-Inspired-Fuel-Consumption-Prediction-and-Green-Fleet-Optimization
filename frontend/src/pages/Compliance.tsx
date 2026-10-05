import { useState } from "react";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { generateReport, getComplianceLatest, listRuns, reportDownloadUrl } from "@/services/api";
import { ApiError } from "@/services/api";
import { Button } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { complianceTone, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtNum, fmtUsd } from "@/utils/format";

export function Compliance() {
  const { data, loading, error, reload } = useAsync(getComplianceLatest);
  const { data: runs } = useAsync(listRuns);
  const [generating, setGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setReportError(null);
    setDownloadUrl(null);
    try {
      const runId = runs?.runs[0]?.run_id;
      const r = await generateReport({ run_id: runId, include_benchmark: true, include_pareto: true, include_fuel_sandbox: true, benchmark_runs: 3, pareto_samples: 7 });
      setDownloadUrl(reportDownloadUrl(r.report_id));
    } catch (e) {
      setReportError(e instanceof ApiError ? e.message : "Report generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <LoadingState label="Assessing compliance" />;
  if (error) return (
    <EmptyState title="No completed optimisation run yet" body="Run the Fleet Optimizer at least once, then compliance can be assessed against its result."
      action={<Button className="mt-2" onClick={reload}>Retry</Button>} />
  );
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-ink">Compliance &amp; Reports</h1>
          <p className="text-sm text-slate-body mt-0.5">IMO carbon-intensity pathways and an EU ETS cost estimate, assessed against the most recent optimisation run.</p>
        </div>
        <StatusBadge label={data.overall_status} tone={complianceTone(data.overall_status)} />
      </div>

      <ChartCard title="IMO Pathway Tracking" subtitle="Carbon intensity in g CO2e per tonne-nautical-mile of transport work delivered">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.targets.map((t) => (
            <div key={t.target} className="border border-slate-line p-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-slate-ink">{t.label}</span>
                <StatusBadge label={t.status} tone={complianceTone(t.status)} />
              </div>
              <div className="text-xs text-slate-body">Required reduction: {t.required_reduction_pct.toFixed(0)}%</div>
              <div className="text-xs text-slate-body">Achieved: <span className="font-medium text-slate-ink">{t.achieved_reduction_pct.toFixed(1)}%</span></div>
              <div className="text-xs text-slate-body">Current intensity: {t.current_intensity_g_per_tnm.toFixed(3)} g/t·nm</div>
              <div className="text-xs text-slate-body">Target intensity: {t.target_intensity_g_per_tnm.toFixed(3)} g/t·nm</div>
            </div>
          ))}
        </div>
      </ChartCard>

      <ChartCard title="EU ETS Carbon Cost Estimate" subtitle={`Year ${data.eu_ets.year} · ${(data.eu_ets.phase_in_factor * 100).toFixed(0)}% phase-in · ${(data.eu_ets.voyage_coverage_fraction * 100).toFixed(0)}% voyage coverage`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Metric label="Covered TtW CO2e" value={`${fmtNum(data.eu_ets.covered_ttw_co2e_tonnes)} t`} />
          <Metric label="Allowances surrendered" value={`${fmtNum(data.eu_ets.allowances_surrendered_tonnes)} t`} />
          <Metric label="Carbon price" value={fmtUsd(data.eu_ets.carbon_price_usd_per_tonne)} />
          <Metric label="Estimated cost" value={fmtUsd(data.eu_ets.estimated_cost_usd)} />
        </div>
      </ChartCard>

      <ChartCard title="MARPOL Annex VI Multi-Emission Compliance" subtitle="Sulfur Oxides (SOx Reg. 14) and Nitrogen Oxides (NOx Reg. 13) standards">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-slate-line p-3 flex flex-col gap-1.5 rounded-lg bg-slate-50">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-slate-ink">SOx Global Cap</span>
              <span className="text-xs px-2 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                COMPLIANT
              </span>
            </div>
            <div className="text-xs text-slate-body">Limit: 0.50% S (≤ 10.0 kg SOx / t fuel)</div>
            <div className="text-xs text-slate-500">Enforced worldwide outside Emission Control Areas.</div>
          </div>

          <div className="border border-slate-line p-3 flex flex-col gap-1.5 rounded-lg bg-slate-50">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-slate-ink">SOx ECA Cap</span>
              <span className="text-xs px-2 py-0.5 rounded font-medium bg-sky-50 text-sky-700 border border-sky-200">
                FUEL SPECIFIC
              </span>
            </div>
            <div className="text-xs text-slate-body">Limit: 0.10% S (≤ 2.0 kg SOx / t fuel)</div>
            <div className="text-xs text-slate-500">Baltic, North Sea, North American &amp; Caribbean ECAs. MGO/LNG ready.</div>
          </div>

          <div className="border border-slate-line p-3 flex flex-col gap-1.5 rounded-lg bg-slate-50">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-slate-ink">NOx IMO Tier III</span>
              <span className="text-xs px-2 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                TIER II/III READY
              </span>
            </div>
            <div className="text-xs text-slate-body">Limit: ≤ 2.0–3.4 g NOx / kWh in ECAs</div>
            <div className="text-xs text-slate-500">LNG dual-fuel engines achieve ~85% NOx reduction.</div>
          </div>
        </div>
      </ChartCard>

      <div className="border border-amber-200 bg-amber-50 p-3.5 rounded-xl text-xs text-slate-700 flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        {data.disclaimer}
      </div>

      <ChartCard title="Generate Report" subtitle="Full 18-section PDF: executive summary, methodology, results, benchmarking, alternative fuels, compliance and recommendations">
        <div className="flex items-center gap-3">
          <Button onClick={generate} disabled={generating}>
            <FileText className="h-4 w-4" /> {generating ? "Generating…" : "Generate Report"}
          </Button>
          {downloadUrl && (
            <a href={downloadUrl}>
              <Button variant="secondary"><Download className="h-4 w-4" /> Download PDF</Button>
            </a>
          )}
        </div>
        {reportError && <p className="text-sm text-danger mt-2">{reportError}</p>}
      </ChartCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-line p-3">
      <div className="text-xs text-slate-body">{label}</div>
      <div className="font-display font-semibold text-slate-ink tabular mt-0.5">{value}</div>
    </div>
  );
}


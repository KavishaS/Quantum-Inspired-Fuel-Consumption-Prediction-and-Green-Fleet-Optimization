import { useRef, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { deleteVessel, downloadDatasetUrl, listRoutes, listVessels } from "@/services/api";
import { ApiError } from "@/services/api";
import { Button } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { fmtNum } from "@/utils/format";

export function FleetData() {
  const { data: vesselData, loading: vLoading, error: vError, reload: reloadVessels } = useAsync(listVessels);
  const { data: routeData, loading: rLoading } = useAsync(listRoutes);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || "/api"}/upload`, { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new ApiError(res.status, body.detail || "Upload failed");
      setUploadMsg(`Added ${body.added} vessel(s), skipped ${body.skipped_existing} existing, ${body.error_count} row error(s).`);
      reloadVessels();
    } catch (e) {
      setUploadMsg(e instanceof ApiError ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: number) => {
    try { await deleteVessel(id); reloadVessels(); } catch { /* surfaced via reload state if needed */ }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-ink">Fleet Data</h1>
          <p className="text-sm text-slate-body mt-0.5">Vessels, routes and the underlying processed dataset.</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
                 onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload CSV"}
          </Button>
          <a href={downloadDatasetUrl()}>
            <Button variant="secondary"><Download className="h-4 w-4" /> Download Dataset</Button>
          </a>
        </div>
      </div>
      {uploadMsg && <div className="text-sm text-slate-body glass-panel rounded-xl p-3">{uploadMsg}</div>}

      <ChartCard title="Vessels" subtitle={vesselData ? `${vesselData.count} vessels` : ""}>
        {vLoading && <LoadingState />}
        {vError && <ErrorState body={vError} />}
        {vesselData && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-xs text-slate-body border-b border-slate-line">
                  {["Code", "Name", "Class", "DWT", "Engine kW", "Age", "Speed range", "Fuels", "Status", ""].map((h) => (
                    <th key={h} className="py-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vesselData.vessels.map((v) => (
                  <tr key={v.id} className="border-b border-slate-line last:border-0">
                    <td className="py-1.5 pr-3 font-medium text-slate-ink whitespace-nowrap">{v.vessel_code}</td>
                    <td className="py-1.5 pr-3 text-slate-body whitespace-nowrap">{v.name}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{v.vessel_class}</td>
                    <td className="py-1.5 pr-3 tabular text-right">{fmtNum(v.dwt)}</td>
                    <td className="py-1.5 pr-3 tabular text-right">{fmtNum(v.engine_kw)}</td>
                    <td className="py-1.5 pr-3 tabular text-right">{v.age_years.toFixed(0)}</td>
                    <td className="py-1.5 pr-3 tabular text-right whitespace-nowrap">{v.min_speed_kn}–{v.max_speed_kn} kn</td>
                    <td className="py-1.5 pr-3 text-slate-body whitespace-nowrap">{v.allowed_fuels.join(", ")}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{v.status}</td>
                    <td className="py-1.5 pr-1">
                      <button onClick={() => remove(v.id)} className="text-slate-body hover:text-danger" title="Delete vessel">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Routes" subtitle={routeData ? `${routeData.routes.length} routes` : ""}>
        {rLoading && <LoadingState />}
        {routeData && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-xs text-slate-body border-b border-slate-line">
                  {["Code", "Route", "Distance nm", "Cargo demand t", "Deadline h", "Weather"].map((h) => (
                    <th key={h} className="py-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routeData.routes.map((r) => (
                  <tr key={r.id} className="border-b border-slate-line last:border-0">
                    <td className="py-1.5 pr-3 font-medium text-slate-ink whitespace-nowrap">{r.route_code}</td>
                    <td className="py-1.5 pr-3 text-slate-body whitespace-nowrap">{r.name}</td>
                    <td className="py-1.5 pr-3 tabular text-right">{fmtNum(r.distance_nm)}</td>
                    <td className="py-1.5 pr-3 tabular text-right">{r.cargo_demand_tonnes ? fmtNum(r.cargo_demand_tonnes) : "—"}</td>
                    <td className="py-1.5 pr-3 tabular text-right">{r.deadline_hours ? fmtNum(r.deadline_hours) : "—"}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{r.weather}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}


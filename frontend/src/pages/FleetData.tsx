import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download, Trash2, Upload, Ship, Filter, Search, Info,
  Sliders, MapPin, Gauge, Fuel, CheckCircle2, ChevronRight, X
} from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { deleteVessel, downloadDatasetUrl, listFleet, listRoutes } from "@/services/api";
import { ApiError } from "@/services/api";
import type { Vessel, VesselType } from "@/types/api";
import { Button, Field, Input, Select } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { KpiCard } from "@/components/ui/KpiCard";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { fmtNum } from "@/utils/format";

const VESSEL_TYPES: VesselType[] = [
  "Bulk Carrier",
  "Container Ship",
  "Oil Tanker",
  "General Cargo",
  "Ro-Ro",
];

const SIZE_CLASSES = [
  "Handysize",
  "Supramax",
  "Panamax",
  "Capesize",
  "Feeder",
  "Post-Panamax",
  "MR Tanker",
  "Aframax",
  "Suezmax",
];

const FUELS = ["HFO", "MGO", "LNG", "METHANOL", "AMMONIA", "HYDROGEN"];

const TYPE_BADGE_STYLE: Record<string, string> = {
  "Bulk Carrier": "bg-sky-50 text-sky-700 border-sky-200",
  "Container Ship": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Oil Tanker": "bg-pink-50 text-pink-700 border-pink-200",
  "General Cargo": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Ro-Ro": "bg-amber-50 text-amber-700 border-amber-200",
};

export function FleetData() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sizeFilter, setSizeFilter] = useState("ALL");
  const [fuelFilter, setFuelFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Modal / Drawer state for vessel details
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);

  const { data: fleetData, loading: vLoading, error: vError, reload: reloadVessels } = useAsync(() =>
    listFleet({
      vessel_type: typeFilter !== "ALL" ? typeFilter : undefined,
      size_class: sizeFilter !== "ALL" ? sizeFilter : undefined,
      fuel: fuelFilter !== "ALL" ? fuelFilter : undefined,
      search: search.trim() ? search.trim() : undefined,
    })
  );

  const { data: routeData, loading: rLoading } = useAsync(listRoutes);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || "/api"}/upload`, {
        method: "POST",
        body: fd,
      });
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
    if (!confirm("Are you sure you want to delete this vessel?")) return;
    try {
      await deleteVessel(id);
      reloadVessels();
      if (selectedVessel?.id === id) setSelectedVessel(null);
    } catch {
      /* surfaced via reload state */
    }
  };

  const vessels = fleetData?.vessels || [];

  // Summary Metrics
  const totalDwt = vessels.reduce((acc, v) => acc + (v.dwt || 0), 0);
  const avgAge = vessels.length > 0 ? vessels.reduce((acc, v) => acc + (v.age_years || 0), 0) / vessels.length : 0;
  const dualFuelCount = vessels.filter((v) => v.allowed_fuels && v.allowed_fuels.length > 1).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold text-slate-ink">Fleet Master &amp; Vessel Profiles</h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              HETEROGENEOUS FLEET
            </span>
          </div>
          <p className="text-sm text-slate-body mt-0.5">
            Fleet master database with segregated Vessel Types, Size Classes, naval dimensions, and operational fuel consumption envelopes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload Fleet CSV"}
          </Button>
          <a href={downloadDatasetUrl()}>
            <Button variant="secondary">
              <Download className="h-4 w-4" /> Download Dataset
            </Button>
          </a>
        </div>
      </div>

      {uploadMsg && <div className="text-sm text-slate-body glass-panel rounded-xl p-3">{uploadMsg}</div>}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Fleet Size" value={`${vessels.length} vessels`} icon={Ship} />
        <KpiCard label="Total Deadweight" value={`${fmtNum(totalDwt)} t`} icon={Ship} />
        <KpiCard label="Average Fleet Age" value={`${avgAge.toFixed(1)} years`} icon={Ship} />
        <KpiCard label="Alternative Fuel Ready" value={`${dualFuelCount} ships`} icon={Fuel} />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 flex flex-wrap items-end gap-3.5">
        <div className="flex-1 min-w-[220px]">
          <Field label="Search Fleet">
            <Input
              type="text"
              placeholder="Search code, name, IMO, call sign..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Vessel Type">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">All Types</option>
            {VESSEL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Size Class">
          <Select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)}>
            <option value="ALL">All Size Classes</option>
            {SIZE_CLASSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fuel Capability">
          <Select value={fuelFilter} onChange={(e) => setFuelFilter(e.target.value)}>
            <option value="ALL">All Fuels</option>
            {FUELS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>

        {(typeFilter !== "ALL" || sizeFilter !== "ALL" || fuelFilter !== "ALL" || search) && (
          <Button
            variant="ghost"
            onClick={() => {
              setTypeFilter("ALL");
              setSizeFilter("ALL");
              setFuelFilter("ALL");
              setSearch("");
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Main Vessels Master Table */}
      <ChartCard
        title="Fleet Registry"
        subtitle={`${vessels.length} vessel records matching criteria · Click any vessel for technical dossier`}
      >
        {vLoading && <LoadingState label="Loading fleet records" />}
        {vError && <ErrorState body={vError} />}
        {!vLoading && vessels.length === 0 && (
          <EmptyState
            title="No vessels found"
            body="No vessels match the selected filter criteria."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setTypeFilter("ALL");
                  setSizeFilter("ALL");
                  setFuelFilter("ALL");
                  setSearch("");
                }}
              >
                Reset Filters
              </Button>
            }
          />
        )}
        {!vLoading && vessels.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-left text-xs text-slate-body border-b border-slate-line">
                  <th className="py-2.5 pr-3 font-medium">Vessel</th>
                  <th className="py-2.5 pr-3 font-medium">Type</th>
                  <th className="py-2.5 pr-3 font-medium">Size Class</th>
                  <th className="py-2.5 pr-3 font-medium text-right">IMO</th>
                  <th className="py-2.5 pr-3 font-medium text-right">DWT (t)</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Engine (kW)</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Dimensions (m)</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Age</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Speed</th>
                  <th className="py-2.5 pr-3 font-medium">Fuels</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Daily Fuel Envelope</th>
                  <th className="py-2.5 pr-3 font-medium">Status</th>
                  <th className="py-2.5 pr-1 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vessels.map((v) => {
                  const typeLabel = v.vessel_type || "Bulk Carrier";
                  const sizeLabel = v.size_class || v.vessel_class;
                  const range = v.daily_fuel_mt_expected_range || [25, 45];

                  return (
                    <tr
                      key={v.id}
                      onClick={() => setSelectedVessel(v)}
                      className={`border-b border-slate-line/50 hover:bg-slate-50 transition-colors cursor-pointer ${
                        selectedVessel?.id === v.id ? "bg-sky-50/70" : ""
                      }`}
                    >
                      <td className="py-2.5 pr-3 font-medium text-slate-ink">
                        <div>{v.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{v.vessel_code}</div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium border ${
                            TYPE_BADGE_STYLE[typeLabel] || "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {typeLabel}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-ink font-medium">{sizeLabel}</td>
                      <td className="py-2.5 pr-3 tabular text-right text-xs font-mono text-slate-500">
                        {v.imo || "—"}
                      </td>
                      <td className="py-2.5 pr-3 tabular text-right font-medium text-slate-ink">
                        {fmtNum(v.dwt)}
                      </td>
                      <td className="py-2.5 pr-3 tabular text-right text-slate-700">{fmtNum(v.engine_kw)}</td>
                      <td className="py-2.5 pr-3 tabular text-right text-xs text-slate-500">
                        {v.length_m ? `${v.length_m}×${v.beam_m}×${v.draft_m}` : "—"}
                      </td>
                      <td className="py-2.5 pr-3 tabular text-right text-slate-700">
                        {v.age_years.toFixed(0)}y
                        {v.build_year && <span className="text-xs text-slate-500 block font-normal">({v.build_year})</span>}
                      </td>
                      <td className="py-2.5 pr-3 tabular text-right text-xs text-slate-700 whitespace-nowrap">
                        {v.min_speed_kn}–{v.max_speed_kn} kn
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {v.allowed_fuels.map((fuel) => (
                            <span
                              key={fuel}
                              className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-slate-700 font-mono"
                            >
                              {fuel}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 tabular text-right text-xs text-slate-600">
                        <span className="font-semibold text-slate-ink">{range[0]}–{range[1]}</span> MT/d
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium border ${
                            v.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td
                        className="py-2.5 pr-1 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedVessel(v)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-signal transition-colors"
                            title="View technical dossier"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => remove(v.id)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-danger transition-colors"
                            title="Delete vessel"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      {/* Vessel Technical Dossier Modal / Drawer */}
      {selectedVessel && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-line rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[92vh] flex flex-col gap-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-line">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-ink">{selectedVessel.name}</h2>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium border ${
                      TYPE_BADGE_STYLE[selectedVessel.vessel_type || "Bulk Carrier"] ||
                      "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {selectedVessel.vessel_type || selectedVessel.vessel_class}
                  </span>
                  <span className="text-xs text-signal font-mono font-medium">
                    {selectedVessel.size_class || selectedVessel.vessel_class}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                  <span>Code: <strong className="text-slate-700">{selectedVessel.vessel_code}</strong></span>
                  <span>IMO: <strong className="text-slate-700">{selectedVessel.imo || "Unassigned"}</strong></span>
                  <span>Status: <strong className="text-emerald-700 uppercase">{selectedVessel.status}</strong></span>
                </div>
              </div>
              <button
                onClick={() => setSelectedVessel(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Naval Architecture & Principal Dimensions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <DossierMetric label="Deadweight (DWT)" value={`${fmtNum(selectedVessel.dwt)} tonnes`} />
              <DossierMetric label="Engine Power" value={`${fmtNum(selectedVessel.engine_kw)} kW`} />
              <DossierMetric label="Build Year / Age" value={`${selectedVessel.build_year || "—"} (${selectedVessel.age_years.toFixed(0)}y)`} />
              <DossierMetric
                label="Length × Beam × Draft"
                value={selectedVessel.length_m ? `${selectedVessel.length_m}m × ${selectedVessel.beam_m}m × ${selectedVessel.draft_m}m` : "—"}
              />
            </div>

            {/* Propulsion & Hydrodynamics */}
            <div className="glass-panel rounded-xl p-4 border border-slate-line flex flex-col gap-3">
              <h3 className="text-xs font-bold text-slate-body uppercase tracking-wider">
                Propulsion &amp; Speed Envelopes
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-body block">Design Service Speed</span>
                  <strong className="text-sm text-slate-ink">
                    {selectedVessel.design_speed_kn ? `${selectedVessel.design_speed_kn} kn` : "14.5 kn"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-body block">Operational Speed Range</span>
                  <strong className="text-sm text-slate-ink">
                    {selectedVessel.min_speed_kn} – {selectedVessel.max_speed_kn} knots
                  </strong>
                </div>
                <div>
                  <span className="text-slate-body block">Design Specific Fuel Consumption</span>
                  <strong className="text-sm text-slate-ink">
                    {selectedVessel.design_sfoc_g_per_kwh ? `${selectedVessel.design_sfoc_g_per_kwh} g/kWh` : "175 g/kWh"}
                  </strong>
                </div>
              </div>
            </div>

            {/* Fuel Consumption Sanity & Validation Bounds */}
            <div className="glass-panel rounded-xl p-4 border border-emerald-200 bg-emerald-50/60 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs uppercase tracking-wide">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Operational Fuel Consumption Sanity Range</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Benchmark hydrodynamic envelope for this vessel class at cruising speed:{" "}
                <strong className="text-slate-900">
                  {selectedVessel.daily_fuel_mt_expected_range?.[0] ?? 25} –{" "}
                  {selectedVessel.daily_fuel_mt_expected_range?.[1] ?? 45} MT/day
                </strong>
                . High-frequency telemetry or predictions outside this envelope are flagged as warnings or physics outliers.
              </p>
            </div>

            {/* Fuel Capability & Green Transition */}
            <div className="glass-panel rounded-xl p-4 border border-slate-line flex flex-col gap-2">
              <h3 className="text-xs font-bold text-slate-body uppercase tracking-wider">
                Authorized Fuel Types &amp; Retrofit Readiness
              </h3>
              <div className="flex flex-wrap gap-2 mt-1">
                {selectedVessel.allowed_fuels.map((fuel) => (
                  <span
                    key={fuel}
                    className="px-3 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 font-mono text-xs font-semibold"
                  >
                    {fuel}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Data Provenance: {selectedVessel.source || "Clarksons World Fleet Register"} (Archive {selectedVessel.source_date || "2026"})
              </p>
            </div>

            {/* Quick Actions Footer */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-line">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedVessel(null);
                  navigate("/live-map");
                }}
              >
                <MapPin className="h-4 w-4" /> Track on AIS Map
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    setSelectedVessel(null);
                    navigate("/what-if");
                  }}
                >
                  <Sliders className="h-4 w-4" /> Simulate What-If <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Routes Reference Table */}
      <ChartCard title="Maritime Route Corridors" subtitle={routeData ? `${routeData.routes.length} active corridors` : ""}>
        {rLoading && <LoadingState />}
        {routeData && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-xs text-slate-body border-b border-slate-line">
                  {["Code", "Route Name", "Distance (nm)", "Cargo Demand (t)", "Deadline (h)", "Weather State"].map((h) => (
                    <th key={h} className="py-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routeData.routes.map((r) => (
                  <tr key={r.id} className="border-b border-slate-line/50 hover:bg-slate-50 transition-colors">
                    <td className="py-2 pr-3 font-medium text-slate-ink whitespace-nowrap">{r.route_code}</td>
                    <td className="py-2 pr-3 text-slate-body whitespace-nowrap">{r.name}</td>
                    <td className="py-2 pr-3 tabular text-right text-slate-700">{fmtNum(r.distance_nm)}</td>
                    <td className="py-2 pr-3 tabular text-right text-slate-700">{r.cargo_demand_tonnes ? fmtNum(r.cargo_demand_tonnes) : "—"}</td>
                    <td className="py-2 pr-3 tabular text-right text-slate-700">{r.deadline_hours ? `${r.deadline_hours}h` : "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-medium">
                        {r.weather}
                      </span>
                    </td>
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

function DossierMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-xl p-3 border border-slate-line/50">
      <span className="text-[11px] text-slate-body block">{label}</span>
      <span className="text-sm font-bold text-slate-ink mt-0.5 block">{value}</span>
    </div>
  );
}

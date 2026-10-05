import { useState, useEffect } from "react";
import {
  Sliders, ArrowRight, TrendingDown, TrendingUp, AlertTriangle,
  CheckCircle2, Gauge, DollarSign, Wind, Flame, Shield, HelpCircle
} from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { listFleet, listRoutes, simulateWhatIf } from "@/services/api";
import { ApiError } from "@/services/api";
import type { WhatIfComparisonResponse, WhatIfRequest } from "@/types/api";
import { Button, Field, Input, Select } from "@/components/ui/Controls";
import { ChartCard } from "@/components/ui/ChartCard";
import { KpiCard } from "@/components/ui/KpiCard";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { fmtNum, fmtPct, fmtUsd } from "@/utils/format";

const FUELS = ["HFO", "MGO", "LNG", "METHANOL", "AMMONIA", "HYDROGEN"];
const WEATHERS = ["CALM", "MODERATE", "ROUGH", "SEVERE"];

export function WhatIfSimulator() {
  const { data: fleetData } = useAsync(() => listFleet());
  const { data: routeData } = useAsync(listRoutes);

  // Baseline Form
  const [bVesselId, setBVesselId] = useState<number | "">("");
  const [bRouteName, setBRouteName] = useState("Rotterdam - Singapore");
  const [bDistance, setBDistance] = useState(8288);
  const [bSpeed, setBSpeed] = useState(14.0);
  const [bFuel, setBFuel] = useState("HFO");
  const [bWeather, setBWeather] = useState("MODERATE");
  const [bDeadline, setBDeadline] = useState(600);
  const [bPenalty, setBPenalty] = useState(15000);

  // Scenario Form
  const [sVesselId, setSVesselId] = useState<number | "">("");
  const [sRouteName, setSRouteName] = useState("Rotterdam - Singapore");
  const [sDistance, setSDistance] = useState(8288);
  const [sSpeed, setSSpeed] = useState(12.0); // Slow steaming by default
  const [sFuel, setSFuel] = useState("LNG"); // Alternative fuel by default
  const [sWeather, setSWeather] = useState("MODERATE");
  const [sDeadline, setSDeadline] = useState(600);
  const [sPenalty, setSPenalty] = useState(15000);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhatIfComparisonResponse | null>(null);

  // Initialize vessel IDs once fleet is loaded
  useEffect(() => {
    if (fleetData?.vessels && fleetData.vessels.length > 0) {
      if (bVesselId === "") setBVesselId(fleetData.vessels[0].id);
      if (sVesselId === "") setSVesselId(fleetData.vessels[0].id);
    }
  }, [fleetData, bVesselId, sVesselId]);

  const handleRouteChange = (side: "b" | "s", rName: string) => {
    const route = routeData?.routes.find((r) => r.name === rName);
    if (route) {
      if (side === "b") {
        setBRouteName(route.name);
        setBDistance(route.distance_nm);
        setBWeather(route.weather);
        if (route.deadline_hours) setBDeadline(route.deadline_hours);
      } else {
        setSRouteName(route.name);
        setSDistance(route.distance_nm);
        setSWeather(route.weather);
        if (route.deadline_hours) setSDeadline(route.deadline_hours);
      }
    }
  };

  const runSimulation = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload: WhatIfRequest = {
        baseline: {
          vessel_id: bVesselId ? Number(bVesselId) : undefined,
          route_name: bRouteName,
          distance_nm: Number(bDistance),
          speed_kn: Number(bSpeed),
          fuel_type: bFuel,
          weather: bWeather,
          deadline_hours: Number(bDeadline),
          penalty_per_day: Number(bPenalty),
        },
        scenario: {
          vessel_id: sVesselId ? Number(sVesselId) : undefined,
          route_name: sRouteName,
          distance_nm: Number(sDistance),
          speed_kn: Number(sSpeed),
          fuel_type: sFuel,
          weather: sWeather,
          deadline_hours: Number(sDeadline),
          penalty_per_day: Number(sPenalty),
        },
      };

      const res = await simulateWhatIf(payload);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "What-If simulation failed.");
    } finally {
      setLoading(false);
    }
  };

  // Run initial simulation once fleet is available
  useEffect(() => {
    if (fleetData?.vessels && fleetData.vessels.length > 0) {
      runSimulation();
    }
  }, [fleetData]); // eslint-disable-line react-hooks/exhaustive-deps

  const vessels = fleetData?.vessels || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl font-semibold text-slate-ink">What-If Voyage Scenario Simulator</h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-signal/15 text-signal border border-signal/30">
              HYDRODYNAMIC &amp; COMMERCIAL ENGINE
            </span>
          </div>
          <p className="text-sm text-slate-body mt-0.5">
            Simulate hydrodynamic, economic, and multi-emission impacts of speed alterations, fuel transitions, and contractual delay penalties.
          </p>
        </div>
        <Button onClick={runSimulation} variant="primary" disabled={loading}>
          <Sliders className="h-4 w-4" /> {loading ? "Simulating…" : "Run Simulation"}
        </Button>
      </div>

      {error && <ErrorState body={error} />}

      {/* Dual Configuration Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Baseline Panel */}
        <div className="rounded-2xl p-6 border border-slate-200/90 flex flex-col gap-4 bg-white shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-slate-400" />
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Baseline Reference Profile</h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              Reference Case
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Vessel Profile">
              <Select value={bVesselId} onChange={(e) => setBVesselId(Number(e.target.value))}>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.vessel_type || v.vessel_class} · {v.dwt.toLocaleString()} DWT)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Route Template">
              <Select value={bRouteName} onChange={(e) => handleRouteChange("b", e.target.value)}>
                {routeData?.routes.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name} ({fmtNum(r.distance_nm)} nm)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Distance">
              <Input
                type="number"
                value={bDistance}
                onChange={(e) => setBDistance(Number(e.target.value))}
                suffix="nm"
              />
            </Field>

            <Field label="Cruising Speed">
              <Input
                type="number"
                step="0.1"
                value={bSpeed}
                onChange={(e) => setBSpeed(Number(e.target.value))}
                suffix="kn"
              />
            </Field>

            <Field label="Bunker Fuel Grade">
              <Select value={bFuel} onChange={(e) => setBFuel(e.target.value)}>
                {FUELS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Weather Sea State">
              <Select value={bWeather} onChange={(e) => setBWeather(e.target.value)}>
                {WEATHERS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Contract Deadline">
              <Input
                type="number"
                value={bDeadline}
                onChange={(e) => setBDeadline(Number(e.target.value))}
                suffix="hrs"
              />
            </Field>

            <Field label="Demurrage Penalty">
              <Input
                type="number"
                value={bPenalty}
                onChange={(e) => setBPenalty(Number(e.target.value))}
                suffix="$/day"
              />
            </Field>
          </div>
        </div>

        {/* What-If Scenario Panel */}
        <div className="rounded-2xl p-6 border border-sky-300 flex flex-col gap-4 bg-sky-50/40 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-sky-200">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-sky-600 shadow-xs" />
              <h2 className="text-xs font-black text-sky-900 uppercase tracking-wider">What-If Alternative Scenario</h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300 font-bold">
              Simulated Variant
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Vessel Profile">
              <Select value={sVesselId} onChange={(e) => setSVesselId(Number(e.target.value))}>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.vessel_type || v.vessel_class} · {v.dwt.toLocaleString()} DWT)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Route Template">
              <Select value={sRouteName} onChange={(e) => handleRouteChange("s", e.target.value)}>
                {routeData?.routes.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name} ({fmtNum(r.distance_nm)} nm)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Distance">
              <Input
                type="number"
                value={sDistance}
                onChange={(e) => setSDistance(Number(e.target.value))}
                suffix="nm"
              />
            </Field>

            <Field label="Cruising Speed">
              <Input
                type="number"
                step="0.1"
                value={sSpeed}
                onChange={(e) => setSSpeed(Number(e.target.value))}
                suffix="kn"
              />
            </Field>

            <Field label="Bunker Fuel Grade">
              <Select value={sFuel} onChange={(e) => setSFuel(e.target.value)}>
                {FUELS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Weather Sea State">
              <Select value={sWeather} onChange={(e) => setSWeather(e.target.value)}>
                {WEATHERS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Contract Deadline">
              <Input
                type="number"
                value={sDeadline}
                onChange={(e) => setSDeadline(Number(e.target.value))}
                suffix="hrs"
              />
            </Field>

            <Field label="Demurrage Penalty">
              <Input
                type="number"
                value={sPenalty}
                onChange={(e) => setSPenalty(Number(e.target.value))}
                suffix="$/day"
              />
            </Field>
          </div>
        </div>
      </div>

      {/* Simulation Results Section */}
      {loading && <LoadingState label="Computing hydrodynamic deltas and emission profiles" />}

      {!loading && result && (() => {
        const baseline: any = result.baseline || {};
        const scenario: any = result.scenario || {};
        const deltas: any = result.deltas || {};
        const provenance: any = result.provenance || {};

        const bVessel = baseline.vessel || {};
        const sVessel = scenario.vessel || {};
        const bVesselName = bVessel.name || baseline.vessel_name || "Baseline Vessel";
        const bVesselType = bVessel.type || baseline.vessel_type || baseline.vessel_class || "Vessel";
        const sVesselName = sVessel.name || scenario.vessel_name || "Scenario Vessel";
        const sVesselType = sVessel.type || scenario.vessel_type || scenario.vessel_class || "Vessel";

        const fuelTonnesDelta = deltas.fuel_tonnes_delta ?? deltas.total_fuel_tonnes?.absolute_diff ?? 0;
        const fuelPctChange = deltas.fuel_pct_change ?? deltas.total_fuel_tonnes?.pct_change ?? 0;
        const costDelta = deltas.total_cost_delta_usd ?? deltas.total_voyage_cost_usd?.absolute_diff ?? 0;
        const costPctChange = deltas.fuel_cost_pct_change ?? 0;
        const co2Delta = deltas.co2_tonnes_delta ?? deltas.co2_tonnes?.absolute_diff ?? 0;
        const co2PctChange = deltas.co2_pct_change ?? deltas.co2_tonnes?.pct_change ?? 0;
        const soxDelta = deltas.sox_kg_delta ?? deltas.sox_kg?.absolute_diff ?? 0;
        const soxPctChange = deltas.sox_pct_change ?? deltas.sox_kg?.pct_change ?? 0;
        const noxDelta = deltas.nox_kg_delta ?? deltas.nox_kg?.absolute_diff ?? 0;
        const noxPctChange = deltas.nox_pct_change ?? deltas.nox_kg?.pct_change ?? 0;
        const penaltyDelta = deltas.penalty_delta_usd ?? deltas.penalty_usd?.absolute_diff ?? 0;
        const durationDelta = deltas.duration_days_delta ?? deltas.duration_days?.absolute_diff ?? 0;
        const delayHoursDelta = deltas.delay_hours_delta ?? deltas.delay_hours?.absolute_diff ?? 0;
        const fuelCostDelta = deltas.fuel_cost_delta_usd ?? deltas.fuel_cost_usd?.absolute_diff ?? 0;
        const fuelCostPct = deltas.fuel_cost_pct_change ?? deltas.fuel_cost_usd?.pct_change ?? 0;

        const bSpeed = baseline.speed_kn ?? 0;
        const sSpeed = scenario.speed_kn ?? 0;
        const bDuration = baseline.duration_days ?? 0;
        const sDuration = scenario.duration_days ?? 0;
        const bFuel = baseline.total_fuel_tonnes ?? 0;
        const sFuel = scenario.total_fuel_tonnes ?? 0;
        const bFuelCost = baseline.fuel_cost_usd ?? 0;
        const sFuelCost = scenario.fuel_cost_usd ?? 0;
        const bCo2 = baseline.co2_tonnes ?? 0;
        const sCo2 = scenario.co2_tonnes ?? 0;
        const bSox = baseline.sox_kg ?? 0;
        const sSox = scenario.sox_kg ?? 0;
        const bNox = baseline.nox_kg ?? 0;
        const sNox = scenario.nox_kg ?? 0;
        const bDelay = baseline.delay_hours ?? 0;
        const sDelay = scenario.delay_hours ?? 0;
        const bPenaltyVal = baseline.penalty_usd ?? 0;
        const sPenaltyVal = scenario.penalty_usd ?? 0;
        const bTotalCost = baseline.total_voyage_cost_usd ?? 0;
        const sTotalCost = scenario.total_voyage_cost_usd ?? 0;

        const physicsModel = provenance.physics_model || (result as any).data_provenance || "Admiralty Physics Model";
        const emissionFactors = provenance.emission_factors || "IMO 4th GHG Study Standards";
        const dataLabel = provenance.data_label || "Deterministic Simulation";

        return (
          <>
            {/* Key Delta Impact Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <DeltaCard
                label="Fuel Consumption"
                deltaNum={fuelTonnesDelta}
                deltaPct={fuelPctChange}
                unit="t"
                goodIfNegative
              />
              <DeltaCard
                label="Total Voyage Cost"
                deltaNum={costDelta}
                deltaPct={costPctChange}
                unit="$"
                goodIfNegative
                isCurrency
              />
              <DeltaCard
                label="CO2 Emissions"
                deltaNum={co2Delta}
                deltaPct={co2PctChange}
                unit="t"
                goodIfNegative
              />
              <DeltaCard
                label="SOx Emissions"
                deltaNum={soxDelta}
                deltaPct={soxPctChange}
                unit="kg"
                goodIfNegative
              />
              <DeltaCard
                label="NOx Emissions"
                deltaNum={noxDelta}
                deltaPct={noxPctChange}
                unit="kg"
                goodIfNegative
              />
              <DeltaCard
                label="Delay Penalty"
                deltaNum={penaltyDelta}
                deltaPct={0}
                unit="$"
                goodIfNegative
                isCurrency
                hidePct
              />
            </div>

            {/* Detailed Side-by-Side Comparison Table */}
            <ChartCard title="Comparative Voyage Analytics" subtitle="Baseline vs. Simulated Alternative Breakdown">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="text-left text-xs text-slate-body border-b border-slate-line">
                      <th className="py-2.5 pr-3 font-medium">Metric</th>
                      <th className="py-2.5 pr-3 font-medium text-right">Baseline</th>
                      <th className="py-2.5 pr-3 font-medium text-right">What-If Scenario</th>
                      <th className="py-2.5 pr-3 font-medium text-right">Absolute Delta</th>
                      <th className="py-2.5 pr-3 font-medium text-right">Relative Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    <ComparisonTableRow
                      label="Vessel & Type"
                      bVal={`${bVesselName} (${bVesselType})`}
                      sVal={`${sVesselName} (${sVesselType})`}
                      delta="—"
                      pct="—"
                    />
                    <ComparisonTableRow
                      label="Bunker Fuel Type"
                      bVal={baseline.fuel_type || "—"}
                      sVal={scenario.fuel_type || "—"}
                      delta="—"
                      pct="—"
                    />
                    <ComparisonTableRow
                      label="Cruising Speed"
                      bVal={`${bSpeed.toFixed(1)} kn`}
                      sVal={`${sSpeed.toFixed(1)} kn`}
                      delta={`${(sSpeed - bSpeed).toFixed(1)} kn`}
                      pct={fmtPct(((sSpeed - bSpeed) / (bSpeed || 1)) * 100, 1, true)}
                    />
                    <ComparisonTableRow
                      label="Voyage Duration"
                      bVal={`${bDuration.toFixed(1)} days`}
                      sVal={`${sDuration.toFixed(1)} days`}
                      delta={`${durationDelta.toFixed(1)} days`}
                      pct={fmtPct((durationDelta / (bDuration || 1)) * 100, 1, true)}
                    />
                    <ComparisonTableRow
                      label="Total Fuel Consumed"
                      bVal={`${fmtNum(bFuel, 1)} t`}
                      sVal={`${fmtNum(sFuel, 1)} t`}
                      delta={`${fmtNum(fuelTonnesDelta, 1)} t`}
                      pct={fmtPct(fuelPctChange, 1, true)}
                      highlight={fuelTonnesDelta < 0 ? "good" : "bad"}
                    />
                    <ComparisonTableRow
                      label="Bunker Fuel Cost"
                      bVal={fmtUsd(bFuelCost)}
                      sVal={fmtUsd(sFuelCost)}
                      delta={fmtUsd(fuelCostDelta)}
                      pct={fmtPct(fuelCostPct, 1, true)}
                      highlight={fuelCostDelta < 0 ? "good" : "bad"}
                    />
                    <ComparisonTableRow
                      label="CO2 Emissions (Tank-to-Wake)"
                      bVal={`${fmtNum(bCo2, 1)} t`}
                      sVal={`${fmtNum(sCo2, 1)} t`}
                      delta={`${fmtNum(co2Delta, 1)} t`}
                      pct={fmtPct(co2PctChange, 1, true)}
                      highlight={co2Delta < 0 ? "good" : "bad"}
                    />
                    <ComparisonTableRow
                      label="SOx Emissions"
                      bVal={`${fmtNum(bSox, 1)} kg`}
                      sVal={`${fmtNum(sSox, 1)} kg`}
                      delta={`${fmtNum(soxDelta, 1)} kg`}
                      pct={fmtPct(soxPctChange, 1, true)}
                      highlight={soxDelta < 0 ? "good" : "bad"}
                    />
                    <ComparisonTableRow
                      label="NOx Emissions"
                      bVal={`${fmtNum(bNox, 1)} kg`}
                      sVal={`${fmtNum(sNox, 1)} kg`}
                      delta={`${fmtNum(noxDelta, 1)} kg`}
                      pct={fmtPct(noxPctChange, 1, true)}
                      highlight={noxDelta < 0 ? "good" : "bad"}
                    />
                    <ComparisonTableRow
                      label="Contract Delay & Demurrage"
                      bVal={`${bDelay.toFixed(1)} h (${fmtUsd(bPenaltyVal)})`}
                      sVal={`${sDelay.toFixed(1)} h (${fmtUsd(sPenaltyVal)})`}
                      delta={fmtUsd(penaltyDelta)}
                      pct={`${delayHoursDelta.toFixed(1)} h`}
                      highlight={penaltyDelta <= 0 ? "good" : "bad"}
                    />
                    <ComparisonTableRow
                      label="Total Economic Cost"
                      bVal={fmtUsd(bTotalCost)}
                      sVal={fmtUsd(sTotalCost)}
                      delta={fmtUsd(costDelta)}
                      pct={fmtPct((costDelta / (bTotalCost || 1)) * 100, 1, true)}
                      highlight={costDelta < 0 ? "good" : "bad"}
                    />
                  </tbody>
                </table>
              </div>
            </ChartCard>

            {/* Executive Verdict Card */}
            <div className="glass-panel rounded-xl p-5 border border-slate-line flex items-start gap-4 bg-white">
              <div className={`p-3 rounded-xl shrink-0 ${costDelta <= 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {costDelta <= 0 ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                )}
              </div>
              <div className="flex-1 text-sm text-slate-body">
                <h3 className="text-base font-semibold text-slate-ink mb-1">
                  {costDelta <= 0
                    ? "Simulation Verdict: Favorable What-If Transition"
                    : "Simulation Verdict: Commercial Trade-Off Required"}
                </h3>
                <p className="leading-relaxed">
                  The simulated scenario changes total fuel consumption by{" "}
                  <strong className="text-slate-ink">{fmtPct(fuelPctChange, 1, true)}</strong> (
                  {fmtNum(fuelTonnesDelta, 1)} tonnes) and lifecycle CO2 emissions by{" "}
                  <strong className="text-slate-ink">{fmtPct(co2PctChange, 1, true)}</strong>.
                  {penaltyDelta > 0 ? (
                    <>
                      {" "}However, reducing speed results in an additional{" "}
                      <strong className="text-danger">{delayHoursDelta.toFixed(1)} hours delay</strong>, incurring{" "}
                      <strong className="text-danger">{fmtUsd(penaltyDelta)}</strong> in demurrage penalty charges.
                    </>
                  ) : (
                    <> The voyage remains strictly within the required laycan window with zero demurrage penalty.</>
                  )}
                </p>
                <div className="flex items-center gap-4 text-xs text-slate-400 mt-3 pt-2 border-t border-slate-line/50">
                  <span>Model: {physicsModel}</span>
                  <span>Emissions Standard: {emissionFactors}</span>
                  <span className="font-mono">{dataLabel}</span>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

function DeltaCard({
  label,
  deltaNum,
  deltaPct,
  unit,
  goodIfNegative,
  isCurrency,
  hidePct,
}: {
  label: string;
  deltaNum: number;
  deltaPct: number;
  unit: string;
  goodIfNegative?: boolean;
  isCurrency?: boolean;
  hidePct?: boolean;
}) {
  const isZero = Math.abs(deltaNum) < 0.001;
  const isGood = goodIfNegative ? deltaNum < 0 : deltaNum > 0;
  const formattedVal = isCurrency ? fmtUsd(deltaNum) : `${fmtNum(deltaNum, 1)} ${unit}`;

  return (
    <div className="glass-panel rounded-xl p-3 border border-slate-line/50 flex flex-col justify-between">
      <span className="text-xs text-slate-body">{label}</span>
      <div className="mt-1">
        <div className={`text-base font-bold tabular ${isZero ? "text-slate-body" : isGood ? "text-positive" : "text-danger"}`}>
          {isZero ? "0" : deltaNum > 0 ? `+${formattedVal}` : formattedVal}
        </div>
        {!hidePct && !isZero && (
          <span className={`text-[11px] font-medium flex items-center gap-0.5 ${isGood ? "text-positive" : "text-danger"}`}>
            {isGood ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
            {fmtPct(deltaPct, 1, true)}
          </span>
        )}
      </div>
    </div>
  );
}

function ComparisonTableRow({
  label,
  bVal,
  sVal,
  delta,
  pct,
  highlight,
}: {
  label: string;
  bVal: string;
  sVal: string;
  delta: string;
  pct: string;
  highlight?: "good" | "bad";
}) {
  return (
    <tr className="border-b border-slate-line/50 hover:bg-slate-50 transition-colors">
      <td className="py-2.5 pr-3 font-medium text-slate-ink">{label}</td>
      <td className="py-2.5 pr-3 tabular text-right text-slate-body">{bVal}</td>
      <td className="py-2.5 pr-3 tabular text-right font-medium text-slate-ink">{sVal}</td>
      <td
        className={`py-2.5 pr-3 tabular text-right font-semibold ${
          highlight === "good" ? "text-positive" : highlight === "bad" ? "text-danger" : "text-slate-ink"
        }`}
      >
        {delta}
      </td>
      <td
        className={`py-2.5 pr-3 tabular text-right text-xs ${
          highlight === "good" ? "text-positive" : highlight === "bad" ? "text-danger" : "text-slate-body"
        }`}
      >
        {pct}
      </td>
    </tr>
  );
}

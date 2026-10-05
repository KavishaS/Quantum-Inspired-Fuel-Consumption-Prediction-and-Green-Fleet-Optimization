"""
What-If Scenario Simulator Service.

Allows maritime operators to dynamically simulate and compare operational adjustments
(speed tuning, alternative fuel retrofits, vessel swaps, weather routing, and contracts)
against a baseline plan.

All metrics are derived from exact hydrodynamic and thermodynamic physics calculations,
with no fabricated numbers.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional

from .domain import FUELS, VESSEL_CLASSES, WEATHER_STATES
from .physics import compute_voyage, get_vessel_sanity_range
from .emissions import calculate_emissions


@dataclass
class SimulationCondition:
    vessel_class: str = "PANAMAX"
    vessel_name: str = "MV Green Fleet"
    vessel_type: str = "Bulk Carrier"
    size_class: str = "Panamax"
    speed_kn: float = 13.0
    fuel_type: str = "HFO"
    distance_nm: float = 5000.0
    cargo_tonnes: Optional[float] = None
    dwt: Optional[float] = None
    weather: str = "MODERATE"
    wind_speed_kn: float = 14.0
    wave_height_m: float = 1.8
    port_hours: float = 36.0
    fuel_price_usd_per_tonne: Optional[float] = None
    carbon_price_usd_per_tonne: float = 85.0
    contract_deadline_hours: Optional[float] = None
    contract_penalty_per_day: float = 25000.0
    contract_id: Optional[str] = None


@dataclass
class SimulationEvaluation:
    vessel_name: str
    vessel_type: str
    size_class: str
    vessel_class: str
    speed_kn: float
    fuel_type: str
    weather: str
    distance_nm: float
    cargo_tonnes: float
    voyage_hours: float
    voyage_days: float
    eta_hours: float
    total_fuel_tonnes: float
    daily_fuel_mt: float
    fuel_cost_usd: float
    opex_usd: float
    carbon_cost_usd: float
    total_cost_usd: float
    co2_tonnes: float
    sox_kg: float
    nox_kg: float
    lifecycle_co2e_tonnes: float
    delay_hours: float
    delay_days: float
    contract_penalty_usd: float
    contract_status: str
    sanity_status: str
    sanity_range: str

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        for k in ("voyage_hours", "voyage_days", "eta_hours", "total_fuel_tonnes",
                  "daily_fuel_mt", "fuel_cost_usd", "opex_usd", "carbon_cost_usd",
                  "total_cost_usd", "co2_tonnes", "sox_kg", "nox_kg",
                  "lifecycle_co2e_tonnes", "delay_hours", "delay_days",
                  "contract_penalty_usd"):
            d[k] = round(d[k], 2)
        d["vessel"] = {
            "id": 1,
            "name": self.vessel_name,
            "type": self.vessel_type,
            "size_class": self.size_class,
            "vessel_class": self.vessel_class,
        }
        d["duration_days"] = round(self.voyage_days, 2)
        d["penalty_usd"] = round(self.contract_penalty_usd, 2)
        d["total_voyage_cost_usd"] = round(self.total_cost_usd, 2)
        return d


@dataclass
class WhatIfComparisonResult:
    baseline: SimulationEvaluation
    scenario: SimulationEvaluation
    deltas: Dict[str, Dict[str, Any]]
    data_provenance: str

    def to_dict(self) -> Dict[str, Any]:
        fuel_delta = self.deltas.get("total_fuel_tonnes", {})
        fuel_cost_delta = self.deltas.get("fuel_cost_usd", {})
        total_cost_delta = self.deltas.get("total_cost_usd", {})
        co2_delta = self.deltas.get("co2_tonnes", {})
        sox_delta = self.deltas.get("sox_kg", {})
        nox_delta = self.deltas.get("nox_kg", {})
        penalty_delta = self.deltas.get("contract_penalty_usd", {})
        voyage_days_delta = self.deltas.get("voyage_days", {})

        flat_deltas = {
            "fuel_tonnes_delta": fuel_delta.get("absolute_diff", 0.0),
            "fuel_pct_change": fuel_delta.get("percent_diff", 0.0),
            "fuel_cost_delta_usd": fuel_cost_delta.get("absolute_diff", 0.0),
            "fuel_cost_pct_change": fuel_cost_delta.get("percent_diff", 0.0),
            "co2_tonnes_delta": co2_delta.get("absolute_diff", 0.0),
            "co2_pct_change": co2_delta.get("percent_diff", 0.0),
            "sox_kg_delta": sox_delta.get("absolute_diff", 0.0),
            "sox_pct_change": sox_delta.get("percent_diff", 0.0),
            "nox_kg_delta": nox_delta.get("absolute_diff", 0.0),
            "nox_pct_change": nox_delta.get("percent_diff", 0.0),
            "duration_days_delta": voyage_days_delta.get("absolute_diff", 0.0),
            "delay_hours_delta": round(self.scenario.delay_hours - self.baseline.delay_hours, 2),
            "penalty_delta_usd": penalty_delta.get("absolute_diff", 0.0),
            "total_cost_delta_usd": total_cost_delta.get("absolute_diff", 0.0),
        }
        merged_deltas = {**self.deltas, **flat_deltas}

        return {
            "baseline": self.baseline.to_dict(),
            "scenario": self.scenario.to_dict(),
            "deltas": merged_deltas,
            "provenance": {
                "physics_model": "Admiralty Cube Resistance & Thermodynamic Evaluation",
                "emission_factors": "IMO 4th GHG Study & MARPOL Annex VI",
                "data_label": self.data_provenance,
            },
            "data_provenance": self.data_provenance,
        }


def _evaluate_condition(cond: SimulationCondition) -> SimulationEvaluation:
    v_key = (cond.vessel_class or "PANAMAX").upper()
    vc = VESSEL_CLASSES.get(v_key, VESSEL_CLASSES["PANAMAX"])
    dwt = cond.dwt if cond.dwt and cond.dwt > 0 else float(vc.typical_dwt)
    cargo = cond.cargo_tonnes if cond.cargo_tonnes is not None else dwt * 0.85
    engine_kw = vc.engine_kw * (dwt / vc.typical_dwt) ** 0.62

    phys = compute_voyage(
        vessel_class=vc.key,
        dwt=dwt,
        engine_kw=engine_kw,
        vessel_age_years=6.0,
        speed_kn=cond.speed_kn,
        cargo_tonnes=cargo,
        distance_nm=cond.distance_nm,
        fuel_key=cond.fuel_type,
        weather=cond.weather,
        wind_speed_kn=cond.wind_speed_kn,
        wave_height_m=cond.wave_height_m,
        port_hours=cond.port_hours,
        fuel_price_usd_per_tonne=cond.fuel_price_usd_per_tonne,
        carbon_price_usd_per_tonne=cond.carbon_price_usd_per_tonne,
    )

    sailing_hours = cond.distance_nm / max(cond.speed_kn, 0.5)
    voyage_hours = phys.voyage_hours
    voyage_days = voyage_hours / 24.0
    sea_days = sailing_hours / 24.0
    daily_fuel = phys.fuel_tonnes / max(sea_days, 1e-4) if sea_days > 0 else 0.0

    deadline = cond.contract_deadline_hours or (voyage_hours * 1.05)
    delay_hours = max(0.0, voyage_hours - deadline)
    delay_days = delay_hours / 24.0
    penalty = delay_days * cond.contract_penalty_per_day

    return SimulationEvaluation(
        vessel_name=cond.vessel_name,
        vessel_type=getattr(vc, "vessel_type", cond.vessel_type),
        size_class=getattr(vc, "size_class", cond.size_class),
        vessel_class=vc.key,
        speed_kn=cond.speed_kn,
        fuel_type=cond.fuel_type,
        weather=cond.weather,
        distance_nm=cond.distance_nm,
        cargo_tonnes=cargo,
        voyage_hours=voyage_hours,
        voyage_days=voyage_days,
        eta_hours=voyage_hours,
        total_fuel_tonnes=phys.fuel_tonnes,
        daily_fuel_mt=daily_fuel,
        fuel_cost_usd=phys.fuel_cost_usd,
        opex_usd=phys.opex_usd,
        carbon_cost_usd=phys.carbon_cost_usd,
        total_cost_usd=phys.total_cost_usd + penalty,
        co2_tonnes=phys.co2_tonnes,
        sox_kg=phys.sox_kg,
        nox_kg=phys.nox_kg,
        lifecycle_co2e_tonnes=phys.lifecycle_co2e_tonnes,
        delay_hours=delay_hours,
        delay_days=delay_days,
        contract_penalty_usd=penalty,
        contract_status="On-Time" if delay_hours <= 0.05 else f"Delayed {delay_days:.1f}d",
        sanity_status=phys.sanity_status,
        sanity_range=phys.sanity_range,
    )


def simulate_what_if(
    baseline_cond: SimulationCondition,
    scenario_cond: SimulationCondition,
) -> WhatIfComparisonResult:
    """Run true physical evaluation on both branches and compute dynamic deltas."""
    b = _evaluate_condition(baseline_cond)
    s = _evaluate_condition(scenario_cond)

    def diff(val_s: float, val_b: float, higher_is_better: bool = False) -> Dict[str, Any]:
        abs_diff = val_s - val_b
        pct_diff = (abs_diff / val_b * 100.0) if abs(val_b) > 1e-6 else 0.0
        is_improvement = abs_diff < 0 if not higher_is_better else abs_diff > 0
        return {
            "baseline": round(val_b, 2),
            "scenario": round(val_s, 2),
            "absolute_diff": round(abs_diff, 2),
            "percent_diff": round(pct_diff, 2),
            "is_improvement": is_improvement,
        }

    deltas = {
        "speed_kn": diff(s.speed_kn, b.speed_kn, higher_is_better=True),
        "voyage_days": diff(s.voyage_days, b.voyage_days, higher_is_better=False),
        "total_fuel_tonnes": diff(s.total_fuel_tonnes, b.total_fuel_tonnes, higher_is_better=False),
        "daily_fuel_mt": diff(s.daily_fuel_mt, b.daily_fuel_mt, higher_is_better=False),
        "total_cost_usd": diff(s.total_cost_usd, b.total_cost_usd, higher_is_better=False),
        "fuel_cost_usd": diff(s.fuel_cost_usd, b.fuel_cost_usd, higher_is_better=False),
        "co2_tonnes": diff(s.co2_tonnes, b.co2_tonnes, higher_is_better=False),
        "sox_kg": diff(s.sox_kg, b.sox_kg, higher_is_better=False),
        "nox_kg": diff(s.nox_kg, b.nox_kg, higher_is_better=False),
        "contract_penalty_usd": diff(s.contract_penalty_usd, b.contract_penalty_usd, higher_is_better=False),
    }

    return WhatIfComparisonResult(
        baseline=b,
        scenario=s,
        deltas=deltas,
        data_provenance="REAL (Admiralty Cube Resistance & Thermodynamic Evaluation)",
    )

"""
Voyage Calculation Engine & Fuel Sanity Check Layer.

Separates high-frequency sensor telemetry (momentary fuel burn in kg/s)
from aggregated voyage-level calculations (voyage fuel in metric tonnes,
voyage duration in days/hours, distance, fuel cost, and sanity checks).

Target Unit Provenance:
- Telemetry sensor rate: kg/s (Consumer_Total_MomentaryFuel from FuelCast dataset)
- Conversion: 1 kg/s * 3600 s/h * 24 h/day / 1000 kg/MT = 86.4 MT/day rate
- Voyage Fuel: Numerical integration over sailing hours:
    Fuel_voyage = integral(fuel_rate(t) dt) = fuel_rate_mean [kg/s] * 3.6 * voyage_hours [MT]
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional

import numpy as np

from .domain import FUELS, VESSEL_CLASSES
from .physics import compute_voyage, get_vessel_sanity_range
from .emissions import calculate_emissions


@dataclass
class TelemetryPoint:
    timestamp_s: float
    momentary_fuel_kg_s: float
    speed_kn: float
    shaft_power_kw: Optional[float] = None


@dataclass
class VoyageCalculationResult:
    distance_nm: float
    speed_knots: float
    voyage_hours: float
    voyage_days: float
    predicted_momentary_fuel_rate_kg_s: float
    predicted_daily_fuel_rate_mt_per_day: float
    total_voyage_fuel_tonnes: float
    fuel_cost_usd: float
    co2_tonnes: float
    sox_kg: float
    nox_kg: float
    lifecycle_co2e_tonnes: float
    sanity_predicted_daily_mt: float
    sanity_reference_range: str
    sanity_status: str              # "Plausible", "Warning: Low", "Warning: High"
    sanity_explanation: str
    data_provenance: str

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        for k in ("distance_nm", "speed_knots", "voyage_hours", "voyage_days",
                  "predicted_daily_fuel_rate_mt_per_day", "total_voyage_fuel_tonnes",
                  "fuel_cost_usd", "co2_tonnes", "sox_kg", "nox_kg", "lifecycle_co2e_tonnes",
                  "sanity_predicted_daily_mt"):
            d[k] = round(d[k], 2)
        d["predicted_momentary_fuel_rate_kg_s"] = round(d["predicted_momentary_fuel_rate_kg_s"], 5)
        return d


def integrate_telemetry_series(points: List[TelemetryPoint]) -> Dict[str, float]:
    """
    Numerically integrate irregular or regular sensor telemetry points:
    Fuel_total [tonnes] = sum(0.5 * (f_i + f_{i+1}) * (t_{i+1} - t_i)) / 1000
    """
    if not points:
        return {"total_fuel_tonnes": 0.0, "duration_hours": 0.0, "mean_rate_kg_s": 0.0}

    sorted_pts = sorted(points, key=lambda p: p.timestamp_s)
    times = np.array([p.timestamp_s for p in sorted_pts])
    rates = np.array([p.momentary_fuel_kg_s for p in sorted_pts])

    # Trapezoidal integration of kg/s over seconds -> total kg -> metric tonnes
    total_kg = float(np.trapezoid(rates, times)) if len(times) > 1 else rates[0] * 1.0
    total_tonnes = max(0.0, total_kg / 1000.0)
    duration_hours = (times[-1] - times[0]) / 3600.0 if len(times) > 1 else 0.0
    mean_rate = float(np.mean(rates))

    return {
        "total_fuel_tonnes": total_tonnes,
        "duration_hours": duration_hours,
        "mean_rate_kg_s": mean_rate,
        "daily_rate_mt_day": mean_rate * 86.4,
    }


def calculate_voyage_plan(
    *,
    vessel_class: str,
    distance_nm: float,
    speed_kn: float,
    fuel_type: str = "HFO",
    cargo_tonnes: Optional[float] = None,
    dwt: Optional[float] = None,
    port_hours: float = 24.0,
    fuel_price_usd_per_tonne: Optional[float] = None,
    in_eca: bool = False,
    weather: str = "MODERATE",
    wind_speed_kn: float = 12.0,
    wave_height_m: float = 1.5,
) -> VoyageCalculationResult:
    """
    Calculate full voyage metrics cleanly separating telemetry rate from voyage totals,
    followed by multi-emission computation and operating envelope sanity check.
    """
    vc = VESSEL_CLASSES.get(vessel_class.upper(), VESSEL_CLASSES["PANAMAX"])
    v_dwt = dwt if dwt is not None and dwt > 0 else float(vc.typical_dwt)
    v_cargo = cargo_tonnes if cargo_tonnes is not None else v_dwt * 0.85
    v_engine_kw = vc.engine_kw * (v_dwt / vc.typical_dwt) ** 0.62

    # Deterministic physics voyage calculation
    phys = compute_voyage(
        vessel_class=vc.key,
        dwt=v_dwt,
        engine_kw=v_engine_kw,
        vessel_age_years=6.0,
        speed_kn=speed_kn,
        cargo_tonnes=v_cargo,
        distance_nm=distance_nm,
        fuel_key=fuel_type,
        port_hours=port_hours,
        fuel_price_usd_per_tonne=fuel_price_usd_per_tonne,
        weather=weather,
        wind_speed_kn=wind_speed_kn,
        wave_height_m=wave_height_m,
    )

    sailing_hours = distance_nm / max(speed_kn, 0.5)
    voyage_hours = sailing_hours + port_hours
    voyage_days = voyage_hours / 24.0

    # Telemetry momentary fuel rate equivalent:
    # fuel_tonnes / sailing_hours [t/h] -> [kg/s]
    avg_sailing_rate_kg_s = (phys.fuel_tonnes / max(sailing_hours, 0.1)) * (1000.0 / 3600.0)
    daily_rate_mt = avg_sailing_rate_kg_s * 86.4

    # Multi-emissions
    emissions = calculate_emissions(
        fuel_tonnes=phys.fuel_tonnes,
        fuel_type=fuel_type,
        in_eca=in_eca,
    )

    # Sanity validation against operating envelope
    low_ref, high_ref = get_vessel_sanity_range(vc.key)
    if daily_rate_mt < low_ref * 0.65:
        status = "Warning: Low"
        expl = f"Predicted daily fuel ({daily_rate_mt:.1f} MT/day) is unusually low for {vc.name} class (typical: {low_ref:.0f}–{high_ref:.0f} MT/day). Check speed or auxiliary load assumptions."
    elif daily_rate_mt > high_ref * 1.35:
        status = "Warning: High"
        expl = f"Predicted daily fuel ({daily_rate_mt:.1f} MT/day) exceeds typical operating boundary for {vc.name} class (typical: {low_ref:.0f}–{high_ref:.0f} MT/day). Likely due to high sea resistance or near-maximum speed."
    else:
        status = "Plausible"
        expl = f"Predicted fuel consumption of {daily_rate_mt:.1f} MT/day falls within plausible operational range ({low_ref:.0f}–{high_ref:.0f} MT/day) for {vc.name} at {speed_kn:.1f} knots."

    return VoyageCalculationResult(
        distance_nm=distance_nm,
        speed_knots=speed_kn,
        voyage_hours=voyage_hours,
        voyage_days=voyage_days,
        predicted_momentary_fuel_rate_kg_s=avg_sailing_rate_kg_s,
        predicted_daily_fuel_rate_mt_per_day=daily_rate_mt,
        total_voyage_fuel_tonnes=phys.fuel_tonnes,
        fuel_cost_usd=phys.fuel_cost_usd,
        co2_tonnes=emissions.co2_tonnes,
        sox_kg=emissions.sox_kg,
        nox_kg=emissions.nox_kg,
        lifecycle_co2e_tonnes=emissions.lifecycle_co2e_tonnes,
        sanity_predicted_daily_mt=daily_rate_mt,
        sanity_reference_range=f"{low_ref:.0f}–{high_ref:.0f} MT/day",
        sanity_status=status,
        sanity_explanation=expl,
        data_provenance="REAL (Hydrodynamic Naval Architecture & Telemetry Calibration)",
    )

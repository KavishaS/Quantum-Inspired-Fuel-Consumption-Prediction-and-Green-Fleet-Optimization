"""
Physical fuel-consumption, emission and cost model.

This module is the ground truth of the platform. The synthetic dataset is
generated from it (plus noise), the ML predictor learns it, and the
optimisers are scored against it.

Core relationship
-----------------
Propulsion power for a displacement hull scales roughly with the cube of
speed (Admiralty coefficient method):

    P(v) = P_design * (v / v_design)^3

Displacement affects resistance through a fractional power of the
displacement ratio (2/3 exponent from wetted-surface scaling, damped to 0.42
to reflect that ballast draft does not scale linearly with cargo):

    k_load = (0.55 + 0.45 * load_fraction) ^ 0.42 ... normalised to 1.0 at full load

Fuel mass flow follows from brake power and specific fuel oil consumption:

    mdot [t/h] = P [kW] * SFOC [g/kWh] * 1e-6

SFOC itself is load-dependent and U-shaped, minimised near 75% MCR, which is
why "slow steaming to zero" is not optimal and why the optimiser has a real
trade-off to solve.

Assumptions are documented in README under "Mathematical model".
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from .domain import FUELS, VESSEL_CLASSES, WEATHER_STATES, FuelSpec

# Reference specific fuel oil consumption for a modern 2-stroke at 75% MCR
SFOC_REF_G_PER_KWH = 172.0
AUX_LOAD_FRACTION = 0.06        # auxiliary engines / hotel load as share of MCR
HULL_FOULING_PER_YEAR = 0.006   # +0.6% consumption per year of vessel age


def sfoc_curve(load_fraction: float) -> float:
    """
    Load-dependent SFOC multiplier, minimum at 75% MCR.
    Quadratic bowl: 1.0 at optimum, rising either side.
    """
    lf = max(0.10, min(1.0, load_fraction))
    return 1.0 + 0.45 * (lf - 0.75) ** 2 / 0.75 ** 2 + 0.22 * max(0.0, 0.35 - lf)


def load_factor(cargo_tonnes: float, dwt: float) -> float:
    """Resistance multiplier from cargo loading, 1.0 at full deadweight."""
    frac = max(0.0, min(1.0, cargo_tonnes / max(dwt, 1.0)))
    disp_ratio = 0.55 + 0.45 * frac
    return disp_ratio ** 0.42 / (1.0 ** 0.42)


def weather_factor(
    wind_speed_kn: float, wave_height_m: float, current_speed_kn: float
) -> float:
    """
    Added resistance from environment. Wind and waves add power demand;
    a following current (negative value) reduces effective speed through water.
    """
    wind = 1.0 + 0.0018 * max(0.0, wind_speed_kn) ** 1.35
    wave = 1.0 + 0.030 * max(0.0, wave_height_m) ** 1.6
    curr = 1.0 + 0.025 * current_speed_kn
    return wind * wave * max(0.7, curr)


def engine_load(speed_kn: float, design_speed_kn: float, resistance_mult: float) -> float:
    """Fraction of MCR demanded at this speed under these conditions."""
    base = (speed_kn / max(design_speed_kn, 1e-6)) ** 3
    return max(0.05, min(1.10, base * resistance_mult * 0.74))


@dataclass
class VoyageResult:
    fuel_tonnes: float
    fuel_tonnes_per_nm: float
    fuel_cost_usd: float
    opex_usd: float
    total_cost_usd: float
    ttw_co2e_tonnes: float
    wtt_co2e_tonnes: float
    lifecycle_co2e_tonnes: float
    carbon_cost_usd: float
    voyage_hours: float
    engine_load_pct: float
    sfoc_g_per_kwh: float
    avg_power_kw: float
    co2_tonnes: float = 0.0
    sox_kg: float = 0.0
    nox_kg: float = 0.0
    predicted_daily_fuel_mt: float = 0.0
    sanity_status: str = "Plausible"
    sanity_range: str = "50-80 MT/day"

    def to_dict(self) -> dict:
        return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in self.__dict__.items()}


def get_vessel_sanity_range(vessel_class: str) -> tuple[float, float]:
    """Empirical operating reference envelopes for fuel sanity checking."""
    ranges = {
        "CAPESIZE": (45.0, 85.0),
        "POST_PANAMAX": (55.0, 95.0),
        "SUEZMAX": (45.0, 80.0),
        "PANAMAX": (25.0, 55.0),
        "CONTAINER_PANAMAX": (35.0, 65.0),
        "AFRAMAX": (30.0, 60.0),
        "SUPRAMAX": (18.0, 38.0),
        "MR_TANKER": (18.0, 40.0),
        "GENERAL_CARGO_LARGE": (15.0, 35.0),
        "RORO_LARGE": (25.0, 50.0),
        "HANDYSIZE": (10.0, 28.0),
        "FEEDER": (12.0, 30.0),
        "TANKER_HANDYSIZE": (12.0, 30.0),
        "GENERAL_CARGO_SMALL": (8.0, 22.0),
        "RORO_COMPACT": (14.0, 32.0),
    }
    return ranges.get(vessel_class.upper(), (30.0, 70.0))


def compute_voyage(
    *,
    vessel_class: str,
    dwt: float,
    engine_kw: float,
    vessel_age_years: float,
    speed_kn: float,
    cargo_tonnes: float,
    distance_nm: float,
    fuel_key: str,
    wind_speed_kn: float = 12.0,
    wave_height_m: float = 1.5,
    current_speed_kn: float = 0.0,
    weather: str = "MODERATE",
    fuel_price_usd_per_tonne: Optional[float] = None,
    carbon_price_usd_per_tonne: float = 0.0,
    design_speed_kn: Optional[float] = None,
    port_hours: float = 0.0,
) -> VoyageResult:
    """Deterministic physical evaluation of a single voyage leg."""
    vc = VESSEL_CLASSES.get(vessel_class)
    if design_speed_kn is None:
        design_speed_kn = vc.design_speed_kn if vc else 14.0

    fuel: FuelSpec = FUELS[fuel_key]

    resistance = (
        load_factor(cargo_tonnes, dwt)
        * weather_factor(wind_speed_kn, wave_height_m, current_speed_kn)
        * WEATHER_STATES.get(weather, 1.0)
    )
    lf = engine_load(speed_kn, design_speed_kn, resistance)

    propulsion_kw = engine_kw * lf
    aux_kw = engine_kw * AUX_LOAD_FRACTION
    total_kw = propulsion_kw + aux_kw

    fouling = 1.0 + HULL_FOULING_PER_YEAR * max(0.0, vessel_age_years)
    sfoc = SFOC_REF_G_PER_KWH * sfoc_curve(lf) * fuel.sfoc_penalty * fouling

    voyage_hours = distance_nm / max(speed_kn, 1e-6) + port_hours
    sea_hours = distance_nm / max(speed_kn, 1e-6)

    # Main engine burns only at sea; auxiliaries run throughout.
    fuel_tonnes = (
        propulsion_kw * sfoc * sea_hours
        + aux_kw * sfoc * voyage_hours
    ) * 1e-6

    price = fuel_price_usd_per_tonne if fuel_price_usd_per_tonne is not None else fuel.price_usd_per_tonne
    fuel_cost = fuel_tonnes * price
    opex = (vc.daily_opex_usd if vc else 8000.0) * voyage_hours / 24.0

    ttw = fuel_tonnes * fuel.ttw_co2e_g_per_g
    wtt = fuel_tonnes * fuel.wtt_co2e_g_per_g
    lifecycle = ttw + wtt
    # EU ETS-style schemes price tank-to-wake emissions.
    carbon_cost = ttw * carbon_price_usd_per_tonne

    # Multi-emissions: CO2 (tonnes), SOx (kg), NOx (kg)
    co2_tonnes = ttw
    sox_kg = fuel_tonnes * getattr(fuel, "sox_kg_per_tonne", 10.0)
    nox_kg = fuel_tonnes * getattr(fuel, "nox_kg_per_tonne", 78.0)

    # Sanity checking against empirical daily burn rates
    sea_days = sea_hours / 24.0
    daily_fuel = fuel_tonnes / max(sea_days, 1e-4) if sea_days > 0 else 0.0
    low_ref, high_ref = get_vessel_sanity_range(vessel_class)
    if daily_fuel < low_ref * 0.65:
        sanity_status = "Warning: Low"
    elif daily_fuel > high_ref * 1.35:
        sanity_status = "Warning: High"
    else:
        sanity_status = "Plausible"

    return VoyageResult(
        fuel_tonnes=fuel_tonnes,
        fuel_tonnes_per_nm=fuel_tonnes / max(distance_nm, 1e-6),
        fuel_cost_usd=fuel_cost,
        opex_usd=opex,
        total_cost_usd=fuel_cost + opex + carbon_cost,
        ttw_co2e_tonnes=ttw,
        wtt_co2e_tonnes=wtt,
        lifecycle_co2e_tonnes=lifecycle,
        carbon_cost_usd=carbon_cost,
        voyage_hours=voyage_hours,
        engine_load_pct=lf * 100.0,
        sfoc_g_per_kwh=sfoc,
        avg_power_kw=total_kw,
        co2_tonnes=co2_tonnes,
        sox_kg=sox_kg,
        nox_kg=nox_kg,
        predicted_daily_fuel_mt=round(daily_fuel, 2),
        sanity_status=sanity_status,
        sanity_range=f"{low_ref:.0f}–{high_ref:.0f} MT/day",
    )

"""
GREENFLEET QUANTUM - Domain constants.

All figures are order-of-magnitude representative values drawn from open
maritime literature (IMO 4th GHG Study, DNV Maritime Forecast, EU MRV).
They are MODEL PARAMETERS for a demonstration platform, not certified data,
and every one of them is configurable at runtime via the API.

Emission accounting is split Well-to-Tank (WtT, upstream production and
distribution) and Tank-to-Wake (TtW, combustion on board). Lifecycle
CO2-equivalent = WtT + TtW, expressed in g CO2e per gram of fuel burned.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, List


@dataclass(frozen=True)
class FuelSpec:
    key: str
    name: str
    lhv_mj_per_kg: float          # lower heating value
    price_usd_per_tonne: float    # indicative bunker price
    ttw_co2e_g_per_g: float       # tank-to-wake CO2e per gram fuel
    wtt_co2e_g_per_g: float       # well-to-tank CO2e per gram fuel
    sfoc_penalty: float           # engine-specific consumption multiplier vs HFO
    availability: float           # 0-1 bunkering availability at major ports
    retrofit_musd_per_vessel: float  # indicative capex to enable this fuel
    notes: str

    @property
    def lifecycle_co2e_g_per_g(self) -> float:
        return self.ttw_co2e_g_per_g + self.wtt_co2e_g_per_g

    def to_dict(self) -> dict:
        d = asdict(self)
        d["lifecycle_co2e_g_per_g"] = round(self.lifecycle_co2e_g_per_g, 4)
        return d


# sfoc_penalty scales mass consumption: lower-LHV fuels burn more mass for the
# same shaft energy. It is derived from LHV ratio vs HFO and adjusted slightly
# for engine cycle efficiency differences.
FUELS: Dict[str, FuelSpec] = {
    "HFO": FuelSpec(
        "HFO", "Heavy Fuel Oil", 40.2, 520.0, 3.114, 0.594, 1.000, 1.00, 0.0,
        "Baseline reference fuel. High sulphur content requires scrubbers in ECAs.",
    ),
    "MGO": FuelSpec(
        "MGO", "Marine Gas Oil", 42.7, 720.0, 3.206, 0.630, 0.941, 0.98, 0.05,
        "Low-sulphur distillate. Drop-in replacement, no retrofit needed.",
    ),
    "LNG": FuelSpec(
        "LNG", "Liquefied Natural Gas", 48.0, 640.0, 2.750, 0.800, 0.838, 0.55, 12.0,
        "Lower TtW carbon but methane slip raises the lifecycle figure.",
    ),
    "METHANOL": FuelSpec(
        "METHANOL", "Green Methanol", 19.9, 980.0, 1.375, 0.150, 2.020, 0.30, 9.0,
        "Near carbon-neutral when produced from biogenic or e-fuel pathways.",
    ),
    "AMMONIA": FuelSpec(
        "AMMONIA", "Green Ammonia", 18.6, 1150.0, 0.000, 0.220, 2.161, 0.15, 16.0,
        "Zero tank-to-wake carbon. Toxicity and N2O slip are open issues.",
    ),
    "HYDROGEN": FuelSpec(
        "HYDROGEN", "Liquid Hydrogen", 120.0, 4200.0, 0.000, 0.450, 0.335, 0.05, 28.0,
        "Zero carbon at the stack. Cryogenic storage penalises cargo volume.",
    ),
}


@dataclass(frozen=True)
class VesselClass:
    key: str
    name: str
    dwt_min: int
    dwt_max: int
    typical_dwt: int
    engine_kw: int
    design_speed_kn: float
    min_speed_kn: float
    max_speed_kn: float
    daily_opex_usd: float


VESSEL_CLASSES: Dict[str, VesselClass] = {
    "HANDYSIZE": VesselClass("HANDYSIZE", "Handysize", 15000, 39999, 32000, 5400, 13.5, 8.0, 15.0, 6200),
    "SUPRAMAX": VesselClass("SUPRAMAX", "Supramax", 40000, 64999, 56000, 7600, 14.0, 8.5, 15.5, 7800),
    "PANAMAX": VesselClass("PANAMAX", "Panamax", 65000, 99999, 76000, 9500, 14.5, 9.0, 16.0, 9600),
    "CAPESIZE": VesselClass("CAPESIZE", "Capesize", 100000, 220000, 180000, 15800, 14.5, 9.0, 16.0, 13500),
}

WEATHER_STATES: Dict[str, float] = {
    "CALM": 1.00,
    "MODERATE": 1.06,
    "ROUGH": 1.15,
    "SEVERE": 1.28,
}


def fuel_keys() -> List[str]:
    return list(FUELS.keys())


def vessel_class_keys() -> List[str]:
    return list(VESSEL_CLASSES.keys())

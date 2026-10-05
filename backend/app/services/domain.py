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
    sox_kg_per_tonne: float = 10.0   # kg SOx emitted per tonne of fuel burned (IMO 2020 0.5% S baseline)
    nox_kg_per_tonne: float = 78.0   # kg NOx emitted per tonne of fuel burned (IMO Tier II baseline)

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
# Multi-emission factors documented from IMO 4th GHG Study & MARPOL Annex VI:
# SOx [kg/t] = 2000 * S_fraction; NOx [kg/t] based on marine 2-stroke Tier II/III.
FUELS: Dict[str, FuelSpec] = {
    "HFO": FuelSpec(
        "HFO", "Heavy Fuel Oil", 40.2, 520.0, 3.114, 0.594, 1.000, 1.00, 0.0,
        "Baseline reference fuel. High sulphur content requires scrubbers in ECAs.",
        sox_kg_per_tonne=10.0,  # 0.50% S VLSFO standard (20.0 for 1.0% or 10.0 for 0.5%)
        nox_kg_per_tonne=78.0,  # Tier II marine diesel combustion
    ),
    "MGO": FuelSpec(
        "MGO", "Marine Gas Oil", 42.7, 720.0, 3.206, 0.630, 0.941, 0.98, 0.05,
        "Low-sulphur distillate. Drop-in replacement, no retrofit needed.",
        sox_kg_per_tonne=2.0,   # 0.10% S ECA-compliant distillate
        nox_kg_per_tonne=72.0,  # Tier II distillate combustion
    ),
    "LNG": FuelSpec(
        "LNG", "Liquefied Natural Gas", 48.0, 640.0, 2.750, 0.800, 0.838, 0.55, 12.0,
        "Lower TtW carbon but methane slip raises the lifecycle figure.",
        sox_kg_per_tonne=0.02,  # Trace sulfur in LNG
        nox_kg_per_tonne=15.0,  # ~80% NOx reduction in dual-fuel Otto cycle
    ),
    "METHANOL": FuelSpec(
        "METHANOL", "Green Methanol", 19.9, 980.0, 1.375, 0.150, 2.020, 0.30, 9.0,
        "Near carbon-neutral when produced from biogenic or e-fuel pathways.",
        sox_kg_per_tonne=0.0,   # Sulfur-free alcohol fuel
        nox_kg_per_tonne=20.0,  # Low-temperature combustion reduces NOx
    ),
    "AMMONIA": FuelSpec(
        "AMMONIA", "Green Ammonia", 18.6, 1150.0, 0.000, 0.220, 2.161, 0.15, 16.0,
        "Zero tank-to-wake carbon. Toxicity and N2O slip are open issues.",
        sox_kg_per_tonne=0.0,   # Zero sulfur
        nox_kg_per_tonne=18.0,  # Controlled SCR combustion
    ),
    "HYDROGEN": FuelSpec(
        "HYDROGEN", "Liquid Hydrogen", 120.0, 4200.0, 0.000, 0.450, 0.335, 0.05, 28.0,
        "Zero carbon at the stack. Cryogenic storage penalises cargo volume.",
        sox_kg_per_tonne=0.0,   # Zero sulfur
        nox_kg_per_tonne=0.0,   # Fuel cell / clean combustion
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
    vessel_type: str = "Bulk Carrier"
    size_class: str = ""

    def __post_init__(self):
        if not self.size_class:
            object.__setattr__(self, "size_class", self.name)


# Heterogeneous vessel classes categorised properly by vessel type and size class.
# Preserves all 4 original bulk carrier keys (HANDYSIZE, SUPRAMAX, PANAMAX, CAPESIZE)
# for strict 100% backward compatibility.
VESSEL_CLASSES: Dict[str, VesselClass] = {
    # Bulk Carriers
    "HANDYSIZE": VesselClass("HANDYSIZE", "Handysize", 15000, 39999, 32000, 5400, 13.5, 8.0, 15.0, 6200, vessel_type="Bulk Carrier", size_class="Handysize"),
    "SUPRAMAX": VesselClass("SUPRAMAX", "Supramax", 40000, 64999, 56000, 7600, 14.0, 8.5, 15.5, 7800, vessel_type="Bulk Carrier", size_class="Supramax"),
    "PANAMAX": VesselClass("PANAMAX", "Panamax", 65000, 99999, 76000, 9500, 14.5, 9.0, 16.0, 9600, vessel_type="Bulk Carrier", size_class="Panamax"),
    "CAPESIZE": VesselClass("CAPESIZE", "Capesize", 100000, 220000, 180000, 15800, 14.5, 9.0, 16.0, 13500, vessel_type="Bulk Carrier", size_class="Capesize"),

    # Container Ships
    "FEEDER": VesselClass("FEEDER", "Feeder", 8000, 24999, 16000, 7200, 16.0, 10.0, 19.0, 8500, vessel_type="Container Ship", size_class="Feeder"),
    "CONTAINER_PANAMAX": VesselClass("CONTAINER_PANAMAX", "Panamax Container", 25000, 64999, 45000, 18000, 19.5, 12.0, 22.5, 14000, vessel_type="Container Ship", size_class="Panamax"),
    "POST_PANAMAX": VesselClass("POST_PANAMAX", "Post-Panamax", 65000, 150000, 110000, 38000, 21.0, 13.0, 24.5, 21000, vessel_type="Container Ship", size_class="Post-Panamax"),

    # Oil Tankers
    "TANKER_HANDYSIZE": VesselClass("TANKER_HANDYSIZE", "Handysize Tanker", 15000, 39999, 30000, 6200, 13.5, 8.0, 15.0, 7400, vessel_type="Oil Tanker", size_class="Handysize"),
    "MR_TANKER": VesselClass("MR_TANKER", "MR Tanker", 40000, 54999, 48000, 8500, 14.0, 8.5, 15.5, 8900, vessel_type="Oil Tanker", size_class="MR"),
    "AFRAMAX": VesselClass("AFRAMAX", "Aframax", 80000, 119999, 105000, 13000, 14.5, 9.0, 16.0, 12800, vessel_type="Oil Tanker", size_class="Aframax"),
    "SUEZMAX": VesselClass("SUEZMAX", "Suezmax", 120000, 199999, 155000, 16500, 15.0, 9.5, 16.5, 15200, vessel_type="Oil Tanker", size_class="Suezmax"),

    # General Cargo
    "GENERAL_CARGO_SMALL": VesselClass("GENERAL_CARGO_SMALL", "General Cargo Handysize", 5000, 19999, 12000, 4200, 12.5, 7.5, 14.0, 5200, vessel_type="General Cargo", size_class="Handysize"),
    "GENERAL_CARGO_LARGE": VesselClass("GENERAL_CARGO_LARGE", "General Cargo Multi-Purpose", 20000, 45000, 30000, 6800, 13.5, 8.0, 15.0, 7100, vessel_type="General Cargo", size_class="Supramax"),

    # Ro-Ro
    "RORO_COMPACT": VesselClass("RORO_COMPACT", "Ro-Ro Feeder", 6000, 19999, 14000, 9200, 17.0, 11.0, 20.0, 9800, vessel_type="Ro-Ro", size_class="Feeder"),
    "RORO_LARGE": VesselClass("RORO_LARGE", "Deep-sea Ro-Ro / PCTC", 20000, 45000, 32000, 15500, 18.5, 12.0, 21.0, 16500, vessel_type="Ro-Ro", size_class="Panamax"),
}

VESSEL_TYPES = [
    "Bulk Carrier",
    "Container Ship",
    "Oil Tanker",
    "General Cargo",
    "Ro-Ro",
]

VESSEL_TYPE_SIZE_CLASSES = {
    "Bulk Carrier": ["Handysize", "Supramax", "Panamax", "Capesize"],
    "Container Ship": ["Feeder", "Panamax", "Post-Panamax"],
    "Oil Tanker": ["Handysize", "MR", "Aframax", "Suezmax"],
    "General Cargo": ["Handysize", "Supramax"],
    "Ro-Ro": ["Feeder", "Panamax"],
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


def vessel_types() -> List[str]:
    return list(VESSEL_TYPES)


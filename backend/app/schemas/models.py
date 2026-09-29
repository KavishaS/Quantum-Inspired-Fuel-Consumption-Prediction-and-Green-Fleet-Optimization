"""Pydantic v2 schemas. Validation lives here so routes stay thin."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..services.domain import FUELS, VESSEL_CLASSES, WEATHER_STATES

FUEL_KEYS = set(FUELS)
CLASS_KEYS = set(VESSEL_CLASSES)
WEATHER_KEYS = set(WEATHER_STATES)
ALGOS = {"QGA", "QPSO", "GA", "PSO", "GREEDY"}


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vessel_class: str = Field(..., description="HANDYSIZE | SUPRAMAX | PANAMAX | CAPESIZE")
    dwt: float = Field(..., gt=0, le=500_000)
    engine_kw: Optional[float] = Field(None, gt=0, le=120_000)
    vessel_age_years: float = Field(8.0, ge=0, le=60)
    speed_kn: float = Field(..., gt=0, le=30)
    cargo_tonnes: float = Field(..., ge=0)
    distance_nm: float = Field(..., gt=0, le=30_000)
    route: str = "TUBARAO-ROTTERDAM"
    port_hours: float = Field(36.0, ge=0, le=720)
    fuel_type: str = "HFO"
    weather: str = "MODERATE"
    wind_speed_kn: float = Field(14.0, ge=0, le=80)
    wave_height_m: float = Field(1.8, ge=0, le=20)
    current_speed_kn: float = Field(0.0, ge=-6, le=6)
    fuel_price_usd_per_tonne: Optional[float] = Field(None, gt=0)
    carbon_price_usd_per_tonne: float = Field(85.0, ge=0, le=1000)

    @field_validator("vessel_class")
    @classmethod
    def _cls(cls, v: str) -> str:
        u = v.upper()
        if u not in CLASS_KEYS:
            raise ValueError(f"vessel_class must be one of {sorted(CLASS_KEYS)}")
        return u

    @field_validator("fuel_type")
    @classmethod
    def _fuel(cls, v: str) -> str:
        u = v.upper()
        if u not in FUEL_KEYS:
            raise ValueError(f"fuel_type must be one of {sorted(FUEL_KEYS)}")
        return u

    @field_validator("weather")
    @classmethod
    def _weather(cls, v: str) -> str:
        u = v.upper()
        if u not in WEATHER_KEYS:
            raise ValueError(f"weather must be one of {sorted(WEATHER_KEYS)}")
        return u

    @model_validator(mode="after")
    def _cargo_fits(self) -> "PredictionRequest":
        if self.cargo_tonnes > self.dwt:
            raise ValueError(
                f"cargo_tonnes ({self.cargo_tonnes:,.0f}) exceeds vessel deadweight "
                f"({self.dwt:,.0f}). A vessel cannot carry more than its DWT.")
        vc = VESSEL_CLASSES[self.vessel_class]
        if not (vc.min_speed_kn - 2 <= self.speed_kn <= vc.max_speed_kn + 2):
            raise ValueError(
                f"speed_kn {self.speed_kn} is far outside the operating envelope for "
                f"{vc.name} ({vc.min_speed_kn}-{vc.max_speed_kn} kn).")
        return self


class ObjectiveWeightsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fuel: float = Field(0.35, ge=0, le=1)
    cost: float = Field(0.25, ge=0, le=1)
    emission: float = Field(0.30, ge=0, le=1)
    reliability: float = Field(0.10, ge=0, le=1)

    @model_validator(mode="after")
    def _nonzero(self) -> "ObjectiveWeightsIn":
        if self.fuel + self.cost + self.emission + self.reliability <= 0:
            raise ValueError("At least one objective weight must be greater than zero.")
        return self


class VesselIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str = ""
    vessel_class: str
    dwt: float = Field(..., gt=0)
    engine_kw: float = Field(..., gt=0)
    age_years: float = Field(5.0, ge=0, le=60)
    min_speed_kn: float = Field(9.0, gt=0)
    max_speed_kn: float = Field(15.5, gt=0)
    allowed_fuels: List[str] = Field(default_factory=lambda: ["HFO", "MGO"])
    available: bool = True

    @model_validator(mode="after")
    def _check(self) -> "VesselIn":
        if self.min_speed_kn >= self.max_speed_kn:
            raise ValueError(f"Vessel {self.id}: min_speed_kn must be below max_speed_kn.")
        bad = [f for f in self.allowed_fuels if f.upper() not in FUEL_KEYS]
        if bad:
            raise ValueError(f"Vessel {self.id}: unsupported fuel(s) {bad}.")
        self.allowed_fuels = [f.upper() for f in self.allowed_fuels] or ["HFO"]
        if self.vessel_class.upper() not in CLASS_KEYS:
            raise ValueError(f"Vessel {self.id}: unknown vessel_class {self.vessel_class}.")
        self.vessel_class = self.vessel_class.upper()
        return self


class RouteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str = ""
    distance_nm: float = Field(..., gt=0, le=30_000)
    cargo_demand_tonnes: float = Field(..., ge=0)
    deadline_hours: float = Field(500.0, gt=0)
    wind_speed_kn: float = Field(14.0, ge=0, le=80)
    wave_height_m: float = Field(1.8, ge=0, le=20)
    current_speed_kn: float = Field(0.0, ge=-6, le=6)
    weather: str = "MODERATE"
    port_hours: float = Field(36.0, ge=0, le=720)


class EconomicsIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    fuel_prices: Dict[str, float] = Field(default_factory=dict)
    carbon_price_usd_per_tonne: float = Field(85.0, ge=0, le=2000)
    max_lifecycle_emissions_tonnes: Optional[float] = Field(None, gt=0)
    emission_target_tonnes: Optional[float] = Field(None, gt=0)
    max_total_cost_usd: Optional[float] = Field(None, gt=0)
    max_delay_hours: float = Field(24.0, ge=0, le=1000)


class ScenarioPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    vessels: List[VesselIn] = Field(..., min_length=1)
    routes: List[RouteIn] = Field(..., min_length=1)
    economics: EconomicsIn = Field(default_factory=EconomicsIn)
    weights: ObjectiveWeightsIn = Field(default_factory=ObjectiveWeightsIn)

    @model_validator(mode="after")
    def _capacity_is_sufficient(self) -> "ScenarioPayload":
        capacity = sum(v.dwt for v in self.vessels if v.available)
        demand = sum(r.cargo_demand_tonnes for r in self.routes)
        if capacity <= 0:
            raise ValueError("No available vessel capacity in this scenario.")
        if demand > capacity * 3:
            raise ValueError(
                f"Cargo demand ({demand:,.0f} t) exceeds three times total available "
                f"deadweight ({capacity:,.0f} t). No feasible plan exists; add vessels "
                f"or reduce demand.")
        return self


class OptimizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: Optional[int] = None
    scenario: Optional[ScenarioPayload] = None
    algorithm: str = "QGA"
    population_size: int = Field(30, ge=4, le=300)
    iterations: int = Field(100, ge=5, le=2000)
    seed: int = Field(42, ge=0)
    refine_speeds: bool = True
    weights: Optional[ObjectiveWeightsIn] = None
    async_run: bool = False

    @field_validator("algorithm")
    @classmethod
    def _algo(cls, v: str) -> str:
        u = v.upper()
        if u not in ALGOS:
            raise ValueError(f"algorithm must be one of {sorted(ALGOS)}")
        return u

    @model_validator(mode="after")
    def _source(self) -> "OptimizeRequest":
        if self.scenario_id is None and self.scenario is None:
            raise ValueError("Provide either scenario_id or an inline scenario payload.")
        return self


class BenchmarkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: Optional[int] = None
    scenario: Optional[ScenarioPayload] = None
    runs: int = Field(5, ge=1, le=50)
    population_size: int = Field(24, ge=4, le=200)
    iterations: int = Field(60, ge=5, le=1000)
    algorithms: List[str] = Field(default_factory=lambda: ["QGA", "GA", "QPSO", "PSO", "GREEDY"])

    @field_validator("algorithms")
    @classmethod
    def _algos(cls, v: List[str]) -> List[str]:
        out = [a.upper() for a in v]
        bad = [a for a in out if a not in ALGOS]
        if bad:
            raise ValueError(f"Unsupported algorithm(s): {bad}")
        return out


class ParetoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: Optional[int] = None
    scenario: Optional[ScenarioPayload] = None
    samples: int = Field(9, ge=3, le=31)
    population_size: int = Field(20, ge=4, le=200)
    iterations: int = Field(40, ge=5, le=500)
    min_cargo_fulfilment_pct: float = Field(0.0, ge=0, le=100)
    max_emissions_tonnes: Optional[float] = Field(None, gt=0)
    max_cost_usd: Optional[float] = Field(None, gt=0)


class FuelSandboxRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vessel_class: str = "PANAMAX"
    dwt: Optional[float] = Field(None, gt=0)
    speed_kn: Optional[float] = Field(None, gt=0, le=30)
    cargo_tonnes: Optional[float] = Field(None, ge=0)
    distance_nm: float = Field(5000.0, gt=0, le=30_000)
    annual_operating_hours: float = Field(6000.0, gt=0, le=8760)
    carbon_price_usd_per_tonne: float = Field(85.0, ge=0, le=2000)
    fuel_prices: Dict[str, float] = Field(default_factory=dict)
    incumbent: str = "HFO"
    horizon_years: int = Field(10, ge=1, le=30)
    weather: str = "MODERATE"

    @field_validator("vessel_class")
    @classmethod
    def _cls(cls, v: str) -> str:
        u = v.upper()
        if u not in CLASS_KEYS:
            raise ValueError(f"vessel_class must be one of {sorted(CLASS_KEYS)}")
        return u

    @field_validator("incumbent")
    @classmethod
    def _inc(cls, v: str) -> str:
        u = v.upper()
        if u not in FUEL_KEYS:
            raise ValueError(f"incumbent must be one of {sorted(FUEL_KEYS)}")
        return u


class ComplianceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: Optional[int] = None
    total_lifecycle_co2e_tonnes: Optional[float] = Field(None, ge=0)
    total_ttw_co2e_tonnes: Optional[float] = Field(None, ge=0)
    transport_work_tonne_nm: Optional[float] = Field(None, gt=0)
    baseline_intensity_g_per_tnm: float = Field(7.8, gt=0)
    carbon_price_usd_per_tonne: float = Field(85.0, ge=0, le=2000)
    ets_year: int = Field(2026, ge=2020, le=2060)
    ets_phase_in: Optional[float] = Field(None, ge=0, le=1)
    eu_voyage_coverage: float = Field(0.5, ge=0, le=1)


class ScenarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""
    tag: str = "custom"
    payload: ScenarioPayload


class VesselCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vessel_code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    vessel_class: str
    dwt: float = Field(..., gt=0, le=500_000)
    engine_kw: float = Field(..., gt=0, le=120_000)
    age_years: float = Field(5.0, ge=0, le=60)
    min_speed_kn: float = Field(9.0, gt=0, le=30)
    max_speed_kn: float = Field(15.5, gt=0, le=30)
    allowed_fuels: List[str] = Field(default_factory=lambda: ["HFO", "MGO"])
    status: str = "available"
    available: bool = True

    @model_validator(mode="after")
    def _check(self) -> "VesselCreate":
        if self.vessel_class.upper() not in CLASS_KEYS:
            raise ValueError(f"vessel_class must be one of {sorted(CLASS_KEYS)}")
        self.vessel_class = self.vessel_class.upper()
        if self.min_speed_kn >= self.max_speed_kn:
            raise ValueError("min_speed_kn must be below max_speed_kn.")
        bad = [f for f in self.allowed_fuels if f.upper() not in FUEL_KEYS]
        if bad:
            raise ValueError(f"Unsupported fuel(s): {bad}")
        self.allowed_fuels = [f.upper() for f in self.allowed_fuels]
        return self


class ReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: Optional[int] = None
    scenario_id: Optional[int] = None
    include_benchmark: bool = True
    include_pareto: bool = True
    include_fuel_sandbox: bool = True
    benchmark_runs: int = Field(3, ge=1, le=20)
    pareto_samples: int = Field(7, ge=3, le=21)

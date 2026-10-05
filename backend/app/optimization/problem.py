"""
Green fleet deployment problem.

DECISION STRUCTURE
------------------
For each available vessel v the platform decides:

  discrete   route(v) in {IDLE, r1..rR}   which route to deploy on
  discrete   fuel(v)  in {compatible fuels of v}
  continuous speed(v) in [v_min, v_max]

The discrete block is the natural domain of QGA; the continuous block is the
natural domain of QPSO. The production Fleet Optimizer runs them as a hybrid
(QGA for assignment, QPSO to refine speeds on the winning assignment). The
benchmarking module instead holds one block fixed so QGA can be compared
against a standard GA, and QPSO against a standard PSO, on identical inputs.

FITNESS
-------
Objectives are min-max normalised against a reference baseline so that the
user-supplied weights are dimensionless and comparable:

    f = w_fuel*F~ + w_cost*C~ + w_emis*E~ + w_rel*(1 - R~) + penalty

Constraint handling is a static penalty on normalised violation, which keeps
infeasible-but-near solutions in the population (useful on tightly
constrained scenarios) while guaranteeing any feasible solution outranks any
infeasible one when PENALTY_BASE is large relative to the objective range.

Lower fitness is better throughout.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from ..services.domain import FUELS, VESSEL_CLASSES
from ..services.physics import compute_voyage

# Per-constraint penalty weights. Cargo commitments and emission ceilings are
# contractual/regulatory, so they carry far more weight than soft preferences:
# a 1% cargo shortfall must cost more than any objective gain it could buy.
PENALTY_WEIGHTS = {
    "cargo_shortfall": 50.0,
    "emission_cap": 25.0,
    "cost_cap": 25.0,
    "schedule": 8.0,
    "contract_penalty": 15.0,
    "no_deployment": 100.0,
}
PENALTY_DEFAULT = 10.0
IDLE = 0


@dataclass
class Vessel:
    id: str
    name: str
    vessel_class: str
    dwt: float
    engine_kw: float
    age_years: float
    min_speed_kn: float
    max_speed_kn: float
    allowed_fuels: List[str]
    available: bool = True
    vessel_type: str = "Bulk Carrier"
    size_class: str = ""

    @staticmethod
    def from_class(idx: int, cls: str, dwt: Optional[float] = None,
                   allowed: Optional[List[str]] = None) -> "Vessel":
        vc = VESSEL_CLASSES[cls]
        d = dwt if dwt is not None else float(vc.typical_dwt)
        return Vessel(
            id=f"V{idx:03d}", name=f"{vc.name} {idx:03d}", vessel_class=cls,
            dwt=d, engine_kw=vc.engine_kw * (d / vc.typical_dwt) ** 0.62,
            age_years=float(3 + (idx * 7) % 18),
            min_speed_kn=vc.min_speed_kn, max_speed_kn=vc.max_speed_kn,
            allowed_fuels=allowed or ["HFO", "MGO", "LNG"],
            vessel_type=getattr(vc, "vessel_type", "Bulk Carrier"),
            size_class=getattr(vc, "size_class", vc.name),
        )


@dataclass
class RouteDemand:
    id: str
    name: str
    distance_nm: float
    cargo_demand_tonnes: float
    deadline_hours: float
    wind_speed_kn: float = 14.0
    wave_height_m: float = 1.8
    current_speed_kn: float = 0.0
    weather: str = "MODERATE"
    port_hours: float = 36.0
    contract_id: Optional[str] = None
    customer: Optional[str] = None
    cargo_type: str = "dry bulk"
    penalty_per_day: float = 25000.0
    laycan_start: Optional[str] = None
    laycan_end: Optional[str] = None


@dataclass
class EconomicParams:
    fuel_prices: Dict[str, float] = field(default_factory=dict)
    carbon_price_usd_per_tonne: float = 85.0
    max_lifecycle_emissions_tonnes: Optional[float] = None
    emission_target_tonnes: Optional[float] = None
    max_total_cost_usd: Optional[float] = None
    max_delay_hours: float = 24.0

    def price(self, fuel_key: str) -> float:
        return float(self.fuel_prices.get(fuel_key, FUELS[fuel_key].price_usd_per_tonne))


@dataclass
class ObjectiveWeights:
    fuel: float = 0.35
    cost: float = 0.25
    emission: float = 0.30
    reliability: float = 0.10

    def normalised(self) -> "ObjectiveWeights":
        t = self.fuel + self.cost + self.emission + self.reliability
        if t <= 0:
            return ObjectiveWeights()
        return ObjectiveWeights(self.fuel / t, self.cost / t, self.emission / t, self.reliability / t)


@dataclass
class Evaluation:
    fitness: float
    total_fuel_tonnes: float
    total_cost_usd: float
    total_lifecycle_co2e_tonnes: float
    total_ttw_co2e_tonnes: float
    cargo_fulfilment_pct: float
    schedule_reliability_pct: float
    violations: Dict[str, float]
    n_violations: int
    feasible: bool
    assignments: List[Dict[str, Any]]
    total_co2_tonnes: float = 0.0
    total_sox_kg: float = 0.0
    total_nox_kg: float = 0.0
    total_delay_hours: float = 0.0
    total_contract_penalty_usd: float = 0.0

    def summary(self) -> dict:
        d = {k: v for k, v in self.__dict__.items() if k != "assignments"}
        d = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in d.items()}
        return d


class FleetProblem:
    """Encodes, decodes and scores candidate fleet deployment plans."""

    def __init__(
        self,
        vessels: Sequence[Vessel],
        routes: Sequence[RouteDemand],
        economics: Optional[EconomicParams] = None,
        weights: Optional[ObjectiveWeights] = None,
    ):
        self.vessels = [v for v in vessels if v.available]
        self.routes = list(routes)
        self.econ = economics or EconomicParams()
        self.weights = (weights or ObjectiveWeights()).normalised()

        self.n_vessels = len(self.vessels)
        self.n_routes = len(self.routes)
        # Gene cardinalities: route gene has R+1 options (incl. IDLE)
        self.route_card = self.n_routes + 1
        self.fuel_options: List[List[str]] = [v.allowed_fuels for v in self.vessels]
        self.fuel_card = max(len(f) for f in self.fuel_options) if self.vessels else 1

        self._ref: Optional[Dict[str, float]] = None
        self._cache: Dict[Tuple, Evaluation] = {}

    # ---------------------------------------------------------------- encoding

    @property
    def discrete_dims(self) -> List[int]:
        """Cardinality of each discrete gene: [route, fuel] per vessel."""
        dims: List[int] = []
        for i in range(self.n_vessels):
            dims.append(self.route_card)
            dims.append(len(self.fuel_options[i]))
        return dims

    @property
    def continuous_bounds(self) -> List[Tuple[float, float]]:
        return [(v.min_speed_kn, v.max_speed_kn) for v in self.vessels]

    def default_speeds(self) -> np.ndarray:
        """Economic speed heuristic: 92% of design speed."""
        return np.array([
            min(v.max_speed_kn, VESSEL_CLASSES[v.vessel_class].design_speed_kn * 0.92)
            for v in self.vessels
        ], dtype=float)

    def random_discrete(self, rng: np.random.Generator) -> np.ndarray:
        return np.array([rng.integers(0, d) for d in self.discrete_dims], dtype=int)

    # -------------------------------------------------------------- evaluation

    def evaluate(
        self, discrete: Sequence[int], speeds: Optional[Sequence[float]] = None
    ) -> Evaluation:
        d = np.asarray(discrete, dtype=int)
        sp = np.asarray(self.default_speeds() if speeds is None else speeds, dtype=float)

        key = (tuple(d.tolist()), tuple(np.round(sp, 3).tolist()))
        hit = self._cache.get(key)
        if hit is not None:
            return hit

        total_fuel = total_cost = total_life = total_ttw = 0.0
        total_co2 = total_sox = total_nox = 0.0
        total_contract_penalty = 0.0
        delivered = np.zeros(self.n_routes)
        late_hours = 0.0
        deployed = 0
        assignments: List[Dict[str, Any]] = []

        for i, v in enumerate(self.vessels):
            r_gene = int(d[2 * i]) % self.route_card
            v_type = getattr(v, "vessel_type", "Bulk Carrier")
            s_class = getattr(v, "size_class", v.vessel_class.title())
            if r_gene == IDLE:
                assignments.append({
                    "vessel_id": v.id, "vessel_name": v.name, "vessel_class": v.vessel_class,
                    "vessel_type": v_type, "size_class": s_class,
                    "route": "IDLE", "status": "idle", "cargo_tonnes": 0.0, "speed_kn": 0.0,
                    "fuel_type": None, "fuel_tonnes": 0.0, "fuel_cost_usd": 0.0,
                    "total_cost_usd": 0.0, "lifecycle_co2e_tonnes": 0.0,
                    "co2_tonnes": 0.0, "sox_kg": 0.0, "nox_kg": 0.0,
                    "voyage_hours": 0.0, "eta_hours": 0.0, "utilisation_pct": 0.0,
                    "on_time": True, "delay_hours": 0.0, "delay_days": 0.0,
                    "contract_penalty_usd": 0.0, "contract_status": "IDLE",
                })
                continue

            route = self.routes[r_gene - 1]
            opts = self.fuel_options[i]
            fuel = opts[int(d[2 * i + 1]) % len(opts)]

            remaining = max(0.0, route.cargo_demand_tonnes - delivered[r_gene - 1])
            cargo = float(min(v.dwt, remaining)) if remaining > 0 else 0.0
            # A vessel sent to a satisfied route still sails (and still costs);
            # the optimiser is expected to learn to idle it instead.
            speed = float(np.clip(sp[i], v.min_speed_kn, v.max_speed_kn))

            r = compute_voyage(
                vessel_class=v.vessel_class, dwt=v.dwt, engine_kw=v.engine_kw,
                vessel_age_years=v.age_years, speed_kn=speed, cargo_tonnes=cargo,
                distance_nm=route.distance_nm, fuel_key=fuel,
                wind_speed_kn=route.wind_speed_kn, wave_height_m=route.wave_height_m,
                current_speed_kn=route.current_speed_kn, weather=route.weather,
                fuel_price_usd_per_tonne=self.econ.price(fuel),
                carbon_price_usd_per_tonne=self.econ.carbon_price_usd_per_tonne,
                port_hours=route.port_hours,
            )

            delivered[r_gene - 1] += cargo
            total_fuel += r.fuel_tonnes
            total_cost += r.total_cost_usd
            total_life += r.lifecycle_co2e_tonnes
            total_ttw += r.ttw_co2e_tonnes
            total_co2 += r.co2_tonnes
            total_sox += r.sox_kg
            total_nox += r.nox_kg
            deployed += 1
            delay = max(0.0, r.voyage_hours - route.deadline_hours)
            late_hours += delay
            delay_days = delay / 24.0
            penalty_rate = getattr(route, "penalty_per_day", 25000.0)
            contract_penalty = delay_days * penalty_rate
            total_contract_penalty += contract_penalty

            assignments.append({
                "vessel_id": v.id, "vessel_name": v.name, "vessel_class": v.vessel_class,
                "vessel_type": v_type, "size_class": s_class,
                "route": route.name, "status": "deployed",
                "cargo_tonnes": round(cargo, 1), "speed_kn": round(speed, 2),
                "fuel_type": fuel, "fuel_tonnes": round(r.fuel_tonnes, 2),
                "fuel_cost_usd": round(r.fuel_cost_usd, 2),
                "total_cost_usd": round(r.total_cost_usd, 2),
                "lifecycle_co2e_tonnes": round(r.lifecycle_co2e_tonnes, 2),
                "co2_tonnes": round(r.co2_tonnes, 2),
                "sox_kg": round(r.sox_kg, 2),
                "nox_kg": round(r.nox_kg, 2),
                "engine_load_pct": round(r.engine_load_pct, 1),
                "voyage_hours": round(r.voyage_hours, 1),
                "eta_hours": round(r.voyage_hours, 1),
                "utilisation_pct": round(100.0 * cargo / v.dwt, 1),
                "on_time": delay <= self.econ.max_delay_hours,
                "delay_hours": round(delay, 1),
                "delay_days": round(delay_days, 2),
                "contract_penalty_usd": round(contract_penalty, 2),
                "contract_status": "On-Time" if delay <= 0.05 else f"Delayed {delay_days:.1f}d",
            })

        demand = np.array([r.cargo_demand_tonnes for r in self.routes], dtype=float)
        fulfil = float(np.sum(np.minimum(delivered, demand)) / max(np.sum(demand), 1e-6))
        n_legs = max(deployed, 1)
        on_time = sum(1 for a in assignments if a["status"] == "deployed" and a["on_time"])
        reliability = on_time / n_legs

        viol: Dict[str, float] = {}
        shortfall = float(np.sum(np.maximum(0.0, demand - delivered)) / max(np.sum(demand), 1e-6))
        if shortfall > 1e-9:
            viol["cargo_shortfall"] = shortfall
        if reliability < 1.0:
            viol["schedule"] = 1.0 - reliability
        cap = self.econ.max_lifecycle_emissions_tonnes
        if cap and total_life > cap:
            viol["emission_cap"] = (total_life - cap) / cap
        cmax = self.econ.max_total_cost_usd
        if cmax and total_cost > cmax:
            viol["cost_cap"] = (total_cost - cmax) / cmax
        if deployed == 0:
            viol["no_deployment"] = 1.0

        ref = self._reference()
        if total_contract_penalty > 0:
            viol["contract_penalty"] = total_contract_penalty / max(ref["cost"], 10000.0)

        w = self.weights
        f = (
            w.fuel * total_fuel / ref["fuel"]
            + w.cost * total_cost / ref["cost"]
            + w.emission * total_life / ref["emission"]
            + w.reliability * (1.0 - reliability)
        )
        # Quadratic-plus-linear: small violations are discouraged, large ones
        # are effectively prohibited.
        penalty = sum(
            PENALTY_WEIGHTS.get(k, PENALTY_DEFAULT) * (v + v ** 2)
            for k, v in viol.items()
        )

        ev = Evaluation(
            fitness=float(f + penalty),
            total_fuel_tonnes=total_fuel,
            total_cost_usd=total_cost,
            total_lifecycle_co2e_tonnes=total_life,
            total_ttw_co2e_tonnes=total_ttw,
            cargo_fulfilment_pct=100.0 * fulfil,
            schedule_reliability_pct=100.0 * reliability,
            violations={k: round(v, 5) for k, v in viol.items()},
            n_violations=len(viol),
            feasible=len(viol) == 0,
            assignments=assignments,
            total_co2_tonnes=total_co2,
            total_sox_kg=total_sox,
            total_nox_kg=total_nox,
            total_delay_hours=late_hours,
            total_contract_penalty_usd=total_contract_penalty,
        )
        if len(self._cache) < 200_000:
            self._cache[key] = ev
        return ev

    def _reference(self) -> Dict[str, float]:
        """
        Normalisation reference: every route served by the largest compatible
        vessel on HFO at design speed. Computed once, deterministic, and used
        only to scale objectives into comparable units.
        """
        if self._ref is not None:
            return self._ref
        fuel = cost = emis = 0.0
        if self.vessels:
            big = max(self.vessels, key=lambda v: v.dwt)
            for route in self.routes:
                trips = max(1.0, route.cargo_demand_tonnes / big.dwt)
                r = compute_voyage(
                    vessel_class=big.vessel_class, dwt=big.dwt, engine_kw=big.engine_kw,
                    vessel_age_years=big.age_years,
                    speed_kn=VESSEL_CLASSES[big.vessel_class].design_speed_kn,
                    cargo_tonnes=big.dwt, distance_nm=route.distance_nm, fuel_key="HFO",
                    wind_speed_kn=route.wind_speed_kn, wave_height_m=route.wave_height_m,
                    weather=route.weather, port_hours=route.port_hours,
                    fuel_price_usd_per_tonne=self.econ.price("HFO"),
                    carbon_price_usd_per_tonne=self.econ.carbon_price_usd_per_tonne,
                )
                fuel += r.fuel_tonnes * trips
                cost += r.total_cost_usd * trips
                emis += r.lifecycle_co2e_tonnes * trips
        self._ref = {
            "fuel": max(fuel, 1.0), "cost": max(cost, 1.0), "emission": max(emis, 1.0),
        }
        return self._ref

    # ------------------------------------------------------------- convenience

    def objective_vector(self, ev: Evaluation) -> Tuple[float, float]:
        """(cost, lifecycle emissions) used by the Pareto module."""
        return ev.total_cost_usd, ev.total_lifecycle_co2e_tonnes

    def greedy_baseline(self) -> Tuple[np.ndarray, np.ndarray]:
        """
        Deterministic reference plan: fill each route's demand with the
        largest available vessels first, cheapest compatible fuel, design
        speed. This is the 'traditional planning' comparator.
        """
        order = sorted(range(self.n_vessels), key=lambda i: -self.vessels[i].dwt)
        d = np.zeros(2 * self.n_vessels, dtype=int)
        remaining = {j: r.cargo_demand_tonnes for j, r in enumerate(self.routes)}
        for i in order:
            target = max(remaining, key=lambda j: remaining[j]) if remaining else None
            if target is None or remaining[target] <= 0:
                d[2 * i] = IDLE
                continue
            d[2 * i] = target + 1
            opts = self.fuel_options[i]
            cheapest = min(range(len(opts)), key=lambda k: self.econ.price(opts[k]))
            d[2 * i + 1] = cheapest
            remaining[target] -= self.vessels[i].dwt
            if remaining[target] <= 0:
                remaining.pop(target)
        return d, self.default_speeds()

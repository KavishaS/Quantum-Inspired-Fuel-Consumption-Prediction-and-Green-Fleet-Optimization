"""
Scenario definitions and the bridge from stored records to a FleetProblem.

A scenario payload is a self-contained JSON description of a planning
situation: which vessels are available, which routes carry demand, what
fuel and carbon prices apply, the constraint envelope and the objective
weights. Saving a scenario therefore saves everything needed to reproduce a
result exactly, which is what makes the Scenario Manager comparisons valid.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database.models import FuelType, Route, Vessel
from ..optimization.problem import (
    EconomicParams, FleetProblem, ObjectiveWeights, RouteDemand)
from ..optimization.problem import Vessel as ProblemVessel
from .domain import FUELS

# Three ready-to-run case studies required by the problem statement.
DEMO_SCENARIOS: List[Dict[str, Any]] = [
    {
        "name": "Case Study 1 - Conventional Fleet",
        "tag": "cost",
        "description": ("Baseline commercial operation on conventional bunkers. "
                        "Objective weighted toward operating cost; alternative "
                        "fuels available but rarely economic at demo prices."),
        "vessel_limit": 14,
        "routes": ["R01", "R02", "R03"],
        "weights": {"fuel": 0.30, "cost": 0.55, "emission": 0.05, "reliability": 0.10},
        "carbon_price": 0.0,
        "emission_cap": None,
    },
    {
        "name": "Case Study 2 - Green Fleet",
        "tag": "emission",
        "description": ("Same cargo commitments under an emission-weighted "
                        "objective and an explicit lifecycle CO2e ceiling. Tests "
                        "whether demand can still be met while decarbonising."),
        "vessel_limit": 16,
        "routes": ["R01", "R02", "R03", "R04"],
        "weights": {"fuel": 0.20, "cost": 0.15, "emission": 0.55, "reliability": 0.10},
        "carbon_price": 120.0,
        "emission_cap": 9000.0,
    },
    {
        "name": "Case Study 3 - Alternative Fuel Transition",
        "tag": "transition",
        "description": ("Fleet with methanol and ammonia capability under a high "
                        "carbon price. Evaluates when the carbon cost of "
                        "conventional bunkers outweighs the fuel-price premium."),
        "vessel_limit": 18,
        "routes": ["R01", "R02", "R04", "R05"],
        "weights": {"fuel": 0.20, "cost": 0.25, "emission": 0.45, "reliability": 0.10},
        "carbon_price": 200.0,
        "emission_cap": None,
    },
]


def current_fuel_prices(db: Session) -> Dict[str, float]:
    prices: Dict[str, float] = {}
    for ft in db.scalars(select(FuelType)).all():
        latest = max(ft.prices, key=lambda p: p.effective_date) if ft.prices else None
        prices[ft.key] = latest.price_usd_per_tonne if latest else FUELS[ft.key].price_usd_per_tonne
    return prices or {k: v.price_usd_per_tonne for k, v in FUELS.items()}


def build_scenario_payload(db: Session, spec: Dict[str, Any]) -> Dict[str, Any]:
    vessels = db.scalars(
        select(Vessel).where(Vessel.available.is_(True)).limit(spec["vessel_limit"])).all()
    routes = db.scalars(select(Route).where(Route.route_code.in_(spec["routes"]))).all()

    return {
        "vessels": [{
            "id": v.vessel_code, "name": v.name, "vessel_class": v.vessel_class,
            "dwt": v.dwt, "engine_kw": v.engine_kw, "age_years": v.age_years,
            "min_speed_kn": v.min_speed_kn, "max_speed_kn": v.max_speed_kn,
            "allowed_fuels": v.allowed_fuels, "available": True,
        } for v in vessels],
        "routes": [{
            "id": r.route_code, "name": r.name, "distance_nm": r.distance_nm,
            "cargo_demand_tonnes": r.demands[0].cargo_tonnes if r.demands else 100000.0,
            "deadline_hours": r.demands[0].deadline_hours if r.demands else 500.0,
            "wind_speed_kn": r.wind_speed_kn, "wave_height_m": r.wave_height_m,
            "current_speed_kn": r.current_speed_kn, "weather": r.typical_weather,
            "port_hours": r.port_hours,
        } for r in routes],
        "economics": {
            "fuel_prices": current_fuel_prices(db),
            "carbon_price_usd_per_tonne": spec["carbon_price"],
            "max_lifecycle_emissions_tonnes": spec["emission_cap"],
            "emission_target_tonnes": spec.get("emission_target"),
            "max_total_cost_usd": spec.get("max_cost"),
            "max_delay_hours": 24.0,
        },
        "weights": spec["weights"],
    }


def problem_from_payload(payload: Dict[str, Any]) -> FleetProblem:
    """Rehydrate a FleetProblem from a stored or posted scenario payload."""
    vessels = [ProblemVessel(
        id=v["id"], name=v.get("name", v["id"]), vessel_class=v["vessel_class"],
        dwt=float(v["dwt"]), engine_kw=float(v["engine_kw"]),
        age_years=float(v.get("age_years", 5)),
        min_speed_kn=float(v.get("min_speed_kn", 9)),
        max_speed_kn=float(v.get("max_speed_kn", 15.5)),
        allowed_fuels=list(v.get("allowed_fuels") or ["HFO", "MGO"]),
        available=bool(v.get("available", True)),
    ) for v in payload["vessels"]]

    routes = [RouteDemand(
        id=r["id"], name=r.get("name", r["id"]), distance_nm=float(r["distance_nm"]),
        cargo_demand_tonnes=float(r["cargo_demand_tonnes"]),
        deadline_hours=float(r.get("deadline_hours", 500)),
        wind_speed_kn=float(r.get("wind_speed_kn", 14)),
        wave_height_m=float(r.get("wave_height_m", 1.8)),
        current_speed_kn=float(r.get("current_speed_kn", 0.0)),
        weather=r.get("weather", "MODERATE"),
        port_hours=float(r.get("port_hours", 36)),
    ) for r in payload["routes"]]

    e = payload.get("economics", {})
    econ = EconomicParams(
        fuel_prices=e.get("fuel_prices") or {},
        carbon_price_usd_per_tonne=float(e.get("carbon_price_usd_per_tonne", 85.0)),
        max_lifecycle_emissions_tonnes=e.get("max_lifecycle_emissions_tonnes"),
        emission_target_tonnes=e.get("emission_target_tonnes"),
        max_total_cost_usd=e.get("max_total_cost_usd"),
        max_delay_hours=float(e.get("max_delay_hours", 24.0)),
    )
    w = payload.get("weights", {})
    weights = ObjectiveWeights(
        fuel=float(w.get("fuel", 0.35)), cost=float(w.get("cost", 0.25)),
        emission=float(w.get("emission", 0.30)), reliability=float(w.get("reliability", 0.10)))

    if not vessels:
        raise ValueError("Scenario contains no available vessels.")
    if not routes:
        raise ValueError("Scenario contains no routes with cargo demand.")
    return FleetProblem(vessels, routes, econ, weights)


def default_payload(db: Session) -> Dict[str, Any]:
    return build_scenario_payload(db, DEMO_SCENARIOS[1])

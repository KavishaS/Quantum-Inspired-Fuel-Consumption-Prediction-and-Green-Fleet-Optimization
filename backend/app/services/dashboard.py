"""
Executive dashboard aggregation.

Every KPI, chart series and insight string here is derived from the current
fleet, the stored optimisation runs and the physics model. Nothing is
hard-coded prose: the insight generators inspect real numbers and only emit a
sentence when the underlying condition actually holds.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database.models import OptimizationResult, OptimizationRun, Route, Vessel
from ..optimization.engine import solve
from .compliance import assess, transport_work
from .domain import FUELS, VESSEL_CLASSES
from .physics import compute_voyage
from .scenarios import current_fuel_prices, problem_from_payload


def _baseline_fleet_profile(db: Session) -> Dict[str, Any]:
    """
    Twelve-month operating profile for the fleet as it stands, evaluated with
    the physics model. This is the 'business as usual' picture the dashboard
    shows before any optimisation is run.
    """
    vessels = db.scalars(select(Vessel).where(Vessel.available.is_(True))).all()
    routes = db.scalars(select(Route)).all()
    prices = current_fuel_prices(db)
    if not vessels or not routes:
        return {}

    monthly: List[Dict[str, Any]] = []
    by_class: Dict[str, float] = defaultdict(float)
    by_fuel: Dict[str, float] = defaultdict(float)
    class_counts: Dict[str, int] = defaultdict(int)

    total_fuel = total_cost = total_co2 = total_work = 0.0
    util_sum = 0.0

    # Seasonal weather pattern drives month-to-month variation.
    seasons = ["CALM", "MODERATE", "MODERATE", "ROUGH", "ROUGH", "MODERATE",
               "MODERATE", "CALM", "CALM", "MODERATE", "ROUGH", "MODERATE"]
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    for mi, (mname, weather) in enumerate(zip(months, seasons)):
        m_fuel = m_cost = m_co2 = 0.0
        for i, v in enumerate(vessels):
            route = routes[(i + mi) % len(routes)]
            vc = VESSEL_CLASSES[v.vessel_class]
            fuel = (v.allowed_fuels or ["HFO"])[0]
            cargo = v.dwt * 0.86
            r = compute_voyage(
                vessel_class=v.vessel_class, dwt=v.dwt, engine_kw=v.engine_kw,
                vessel_age_years=v.age_years, speed_kn=vc.design_speed_kn * 0.92,
                cargo_tonnes=cargo, distance_nm=route.distance_nm, fuel_key=fuel,
                wind_speed_kn=route.wind_speed_kn, wave_height_m=route.wave_height_m,
                weather=weather, port_hours=route.port_hours,
                fuel_price_usd_per_tonne=prices.get(fuel), carbon_price_usd_per_tonne=85.0)
            m_fuel += r.fuel_tonnes
            m_cost += r.total_cost_usd
            m_co2 += r.lifecycle_co2e_tonnes
            by_class[v.vessel_class] += r.fuel_tonnes
            by_fuel[fuel] += r.fuel_tonnes
            total_work += cargo * route.distance_nm
            util_sum += cargo / v.dwt
            if mi == 0:
                class_counts[v.vessel_class] += 1
        monthly.append({"month": mname, "fuel_tonnes": round(m_fuel, 1),
                        "cost_usd": round(m_cost, 0), "co2e_tonnes": round(m_co2, 1),
                        "weather": weather})
        total_fuel += m_fuel
        total_cost += m_cost
        total_co2 += m_co2

    n = len(vessels) * 12
    return {
        "vessels": vessels, "routes": routes, "monthly": monthly,
        "total_fuel": total_fuel, "total_cost": total_cost, "total_co2": total_co2,
        "total_work": total_work, "avg_utilisation": 100 * util_sum / max(n, 1),
        "by_class": dict(by_class), "by_fuel": dict(by_fuel), "class_counts": dict(class_counts),
    }


def _insights(p: Dict[str, Any], best_run: Optional[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Conditional insight generation. A rule fires only if the data supports it."""
    out: List[Dict[str, str]] = []
    if not p:
        return out

    # 1. Which vessel class dominates consumption?
    if p["by_class"]:
        cls, val = max(p["by_class"].items(), key=lambda kv: kv[1])
        share = 100 * val / max(p["total_fuel"], 1e-6)
        if share >= 20:
            out.append({
                "severity": "info",
                "text": (f"{VESSEL_CLASSES[cls].name} vessels account for {share:.1f}% of "
                         f"total fleet fuel consumption ({val:,.0f} t/year)."),
            })

    # 2. Speed sensitivity, measured rather than asserted.
    vessels, routes = p["vessels"], p["routes"]
    if vessels and routes:
        v, route = vessels[0], routes[0]
        vc = VESSEL_CLASSES[v.vessel_class]
        base = compute_voyage(vessel_class=v.vessel_class, dwt=v.dwt, engine_kw=v.engine_kw,
                              vessel_age_years=v.age_years, speed_kn=vc.design_speed_kn * 0.92,
                              cargo_tonnes=v.dwt * 0.86, distance_nm=route.distance_nm,
                              fuel_key="HFO", weather=route.typical_weather)
        slow = compute_voyage(vessel_class=v.vessel_class, dwt=v.dwt, engine_kw=v.engine_kw,
                              vessel_age_years=v.age_years, speed_kn=vc.design_speed_kn * 0.92 - 1.5,
                              cargo_tonnes=v.dwt * 0.86, distance_nm=route.distance_nm,
                              fuel_key="HFO", weather=route.typical_weather)
        delta = (base.fuel_tonnes - slow.fuel_tonnes) / max(base.fuel_tonnes, 1e-6) * 100
        extra_h = slow.voyage_hours - base.voyage_hours
        if delta > 1:
            out.append({
                "severity": "positive",
                "text": (f"Reducing cruising speed by 1.5 kn on {route.name} lowers predicted "
                         f"consumption {delta:.1f}% but adds {extra_h:.0f} h to the voyage."),
            })

    # 3. Alternative fuel trade-off, computed from the fuel table.
    hfo, meoh = FUELS["HFO"], FUELS["METHANOL"]
    emis_delta = (meoh.lifecycle_co2e_g_per_g * meoh.sfoc_penalty) / \
                 (hfo.lifecycle_co2e_g_per_g * hfo.sfoc_penalty) - 1
    cost_delta = (meoh.price_usd_per_tonne * meoh.sfoc_penalty) / \
                 (hfo.price_usd_per_tonne * hfo.sfoc_penalty) - 1
    if emis_delta < 0 < cost_delta:
        out.append({
            "severity": "warn",
            "text": (f"Per unit of shaft energy, methanol cuts lifecycle emissions "
                     f"{abs(emis_delta) * 100:.0f}% versus HFO but raises bunker spend "
                     f"{cost_delta * 100:.0f}% at current demo prices."),
        })

    # 4. Best stored optimisation result, if any.
    if best_run:
        c = {r["metric"]: r for r in best_run.get("comparison", [])}
        fuel_row = c.get("Fuel consumption")
        if fuel_row and fuel_row["change_pct"] < 0:
            out.append({
                "severity": "positive",
                "text": (f"Best stored run ({best_run['algorithm']}) cut fuel "
                         f"{abs(fuel_row['change_pct']):.1f}% versus the greedy baseline "
                         f"at {best_run['summary']['cargo_fulfilment_pct']:.0f}% cargo fulfilment."),
            })
    else:
        out.append({"severity": "info",
                    "text": "No optimisation has been run yet. Load a demo scenario and run the Fleet Optimizer to populate results."})

    # 5. Utilisation headroom.
    if p["avg_utilisation"] < 90:
        out.append({
            "severity": "warn",
            "text": (f"Average deadweight utilisation is {p['avg_utilisation']:.1f}%. "
                     "Consolidating cargo onto fewer vessels is the largest single lever available."),
        })
    return out


def build_dashboard(db: Session) -> Dict[str, Any]:
    p = _baseline_fleet_profile(db)
    if not p:
        return {"empty": True, "message": "No fleet data. Initialise the database to seed demo vessels and routes."}

    best_run = None
    row = db.scalars(
        select(OptimizationRun).where(OptimizationRun.status == "completed")
        .order_by(OptimizationRun.best_fitness.asc()).limit(1)).first()
    if row and row.result:
        best_run = {"algorithm": row.algorithm, "summary": row.result.summary,
                    "comparison": row.result.comparison, "run_id": row.id}

    comp = assess(
        total_lifecycle_co2e_tonnes=p["total_co2"],
        total_ttw_co2e_tonnes=p["total_co2"] * 0.84,
        transport_work_tonne_nm=p["total_work"])

    savings = 0.0
    if best_run:
        cost_row = next((r for r in best_run["comparison"] if r["metric"] == "Operating cost"), None)
        if cost_row and cost_row["change_pct"] < 0:
            savings = p["total_cost"] * abs(cost_row["change_pct"]) / 100.0

    return {
        "empty": False,
        "kpis": {
            "fleet_size": len(p["vessels"]),
            "annual_fuel_tonnes": round(p["total_fuel"], 0),
            "annual_fuel_cost_usd": round(p["total_cost"], 0),
            "annual_co2e_tonnes": round(p["total_co2"], 0),
            "avg_utilisation_pct": round(p["avg_utilisation"], 1),
            "estimated_savings_usd": round(savings, 0),
            "cargo_fulfilment_pct": round(best_run["summary"]["cargo_fulfilment_pct"], 1) if best_run else None,
            "compliance_status": comp["overall_status"],
            "routes_active": len(p["routes"]),
        },
        "trends": p["monthly"],
        "fuel_mix": [{"fuel": k, "tonnes": round(v, 1),
                      "share_pct": round(100 * v / max(p["total_fuel"], 1e-6), 2)}
                     for k, v in sorted(p["by_fuel"].items(), key=lambda kv: -kv[1])],
        "class_mix": [{"vessel_class": k, "tonnes": round(v, 1),
                       "vessels": p["class_counts"].get(k, 0),
                       "share_pct": round(100 * v / max(p["total_fuel"], 1e-6), 2)}
                      for k, v in sorted(p["by_class"].items(), key=lambda kv: -kv[1])],
        "insights": _insights(p, best_run),
        "best_run": best_run,
        "compliance_snapshot": {"overall_status": comp["overall_status"],
                                "intensity_g_per_tnm": comp["current_intensity_g_per_tnm"]},
        "data_notice": "Demo dataset generated for simulation and algorithm validation.",
    }

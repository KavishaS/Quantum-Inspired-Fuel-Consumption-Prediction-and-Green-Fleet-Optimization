"""
Fleet Analytics Service.

Aggregates operational metrics, fleet composition, vessel types, size classes,
propulsion power, age profiles, and multi-fuel capabilities directly from the database.
All metrics are dynamically calculated from active fleet data without hardcoded statistics.
"""
from __future__ import annotations

from typing import Any, Dict, List
import statistics

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database.models import Vessel, Contract
from ..services.domain import VESSEL_CLASSES
from ..services.physics import compute_voyage


def compute_fleet_analytics(db: Session) -> Dict[str, Any]:
    vessels = db.scalars(select(Vessel)).all()
    contracts = db.scalars(select(Contract)).all()

    if not vessels:
        empty_summary = {
            "total_vessels": 0,
            "active_vessels": 0,
            "available_vessels": 0,
            "total_dwt": 0.0,
            "avg_dwt": 0.0,
            "avg_age_years": 0.0,
            "avg_engine_kw": 0.0,
            "avg_daily_fuel_mt": 0.0,
        }
        empty_contracts = {
            "total_contracts": 0,
            "active_contracts": 0,
            "total_cargo_tonnes": 0.0,
            "total_potential_penalty_per_day": 0.0,
            "by_status": {},
        }
        return {
            "summary": empty_summary,
            "by_type": [],
            "by_size_class": [],
            "fuel_capability": [],
            "age_distribution": [],
            "contracts_summary": empty_contracts,
            "provenance": {
                "source": "Clarksons World Fleet Register",
                "contracts_type": "SCENARIO",
                "vessel_data_type": "REAL/SEEDED_SPECS",
            },
            # Flat legacy keys for backward compatibility
            "total_vessels": 0,
            "vessels_by_type": [],
            "vessels_by_size_class": [],
            "average_dwt": 0.0,
            "total_dwt": 0.0,
            "average_engine_power_kw": 0.0,
            "average_age_years": 0.0,
            "fuel_capabilities": [],
            "average_daily_fuel_mt": 0.0,
            "data_provenance": "REAL (Active Database Fleet Records)",
        }

    total_vessels = len(vessels)
    active_count = sum(1 for v in vessels if getattr(v, "status", "active") == "active")
    avail_count = sum(1 for v in vessels if getattr(v, "available", True))

    # 1. Vessels by type (aggregated with DWT and Power)
    by_type_dict: Dict[str, Dict[str, Any]] = {}
    for v in vessels:
        t = v.vessel_type or "Bulk Carrier"
        if t not in by_type_dict:
            by_type_dict[t] = {"count": 0, "total_dwt": 0.0, "powers": []}
        by_type_dict[t]["count"] += 1
        by_type_dict[t]["total_dwt"] += float(v.dwt or 0)
        if v.engine_kw:
            by_type_dict[t]["powers"].append(float(v.engine_kw))

    by_type_list = [
        {
            "vessel_type": k,
            "count": data["count"],
            "total_dwt": round(data["total_dwt"], 1),
            "avg_kw": round(statistics.mean(data["powers"]), 1) if data["powers"] else 0.0,
        }
        for k, data in sorted(by_type_dict.items(), key=lambda x: -x[1]["count"])
    ]

    # 2. Vessels by size class
    by_size_dict: Dict[str, Dict[str, Any]] = {}
    for v in vessels:
        sc = v.size_class or (v.vessel_class.title() if v.vessel_class else "Standard")
        if sc not in by_size_dict:
            by_size_dict[sc] = {"count": 0, "total_dwt": 0.0}
        by_size_dict[sc]["count"] += 1
        by_size_dict[sc]["total_dwt"] += float(v.dwt or 0)

    by_size_list = [
        {
            "size_class": k,
            "count": data["count"],
            "total_dwt": round(data["total_dwt"], 1),
        }
        for k, data in sorted(by_size_dict.items(), key=lambda x: -x[1]["count"])
    ]

    # 3. Aggregates: DWT, Power, Age
    dwts = [float(v.dwt) for v in vessels if v.dwt]
    powers = [float(v.engine_kw) for v in vessels if v.engine_kw]
    ages = [float(v.age_years) for v in vessels if v.age_years is not None]

    total_dwt = sum(dwts)
    avg_dwt = statistics.mean(dwts) if dwts else 0.0
    avg_power = statistics.mean(powers) if powers else 0.0
    avg_age = statistics.mean(ages) if ages else 0.0

    # 4. Fuel capabilities
    fuel_counts: Dict[str, int] = {}
    for v in vessels:
        for f in (v.allowed_fuels or []):
            fuel_counts[f] = fuel_counts.get(f, 0) + 1

    fuel_capability_list = [
        {
            "fuel": k,
            "vessel_count": v,
            "share_pct": round(100.0 * v / total_vessels, 1),
        }
        for k, v in sorted(fuel_counts.items(), key=lambda x: -x[1])
    ]

    # 5. Age distribution
    age_bins = {"0–5 yrs": 0, "6–10 yrs": 0, "11–15 yrs": 0, "15+ yrs": 0}
    for a in ages:
        if a <= 5:
            age_bins["0–5 yrs"] += 1
        elif a <= 10:
            age_bins["6–10 yrs"] += 1
        elif a <= 15:
            age_bins["11–15 yrs"] += 1
        else:
            age_bins["15+ yrs"] += 1

    age_dist_list = [{"range": k, "count": v} for k, v in age_bins.items()]

    # 6. Average estimated daily fuel consumption
    daily_fuels: List[float] = []
    for v in vessels[:25]:
        vc = VESSEL_CLASSES.get(v.vessel_class, VESSEL_CLASSES["PANAMAX"])
        speed = min(v.max_speed_kn, vc.design_speed_kn * 0.92)
        fuel = v.allowed_fuels[0] if v.allowed_fuels else "HFO"
        res = compute_voyage(
            vessel_class=v.vessel_class,
            dwt=v.dwt,
            engine_kw=v.engine_kw,
            vessel_age_years=v.age_years,
            speed_kn=speed,
            cargo_tonnes=v.dwt * 0.85,
            distance_nm=1000.0,
            fuel_key=fuel,
        )
        sailing_days = (1000.0 / speed) / 24.0
        if sailing_days > 0:
            daily_fuels.append(res.fuel_tonnes / sailing_days)

    avg_daily_fuel = statistics.mean(daily_fuels) if daily_fuels else 0.0

    # 7. Commercial contracts summary
    total_contracts = len(contracts)
    active_contracts = sum(1 for c in contracts if c.status.upper() in ["ACTIVE", "PENDING"])
    total_cargo = sum(float(c.cargo_quantity_tonnes or 0) for c in contracts)
    total_penalty = sum(float(c.penalty_per_day or 0) for c in contracts if c.status.upper() == "ACTIVE")
    by_status: Dict[str, int] = {}
    for c in contracts:
        st = c.status.title()
        by_status[st] = by_status.get(st, 0) + 1

    contracts_summary = {
        "total_contracts": total_contracts,
        "active_contracts": active_contracts,
        "total_cargo_tonnes": round(total_cargo, 1),
        "total_potential_penalty_per_day": round(total_penalty, 2),
        "by_status": by_status,
    }

    summary = {
        "total_vessels": total_vessels,
        "active_vessels": active_count,
        "available_vessels": avail_count,
        "total_dwt": round(total_dwt, 1),
        "avg_dwt": round(avg_dwt, 1),
        "avg_age_years": round(avg_age, 1),
        "avg_engine_kw": round(avg_power, 1),
        "avg_daily_fuel_mt": round(avg_daily_fuel, 2),
    }

    return {
        "summary": summary,
        "by_type": by_type_list,
        "by_size_class": by_size_list,
        "fuel_capability": fuel_capability_list,
        "age_distribution": age_dist_list,
        "contracts_summary": contracts_summary,
        "provenance": {
            "source": "Clarksons World Fleet Register",
            "contracts_type": "SCENARIO",
            "vessel_data_type": "REAL/SEEDED_SPECS",
        },
        # Flat legacy keys for backward compatibility
        "total_vessels": total_vessels,
        "vessels_by_type": [{"type": item["vessel_type"], "count": item["count"]} for item in by_type_list],
        "vessels_by_size_class": by_size_list,
        "average_dwt": round(avg_dwt, 1),
        "total_dwt": round(total_dwt, 1),
        "average_engine_power_kw": round(avg_power, 1),
        "average_age_years": round(avg_age, 1),
        "fuel_capabilities": [{"fuel": item["fuel"], "vessels": item["vessel_count"], "pct": item["share_pct"]} for item in fuel_capability_list],
        "average_daily_fuel_mt": round(avg_daily_fuel, 2),
        "data_provenance": "REAL (Active Database Fleet Records)",
    }

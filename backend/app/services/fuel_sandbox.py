"""
Alternative fuel sandbox.

Compares candidate fuels for one representative vessel over an annual
operating profile, holding transport work constant. Every fuel must move the
same cargo the same distance the same number of times, so differences in
consumed mass come from the physics (LHV and SFOC penalty), not from
assuming a lighter duty for the cleaner option.

ROI treatment
-------------
Switching fuel costs capex (engine/tank retrofit) and changes annual opex
(bunker spend plus carbon cost). Against the incumbent fuel:

    annual_saving = opex_incumbent - opex_candidate
    payback_years = retrofit_capex / annual_saving      (if saving > 0)
    roi_pct       = (annual_saving * horizon - capex) / capex * 100

A negative annual saving means the switch never pays back on these inputs,
and the module says so rather than emitting a misleading large number.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .domain import FUELS, VESSEL_CLASSES
from .physics import compute_voyage


def compare_fuels(
    *,
    vessel_class: str = "PANAMAX",
    dwt: Optional[float] = None,
    engine_kw: Optional[float] = None,
    vessel_age_years: float = 8.0,
    speed_kn: Optional[float] = None,
    cargo_tonnes: Optional[float] = None,
    distance_nm: float = 5000.0,
    annual_operating_hours: float = 6000.0,
    carbon_price_usd_per_tonne: float = 85.0,
    fuel_prices: Optional[Dict[str, float]] = None,
    incumbent: str = "HFO",
    horizon_years: int = 10,
    weather: str = "MODERATE",
) -> Dict[str, Any]:
    vc = VESSEL_CLASSES.get(vessel_class) or VESSEL_CLASSES["PANAMAX"]
    dwt = float(dwt or vc.typical_dwt)
    engine_kw = float(engine_kw or vc.engine_kw * (dwt / vc.typical_dwt) ** 0.62)
    speed_kn = float(speed_kn or vc.design_speed_kn * 0.92)
    cargo_tonnes = float(cargo_tonnes if cargo_tonnes is not None else dwt * 0.88)
    prices = fuel_prices or {}

    rows: List[Dict[str, Any]] = []
    for key, spec in FUELS.items():
        r = compute_voyage(
            vessel_class=vessel_class, dwt=dwt, engine_kw=engine_kw,
            vessel_age_years=vessel_age_years, speed_kn=speed_kn,
            cargo_tonnes=cargo_tonnes, distance_nm=distance_nm, fuel_key=key,
            weather=weather, fuel_price_usd_per_tonne=prices.get(key, spec.price_usd_per_tonne),
            carbon_price_usd_per_tonne=carbon_price_usd_per_tonne,
        )
        # Scale one representative voyage up to an annual profile.
        voyages_per_year = annual_operating_hours / max(r.voyage_hours, 1e-6)
        rows.append({
            "fuel": key,
            "name": spec.name,
            "price_usd_per_tonne": round(prices.get(key, spec.price_usd_per_tonne), 2),
            "energy_density_mj_per_kg": spec.lhv_mj_per_kg,
            "availability": spec.availability,
            "voyage_fuel_tonnes": round(r.fuel_tonnes, 2),
            "annual_fuel_tonnes": round(r.fuel_tonnes * voyages_per_year, 1),
            "annual_fuel_cost_usd": round(r.fuel_cost_usd * voyages_per_year, 0),
            "annual_carbon_cost_usd": round(r.carbon_cost_usd * voyages_per_year, 0),
            "annual_ttw_co2e_tonnes": round(r.ttw_co2e_tonnes * voyages_per_year, 1),
            "annual_wtt_co2e_tonnes": round(r.wtt_co2e_tonnes * voyages_per_year, 1),
            "annual_lifecycle_co2e_tonnes": round(r.lifecycle_co2e_tonnes * voyages_per_year, 1),
            "lifecycle_co2e_g_per_g": round(spec.lifecycle_co2e_g_per_g, 3),
            "retrofit_capex_usd": round(spec.retrofit_musd_per_vessel * 1e6, 0),
            "voyages_per_year": round(voyages_per_year, 2),
            "notes": spec.notes,
            "_annual_opex": r.fuel_cost_usd * voyages_per_year + r.carbon_cost_usd * voyages_per_year,
        })

    base = next((x for x in rows if x["fuel"] == incumbent), rows[0])
    base_opex = base["_annual_opex"]
    base_emis = base["annual_lifecycle_co2e_tonnes"]
    base_capex = base["retrofit_capex_usd"]

    for x in rows:
        saving = base_opex - x["_annual_opex"]
        capex = max(0.0, x["retrofit_capex_usd"] - base_capex)
        x["annual_opex_usd"] = round(x["_annual_opex"], 0)
        x["annual_saving_vs_incumbent_usd"] = round(saving, 0)
        x["relative_cost_pct"] = round((x["_annual_opex"] / base_opex - 1) * 100, 2) if base_opex else 0.0
        x["emission_change_pct"] = round(
            (x["annual_lifecycle_co2e_tonnes"] / base_emis - 1) * 100, 2) if base_emis else 0.0
        x["abatement_cost_usd_per_tonne_co2e"] = (
            round(-saving / (base_emis - x["annual_lifecycle_co2e_tonnes"]), 2)
            if base_emis - x["annual_lifecycle_co2e_tonnes"] > 1e-6 else None)

        if capex <= 0:
            x["payback_years"] = 0.0 if saving >= 0 else None
            x["roi_pct"] = None
            x["verdict"] = "No retrofit required"
        elif saving <= 0:
            x["payback_years"] = None
            x["roi_pct"] = round(-100.0, 2)
            x["verdict"] = "Does not pay back on these inputs"
        else:
            x["payback_years"] = round(capex / saving, 2)
            x["roi_pct"] = round((saving * horizon_years - capex) / capex * 100, 2)
            x["verdict"] = (f"Pays back in {capex / saving:.1f} years"
                            if capex / saving <= horizon_years
                            else f"Payback exceeds {horizon_years}-year horizon")
        x.pop("_annual_opex", None)

    cleanest = min(rows, key=lambda x: x["annual_lifecycle_co2e_tonnes"])
    cheapest = min(rows, key=lambda x: x["annual_opex_usd"])
    return {
        "incumbent": incumbent,
        "horizon_years": horizon_years,
        "assumptions": {
            "vessel_class": vessel_class, "dwt": dwt, "engine_kw": round(engine_kw, 0),
            "speed_kn": round(speed_kn, 2), "cargo_tonnes": round(cargo_tonnes, 0),
            "distance_nm": distance_nm, "annual_operating_hours": annual_operating_hours,
            "carbon_price_usd_per_tonne": carbon_price_usd_per_tonne, "weather": weather,
        },
        "fuels": rows,
        "cheapest_fuel": cheapest["fuel"],
        "lowest_emission_fuel": cleanest["fuel"],
        "note": ("Transport work is held constant across fuels. Capex and prices are "
                 "configurable demo parameters, not quotations."),
    }

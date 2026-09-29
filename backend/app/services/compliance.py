"""
Compliance estimation.

IMPORTANT
---------
Everything in this module is a MODEL ESTIMATE produced from configurable
parameters. It is not a regulatory calculation, not a certification, and not
legal advice. Real IMO CII / EU ETS reporting depends on audited operational
data, vessel-specific reference lines and rules that change between
compliance years.

Pathways modelled
-----------------
IMO ambition is expressed as a percentage reduction in carbon intensity
against a 2008 baseline. The platform tracks emissions intensity in grams
CO2e per tonne-nautical-mile of transport work actually performed, which is
the right denominator: a fleet that cuts emissions by carrying less cargo has
not decarbonised.

EU ETS phase-in is applied to the tank-to-wake share of emissions on the
covered portion of voyages, with both the phase-in factor and the voyage
coverage fraction exposed as parameters.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# Default pathway targets: percentage reduction in carbon intensity vs 2008.
DEFAULT_TARGETS = {
    "IMO_2030": {"year": 2030, "reduction_pct": 40.0,
                 "label": "IMO 2030 - 40% carbon intensity reduction vs 2008"},
    "IMO_2040": {"year": 2040, "reduction_pct": 70.0,
                 "label": "IMO 2040 - indicative checkpoint"},
    "IMO_2050": {"year": 2050, "reduction_pct": 100.0,
                 "label": "IMO 2050 - net-zero ambition"},
}

# Representative 2008 fleet carbon intensity, g CO2 per tonne-nautical-mile.
DEFAULT_BASELINE_G_PER_TNM = 7.8

# EU ETS phase-in of surrendered allowances by year.
DEFAULT_ETS_PHASE_IN = {2024: 0.40, 2025: 0.70, 2026: 1.00}


def assess(
    *,
    total_lifecycle_co2e_tonnes: float,
    total_ttw_co2e_tonnes: float,
    transport_work_tonne_nm: float,
    baseline_intensity_g_per_tnm: float = DEFAULT_BASELINE_G_PER_TNM,
    targets: Optional[Dict[str, Dict[str, Any]]] = None,
    carbon_price_usd_per_tonne: float = 85.0,
    ets_year: int = 2026,
    ets_phase_in: Optional[float] = None,
    eu_voyage_coverage: float = 0.50,
) -> Dict[str, Any]:
    targets = targets or DEFAULT_TARGETS
    work = max(transport_work_tonne_nm, 1e-6)

    # Intensity uses tank-to-wake, matching how IMO carbon intensity is defined.
    intensity = total_ttw_co2e_tonnes * 1e6 / work  # t -> g
    lifecycle_intensity = total_lifecycle_co2e_tonnes * 1e6 / work

    rows: List[Dict[str, Any]] = []
    for key, t in targets.items():
        target_intensity = baseline_intensity_g_per_tnm * (1 - t["reduction_pct"] / 100.0)
        gap = intensity - target_intensity
        achieved = (1 - intensity / baseline_intensity_g_per_tnm) * 100.0
        if gap <= 0:
            status, severity = "Compliant", "ok"
        elif gap <= 0.10 * max(target_intensity, 1e-6):
            status, severity = "Attention Required", "warn"
        else:
            status, severity = "Above Target", "danger"
        rows.append({
            "target": key,
            "label": t["label"],
            "year": t["year"],
            "required_reduction_pct": t["reduction_pct"],
            "achieved_reduction_pct": round(achieved, 2),
            "target_intensity_g_per_tnm": round(target_intensity, 4),
            "current_intensity_g_per_tnm": round(intensity, 4),
            "gap_g_per_tnm": round(max(0.0, gap), 4),
            # A 100% reduction target has zero target intensity, so a percentage
            # gap is undefined; the absolute gap is reported instead.
            "gap_pct_of_target": (round(100 * gap / target_intensity, 2)
                                  if target_intensity > 1e-9 else None),
            "status": status,
            "severity": severity,
        })

    phase = ets_phase_in if ets_phase_in is not None else DEFAULT_ETS_PHASE_IN.get(ets_year, 1.0)
    covered = total_ttw_co2e_tonnes * eu_voyage_coverage
    surrendered = covered * phase
    ets_cost = surrendered * carbon_price_usd_per_tonne

    worst = max(rows, key=lambda r: r["gap_g_per_tnm"]) if rows else None
    return {
        "current_intensity_g_per_tnm": round(intensity, 4),
        "lifecycle_intensity_g_per_tnm": round(lifecycle_intensity, 4),
        "baseline_intensity_g_per_tnm": baseline_intensity_g_per_tnm,
        "transport_work_tonne_nm": round(work, 0),
        "total_lifecycle_co2e_tonnes": round(total_lifecycle_co2e_tonnes, 2),
        "total_ttw_co2e_tonnes": round(total_ttw_co2e_tonnes, 2),
        "targets": rows,
        "overall_status": worst["status"] if worst else "Unknown",
        "eu_ets": {
            "year": ets_year,
            "phase_in_factor": phase,
            "voyage_coverage_fraction": eu_voyage_coverage,
            "covered_ttw_co2e_tonnes": round(covered, 2),
            "allowances_surrendered_tonnes": round(surrendered, 2),
            "estimated_cost_usd": round(ets_cost, 2),
            "carbon_price_usd_per_tonne": carbon_price_usd_per_tonne,
        },
        "disclaimer": ("Model estimate from configurable parameters. Not a regulatory "
                       "calculation, certification or legal advice. Actual compliance "
                       "depends on audited operational data and the rules in force for "
                       "the relevant compliance year."),
    }


def transport_work(assignments: List[Dict[str, Any]], routes_by_name: Dict[str, float]) -> float:
    """Tonne-nautical-miles actually delivered by a fleet plan."""
    total = 0.0
    for a in assignments:
        if a.get("status") != "deployed":
            continue
        total += float(a.get("cargo_tonnes", 0.0)) * float(routes_by_name.get(a.get("route", ""), 0.0))
    return total

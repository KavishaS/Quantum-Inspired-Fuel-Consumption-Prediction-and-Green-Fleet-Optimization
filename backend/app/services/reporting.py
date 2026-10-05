"""
PDF report generation (ReportLab).

Produces the 18-section analysis report. Recommendations are generated from
the actual result payload by inspecting the numbers, so a report on a run
where emissions rose will say so.
"""
from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

NAVY = colors.HexColor("#0B2447")
BLUE = colors.HexColor("#19507E")
CYAN = colors.HexColor("#2E9BD6")
GREEN = colors.HexColor("#1E8E5A")
AMBER = colors.HexColor("#B77400")
RED = colors.HexColor("#B3261E")
LIGHT = colors.HexColor("#EEF3F8")

REPORTS_DIR = Path(__file__).resolve().parents[3] / "reports"


def _styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle("TitleBig", parent=s["Title"], fontSize=24, textColor=NAVY,
                         spaceAfter=6, alignment=TA_CENTER))
    s.add(ParagraphStyle("Sub", parent=s["Normal"], fontSize=11, textColor=BLUE,
                         alignment=TA_CENTER, spaceAfter=18))
    s.add(ParagraphStyle("H1", parent=s["Heading1"], fontSize=14, textColor=NAVY,
                         spaceBefore=14, spaceAfter=6))
    s.add(ParagraphStyle("H2", parent=s["Heading2"], fontSize=11.5, textColor=BLUE,
                         spaceBefore=10, spaceAfter=4))
    s.add(ParagraphStyle("Body", parent=s["Normal"], fontSize=9.5, leading=13.5,
                         alignment=TA_LEFT, spaceAfter=5))
    s.add(ParagraphStyle("Small", parent=s["Normal"], fontSize=8, textColor=colors.grey,
                         leading=10.5))
    return s


def _table(data: List[List[Any]], widths=None, highlight_col: Optional[int] = None) -> Table:
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C7D3E0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ]
    t.setStyle(TableStyle(style))
    return t


def _page_furniture(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 14 * mm, A4[0], 14 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(15 * mm, A4[1] - 9.5 * mm, "VATES QUANTUM FLEET")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(A4[0] - 15 * mm, A4[1] - 9.5 * mm,
                           "Quantum-Inspired Fuel Prediction & Green Fleet Optimization")
    canvas.setFillColor(colors.grey)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(15 * mm, 10 * mm, "VATES Platform  |  Model estimates for strategic planning - not certified regulatory output")
    canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _recommendations(payload: Dict[str, Any]) -> List[str]:
    """Derived from the numbers in the payload, never boilerplate."""
    recs: List[str] = []
    opt = payload.get("optimization") or {}
    comp = {r["metric"]: r for r in opt.get("comparison", [])}
    summary = opt.get("summary", {})

    fuel = comp.get("Fuel consumption")
    if fuel:
        if fuel["change_pct"] < -1:
            recs.append(f"Adopt the optimised deployment plan: it reduces fuel burn by "
                        f"{abs(fuel['change_pct']):.1f}% ({fuel['baseline']:,.0f} t to "
                        f"{fuel['optimized']:,.0f} t) against the greedy baseline.")
        elif fuel["change_pct"] > 1:
            recs.append(f"The optimised plan consumes {fuel['change_pct']:.1f}% MORE fuel than the "
                        f"baseline. Re-check the objective weights before acting on it.")

    emis = comp.get("Lifecycle CO2e")
    if emis and emis["change_pct"] < -1:
        recs.append(f"Emission reduction of {abs(emis['change_pct']):.1f}% is achievable without "
                    f"reducing cargo fulfilment below {summary.get('cargo_fulfilment_pct', 0):.0f}%.")

    if summary.get("n_violations", 0) > 0:
        recs.append(f"The selected plan violates {summary['n_violations']} constraint(s): "
                    f"{', '.join(summary.get('violations', {}).keys())}. Relax the binding "
                    f"constraint or add vessel capacity before committing.")
    elif summary:
        recs.append("The selected plan satisfies every declared constraint and is operationally feasible.")

    bench = payload.get("benchmark") or {}
    for h in bench.get("head_to_head", []):
        recs.append(f"On this scenario over {bench.get('config', {}).get('runs', '?')} independent runs, "
                    f"{h['winner']} achieved the better mean fitness in {h['pair']} "
                    f"(gap {abs(h['fitness_gap_pct']):.2f}%).")

    sandbox = payload.get("fuel_sandbox") or {}
    if sandbox.get("fuels"):
        payers = [f for f in sandbox["fuels"]
                  if f.get("payback_years") and f["payback_years"] <= sandbox.get("horizon_years", 10)]
        if payers:
            best = min(payers, key=lambda f: f["payback_years"])
            recs.append(f"{best['name']} is the only alternative fuel that pays back within the "
                        f"{sandbox['horizon_years']}-year horizon on these inputs "
                        f"({best['payback_years']:.1f} years).")
        else:
            recs.append("No alternative fuel pays back within the modelled horizon at current "
                        "prices and carbon cost. Revisit if the carbon price rises materially.")

    cm = payload.get("compliance") or {}
    for t in cm.get("targets", []):
        if t["status"] != "Compliant":
            gap = t.get("gap_pct_of_target")
            closing = (f"Closing the gap needs a {gap:.0f}% intensity improvement."
                       if gap is not None
                       else f"The remaining gap is {t['gap_g_per_tnm']:.3f} g CO2e per tonne-nm.")
            recs.append(f"{t['label']}: currently {t['achieved_reduction_pct']:.1f}% reduced "
                        f"against a required {t['required_reduction_pct']:.0f}%. {closing}")
            break
    return recs or ["Insufficient result data to derive recommendations. Run an optimisation first."]


def generate_report(payload: Dict[str, Any], out_dir: Optional[Path] = None) -> Path:
    out_dir = Path(out_dir or REPORTS_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = dt.datetime.now()
    fname = f"vates_fleet_report_{ts.strftime('%Y%m%d_%H%M%S')}.pdf"
    path = out_dir / fname

    s = _styles()
    doc = SimpleDocTemplate(str(path), pagesize=A4, topMargin=22 * mm, bottomMargin=18 * mm,
                            leftMargin=15 * mm, rightMargin=15 * mm,
                            title="VATES Fleet Optimization Analysis Report")
    F: List[Any] = []
    opt = payload.get("optimization") or {}
    summary = opt.get("summary", {})
    base = opt.get("baseline_summary", {})
    scenario = payload.get("scenario", {})

    # Logo + Title
    logo_path = Path(__file__).resolve().parent.parent / "static" / "vates-logo.png"
    if logo_path.exists():
        try:
            F.append(Spacer(1, 2 * mm))
            F.append(Image(str(logo_path), width=52 * mm, height=14.5 * mm, hAlign="CENTER"))
            F.append(Spacer(1, 4 * mm))
        except Exception:
            F.append(Spacer(1, 10 * mm))
    else:
        F.append(Spacer(1, 10 * mm))

    F.append(Paragraph("VATES Fleet Optimization Report", s["TitleBig"]))
    F.append(Paragraph("Quantum-Inspired Fuel Consumption Prediction "
                       "and Green Fleet Optimization", s["Sub"]))
    F.append(Paragraph("1. Executive Summary", s["H1"]))
    if summary:
        F.append(Paragraph(
            f"A fleet of {len(opt.get('assignments', []))} vessels was evaluated against "
            f"{len(scenario.get('routes', []))} route demands using the "
            f"<b>{opt.get('algorithm', 'n/a')}</b> optimiser. The recommended plan consumes "
            f"<b>{summary.get('total_fuel_tonnes', 0):,.0f} t</b> of fuel at a total cost of "
            f"<b>${summary.get('total_cost_usd', 0):,.0f}</b>, emitting "
            f"<b>{summary.get('total_lifecycle_co2e_tonnes', 0):,.0f} t</b> CO2e on a lifecycle "
            f"basis, while meeting <b>{summary.get('cargo_fulfilment_pct', 0):.1f}%</b> of cargo "
            f"demand at <b>{summary.get('schedule_reliability_pct', 0):.1f}%</b> schedule "
            f"reliability. Constraint status: "
            f"<b>{'feasible' if summary.get('feasible') else str(summary.get('n_violations', 0)) + ' violation(s)'}</b>.",
            s["Body"]))
    else:
        F.append(Paragraph("No optimisation result was supplied with this report request.", s["Body"]))

    # 2-3 Fleet + scenario
    F.append(Paragraph("2. Fleet Information", s["H1"]))
    vs = scenario.get("vessels", [])
    if vs:
        by_cls: Dict[str, List[float]] = {}
        for v in vs:
            by_cls.setdefault(v["vessel_class"], []).append(float(v["dwt"]))
        rows = [["Vessel class", "Count", "Total DWT", "Mean DWT"]]
        for k, arr in by_cls.items():
            rows.append([k.title(), str(len(arr)), f"{sum(arr):,.0f}", f"{sum(arr)/len(arr):,.0f}"])
        F.append(_table(rows, [55 * mm, 25 * mm, 45 * mm, 45 * mm]))

    F.append(Paragraph("3. Input Scenario", s["H1"]))
    rs = scenario.get("routes", [])
    if rs:
        rows = [["Route", "Distance (nm)", "Cargo demand (t)", "Deadline (h)", "Weather"]]
        for r in rs:
            rows.append([r.get("name", r.get("id")), f"{r['distance_nm']:,.0f}",
                         f"{r['cargo_demand_tonnes']:,.0f}", f"{r.get('deadline_hours', 0):,.0f}",
                         r.get("weather", "-")])
        F.append(_table(rows, [58 * mm, 28 * mm, 34 * mm, 26 * mm, 24 * mm]))
    econ = scenario.get("economics", {})
    if econ:
        F.append(Paragraph(
            f"Carbon price ${econ.get('carbon_price_usd_per_tonne', 0):,.0f}/t. "
            f"Emission ceiling: {econ.get('max_lifecycle_emissions_tonnes') or 'none'}. "
            f"Maximum tolerated delay {econ.get('max_delay_hours', 0):,.0f} h.", s["Body"]))

    # 4 Prediction
    F.append(Paragraph("4. Fuel Consumption Prediction", s["H1"]))
    pred = payload.get("prediction")
    ml = payload.get("model_meta", {})
    if pred:
        F.append(Paragraph(
            f"ML model <b>{pred.get('model', 'n/a')}</b> predicted "
            f"<b>{pred['predicted_fuel_tonnes']:,.1f} t</b> for the reference voyage "
            f"(95% interval {pred['interval_low_tonnes']:,.1f} to "
            f"{pred['interval_high_tonnes']:,.1f} t).", s["Body"]))
    if ml.get("candidates"):
        rows = [["Model", "MAE (t)", "RMSE (t)", "R2", "MAPE (%)"]]
        for c in ml["candidates"]:
            rows.append([c["name"], f"{c['mae']:.2f}", f"{c['rmse']:.2f}",
                         f"{c['r2']:.4f}", f"{c['mape_pct']:.2f}"])
        F.append(_table(rows, [50 * mm, 30 * mm, 30 * mm, 30 * mm, 30 * mm]))
        F.append(Paragraph(f"Promoted model: <b>{ml.get('best_model')}</b>, selected by held-out "
                           f"RMSE on {ml.get('n_test', 0):,} unseen voyages.", s["Body"]))

    F.append(PageBreak())

    # 5-7 Methodology + results
    F.append(Paragraph("5. Optimization Methodology", s["H1"]))
    F.append(Paragraph(
        "Discrete decisions (vessel deployment, route assignment, fuel selection) are solved with a "
        "Quantum-Inspired Genetic Algorithm in which each gene is a vector of probability amplitudes "
        "evolved by a quantum rotation gate and collapsed by observation. Continuous decisions "
        "(cruising speed per vessel) are solved with Quantum-Inspired Particle Swarm Optimization, "
        "which replaces velocity with a delta-potential-well position collapse. Both execute on "
        "classical hardware; no quantum computer is used at any point.", s["Body"]))
    F.append(Paragraph("6. Selected Algorithm", s["H1"]))
    F.append(Paragraph(f"<b>{opt.get('algorithm', 'n/a')}</b>, runtime "
                       f"{opt.get('runtime_seconds', 0):.2f} s.", s["Body"]))

    F.append(Paragraph("7. Optimization Results", s["H1"]))
    for a in (opt.get("assignments") or [])[:26]:
        pass
    assigns = [a for a in (opt.get("assignments") or []) if a.get("status") == "deployed"]
    if assigns:
        rows = [["Vessel", "Class", "Route", "Cargo t", "kn", "Fuel", "t", "Cost $", "CO2e t", "ETA h", "Util %"]]
        for a in assigns[:30]:
            rows.append([a["vessel_id"], a["vessel_class"][:9].title(), a["route"][:18],
                         f"{a['cargo_tonnes']:,.0f}", f"{a['speed_kn']:.1f}", a["fuel_type"],
                         f"{a['fuel_tonnes']:,.0f}", f"{a['total_cost_usd']:,.0f}",
                         f"{a['lifecycle_co2e_tonnes']:,.0f}", f"{a['eta_hours']:.0f}",
                         f"{a['utilisation_pct']:.0f}"])
        F.append(_table(rows))
        idle = len(opt.get("assignments", [])) - len(assigns)
        F.append(Paragraph(f"{len(assigns)} vessels deployed, {idle} held idle.", s["Small"]))

    # 8-10 Fuel / cost / emissions comparison
    F.append(Paragraph("8-10. Fuel, Cost and Emission Analysis", s["H1"]))
    if opt.get("comparison"):
        rows = [["Metric", "Baseline", "Optimized", "Change %", "Direction"]]
        for c in opt["comparison"]:
            rows.append([f"{c['metric']} ({c['unit']})", f"{c['baseline']:,.1f}",
                         f"{c['optimized']:,.1f}", f"{c['change_pct']:+.2f}%",
                         "improved" if c["improved"] else "worse"])
        F.append(_table(rows, [52 * mm, 32 * mm, 32 * mm, 26 * mm, 28 * mm]))
        F.append(Paragraph("Percentages are computed from the two evaluations above; none are assumed.",
                           s["Small"]))

    # 11 Pareto
    F.append(Paragraph("11. Pareto Analysis", s["H1"]))
    pf = payload.get("pareto")
    if pf and pf.get("solutions"):
        rows = [["ID", "Cost weight", "Cost $", "Lifecycle CO2e t", "Cargo %", "Pareto-optimal"]]
        for sol in pf["solutions"]:
            rows.append([sol["id"], f"{sol['cost_weight']:.2f}", f"{sol['cost_usd']:,.0f}",
                         f"{sol['lifecycle_co2e_tonnes']:,.0f}",
                         f"{sol['cargo_fulfilment_pct']:.0f}", "yes" if sol["pareto_optimal"] else "no"])
        F.append(_table(rows, [16 * mm, 26 * mm, 34 * mm, 36 * mm, 24 * mm, 30 * mm]))
        F.append(Paragraph(f"{pf['pareto_count']} of {len(pf['solutions'])} sampled configurations "
                           f"are non-dominated. Method: {pf['method']}.", s["Small"]))
    else:
        F.append(Paragraph("Pareto sweep not included in this report request.", s["Body"]))

    F.append(PageBreak())

    # 12 Benchmarking
    F.append(Paragraph("12. Benchmarking Results", s["H1"]))
    bm = payload.get("benchmark")
    if bm and bm.get("results"):
        rows = [["Algorithm", "Runs", "Mean fitness", "Std dev", "Best", "Worst", "Iter. to converge", "Runtime s"]]
        for k, v in bm["results"].items():
            rows.append([k, str(v["runs"]), f"{v['mean_fitness']:.4f}", f"{v['std_fitness']:.4f}",
                         f"{v['best_fitness']:.4f}", f"{v['worst_fitness']:.4f}",
                         str(v["mean_iterations_to_converge"] or "-"),
                         f"{v['mean_runtime_seconds']:.2f}"])
        F.append(_table(rows))
        for h in bm.get("head_to_head", []):
            F.append(Paragraph(f"<b>{h['pair']}</b>: better mean fitness achieved by "
                               f"<b>{h['winner']}</b> (gap {h['fitness_gap_pct']:+.2f}%).", s["Body"]))
        F.append(Paragraph(bm.get("note", ""), s["Small"]))
    else:
        F.append(Paragraph("Benchmark not included in this report request.", s["Body"]))

    # 13 Alternative fuels
    F.append(Paragraph("13. Alternative Fuel Comparison", s["H1"]))
    sb = payload.get("fuel_sandbox")
    if sb and sb.get("fuels"):
        rows = [["Fuel", "$/t", "Annual t", "Annual cost $", "Lifecycle CO2e t", "vs base %", "Payback y"]]
        for f in sb["fuels"]:
            rows.append([f["fuel"], f"{f['price_usd_per_tonne']:,.0f}", f"{f['annual_fuel_tonnes']:,.0f}",
                         f"{f['annual_opex_usd']:,.0f}", f"{f['annual_lifecycle_co2e_tonnes']:,.0f}",
                         f"{f['emission_change_pct']:+.1f}",
                         f"{f['payback_years']:.1f}" if f.get("payback_years") else "n/a"])
        F.append(_table(rows))
        F.append(Paragraph(sb.get("note", ""), s["Small"]))

    # 14 Compliance
    F.append(Paragraph("14. Compliance Analysis", s["H1"]))
    cm = payload.get("compliance")
    if cm:
        rows = [["Target", "Required %", "Achieved %", "Current g/t-nm", "Target g/t-nm", "Status"]]
        for t in cm["targets"]:
            rows.append([t["target"], f"{t['required_reduction_pct']:.0f}",
                         f"{t['achieved_reduction_pct']:.1f}",
                         f"{t['current_intensity_g_per_tnm']:.3f}",
                         f"{t['target_intensity_g_per_tnm']:.3f}", t["status"]])
        F.append(_table(rows, [26 * mm, 25 * mm, 25 * mm, 32 * mm, 30 * mm, 32 * mm]))
        ets = cm["eu_ets"]
        F.append(Paragraph(
            f"EU ETS estimate for {ets['year']}: {ets['allowances_surrendered_tonnes']:,.0f} t "
            f"of allowances at a {ets['phase_in_factor']:.0%} phase-in and "
            f"{ets['voyage_coverage_fraction']:.0%} voyage coverage, costing approximately "
            f"<b>${ets['estimated_cost_usd']:,.0f}</b>.", s["Body"]))
        F.append(Paragraph(cm["disclaimer"], s["Small"]))

    # 15 Recommendations
    F.append(Paragraph("15. Recommendations", s["H1"]))
    for i, r in enumerate(_recommendations(payload), 1):
        F.append(Paragraph(f"{i}. {r}", s["Body"]))

    # 16-18
    F.append(Paragraph("16. Methodology Notes", s["H1"]))
    F.append(Paragraph(
        "Fuel consumption follows a cubic speed-power relationship with a load-dependent specific "
        "fuel oil consumption curve minimised near 75% MCR, corrected for cargo displacement, hull "
        "fouling with age, and added resistance from wind, waves and current. Emissions are split "
        "well-to-tank and tank-to-wake; lifecycle CO2e is their sum. The optimiser fitness is a "
        "weighted sum of normalised fuel, cost, emission and reliability terms plus a static "
        "penalty on normalised constraint violation.", s["Body"]))

    F.append(Paragraph("17. Dataset Information", s["H1"]))
    F.append(Paragraph(
        f"<b>Demo dataset generated for simulation and algorithm validation.</b> "
        f"{ml.get('n_samples', 0):,} synthetic voyages produced from the documented physical model "
        f"with injected flow-meter, per-hull and weather noise. This is not real shipping-company "
        f"data and must not be presented as such.", s["Body"]))

    F.append(Paragraph("18. Report Metadata", s["H1"]))
    F.append(_table([
        ["Generated", ts.strftime("%Y-%m-%d %H:%M:%S")],
        ["Platform", "VATES Quantum Fleet Optimization"],
        ["Scenario", scenario.get("name", payload.get("scenario_name", "ad hoc"))],
        ["Algorithm", opt.get("algorithm", "n/a")],
        ["Compute", "Classical hardware; quantum-inspired algorithms only"],
    ], [50 * mm, 110 * mm]))

    doc.build(F, onFirstPage=_page_furniture, onLaterPages=_page_furniture)
    return path

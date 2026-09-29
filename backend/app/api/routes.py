"""
API routes.

Long optimisations run as background tasks writing progress into the
optimization_runs table, so the frontend polls /api/optimize/status/{id}
rather than blocking on a request.
"""
from __future__ import annotations

import csv
import io
import json
import logging
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile)
from fastapi.responses import FileResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database.models import (
    BenchmarkResult, CargoDemand, FuelPrice, FuelType, OptimizationResult,
    OptimizationRun, Prediction, Report, Route, Scenario, Vessel)
from ..database.session import SessionLocal, get_db
from ..ml.predictor import PREDICTOR, train
from ..optimization.engine import benchmark as run_benchmark
from ..optimization.engine import pareto_front, solve
from ..schemas.models import (
    BenchmarkRequest, ComplianceRequest, FuelSandboxRequest, OptimizeRequest,
    ParetoRequest, PredictionRequest, ReportRequest, ScenarioCreate,
    ScenarioPayload, VesselCreate)
from ..services import compliance as compliance_svc
from ..services.dashboard import build_dashboard
from ..services.domain import FUELS, VESSEL_CLASSES
from ..services.fuel_sandbox import compare_fuels
from ..services.physics import compute_voyage
from ..services.reporting import generate_report
from ..services.scenarios import (
    current_fuel_prices, default_payload, problem_from_payload)

log = logging.getLogger("greenfleet.api")
router = APIRouter(prefix="/api")


# ------------------------------------------------------------------ helpers

def _resolve_payload(db: Session, scenario_id: Optional[int],
                     inline: Optional[ScenarioPayload]) -> Dict[str, Any]:
    if inline is not None:
        return json.loads(inline.model_dump_json())
    if scenario_id is not None:
        sc = db.get(Scenario, scenario_id)
        if not sc:
            raise HTTPException(404, f"Scenario {scenario_id} not found.")
        return sc.payload
    return default_payload(db)


def _problem(db: Session, scenario_id, inline, weights=None):
    payload = _resolve_payload(db, scenario_id, inline)
    if weights is not None:
        payload = {**payload, "weights": weights.model_dump()}
    try:
        return problem_from_payload(payload), payload
    except ValueError as e:
        raise HTTPException(422, str(e))


# --------------------------------------------------------------- reference

@router.get("/health", tags=["system"])
def health(db: Session = Depends(get_db)) -> dict:
    n_v = db.scalar(select(Vessel).limit(1))
    try:
        model_ready = bool(PREDICTOR.meta)
    except Exception:
        model_ready = False
    return {
        "status": "ok",
        "database": "connected",
        "dataset": "seeded" if n_v else "empty",
        "optimization_engine": "ready",
        "ml_model": "trained" if model_ready else "not trained",
        "compute": "classical hardware, quantum-inspired algorithms",
    }


@router.get("/fuels", tags=["reference"])
def list_fuels(db: Session = Depends(get_db)) -> dict:
    prices = current_fuel_prices(db)
    return {"fuels": [{**FUELS[k].to_dict(), "current_price_usd_per_tonne": prices.get(k)}
                      for k in FUELS]}


@router.get("/vessel-classes", tags=["reference"])
def list_classes() -> dict:
    return {"classes": [vc.__dict__ for vc in VESSEL_CLASSES.values()]}


# ------------------------------------------------------------------ vessels

@router.get("/vessels", tags=["fleet"])
def list_vessels(db: Session = Depends(get_db), limit: int = Query(200, ge=1, le=1000)) -> dict:
    rows = db.scalars(select(Vessel).limit(limit)).all()
    return {"count": len(rows), "vessels": [{
        "id": v.id, "vessel_code": v.vessel_code, "name": v.name,
        "vessel_class": v.vessel_class, "dwt": v.dwt, "engine_kw": v.engine_kw,
        "age_years": v.age_years, "min_speed_kn": v.min_speed_kn,
        "max_speed_kn": v.max_speed_kn, "allowed_fuels": v.allowed_fuels,
        "status": v.status, "available": v.available} for v in rows]}


@router.post("/vessels", tags=["fleet"], status_code=201)
def create_vessel(body: VesselCreate, db: Session = Depends(get_db)) -> dict:
    if db.scalar(select(Vessel).where(Vessel.vessel_code == body.vessel_code)):
        raise HTTPException(409, f"Vessel code {body.vessel_code} already exists.")
    v = Vessel(**body.model_dump())
    db.add(v)
    db.commit()
    return {"id": v.id, "vessel_code": v.vessel_code}


@router.put("/vessels/{vessel_id}", tags=["fleet"])
def update_vessel(vessel_id: int, body: VesselCreate, db: Session = Depends(get_db)) -> dict:
    v = db.get(Vessel, vessel_id)
    if not v:
        raise HTTPException(404, f"Vessel {vessel_id} not found.")
    for k, val in body.model_dump().items():
        setattr(v, k, val)
    db.commit()
    return {"id": v.id, "updated": True}


@router.delete("/vessels/{vessel_id}", tags=["fleet"])
def delete_vessel(vessel_id: int, db: Session = Depends(get_db)) -> dict:
    v = db.get(Vessel, vessel_id)
    if not v:
        raise HTTPException(404, f"Vessel {vessel_id} not found.")
    db.delete(v)
    db.commit()
    return {"deleted": vessel_id}


@router.get("/routes", tags=["fleet"])
def list_routes(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(Route)).all()
    return {"routes": [{
        "id": r.id, "route_code": r.route_code, "name": r.name, "origin": r.origin,
        "destination": r.destination, "distance_nm": r.distance_nm,
        "weather": r.typical_weather, "wind_speed_kn": r.wind_speed_kn,
        "wave_height_m": r.wave_height_m, "port_hours": r.port_hours,
        "cargo_demand_tonnes": r.demands[0].cargo_tonnes if r.demands else None,
        "deadline_hours": r.demands[0].deadline_hours if r.demands else None,
    } for r in rows]}


ALLOWED_UPLOAD = {".csv"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


@router.post("/upload", tags=["fleet"])
async def upload_vessels(file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict:
    """CSV import. Columns: vessel_code,name,vessel_class,dwt,engine_kw,age_years,
    min_speed_kn,max_speed_kn,allowed_fuels (pipe-separated)."""
    name = (file.filename or "").lower()
    if not any(name.endswith(e) for e in ALLOWED_UPLOAD):
        raise HTTPException(400, "Only .csv uploads are accepted.")
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds the 5 MB upload limit.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "File must be UTF-8 encoded text.")

    reader = csv.DictReader(io.StringIO(text))
    added, skipped, errors = 0, 0, []
    for i, row in enumerate(reader, start=2):
        try:
            code = (row.get("vessel_code") or "").strip()
            if not code:
                raise ValueError("missing vessel_code")
            if db.scalar(select(Vessel).where(Vessel.vessel_code == code)):
                skipped += 1
                continue
            fuels = [f.strip().upper() for f in (row.get("allowed_fuels") or "HFO|MGO").split("|") if f.strip()]
            body = VesselCreate(
                vessel_code=code, name=(row.get("name") or code).strip(),
                vessel_class=(row.get("vessel_class") or "PANAMAX").strip(),
                dwt=float(row["dwt"]), engine_kw=float(row["engine_kw"]),
                age_years=float(row.get("age_years") or 5),
                min_speed_kn=float(row.get("min_speed_kn") or 9),
                max_speed_kn=float(row.get("max_speed_kn") or 15.5),
                allowed_fuels=fuels)
            db.add(Vessel(**body.model_dump()))
            added += 1
        except Exception as e:  # row-level, keep going
            errors.append(f"row {i}: {e}")
    db.commit()
    return {"added": added, "skipped_existing": skipped,
            "errors": errors[:20], "error_count": len(errors)}


@router.get("/dataset/download", tags=["fleet"])
def download_dataset() -> FileResponse:
    from ..ml.dataset import build_and_save
    from pathlib import Path
    p = Path(__file__).resolve().parents[3] / "data" / "processed" / "voyages_demo.csv"
    if not p.exists():
        build_and_save()
    return FileResponse(str(p), media_type="text/csv", filename="voyages_demo.csv")


# ---------------------------------------------------------------- dashboard

@router.get("/dashboard", tags=["dashboard"])
def dashboard(db: Session = Depends(get_db)) -> dict:
    return build_dashboard(db)


# --------------------------------------------------------------- prediction

@router.post("/predict/fuel", tags=["prediction"])
def predict_fuel(body: PredictionRequest, db: Session = Depends(get_db)) -> dict:
    vc = VESSEL_CLASSES[body.vessel_class]
    engine_kw = body.engine_kw or vc.engine_kw * (body.dwt / vc.typical_dwt) ** 0.62

    record = {
        "dwt": body.dwt, "engine_kw": engine_kw, "vessel_age_years": body.vessel_age_years,
        "speed_kn": body.speed_kn, "cargo_tonnes": body.cargo_tonnes,
        "distance_nm": body.distance_nm, "port_hours": body.port_hours,
        "wind_speed_kn": body.wind_speed_kn, "wave_height_m": body.wave_height_m,
        "current_speed_kn": body.current_speed_kn, "vessel_class": body.vessel_class,
        "fuel_type": body.fuel_type, "weather": body.weather, "route": body.route,
    }
    try:
        ml = PREDICTOR.predict(record)
    except Exception as e:
        log.exception("prediction failed")
        raise HTTPException(503, "The prediction model is unavailable. Train it via "
                                 "POST /api/model/train and retry.") from e

    phys = compute_voyage(
        vessel_class=body.vessel_class, dwt=body.dwt, engine_kw=engine_kw,
        vessel_age_years=body.vessel_age_years, speed_kn=body.speed_kn,
        cargo_tonnes=body.cargo_tonnes, distance_nm=body.distance_nm,
        fuel_key=body.fuel_type, wind_speed_kn=body.wind_speed_kn,
        wave_height_m=body.wave_height_m, current_speed_kn=body.current_speed_kn,
        weather=body.weather, port_hours=body.port_hours,
        fuel_price_usd_per_tonne=body.fuel_price_usd_per_tonne,
        carbon_price_usd_per_tonne=body.carbon_price_usd_per_tonne)

    price = body.fuel_price_usd_per_tonne or FUELS[body.fuel_type].price_usd_per_tonne
    spec = FUELS[body.fuel_type]
    tonnes = ml["predicted_fuel_tonnes"]

    # Driver attribution: re-evaluate the physics with one input perturbed to a
    # low reference value and measure the swing. This is a real sensitivity, not
    # a static label.
    drivers = []
    perturbations = {
        "Cruising speed": {"speed_kn": max(vc.min_speed_kn, body.speed_kn * 0.85)},
        "Cargo load": {"cargo_tonnes": body.cargo_tonnes * 0.5},
        "Distance": {"distance_nm": body.distance_nm * 0.5},
        "Weather": {"weather": "CALM", "wind_speed_kn": 5.0, "wave_height_m": 0.5},
        "Vessel age": {"vessel_age_years": 0.0},
    }
    base_kw = dict(vessel_class=body.vessel_class, dwt=body.dwt, engine_kw=engine_kw,
                   vessel_age_years=body.vessel_age_years, speed_kn=body.speed_kn,
                   cargo_tonnes=body.cargo_tonnes, distance_nm=body.distance_nm,
                   fuel_key=body.fuel_type, wind_speed_kn=body.wind_speed_kn,
                   wave_height_m=body.wave_height_m, current_speed_kn=body.current_speed_kn,
                   weather=body.weather, port_hours=body.port_hours)
    for label, override in perturbations.items():
        alt = compute_voyage(**{**base_kw, **override})
        swing = abs(phys.fuel_tonnes - alt.fuel_tonnes) / max(phys.fuel_tonnes, 1e-6) * 100
        drivers.append({"factor": label, "sensitivity_pct": round(swing, 2),
                        "impact": "High" if swing >= 20 else "Medium" if swing >= 7 else "Low"})
    drivers.sort(key=lambda d: -d["sensitivity_pct"])

    out = {
        "predicted_fuel_tonnes": round(tonnes, 2),
        "interval_low_tonnes": round(ml["interval_low_tonnes"], 2),
        "interval_high_tonnes": round(ml["interval_high_tonnes"], 2),
        "physics_model_tonnes": round(phys.fuel_tonnes, 2),
        "ml_vs_physics_delta_pct": round((tonnes - phys.fuel_tonnes) / max(phys.fuel_tonnes, 1e-6) * 100, 2),
        "fuel_tonnes_per_nm": round(tonnes / body.distance_nm, 5),
        "estimated_fuel_cost_usd": round(tonnes * price, 2),
        "ttw_co2e_tonnes": round(tonnes * spec.ttw_co2e_g_per_g, 2),
        "wtt_co2e_tonnes": round(tonnes * spec.wtt_co2e_g_per_g, 2),
        "lifecycle_co2e_tonnes": round(tonnes * spec.lifecycle_co2e_g_per_g, 2),
        "voyage_hours": round(phys.voyage_hours, 1),
        "engine_load_pct": round(phys.engine_load_pct, 1),
        "sfoc_g_per_kwh": round(phys.sfoc_g_per_kwh, 1),
        "model": ml["model"],
        "test_rmse_tonnes": round(ml["test_rmse_tonnes"], 2),
        "test_r2": round(ml["test_r2"], 4),
        "drivers": drivers,
    }
    db.add(Prediction(inputs=record, predicted_fuel_tonnes=tonnes,
                      physics_fuel_tonnes=phys.fuel_tonnes,
                      fuel_cost_usd=out["estimated_fuel_cost_usd"],
                      lifecycle_co2e_tonnes=out["lifecycle_co2e_tonnes"],
                      model_name=ml["model"]))
    db.commit()
    return out


@router.get("/model/performance", tags=["prediction"])
def model_performance() -> dict:
    try:
        m = PREDICTOR.meta
    except Exception as e:
        raise HTTPException(503, "No trained model available.") from e
    return {k: m[k] for k in
            ("best_model", "trained_at", "n_samples", "n_train", "n_test",
             "dataset_notice", "candidates", "metrics", "feature_importance", "diagnostics")
            if k in m}


@router.post("/model/train", tags=["prediction"])
def retrain(n_samples: int = Query(6000, ge=500, le=40000)) -> dict:
    from ..ml.dataset import generate_voyages
    meta = train(df=generate_voyages(n=n_samples))
    PREDICTOR._pipe = None  # force reload
    return {"best_model": meta["best_model"], "metrics": meta["metrics"],
            "candidates": meta["candidates"], "n_samples": meta["n_samples"]}


# ------------------------------------------------------------- optimisation

def _persist_run(db: Session, req: OptimizeRequest, res, payload) -> int:
    run = OptimizationRun(
        scenario_id=req.scenario_id, algorithm=req.algorithm, status="completed",
        progress_pct=100.0, current_iteration=req.iterations,
        total_iterations=req.iterations, best_fitness=res.evaluation.fitness,
        runtime_seconds=res.runtime_seconds,
        config={"population_size": req.population_size, "iterations": req.iterations,
                "seed": req.seed, "refine_speeds": req.refine_speeds})
    db.add(run)
    db.flush()
    db.add(OptimizationResult(
        run_id=run.id, summary=res.evaluation.summary(),
        baseline_summary=res.baseline.summary(), assignments=res.evaluation.assignments,
        comparison=res.comparison, traces=res.traces))
    db.commit()
    return run.id


def _background_solve(run_id: int, payload: Dict[str, Any], req_data: Dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        run = db.get(OptimizationRun, run_id)
        run.status = "running"
        db.commit()
        problem = problem_from_payload(payload)

        def progress(it: int, best: float, mean: float) -> None:
            run.current_iteration = it
            run.progress_pct = round(100.0 * it / max(req_data["iterations"], 1), 1)
            run.best_fitness = best
            run.mean_fitness = mean
            db.commit()

        res = solve(problem, req_data["algorithm"], population=req_data["population_size"],
                    iterations=req_data["iterations"], seed=req_data["seed"],
                    refine_speeds=req_data["refine_speeds"], progress=progress)
        run.status = "completed"
        run.progress_pct = 100.0
        run.best_fitness = res.evaluation.fitness
        run.runtime_seconds = res.runtime_seconds
        db.add(OptimizationResult(
            run_id=run.id, summary=res.evaluation.summary(),
            baseline_summary=res.baseline.summary(), assignments=res.evaluation.assignments,
            comparison=res.comparison, traces=res.traces))
        db.commit()
    except Exception as e:
        log.exception("background optimisation failed")
        run = db.get(OptimizationRun, run_id)
        if run:
            run.status = "failed"
            run.error = str(e)[:500]
            db.commit()
    finally:
        db.close()


@router.post("/optimize", tags=["optimization"])
def optimize(body: OptimizeRequest, bg: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    problem, payload = _problem(db, body.scenario_id, body.scenario, body.weights)

    if body.async_run:
        run = OptimizationRun(scenario_id=body.scenario_id, algorithm=body.algorithm,
                              status="queued", total_iterations=body.iterations,
                              config=body.model_dump(exclude={"scenario"}))
        db.add(run)
        db.commit()
        bg.add_task(_background_solve, run.id, payload, body.model_dump(exclude={"scenario"}))
        return {"run_id": run.id, "status": "queued",
                "poll": f"/api/optimize/status/{run.id}"}

    try:
        res = solve(problem, body.algorithm, population=body.population_size,
                    iterations=body.iterations, seed=body.seed,
                    refine_speeds=body.refine_speeds)
    except Exception as e:
        log.exception("optimisation failed")
        raise HTTPException(500, "Optimisation failed. Check the scenario inputs and retry.") from e

    run_id = _persist_run(db, body, res, payload)
    return {"run_id": run_id, "status": "completed", **res.to_dict()}


# Explicit per-algorithm endpoints required by the specification.
def _algo_endpoint(algo: str):
    def handler(body: OptimizeRequest, bg: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
        body.algorithm = algo
        return optimize(body, bg, db)
    return handler


for _a in ("qga", "qpso", "ga", "pso", "greedy"):
    router.add_api_route(f"/optimize/{_a}", _algo_endpoint(_a.upper()),
                         methods=["POST"], tags=["optimization"],
                         name=f"optimize_{_a}")


@router.get("/optimize/status/{run_id}", tags=["optimization"])
def optimize_status(run_id: int, db: Session = Depends(get_db)) -> dict:
    run = db.get(OptimizationRun, run_id)
    if not run:
        raise HTTPException(404, f"Run {run_id} not found.")
    out = {"run_id": run.id, "status": run.status, "algorithm": run.algorithm,
           "progress_pct": run.progress_pct, "current_iteration": run.current_iteration,
           "total_iterations": run.total_iterations, "best_fitness": run.best_fitness,
           "mean_fitness": run.mean_fitness, "error": run.error,
           "runtime_seconds": run.runtime_seconds}
    if run.result:
        out.update({"summary": run.result.summary,
                    "baseline_summary": run.result.baseline_summary,
                    "assignments": run.result.assignments,
                    "comparison": run.result.comparison,
                    "traces": run.result.traces})
    return out


@router.get("/optimize/runs", tags=["optimization"])
def list_runs(db: Session = Depends(get_db), limit: int = Query(25, ge=1, le=200)) -> dict:
    rows = db.scalars(select(OptimizationRun).order_by(OptimizationRun.id.desc()).limit(limit)).all()
    return {"runs": [{"run_id": r.id, "algorithm": r.algorithm, "status": r.status,
                      "best_fitness": r.best_fitness, "scenario_id": r.scenario_id,
                      "runtime_seconds": r.runtime_seconds,
                      "created_at": r.created_at.isoformat()} for r in rows]}


# -------------------------------------------------------------- benchmarking

@router.post("/benchmark", tags=["benchmark"])
def benchmark_endpoint(body: BenchmarkRequest, db: Session = Depends(get_db)) -> dict:
    problem, _ = _problem(db, body.scenario_id, body.scenario)
    try:
        out = run_benchmark(problem, runs=body.runs, population=body.population_size,
                            iterations=body.iterations, algorithms=body.algorithms)
    except Exception as e:
        log.exception("benchmark failed")
        raise HTTPException(500, "Benchmark run failed. Reduce runs or iterations and retry.") from e
    db.add(BenchmarkResult(scenario_id=body.scenario_id, config=out["config"],
                           results=out["results"], convergence=out["convergence"],
                           head_to_head=out["head_to_head"]))
    db.commit()
    return out


# -------------------------------------------------------------------- pareto

@router.post("/pareto", tags=["optimization"])
def pareto(body: ParetoRequest, db: Session = Depends(get_db)) -> dict:
    problem, _ = _problem(db, body.scenario_id, body.scenario)
    out = pareto_front(problem, samples=body.samples, population=body.population_size,
                       iterations=body.iterations)
    sols = out["solutions"]
    filtered = [s for s in sols
                if s["cargo_fulfilment_pct"] >= body.min_cargo_fulfilment_pct
                and (body.max_emissions_tonnes is None or s["lifecycle_co2e_tonnes"] <= body.max_emissions_tonnes)
                and (body.max_cost_usd is None or s["cost_usd"] <= body.max_cost_usd)]
    out["filtered_solutions"] = filtered
    out["filtered_count"] = len(filtered)
    out["filters_applied"] = {
        "min_cargo_fulfilment_pct": body.min_cargo_fulfilment_pct,
        "max_emissions_tonnes": body.max_emissions_tonnes,
        "max_cost_usd": body.max_cost_usd}
    return out


# ------------------------------------------------------------ fuel sandbox

@router.post("/fuels/sandbox", tags=["fuels"])
def fuel_sandbox(body: FuelSandboxRequest, db: Session = Depends(get_db)) -> dict:
    prices = {**current_fuel_prices(db), **{k.upper(): v for k, v in body.fuel_prices.items()}}
    return compare_fuels(
        vessel_class=body.vessel_class, dwt=body.dwt, speed_kn=body.speed_kn,
        cargo_tonnes=body.cargo_tonnes, distance_nm=body.distance_nm,
        annual_operating_hours=body.annual_operating_hours,
        carbon_price_usd_per_tonne=body.carbon_price_usd_per_tonne,
        fuel_prices=prices, incumbent=body.incumbent,
        horizon_years=body.horizon_years, weather=body.weather)


# --------------------------------------------------------------- compliance

def _compliance_from_run(db: Session, run_id: int) -> Dict[str, float]:
    run = db.get(OptimizationRun, run_id)
    if not run or not run.result:
        raise HTTPException(404, f"No completed result for run {run_id}.")
    s = run.result.summary
    routes = {r.name: r.distance_nm for r in db.scalars(select(Route)).all()}
    if run.scenario_id:
        sc = db.get(Scenario, run.scenario_id)
        if sc:
            routes.update({r["name"]: r["distance_nm"] for r in sc.payload["routes"]})
    work = compliance_svc.transport_work(run.result.assignments, routes)
    return {"lifecycle": s["total_lifecycle_co2e_tonnes"],
            "ttw": s["total_ttw_co2e_tonnes"], "work": max(work, 1.0)}


@router.post("/compliance", tags=["compliance"])
def compliance(body: ComplianceRequest, db: Session = Depends(get_db)) -> dict:
    if body.run_id is not None:
        v = _compliance_from_run(db, body.run_id)
        life, ttw, work = v["lifecycle"], v["ttw"], v["work"]
    elif None not in (body.total_lifecycle_co2e_tonnes, body.total_ttw_co2e_tonnes,
                      body.transport_work_tonne_nm):
        life = body.total_lifecycle_co2e_tonnes
        ttw = body.total_ttw_co2e_tonnes
        work = body.transport_work_tonne_nm
    else:
        raise HTTPException(422, "Provide run_id, or all three of total_lifecycle_co2e_tonnes, "
                                 "total_ttw_co2e_tonnes and transport_work_tonne_nm.")
    return compliance_svc.assess(
        total_lifecycle_co2e_tonnes=life, total_ttw_co2e_tonnes=ttw,
        transport_work_tonne_nm=work,
        baseline_intensity_g_per_tnm=body.baseline_intensity_g_per_tnm,
        carbon_price_usd_per_tonne=body.carbon_price_usd_per_tonne,
        ets_year=body.ets_year, ets_phase_in=body.ets_phase_in,
        eu_voyage_coverage=body.eu_voyage_coverage)


@router.get("/compliance", tags=["compliance"])
def compliance_latest(db: Session = Depends(get_db)) -> dict:
    run = db.scalars(select(OptimizationRun).where(OptimizationRun.status == "completed")
                     .order_by(OptimizationRun.id.desc()).limit(1)).first()
    if not run:
        raise HTTPException(404, "No completed optimisation run to assess. Run the optimiser first.")
    return compliance(ComplianceRequest(run_id=run.id), db)


# ---------------------------------------------------------------- scenarios

@router.get("/scenarios", tags=["scenarios"])
def list_scenarios(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(Scenario).order_by(Scenario.id)).all()
    return {"scenarios": [{
        "id": s.id, "name": s.name, "description": s.description, "tag": s.tag,
        "is_demo": s.is_demo, "vessels": len(s.payload.get("vessels", [])),
        "routes": len(s.payload.get("routes", [])),
        "total_demand_tonnes": sum(r["cargo_demand_tonnes"] for r in s.payload.get("routes", [])),
        "weights": s.payload.get("weights"),
        "created_at": s.created_at.isoformat()} for s in rows]}


@router.get("/scenarios/{scenario_id}", tags=["scenarios"])
def get_scenario(scenario_id: int, db: Session = Depends(get_db)) -> dict:
    s = db.get(Scenario, scenario_id)
    if not s:
        raise HTTPException(404, f"Scenario {scenario_id} not found.")
    return {"id": s.id, "name": s.name, "description": s.description, "tag": s.tag,
            "is_demo": s.is_demo, "payload": s.payload}


@router.post("/scenarios", tags=["scenarios"], status_code=201)
def create_scenario(body: ScenarioCreate, db: Session = Depends(get_db)) -> dict:
    s = Scenario(name=body.name, description=body.description, tag=body.tag,
                 payload=json.loads(body.payload.model_dump_json()), is_demo=False)
    db.add(s)
    db.commit()
    return {"id": s.id, "name": s.name}


@router.post("/scenarios/{scenario_id}/duplicate", tags=["scenarios"], status_code=201)
def duplicate_scenario(scenario_id: int, db: Session = Depends(get_db)) -> dict:
    s = db.get(Scenario, scenario_id)
    if not s:
        raise HTTPException(404, f"Scenario {scenario_id} not found.")
    copy = Scenario(name=f"{s.name} (copy)", description=s.description,
                    tag=s.tag, payload=s.payload, is_demo=False)
    db.add(copy)
    db.commit()
    return {"id": copy.id, "name": copy.name}


@router.delete("/scenarios/{scenario_id}", tags=["scenarios"])
def delete_scenario(scenario_id: int, db: Session = Depends(get_db)) -> dict:
    s = db.get(Scenario, scenario_id)
    if not s:
        raise HTTPException(404, f"Scenario {scenario_id} not found.")
    if s.is_demo:
        raise HTTPException(403, "Built-in demo scenarios cannot be deleted. Duplicate it instead.")
    db.delete(s)
    db.commit()
    return {"deleted": scenario_id}


@router.post("/scenarios/compare", tags=["scenarios"])
def compare_scenarios(ids: List[int], algorithm: str = "QGA",
                      population_size: int = Query(20, ge=4, le=200),
                      iterations: int = Query(40, ge=5, le=500),
                      db: Session = Depends(get_db)) -> dict:
    if not 2 <= len(ids) <= 5:
        raise HTTPException(422, "Compare between two and five scenarios.")
    out = []
    for sid in ids:
        problem, payload = _problem(db, sid, None)
        res = solve(problem, algorithm.upper(), population=population_size,
                    iterations=iterations, seed=42)
        sc = db.get(Scenario, sid)
        out.append({"scenario_id": sid, "name": sc.name if sc else str(sid),
                    "summary": res.evaluation.summary(), "comparison": res.comparison})
    return {"algorithm": algorithm.upper(), "scenarios": out}


# ------------------------------------------------------------------ reports

@router.post("/reports/generate", tags=["reports"])
def generate(body: ReportRequest, db: Session = Depends(get_db)) -> dict:
    run = db.get(OptimizationRun, body.run_id) if body.run_id else \
        db.scalars(select(OptimizationRun).where(OptimizationRun.status == "completed")
                   .order_by(OptimizationRun.id.desc()).limit(1)).first()
    if not run or not run.result:
        raise HTTPException(404, "No completed optimisation run available. Run the optimiser first.")

    scenario_id = body.scenario_id or run.scenario_id
    payload_scenario = _resolve_payload(db, scenario_id, None)
    sc = db.get(Scenario, scenario_id) if scenario_id else None
    problem = problem_from_payload(payload_scenario)

    doc: Dict[str, Any] = {
        "scenario": {**payload_scenario, "name": sc.name if sc else "ad hoc"},
        "optimization": {"algorithm": run.algorithm, "runtime_seconds": run.runtime_seconds or 0.0,
                         "summary": run.result.summary,
                         "baseline_summary": run.result.baseline_summary,
                         "assignments": run.result.assignments,
                         "comparison": run.result.comparison},
    }
    try:
        doc["model_meta"] = PREDICTOR.meta
        v = payload_scenario["vessels"][0]
        r = payload_scenario["routes"][0]
        doc["prediction"] = PREDICTOR.predict({
            "dwt": v["dwt"], "engine_kw": v["engine_kw"], "vessel_age_years": v.get("age_years", 5),
            "speed_kn": 13.0, "cargo_tonnes": v["dwt"] * 0.85, "distance_nm": r["distance_nm"],
            "port_hours": r.get("port_hours", 36), "wind_speed_kn": r.get("wind_speed_kn", 14),
            "wave_height_m": r.get("wave_height_m", 1.8), "current_speed_kn": 0.0,
            "vessel_class": v["vessel_class"], "fuel_type": "HFO",
            "weather": r.get("weather", "MODERATE"), "route": "TUBARAO-ROTTERDAM"})
    except Exception:
        log.warning("model section omitted from report", exc_info=True)

    if body.include_benchmark:
        doc["benchmark"] = run_benchmark(problem, runs=body.benchmark_runs,
                                         population=20, iterations=40)
    if body.include_pareto:
        doc["pareto"] = pareto_front(problem, samples=body.pareto_samples,
                                     population=16, iterations=30)
    if body.include_fuel_sandbox:
        doc["fuel_sandbox"] = compare_fuels(
            fuel_prices=current_fuel_prices(db),
            carbon_price_usd_per_tonne=payload_scenario["economics"].get("carbon_price_usd_per_tonne", 85))

    routes = {r["name"]: r["distance_nm"] for r in payload_scenario["routes"]}
    work = compliance_svc.transport_work(run.result.assignments, routes)
    doc["compliance"] = compliance_svc.assess(
        total_lifecycle_co2e_tonnes=run.result.summary["total_lifecycle_co2e_tonnes"],
        total_ttw_co2e_tonnes=run.result.summary["total_ttw_co2e_tonnes"],
        transport_work_tonne_nm=max(work, 1.0),
        carbon_price_usd_per_tonne=payload_scenario["economics"].get("carbon_price_usd_per_tonne", 85))

    try:
        path = generate_report(doc)
    except Exception as e:
        log.exception("report generation failed")
        raise HTTPException(500, "Report generation failed.") from e

    rec = Report(filename=path.name, title="GreenFleet Quantum Analysis Report",
                 scenario_id=scenario_id, run_id=run.id, size_bytes=path.stat().st_size)
    db.add(rec)
    db.commit()
    return {"report_id": rec.id, "filename": path.name, "size_bytes": rec.size_bytes,
            "download": f"/api/reports/{rec.id}/download"}


@router.get("/reports", tags=["reports"])
def list_reports(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(Report).order_by(Report.id.desc()).limit(50)).all()
    return {"reports": [{"id": r.id, "filename": r.filename, "title": r.title,
                         "size_bytes": r.size_bytes, "run_id": r.run_id,
                         "created_at": r.created_at.isoformat()} for r in rows]}


@router.get("/reports/{report_id}/download", tags=["reports"])
def download_report(report_id: int, db: Session = Depends(get_db)) -> FileResponse:
    from ..services.reporting import REPORTS_DIR
    rec = db.get(Report, report_id)
    if not rec:
        raise HTTPException(404, f"Report {report_id} not found.")
    path = REPORTS_DIR / rec.filename
    if not path.exists():
        raise HTTPException(410, "The report file is no longer on disk. Generate it again.")
    return FileResponse(str(path), media_type="application/pdf", filename=rec.filename)


# ----------------------------------------------------------------- demo mode

@router.post("/demo/load", tags=["demo"])
def load_demo(db: Session = Depends(get_db)) -> dict:
    from ..database.session import seed
    created = seed(db)
    scenarios = db.scalars(select(Scenario).where(Scenario.is_demo.is_(True))).all()
    return {
        "seeded": created,
        "scenarios": [{"id": s.id, "name": s.name, "tag": s.tag,
                       "description": s.description} for s in scenarios],
        "suggested_flow": [
            "1. Load demo scenario", "2. Predict fuel consumption",
            "3. Optimize fleet (QGA)", "4. Review recommended fleet plan",
            "5. Benchmark QGA/QPSO against GA/PSO/greedy",
            "6. Explore alternative fuels", "7. View the Pareto front",
            "8. Generate the PDF report"],
        "notice": "Demo dataset generated for simulation and algorithm validation.",
    }

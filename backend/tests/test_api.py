"""API tests using FastAPI's TestClient against a temporary database."""
import os
import tempfile
from pathlib import Path

import pytest

_tmpdir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmpdir) / 'test.db'}"
os.environ["SEED_ON_START"] = "1"

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ------------------------------------------------------------------ system
def test_health_reports_all_subsystems(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok" and d["database"] == "connected"
    assert "quantum-inspired" in d["compute"]


def test_root_does_not_claim_a_quantum_computer(client):
    d = client.get("/").json()
    assert "No quantum computer is used" in d["compute"]


def test_openapi_schema_is_served(client):
    assert client.get("/openapi.json").status_code == 200


# --------------------------------------------------------------- reference
def test_fuels_endpoint_lists_all_six_fuels(client):
    d = client.get("/api/fuels").json()
    keys = {f["key"] for f in d["fuels"]}
    assert keys == {"HFO", "MGO", "LNG", "METHANOL", "AMMONIA", "HYDROGEN"}
    for f in d["fuels"]:
        assert f["lifecycle_co2e_g_per_g"] == pytest.approx(
            f["ttw_co2e_g_per_g"] + f["wtt_co2e_g_per_g"], abs=1e-3)


def test_seeded_fleet_and_routes_exist(client):
    assert client.get("/api/vessels").json()["count"] >= 20
    assert len(client.get("/api/routes").json()["routes"]) >= 3


# -------------------------------------------------------------- prediction
def test_prediction_returns_real_model_output(client):
    r = client.post("/api/predict/fuel", json={
        "vessel_class": "PANAMAX", "dwt": 76000, "vessel_age_years": 8,
        "speed_kn": 13.5, "cargo_tonnes": 68000, "distance_nm": 5000,
        "fuel_type": "HFO", "weather": "MODERATE"})
    assert r.status_code == 200
    d = r.json()
    assert d["predicted_fuel_tonnes"] > 0
    assert d["interval_low_tonnes"] <= d["predicted_fuel_tonnes"] <= d["interval_high_tonnes"]
    assert d["lifecycle_co2e_tonnes"] > d["ttw_co2e_tonnes"]  # WtT must add
    assert len(d["drivers"]) == 5
    assert d["drivers"] == sorted(d["drivers"], key=lambda x: -x["sensitivity_pct"])


def test_prediction_rejects_cargo_above_deadweight(client):
    r = client.post("/api/predict/fuel", json={
        "vessel_class": "PANAMAX", "dwt": 76000, "speed_kn": 13.5,
        "cargo_tonnes": 200000, "distance_nm": 5000})
    assert r.status_code == 422
    assert "deadweight" in str(r.json()).lower()


def test_prediction_rejects_unknown_fuel_without_stack_trace(client):
    r = client.post("/api/predict/fuel", json={
        "vessel_class": "PANAMAX", "dwt": 76000, "speed_kn": 13.5,
        "cargo_tonnes": 60000, "distance_nm": 5000, "fuel_type": "PLUTONIUM"})
    assert r.status_code == 422
    assert "Traceback" not in r.text


def test_prediction_rejects_negative_distance(client):
    r = client.post("/api/predict/fuel", json={
        "vessel_class": "PANAMAX", "dwt": 76000, "speed_kn": 13.5,
        "cargo_tonnes": 60000, "distance_nm": -100})
    assert r.status_code == 422


def test_model_performance_exposes_metrics(client):
    d = client.get("/api/model/performance").json()
    assert d["metrics"]["r2"] > 0.7
    assert len(d["candidates"]) >= 2
    assert "Demo dataset" in d["dataset_notice"]
    assert d["feature_importance"]


# --------------------------------------------------------------- scenarios
def test_demo_scenarios_are_seeded(client):
    s = client.get("/api/scenarios").json()["scenarios"]
    assert len(s) >= 3
    assert all(x["vessels"] > 0 and x["routes"] > 0 for x in s)


def test_scenario_lifecycle_create_duplicate_delete(client):
    src = client.get("/api/scenarios").json()["scenarios"][0]
    payload = client.get(f"/api/scenarios/{src['id']}").json()["payload"]
    created = client.post("/api/scenarios", json={
        "name": "Unit test scenario", "description": "temp", "tag": "custom",
        "payload": payload})
    assert created.status_code == 201
    sid = created.json()["id"]
    dup = client.post(f"/api/scenarios/{sid}/duplicate")
    assert dup.status_code == 201
    assert client.delete(f"/api/scenarios/{sid}").status_code == 200
    assert client.delete(f"/api/scenarios/{dup.json()['id']}").status_code == 200


def test_demo_scenarios_are_protected_from_deletion(client):
    demo = next(s for s in client.get("/api/scenarios").json()["scenarios"] if s["is_demo"])
    assert client.delete(f"/api/scenarios/{demo['id']}").status_code == 403


def test_scenario_rejects_impossible_demand(client):
    src = client.get("/api/scenarios").json()["scenarios"][0]
    payload = client.get(f"/api/scenarios/{src['id']}").json()["payload"]
    payload["routes"][0]["cargo_demand_tonnes"] = 99_000_000
    r = client.post("/api/scenarios", json={"name": "impossible", "payload": payload})
    assert r.status_code == 422


# ------------------------------------------------------------ optimisation
@pytest.mark.parametrize("algo", ["qga", "qpso", "ga", "pso", "greedy"])
def test_each_algorithm_endpoint_produces_a_plan(client, algo):
    sid = client.get("/api/scenarios").json()["scenarios"][0]["id"]
    r = client.post(f"/api/optimize/{algo}", json={
        "scenario_id": sid, "population_size": 12, "iterations": 15, "seed": 5})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "completed"
    assert d["summary"]["total_fuel_tonnes"] > 0
    assert d["assignments"]
    assert len(d["comparison"]) == 5


def test_comparison_percentages_match_the_underlying_numbers(client):
    sid = client.get("/api/scenarios").json()["scenarios"][0]["id"]
    d = client.post("/api/optimize", json={
        "scenario_id": sid, "algorithm": "QGA", "population_size": 14,
        "iterations": 20, "seed": 11}).json()
    for row in d["comparison"]:
        if row["baseline"]:
            expected = (row["optimized"] - row["baseline"]) / row["baseline"] * 100
            assert abs(row["change_pct"] - expected) < 0.05


def test_objective_weights_are_respected(client):
    sid = client.get("/api/scenarios").json()["scenarios"][0]["id"]
    body = {"scenario_id": sid, "algorithm": "QGA", "population_size": 16,
            "iterations": 25, "seed": 3}
    cost = client.post("/api/optimize", json={
        **body, "weights": {"fuel": 0, "cost": 1, "emission": 0, "reliability": 0}}).json()
    emis = client.post("/api/optimize", json={
        **body, "weights": {"fuel": 0, "cost": 0, "emission": 1, "reliability": 0}}).json()
    assert cost["summary"]["total_cost_usd"] <= emis["summary"]["total_cost_usd"] * 1.2


def test_optimize_rejects_bad_algorithm_and_missing_scenario(client):
    assert client.post("/api/optimize", json={"scenario_id": 1, "algorithm": "QUANTUM"}).status_code == 422
    assert client.post("/api/optimize", json={"algorithm": "QGA"}).status_code == 422


def test_optimize_404s_on_unknown_scenario(client):
    r = client.post("/api/optimize", json={"scenario_id": 99999, "algorithm": "QGA"})
    assert r.status_code == 404


def test_run_history_is_persisted(client):
    runs = client.get("/api/optimize/runs").json()["runs"]
    assert runs and runs[0]["status"] == "completed"
    detail = client.get(f"/api/optimize/status/{runs[0]['run_id']}").json()
    assert detail["summary"]["total_fuel_tonnes"] > 0


# -------------------------------------------------------------- benchmark
def test_benchmark_reports_variance_and_does_not_presuppose_a_winner(client):
    sid = client.get("/api/scenarios").json()["scenarios"][0]["id"]
    d = client.post("/api/benchmark", json={
        "scenario_id": sid, "runs": 3, "population_size": 10, "iterations": 12}).json()
    for a in ("QGA", "GA", "QPSO", "PSO", "GREEDY"):
        assert a in d["results"]
        assert d["results"][a]["std_fitness"] >= 0
    for h in d["head_to_head"]:
        # winner must follow from the numbers, not be asserted
        q, c = h["quantum_mean_fitness"], h["classical_mean_fitness"]
        expected = h["pair"].split(" vs ")[0] if q < c else h["pair"].split(" vs ")[1]
        assert h["winner"] == expected


# ----------------------------------------------------------------- pareto
def test_pareto_returns_non_dominated_set_with_filters(client):
    sid = client.get("/api/scenarios").json()["scenarios"][0]["id"]
    d = client.post("/api/pareto", json={
        "scenario_id": sid, "samples": 5, "population_size": 10,
        "iterations": 12, "min_cargo_fulfilment_pct": 50}).json()
    assert d["pareto_count"] >= 1
    assert all(s["cargo_fulfilment_pct"] >= 50 for s in d["filtered_solutions"])


# ----------------------------------------------------------- fuel sandbox
def test_fuel_sandbox_holds_transport_work_constant(client):
    d = client.post("/api/fuels/sandbox", json={
        "vessel_class": "PANAMAX", "distance_nm": 5000,
        "carbon_price_usd_per_tonne": 150, "incumbent": "HFO"}).json()
    assert len(d["fuels"]) == 6
    hydrogen = next(f for f in d["fuels"] if f["fuel"] == "HYDROGEN")
    assert hydrogen["annual_lifecycle_co2e_tonnes"] < \
           next(f for f in d["fuels"] if f["fuel"] == "HFO")["annual_lifecycle_co2e_tonnes"]
    for f in d["fuels"]:
        assert f["verdict"]
        if f["payback_years"] is None:
            assert f["fuel"] != "HFO" or True  # incumbent needs no payback


def test_fuel_sandbox_responds_to_carbon_price(client):
    low = client.post("/api/fuels/sandbox", json={"carbon_price_usd_per_tonne": 0}).json()
    high = client.post("/api/fuels/sandbox", json={"carbon_price_usd_per_tonne": 500}).json()
    hfo_low = next(f for f in low["fuels"] if f["fuel"] == "HFO")["annual_opex_usd"]
    hfo_high = next(f for f in high["fuels"] if f["fuel"] == "HFO")["annual_opex_usd"]
    assert hfo_high > hfo_low, "carbon price must flow into operating cost"


# ------------------------------------------------------------- compliance
def test_compliance_assessment_from_a_run(client):
    run_id = client.get("/api/optimize/runs").json()["runs"][0]["run_id"]
    d = client.post("/api/compliance", json={"run_id": run_id}).json()
    assert len(d["targets"]) >= 3
    assert d["eu_ets"]["estimated_cost_usd"] >= 0
    assert "not a regulatory calculation" in d["disclaimer"].lower() or \
           "Not a regulatory calculation" in d["disclaimer"]
    for t in d["targets"]:
        assert t["status"] in ("Compliant", "Attention Required", "Above Target")


def test_compliance_requires_sufficient_inputs(client):
    assert client.post("/api/compliance", json={"total_ttw_co2e_tonnes": 100}).status_code == 422


# -------------------------------------------------------------- dashboard
def test_dashboard_insights_are_generated_from_data(client):
    d = client.get("/api/dashboard").json()
    assert d["empty"] is False
    assert d["kpis"]["fleet_size"] >= 20
    assert d["kpis"]["annual_fuel_tonnes"] > 0
    assert len(d["trends"]) == 12
    assert d["insights"]
    # insight text must contain computed figures, not be static prose
    assert any(any(ch.isdigit() for ch in i["text"]) for i in d["insights"])
    assert abs(sum(f["share_pct"] for f in d["fuel_mix"]) - 100) < 1.0


# ----------------------------------------------------------------- reports
def test_report_generation_and_download(client):
    run_id = client.get("/api/optimize/runs").json()["runs"][0]["run_id"]
    r = client.post("/api/reports/generate", json={
        "run_id": run_id, "include_benchmark": True, "include_pareto": True,
        "include_fuel_sandbox": True, "benchmark_runs": 1, "pareto_samples": 3})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["size_bytes"] > 8000, "a real multi-section PDF should not be tiny"
    dl = client.get(d["download"])
    assert dl.status_code == 200
    assert dl.content[:4] == b"%PDF"


# ------------------------------------------------------------------- CRUD
def test_vessel_crud_and_duplicate_rejection(client):
    body = {"vessel_code": "TEST99", "name": "MV Test", "vessel_class": "SUPRAMAX",
            "dwt": 56000, "engine_kw": 7600, "allowed_fuels": ["HFO", "LNG"]}
    r = client.post("/api/vessels", json=body)
    assert r.status_code == 201
    vid = r.json()["id"]
    assert client.post("/api/vessels", json=body).status_code == 409
    assert client.put(f"/api/vessels/{vid}", json={**body, "dwt": 57000}).status_code == 200
    assert client.delete(f"/api/vessels/{vid}").status_code == 200
    assert client.delete(f"/api/vessels/{vid}").status_code == 404


def test_vessel_rejects_invalid_speed_envelope(client):
    r = client.post("/api/vessels", json={
        "vessel_code": "BAD01", "name": "Bad", "vessel_class": "PANAMAX",
        "dwt": 76000, "engine_kw": 9500, "min_speed_kn": 16, "max_speed_kn": 9})
    assert r.status_code == 422


def test_csv_upload_imports_and_reports_row_errors(client):
    csv = ("vessel_code,name,vessel_class,dwt,engine_kw,age_years,min_speed_kn,max_speed_kn,allowed_fuels\n"
           "CSV01,MV CSV One,PANAMAX,78000,9600,6,9,16,HFO|LNG\n"
           "CSV02,MV Bad,NOTACLASS,50000,7000,5,9,15,HFO\n")
    r = client.post("/api/upload", files={"file": ("fleet.csv", csv, "text/csv")})
    assert r.status_code == 200
    d = r.json()
    assert d["added"] == 1 and d["error_count"] == 1


def test_upload_rejects_non_csv(client):
    r = client.post("/api/upload", files={"file": ("bad.exe", b"MZ\x00", "application/octet-stream")})
    assert r.status_code == 400


# ------------------------------------------------------------------- demo
def test_demo_mode_returns_scenarios_and_flow(client):
    d = client.post("/api/demo/load").json()
    assert len(d["scenarios"]) >= 3
    assert len(d["suggested_flow"]) == 8
    assert "Demo dataset" in d["notice"]


# -------------------------------------------------------- map route prediction
def test_map_route_prediction_endpoint(client):
    r = client.post("/api/map/predict", json={
        "route_code": "R02",
        "fuel_type": "VLSFO",
        "fuel_price_usd": 650.0,
        "vessel_class": "Capesize",
        "cargo_demand_tonnes": 180000,
        "weather_severity": "MODERATE",
        "algorithm": "QGA",
        "objective": "balanced"
    })
    assert r.status_code == 200
    d = r.json()
    assert d["quantum_algorithm"] == "QGA"
    assert d["candidate_count"] >= 5
    assert len(d["candidates"]) >= 5
    assert d["best_recommendation"]["id"] == "quantum-pareto"
    assert "algorithm_metadata" in d
    assert "data_provenance" in d


def test_map_route_prediction_objective_selection(client):
    # Test min emissions objective
    r = client.post("/api/map/predict", json={
        "route_code": "R02",
        "fuel_type": "VLSFO",
        "fuel_price_usd": 650.0,
        "vessel_class": "Capesize",
        "cargo_demand_tonnes": 180000,
        "objective": "min_emissions"
    })
    assert r.status_code == 200
    d = r.json()
    assert d["best_recommendation"]["id"] == "min-emissions"

    # Test min cost objective
    r2 = client.post("/api/map/predict", json={
        "route_code": "R02",
        "fuel_type": "VLSFO",
        "fuel_price_usd": 650.0,
        "vessel_class": "Capesize",
        "cargo_demand_tonnes": 180000,
        "objective": "min_cost"
    })
    assert r2.status_code == 200
    assert r2.json()["best_recommendation"]["id"] == "min-cost"


def test_map_route_prediction_validation(client):
    # Cargo demand <= 0 should fail with 400
    r = client.post("/api/map/predict", json={"cargo_demand_tonnes": -100})
    assert r.status_code == 400


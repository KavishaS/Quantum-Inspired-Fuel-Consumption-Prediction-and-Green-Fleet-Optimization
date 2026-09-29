"""Automated tests: physics model, fitness/constraints, optimisers, ML pipeline."""
import numpy as np
import pytest

from app.services.physics import compute_voyage, sfoc_curve
from app.services.domain import FUELS, VESSEL_CLASSES
from app.optimization.problem import (
    Vessel, RouteDemand, EconomicParams, FleetProblem, ObjectiveWeights)
from app.optimization.engine import solve, benchmark, pareto_front


def make_problem(n=8):
    classes = list(VESSEL_CLASSES)
    vessels = [Vessel.from_class(i, classes[i % 4],
               allowed=["HFO", "MGO", "LNG", "METHANOL"]) for i in range(n)]
    routes = [RouteDemand("R1", "A", 3600, 180000, 340),
              RouteDemand("R2", "B", 5100, 120000, 470, weather="ROUGH")]
    return FleetProblem(vessels, routes, EconomicParams(carbon_price_usd_per_tonne=85),
                        ObjectiveWeights(.35, .25, .30, .10))


# ------------------------------------------------------------------ physics
def test_fuel_rises_with_speed():
    kw = dict(vessel_class="PANAMAX", dwt=76000, engine_kw=9500, vessel_age_years=8,
              cargo_tonnes=68000, distance_nm=4000, fuel_key="HFO")
    assert compute_voyage(speed_kn=14, **kw).fuel_tonnes > compute_voyage(speed_kn=11, **kw).fuel_tonnes


def test_sfoc_minimum_near_75pct_mcr():
    assert sfoc_curve(0.75) <= min(sfoc_curve(x) for x in (0.3, 0.5, 0.95, 1.0))


def test_zero_carbon_fuels_still_carry_upstream_emissions():
    for f in ("AMMONIA", "HYDROGEN"):
        assert FUELS[f].ttw_co2e_g_per_g == 0.0
        assert FUELS[f].wtt_co2e_g_per_g > 0.0


def test_daily_burn_is_physically_plausible():
    vc = VESSEL_CLASSES["PANAMAX"]
    r = compute_voyage(vessel_class="PANAMAX", dwt=vc.typical_dwt, engine_kw=vc.engine_kw,
                       vessel_age_years=8, speed_kn=14, cargo_tonnes=68000,
                       distance_nm=5000, fuel_key="HFO")
    per_day = r.fuel_tonnes / (r.voyage_hours / 24)
    assert 20 < per_day < 55, f"Panamax burn {per_day:.1f} t/day implausible"


def test_heavier_cargo_costs_more_fuel():
    kw = dict(vessel_class="CAPESIZE", dwt=180000, engine_kw=15800, vessel_age_years=5,
              speed_kn=13.5, distance_nm=4000, fuel_key="HFO")
    assert compute_voyage(cargo_tonnes=175000, **kw).fuel_tonnes > compute_voyage(cargo_tonnes=50000, **kw).fuel_tonnes


# --------------------------------------------------------- fitness/constraints
def test_idle_fleet_is_infeasible_and_penalised():
    p = make_problem()
    idle = np.zeros(len(p.discrete_dims), dtype=int)
    feasible, _ = p.greedy_baseline()
    ev = p.evaluate(idle)
    assert not ev.feasible and "cargo_shortfall" in ev.violations
    assert ev.fitness > p.evaluate(feasible).fitness


def test_emission_cap_violation_is_detected():
    p = make_problem()
    p.econ.max_lifecycle_emissions_tonnes = 1.0
    chrom, sp = p.greedy_baseline()
    assert "emission_cap" in p.evaluate(chrom, sp).violations


def test_speeds_are_clamped_to_vessel_limits():
    p = make_problem()
    chrom, _ = p.greedy_baseline()
    ev = p.evaluate(chrom, np.full(p.n_vessels, 99.0))
    for a in ev.assignments:
        if a["status"] == "deployed":
            assert a["speed_kn"] <= 16.5


# -------------------------------------------------------------- optimisers
@pytest.mark.parametrize("algo", ["QGA", "GA", "QPSO", "PSO", "GREEDY"])
def test_every_algorithm_returns_a_valid_plan(algo):
    p = make_problem()
    res = solve(p, algo, population=12, iterations=20, seed=7)
    assert res.evaluation.cargo_fulfilment_pct > 0
    assert len(res.evaluation.assignments) == p.n_vessels
    assert len(res.comparison) == 5


def test_search_is_never_worse_than_greedy_baseline():
    p = make_problem()
    g = solve(p, "GREEDY", population=12, iterations=1, seed=1).evaluation.fitness
    q = solve(p, "QGA", population=20, iterations=40, seed=1).evaluation.fitness
    assert q <= g


def test_qga_amplitudes_stay_normalised():
    from app.optimization.qga import QuantumGeneticAlgorithm, QGAConfig
    dims = [4, 3, 5]
    alg = QuantumGeneticAlgorithm(dims, lambda c: float(sum(c)), QGAConfig(8, 5, seed=1))
    Q = alg._uniform_register()
    for _ in range(20):
        alg._rotate(Q[0], np.array([1, 2, 3]), 0.1)
        alg._quantum_mutate(Q[0])
    for g, c in enumerate(dims):
        assert abs(np.sum(Q[0, g, :c] ** 2) - 1.0) < 1e-9, "Born rule violated"


def test_qga_solves_a_known_discrete_optimum():
    from app.optimization.qga import QuantumGeneticAlgorithm, QGAConfig
    dims = [6] * 10
    target = np.array([3] * 10)
    fn = lambda c: float(np.sum(np.abs(np.asarray(c) - target)))
    t = QuantumGeneticAlgorithm(dims, fn, QGAConfig(30, 120, seed=1)).run()
    assert t.best_fitness[-1] <= 2.0


def test_qpso_respects_bounds_and_finds_optimum():
    from app.optimization.qpso import QuantumPSO, QPSOConfig
    t = QuantumPSO([(8.0, 15.0)] * 5, lambda x: float(np.sum((x - 12.0) ** 2)),
                   QPSOConfig(10, 40, seed=2)).run()
    assert all(8.0 <= s <= 15.0 for s in t.best_speeds)
    assert t.best_fitness[-1] < 0.5


def test_qpso_escapes_a_local_optimum_trap():
    """Rastrigin-like multimodal function: velocity-free tunnelling should cope."""
    from app.optimization.qpso import QuantumPSO, QPSOConfig
    f = lambda x: float(np.sum(x ** 2 - 10 * np.cos(2 * np.pi * x) + 10))
    t = QuantumPSO([(-5.12, 5.12)] * 4, f, QPSOConfig(25, 150, seed=4)).run()
    assert t.best_fitness[-1] < 10.0


def test_convergence_curve_is_monotonic_non_increasing():
    p = make_problem()
    res = solve(p, "QGA", population=12, iterations=25, seed=5, refine_speeds=False)
    c = [pt["best"] for pt in res.traces[0]["convergence"]]
    assert all(c[i + 1] <= c[i] + 1e-9 for i in range(len(c) - 1))


def test_comparison_percentages_are_computed_not_hardcoded():
    p = make_problem()
    res = solve(p, "QGA", population=16, iterations=30, seed=9)
    for row in res.comparison:
        base, opt, pct = row["baseline"], row["optimized"], row["change_pct"]
        if base:
            assert abs(pct - (opt - base) / base * 100) < 0.05


# --------------------------------------------------------- benchmark / pareto
def test_benchmark_reports_all_algorithms_with_variance():
    p = make_problem(6)
    b = benchmark(p, runs=3, population=10, iterations=15)
    for a in ("QGA", "GA", "QPSO", "PSO", "GREEDY"):
        assert a in b["results"] and b["results"][a]["std_fitness"] >= 0
    assert len(b["head_to_head"]) == 2
    for h in b["head_to_head"]:
        assert h["winner"] in h["pair"]


def test_pareto_front_contains_no_dominated_points():
    p = make_problem(6)
    pf = pareto_front(p, samples=5, population=10, iterations=15)
    front = [s for s in pf["solutions"] if s["pareto_optimal"]]
    assert front
    for a in front:
        for b in pf["solutions"]:
            dominated = (b["cost_usd"] <= a["cost_usd"]
                         and b["lifecycle_co2e_tonnes"] <= a["lifecycle_co2e_tonnes"]
                         and (b["cost_usd"] < a["cost_usd"]
                              or b["lifecycle_co2e_tonnes"] < a["lifecycle_co2e_tonnes"]))
            assert not dominated


# --------------------------------------------------------------------- ML
def test_ml_model_trains_and_predicts_with_interval():
    from app.ml.dataset import generate_voyages
    from app.ml.predictor import train, FuelPredictor
    import tempfile, pathlib
    df = generate_voyages(n=900, seed=11)
    with tempfile.TemporaryDirectory() as td:
        meta = train(df=df, artifact_dir=pathlib.Path(td))
        assert meta["metrics"]["r2"] > 0.75
        assert len(meta["candidates"]) >= 2
        out = FuelPredictor(pathlib.Path(td)).predict({
            "dwt": 76000, "engine_kw": 9500, "vessel_age_years": 8, "speed_kn": 13.5,
            "cargo_tonnes": 68000, "distance_nm": 5000, "port_hours": 36,
            "wind_speed_kn": 14, "wave_height_m": 1.8, "current_speed_kn": 0.0,
            "vessel_class": "PANAMAX", "fuel_type": "HFO", "weather": "MODERATE",
            "route": "TUBARAO-ROTTERDAM"})
        assert out["predicted_fuel_tonnes"] > 0
        assert out["interval_low_tonnes"] <= out["predicted_fuel_tonnes"] <= out["interval_high_tonnes"]


def test_dataset_is_labelled_as_synthetic():
    from app.ml.dataset import DATASET_NOTICE
    assert "Demo dataset" in DATASET_NOTICE and "simulation" in DATASET_NOTICE

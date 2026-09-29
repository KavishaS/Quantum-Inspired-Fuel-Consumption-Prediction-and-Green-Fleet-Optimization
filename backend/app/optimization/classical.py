"""
Classical baselines used for benchmarking.

These are deliberately competent implementations, not strawmen: tournament
selection with elitism and uniform crossover for the GA, and canonical
inertia-weight PSO with the standard Clerc-style coefficients. A benchmark
is only evidence if the comparator is a fair one.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Tuple

import numpy as np

from .qga import OptimizationTrace


@dataclass
class GAConfig:
    population_size: int = 30
    generations: int = 120
    crossover_rate: float = 0.85
    mutation_rate: float = 0.03
    tournament_size: int = 3
    elite_count: int = 2
    seed: Optional[int] = 42


class StandardGA:
    """Generational GA with tournament selection, uniform crossover, elitism."""

    def __init__(self, dims: Sequence[int], fitness_fn: Callable[[np.ndarray], float],
                 config: Optional[GAConfig] = None):
        self.dims = list(dims)
        self.fitness_fn = fitness_fn
        self.cfg = config or GAConfig()
        self.rng = np.random.default_rng(self.cfg.seed)

    def _random_individual(self) -> np.ndarray:
        return np.array([self.rng.integers(0, c) for c in self.dims], dtype=int)

    def _tournament(self, pop: np.ndarray, fit: np.ndarray) -> np.ndarray:
        idx = self.rng.integers(0, len(pop), self.cfg.tournament_size)
        return pop[idx[np.argmin(fit[idx])]].copy()

    def run(self, progress: Optional[Callable[[int, float, float], None]] = None
            ) -> OptimizationTrace:
        cfg = self.cfg
        t0 = time.perf_counter()
        pop = np.array([self._random_individual() for _ in range(cfg.population_size)])
        fit = np.array([self.fitness_fn(ind) for ind in pop])
        evals = cfg.population_size

        trace = OptimizationTrace(algorithm="GA")
        best_i = int(np.argmin(fit))
        g_best, g_best_fit = pop[best_i].copy(), float(fit[best_i])

        for gen in range(cfg.generations):
            order = np.argsort(fit)
            new_pop = [pop[i].copy() for i in order[: cfg.elite_count]]

            while len(new_pop) < cfg.population_size:
                p1, p2 = self._tournament(pop, fit), self._tournament(pop, fit)
                if self.rng.random() < cfg.crossover_rate:
                    mask = self.rng.random(len(self.dims)) < 0.5
                    c1 = np.where(mask, p1, p2)
                    c2 = np.where(mask, p2, p1)
                else:
                    c1, c2 = p1, p2
                for child in (c1, c2):
                    for g, card in enumerate(self.dims):
                        if self.rng.random() < cfg.mutation_rate:
                            child[g] = self.rng.integers(0, card)
                    if len(new_pop) < cfg.population_size:
                        new_pop.append(child)

            pop = np.array(new_pop)
            fit = np.array([self.fitness_fn(ind) for ind in pop])
            evals += len(pop)

            i = int(np.argmin(fit))
            if fit[i] < g_best_fit:
                g_best_fit, g_best = float(fit[i]), pop[i].copy()

            trace.best_fitness.append(g_best_fit)
            trace.mean_fitness.append(float(fit.mean()))
            trace.worst_fitness.append(float(fit.max()))
            if progress and gen % 5 == 0:
                progress(gen, g_best_fit, float(fit.mean()))

        trace.evaluations = evals
        trace.runtime_seconds = time.perf_counter() - t0
        trace.best_solution = g_best.tolist()
        return trace


@dataclass
class PSOConfig:
    swarm_size: int = 30
    iterations: int = 120
    w_max: float = 0.9
    w_min: float = 0.4
    c1: float = 1.49445
    c2: float = 1.49445
    seed: Optional[int] = 42


class StandardPSO:
    """Canonical inertia-weight PSO with velocity clamping."""

    def __init__(self, bounds: Sequence[Tuple[float, float]],
                 fitness_fn: Callable[[np.ndarray], float],
                 config: Optional[PSOConfig] = None):
        self.bounds = np.asarray(bounds, dtype=float)
        self.lo, self.hi = self.bounds[:, 0], self.bounds[:, 1]
        self.dim = len(bounds)
        self.fitness_fn = fitness_fn
        self.cfg = config or PSOConfig()
        self.rng = np.random.default_rng(self.cfg.seed)

    def run(self, progress: Optional[Callable[[int, float, float], None]] = None
            ) -> OptimizationTrace:
        cfg = self.cfg
        t0 = time.perf_counter()
        n, d = cfg.swarm_size, self.dim
        span = self.hi - self.lo
        vmax = 0.25 * span

        X = self.rng.uniform(self.lo, self.hi, size=(n, d))
        V = self.rng.uniform(-vmax, vmax, size=(n, d))
        fit = np.array([self.fitness_fn(x) for x in X])
        evals = n

        P, pfit = X.copy(), fit.copy()
        gi = int(np.argmin(pfit))
        G, gfit = P[gi].copy(), float(pfit[gi])

        trace = OptimizationTrace(algorithm="PSO")

        for it in range(cfg.iterations):
            w = cfg.w_max - (cfg.w_max - cfg.w_min) * (it / max(1, cfg.iterations - 1))
            for i in range(n):
                r1, r2 = self.rng.random(d), self.rng.random(d)
                V[i] = w * V[i] + cfg.c1 * r1 * (P[i] - X[i]) + cfg.c2 * r2 * (G - X[i])
                V[i] = np.clip(V[i], -vmax, vmax)
                X[i] = np.clip(X[i] + V[i], self.lo, self.hi)
                f = self.fitness_fn(X[i])
                evals += 1
                if f < pfit[i]:
                    pfit[i], P[i] = f, X[i].copy()
                    if f < gfit:
                        gfit, G = float(f), X[i].copy()

            trace.best_fitness.append(gfit)
            trace.mean_fitness.append(float(pfit.mean()))
            trace.worst_fitness.append(float(pfit.max()))
            if progress and it % 5 == 0:
                progress(it, gfit, float(pfit.mean()))

        trace.evaluations = evals
        trace.runtime_seconds = time.perf_counter() - t0
        trace.best_speeds = G.tolist()
        return trace

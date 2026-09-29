"""
Quantum-Inspired Particle Swarm Optimization (QPSO) for continuous variables.

WHY IT IS NOT RENAMED PSO
-------------------------
Standard PSO carries a velocity term and updates
    v <- w*v + c1*r1*(pbest - x) + c2*r2*(gbest - x);  x <- x + v
A particle's trajectory is therefore deterministic given its velocity, and
the search region is bounded by that velocity.

QPSO removes velocity entirely. Each particle is treated as a quantum
particle bound in a delta potential well centred on a stochastic attractor
p. From the wave function psi(x) = (1/sqrt(L)) exp(-|x-p|/L), the probability
density is |psi|^2 and the Monte-Carlo collapse of the position operator
gives the closed-form update

    x = p  ±  (L/2) * ln(1/u),        u ~ U(0,1)

with the characteristic length L = 2 * beta * |mbest - x|, where mbest is the
mean of all personal bests. Because ln(1/u) is unbounded, a particle has
non-zero probability of appearing anywhere in the search space at any
iteration — this is the tunnelling behaviour that lets QPSO leave local
optima a velocity-bounded swarm cannot.

The attractor for particle i in dimension d is the standard stochastic blend

    p_id = phi * pbest_id + (1 - phi) * gbest_d,    phi ~ U(0,1)

beta (the contraction-expansion coefficient) is annealed from beta_max to
beta_min, which is the convergence control in place of inertia weight.

Lower fitness is better.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Tuple

import numpy as np

from .qga import OptimizationTrace


@dataclass
class QPSOConfig:
    swarm_size: int = 30
    iterations: int = 120
    beta_max: float = 1.0
    beta_min: float = 0.4
    seed: Optional[int] = 42


class QuantumPSO:
    def __init__(self, bounds: Sequence[Tuple[float, float]],
                 fitness_fn: Callable[[np.ndarray], float],
                 config: Optional[QPSOConfig] = None):
        self.bounds = np.asarray(bounds, dtype=float)
        self.lo, self.hi = self.bounds[:, 0], self.bounds[:, 1]
        self.dim = len(bounds)
        self.fitness_fn = fitness_fn
        self.cfg = config or QPSOConfig()
        self.rng = np.random.default_rng(self.cfg.seed)

    def run(self, progress: Optional[Callable[[int, float, float], None]] = None
            ) -> OptimizationTrace:
        cfg = self.cfg
        t0 = time.perf_counter()
        n, d = cfg.swarm_size, self.dim

        X = self.rng.uniform(self.lo, self.hi, size=(n, d))
        fit = np.array([self.fitness_fn(x) for x in X])
        evals = n

        P = X.copy()              # personal bests
        pfit = fit.copy()
        gi = int(np.argmin(pfit))
        G = P[gi].copy()
        gfit = float(pfit[gi])

        trace = OptimizationTrace(algorithm="QPSO")

        for it in range(cfg.iterations):
            beta = cfg.beta_max - (cfg.beta_max - cfg.beta_min) * (it / max(1, cfg.iterations - 1))
            mbest = P.mean(axis=0)          # swarm mean best position

            for i in range(n):
                phi = self.rng.random(d)
                p = phi * P[i] + (1.0 - phi) * G          # stochastic attractor
                L = 2.0 * beta * np.abs(mbest - X[i])     # potential well width
                L = np.maximum(L, 1e-9)
                u = self.rng.random(d)
                sign = np.where(self.rng.random(d) < 0.5, -1.0, 1.0)
                # Collapse of the position operator in a delta potential well
                X[i] = p + sign * (L / 2.0) * np.log(1.0 / u)
                X[i] = np.clip(X[i], self.lo, self.hi)

                f = self.fitness_fn(X[i])
                evals += 1
                if f < pfit[i]:
                    pfit[i] = f
                    P[i] = X[i].copy()
                    if f < gfit:
                        gfit = float(f)
                        G = X[i].copy()

            trace.best_fitness.append(gfit)
            trace.mean_fitness.append(float(pfit.mean()))
            trace.worst_fitness.append(float(pfit.max()))
            if progress and it % 5 == 0:
                progress(it, gfit, float(pfit.mean()))

        trace.evaluations = evals
        trace.runtime_seconds = time.perf_counter() - t0
        trace.best_speeds = G.tolist()
        return trace

"""
Quantum-Inspired Genetic Algorithm (QGA) for discrete fleet decisions.

REPRESENTATION
--------------
A classical GA stores a fixed allele per gene. QGA instead stores, for every
gene g with cardinality C_g, a vector of probability amplitudes

    Q_g = [alpha_g,1 ... alpha_g,C_g],     sum_k alpha_g,k^2 = 1

so one individual is a superposition over C_g discrete choices rather than a
single choice. A concrete candidate is produced by *observation*: sampling
allele k with probability alpha_g,k^2. Each individual therefore covers a
region of the search space, which is what gives QGA its broader early
exploration than a same-sized classical population.

UPDATE (quantum rotation gate)
------------------------------
Amplitudes are evolved by rotating each gene's amplitude vector toward the
allele held by the attractor (elite/global best), the multi-level
generalisation of the 2-level rotation gate

    |alpha'|   [cos(dtheta)  -sin(dtheta)] |alpha|
    |beta' | = [sin(dtheta)   cos(dtheta)] |beta |

Implemented as: increase the attractor allele's squared amplitude by
dtheta-proportional mass, renormalise the rest, then renormalise the vector.
The step size dtheta is annealed from theta_max to theta_min so the
population converges as the run proceeds.

QUANTUM MUTATION / CATASTROPHE
------------------------------
With probability p_mut a gene is partially collapsed back toward the uniform
superposition, restoring diversity. If the global best stagnates for
`catastrophe_after` generations, the worst half of the population is reset to
uniform superposition — the quantum analogue of a restart, which helps escape
deceptive basins.

Lower fitness is better.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Sequence

import numpy as np


@dataclass
class QGAConfig:
    population_size: int = 30
    generations: int = 120
    theta_max: float = 0.05 * np.pi
    theta_min: float = 0.005 * np.pi
    mutation_rate: float = 0.03
    elite_fraction: float = 0.2
    observations_per_individual: int = 1
    catastrophe_after: int = 15
    seed: Optional[int] = 42


@dataclass
class OptimizationTrace:
    algorithm: str
    best_fitness: List[float] = field(default_factory=list)
    mean_fitness: List[float] = field(default_factory=list)
    worst_fitness: List[float] = field(default_factory=list)
    evaluations: int = 0
    runtime_seconds: float = 0.0
    best_solution: Optional[List[int]] = None
    best_speeds: Optional[List[float]] = None

    def to_dict(self) -> dict:
        return {
            "algorithm": self.algorithm,
            "convergence": [
                {"iteration": i, "best": round(b, 6), "mean": round(m, 6), "worst": round(w, 6)}
                for i, (b, m, w) in enumerate(
                    zip(self.best_fitness, self.mean_fitness, self.worst_fitness))
            ],
            "evaluations": self.evaluations,
            "runtime_seconds": round(self.runtime_seconds, 4),
            "final_best_fitness": round(self.best_fitness[-1], 6) if self.best_fitness else None,
        }


class QuantumGeneticAlgorithm:
    def __init__(self, dims: Sequence[int], fitness_fn: Callable[[np.ndarray], float],
                 config: Optional[QGAConfig] = None):
        self.dims = list(dims)
        self.fitness_fn = fitness_fn
        self.cfg = config or QGAConfig()
        self.rng = np.random.default_rng(self.cfg.seed)
        self.n_genes = len(self.dims)
        self.max_card = max(self.dims) if self.dims else 1

    # --------------------------------------------------------------- quantum

    def _uniform_register(self) -> np.ndarray:
        """Q[i, g, k] = amplitude of allele k in gene g of individual i."""
        pop, G, K = self.cfg.population_size, self.n_genes, self.max_card
        Q = np.zeros((pop, G, K))
        for g, c in enumerate(self.dims):
            Q[:, g, :c] = 1.0 / np.sqrt(c)   # equal superposition
        return Q

    def _observe(self, q_ind: np.ndarray) -> np.ndarray:
        """Collapse one individual's register into a concrete chromosome."""
        out = np.zeros(self.n_genes, dtype=int)
        for g, c in enumerate(self.dims):
            p = q_ind[g, :c] ** 2
            s = p.sum()
            p = p / s if s > 0 else np.full(c, 1.0 / c)
            out[g] = self.rng.choice(c, p=p)
        return out

    def _rotate(self, q_ind: np.ndarray, target: np.ndarray, dtheta: float) -> None:
        """
        Rotate each gene's amplitude vector toward the target allele.
        Mass moved is proportional to sin(dtheta); the vector is renormalised
        so the unit-norm (Born rule) constraint is preserved exactly.
        """
        gain = np.sin(dtheta)
        for g, c in enumerate(self.dims):
            amp = q_ind[g, :c]
            prob = amp ** 2
            k = int(target[g]) % c
            prob[k] += gain * (1.0 - prob[k])
            others = prob.sum() - prob[k]
            if others > 0:
                scale = (1.0 - prob[k]) / others
                prob *= scale
                prob[k] = 1.0 - (prob.sum() - prob[k])
            prob = np.clip(prob, 1e-6, 1.0)
            prob /= prob.sum()
            q_ind[g, :c] = np.sqrt(prob)

    def _quantum_mutate(self, q_ind: np.ndarray) -> None:
        """Partial collapse toward uniform superposition (diversity restore)."""
        for g, c in enumerate(self.dims):
            if self.rng.random() < self.cfg.mutation_rate:
                uni = np.full(c, 1.0 / np.sqrt(c))
                q_ind[g, :c] = 0.5 * q_ind[g, :c] + 0.5 * uni
                q_ind[g, :c] /= np.linalg.norm(q_ind[g, :c])

    # ------------------------------------------------------------------- run

    def run(self, progress: Optional[Callable[[int, float, float], None]] = None
            ) -> OptimizationTrace:
        cfg = self.cfg
        t0 = time.perf_counter()
        Q = self._uniform_register()
        trace = OptimizationTrace(algorithm="QGA")

        g_best: Optional[np.ndarray] = None
        g_best_fit = np.inf
        stagnant = 0
        evals = 0
        n_elite = max(1, int(cfg.elite_fraction * cfg.population_size))

        for gen in range(cfg.generations):
            dtheta = cfg.theta_max - (cfg.theta_max - cfg.theta_min) * (gen / max(1, cfg.generations - 1))

            ind_best: List[np.ndarray] = []
            ind_fit = np.empty(cfg.population_size)
            for i in range(cfg.population_size):
                best_c, best_f = None, np.inf
                for _ in range(cfg.observations_per_individual):
                    c = self._observe(Q[i])
                    f = self.fitness_fn(c)
                    evals += 1
                    if f < best_f:
                        best_c, best_f = c, f
                ind_best.append(best_c)  # type: ignore[arg-type]
                ind_fit[i] = best_f

            order = np.argsort(ind_fit)
            if ind_fit[order[0]] < g_best_fit - 1e-12:
                g_best_fit = float(ind_fit[order[0]])
                g_best = ind_best[order[0]].copy()
                stagnant = 0
            else:
                stagnant += 1

            # Elites rotate toward their own observation; the rest toward the
            # global best. This keeps elite lineages exploring locally while
            # the tail is pulled into the promising region.
            elite_idx = set(order[:n_elite].tolist())
            for i in range(cfg.population_size):
                target = ind_best[i] if i in elite_idx else g_best
                self._rotate(Q[i], target, dtheta)  # type: ignore[arg-type]
                self._quantum_mutate(Q[i])

            if stagnant >= cfg.catastrophe_after:
                for i in order[n_elite:]:
                    for gnr, c in enumerate(self.dims):
                        Q[i, gnr, :c] = 1.0 / np.sqrt(c)
                stagnant = 0

            trace.best_fitness.append(g_best_fit)
            trace.mean_fitness.append(float(ind_fit.mean()))
            trace.worst_fitness.append(float(ind_fit.max()))
            if progress and gen % 5 == 0:
                progress(gen, g_best_fit, float(ind_fit.mean()))

        trace.evaluations = evals
        trace.runtime_seconds = time.perf_counter() - t0
        trace.best_solution = g_best.tolist() if g_best is not None else None
        return trace

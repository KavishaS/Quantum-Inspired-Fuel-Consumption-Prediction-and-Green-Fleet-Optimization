import { Atom, Waves } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { getModelPerformance } from "@/services/api";
import { LoadingState } from "@/components/ui/States";
import { fmtNum } from "@/utils/format";

const FLOW = [
  "Fleet Data", "Data Preprocessing", "Fuel Prediction Model", "Operational Constraints",
  "QGA / QPSO Optimization", "Multi-Objective Evaluation", "Pareto Solutions",
  "Benchmarking", "Recommended Fleet Plan", "Report",
];

export function About() {
  const { data: ml } = useAsync(getModelPerformance);

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <div>
        <div className="flex items-center gap-2 text-steel">
          <Waves className="h-5 w-5" />
          <span className="font-display text-sm font-semibold tracking-wide">GREENFLEET QUANTUM</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-slate-ink mt-2">About &amp; Methodology</h1>
        <p className="text-sm text-slate-body mt-1">PS-138 — Quantum-Inspired Fuel Consumption Prediction and Green Fleet Optimization</p>
      </div>

      <section className="glass-panel rounded-xl p-5">
        <h2 className="font-display text-base font-semibold text-slate-ink mb-2">The problem</h2>
        <p className="text-sm text-slate-body leading-relaxed">
          Maritime operators must cut fuel cost and greenhouse-gas emissions while still meeting cargo
          commitments and schedules. The decision space is large and non-linear: which vessels to deploy,
          on which routes, carrying what cargo, at what speed, burning which fuel. This platform answers one
          question end to end — given cargo demand, available vessels, routes and fuel/carbon prices, which
          vessel should sail which route, at what speed, on which fuel, and at what cost?
        </p>
      </section>

      <section className="glass-panel rounded-xl p-5">
        <h2 className="font-display text-base font-semibold text-slate-ink mb-3">Methodology flow</h2>
        <div className="flex flex-col gap-1">
          {FLOW.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className="h-7 w-7 rounded-full border-2 border-steel text-steel flex items-center justify-center text-xs font-semibold font-display shrink-0">
                  {i + 1}
                </div>
                {i < FLOW.length - 1 && <div className="w-px h-5 bg-slate-line" />}
              </div>
              <span className="text-sm text-slate-ink font-medium pb-5">{step}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Atom className="h-5 w-5 text-steel" />
          <h2 className="font-display text-base font-semibold text-slate-ink">Why quantum-inspired?</h2>
        </div>
        <p className="text-sm text-slate-body leading-relaxed mb-3">
          <strong className="text-slate-ink">This platform runs on classical hardware. No quantum computer
          is used at any point.</strong> "Quantum-inspired" means the optimisation algorithms borrow
          mathematical structures from quantum mechanics — probability amplitudes, the Born rule, rotation
          gates, delta-potential-well position collapse — and execute them as ordinary numerical code.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-ink mb-1">QGA — discrete decisions</h3>
            <p className="text-xs text-slate-body leading-relaxed">
              Each gene is a vector of probability amplitudes over its possible values rather than a single
              fixed allele. A concrete plan is produced by observation — sampling each allele by its squared
              amplitude. A quantum rotation gate nudges amplitudes toward promising choices each generation,
              so one individual explores a region of the search space rather than a single point. Solves
              vessel deployment, route assignment and fuel selection.
            </p>
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-ink mb-1">QPSO — continuous decisions</h3>
            <p className="text-xs text-slate-body leading-relaxed">
              Removes velocity entirely. Each particle is treated as bound in a delta potential well, and its
              next position is drawn from the resulting probability distribution — including a small chance
              of appearing anywhere in the search space, a tunnelling effect a velocity-bounded swarm cannot
              reproduce. Solves cruising speed per vessel.
            </p>
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-xl p-5">
        <h2 className="font-display text-base font-semibold text-slate-ink mb-2">Fuel prediction model</h2>
        {!ml ? <LoadingState label="Loading model metrics" /> : (
          <>
            <p className="text-sm text-slate-body leading-relaxed mb-3">
              Trained on {fmtNum(ml.n_samples)} synthetic voyages generated from the documented physical
              model with injected sensor and weather noise. Two candidate regressors were compared on a
              held-out test set; the better model by RMSE was promoted automatically.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-body border-b border-slate-line">
                    {["Model", "MAE (t)", "RMSE (t)", "R²", "MAPE"].map((h) => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ml.candidates.map((c) => (
                    <tr key={c.name} className={`border-b border-slate-line last:border-0 ${c.name === ml.best_model ? "bg-signal/5" : ""}`}>
                      <td className="py-2 pr-3 font-medium text-slate-ink">{c.name}{c.name === ml.best_model && <span className="text-xs text-steel ml-1.5">(promoted)</span>}</td>
                      <td className="py-2 pr-3 tabular">{c.mae.toFixed(2)}</td>
                      <td className="py-2 pr-3 tabular">{c.rmse.toFixed(2)}</td>
                      <td className="py-2 pr-3 tabular">{c.r2.toFixed(4)}</td>
                      <td className="py-2 pr-3 tabular">{c.mape_pct.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-body mt-3">{ml.dataset_notice}</p>
          </>
        )}
      </section>

      <section className="border border-warn/25 bg-warn/5 p-4 text-xs text-slate-body">
        This is a demonstration platform built for Smart India Hackathon problem statement PS-138. Compliance
        figures are model estimates, not certified regulatory calculations. The bundled dataset is synthetic
        and generated for simulation and algorithm validation.
      </section>
    </div>
  );
}


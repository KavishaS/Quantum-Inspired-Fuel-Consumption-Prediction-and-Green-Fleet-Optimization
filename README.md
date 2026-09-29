# GREENFLEET QUANTUM

**Quantum-Inspired Fuel Prediction & Green Fleet Optimization**
*Predict. Optimize. Decarbonize.*

Smart India Hackathon — **PS-138: Quantum-Inspired Fuel Consumption Prediction and Green Fleet Optimization**

---

## Two statements we make up front

**Compute.** This platform runs *quantum-inspired* metaheuristics on ordinary classical hardware. No quantum computer, quantum simulator, or quantum cloud service is used at any point. "Quantum-inspired" means the algorithms borrow mathematical structures from quantum mechanics — probability amplitudes, the Born rule, rotation gates, delta-potential-well position collapse — and run them as classical numerical code.

**Data.** The bundled dataset is labelled *"Demo dataset generated for simulation and algorithm validation."* It is synthetic, produced from the documented physical model with injected noise. It is not real shipping-company data and must never be presented as such.

---

## 1. Problem

Maritime operators must cut fuel cost and greenhouse-gas emissions while still meeting cargo commitments and schedules. The decision space is large and non-linear: which vessels to deploy, on which routes, carrying what cargo, at what speed, burning which fuel. Objectives conflict — the cheapest plan is rarely the cleanest — and constraints (cargo demand, deadlines, emission ceilings, fuel compatibility) rule out most of the space.

This platform answers one question end to end:

> *Given this cargo demand, these available vessels, these routes, these fuel and carbon prices, and these emission constraints — which vessel should sail which route, at what speed, on which fuel, and at what cost?*

## 2. What makes this different

Existing commercial platforms (Wärtsilä FOS, NAPA, ZeroNorth, Eniram) optimise **voyages that are already assigned**: weather routing, trim, speed profile, performance monitoring. This platform optimises **future fleet configuration** — the assignment itself — and treats vessel, route, fuel and speed as one joint decision under a multi-objective fitness. The quantum-inspired engine is benchmarked honestly against classical metaheuristics rather than assumed superior.

---

## 3. Architecture

```mermaid
flowchart TD
    A[Fleet Data / Routes / Fuel Prices] --> B[Data Preprocessing<br/>+ Feature Engineering]
    B --> C[Fuel Prediction Model<br/>GradientBoosting / RandomForest]
    A --> D[Physical Voyage Model<br/>cubic speed-power, SFOC curve]
    D --> E[Fitness Function<br/>weighted, normalised, penalised]
    C --> E
    F[Operational Constraints<br/>cargo, schedule, emissions, fuel] --> E
    E --> G[QGA<br/>discrete: vessel, route, fuel]
    E --> H[QPSO<br/>continuous: speed per vessel]
    G --> H
    G --> I[Multi-Objective Evaluation]
    H --> I
    I --> J[Pareto Solutions<br/>cost vs lifecycle CO2e]
    I --> K[Benchmarking<br/>vs GA / PSO / greedy]
    J --> L[Recommended Fleet Plan]
    K --> L
    L --> M[PDF Report + Compliance]
```

### System layers

```mermaid
flowchart LR
    subgraph Frontend["Frontend — React + TypeScript + Vite"]
        UI[Dashboard · Predictor · Optimizer · Sandbox<br/>Pareto · Benchmark · Compliance · Scenarios]
    end
    subgraph Backend["Backend — FastAPI"]
        API[REST API<br/>33 endpoints]
        ML[ML Pipeline]
        OPT[Optimization Engine<br/>QGA · QPSO · GA · PSO · Greedy]
        SVC[Services<br/>physics · sandbox · compliance · reporting]
    end
    subgraph Data["Persistence"]
        DB[(SQLite → PostgreSQL)]
        MODELS[(Trained model artefacts)]
        REPORTS[(Generated PDFs)]
    end
    UI -->|JSON| API
    API --> ML --> MODELS
    API --> OPT --> SVC
    API --> DB
    SVC --> REPORTS
```

---

## 4. Technology stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, Recharts, Lucide |
| Backend | Python 3.11+, FastAPI, Uvicorn, Pydantic v2 |
| ML | scikit-learn (HistGradientBoosting, RandomForest), XGBoost if installed, NumPy, Pandas |
| Optimization | Custom QGA + QPSO, standard GA + PSO, greedy baseline (NumPy) |
| Database | SQLAlchemy 2.0 ORM — SQLite by default, PostgreSQL-ready |
| Reports | ReportLab |
| Testing | pytest, FastAPI TestClient |

No GPU, quantum hardware, cloud account, paid API or external database server is required.

---

## 5. Project structure

```
greenfleet-quantum/
├── backend/
│   ├── app/
│   │   ├── main.py                 FastAPI app, CORS, error handlers
│   │   ├── api/routes.py           all REST endpoints
│   │   ├── schemas/models.py       Pydantic validation
│   │   ├── database/
│   │   │   ├── models.py           12 ORM tables
│   │   │   └── session.py          engine, init_db, seeding
│   │   ├── ml/
│   │   │   ├── dataset.py          synthetic voyage generator
│   │   │   └── predictor.py        train / evaluate / infer
│   │   ├── optimization/
│   │   │   ├── problem.py          encoding, constraints, fitness
│   │   │   ├── qga.py              quantum-inspired GA
│   │   │   ├── qpso.py             quantum-inspired PSO
│   │   │   ├── classical.py        standard GA + PSO
│   │   │   └── engine.py           solve, benchmark, Pareto
│   │   └── services/
│   │       ├── domain.py           fuel & vessel constants
│   │       ├── physics.py          voyage physics model
│   │       ├── scenarios.py        case studies, payload bridge
│   │       ├── fuel_sandbox.py     alternative-fuel ROI
│   │       ├── compliance.py       IMO / EU ETS estimates
│   │       ├── dashboard.py        KPIs + generated insights
│   │       └── reporting.py        18-section PDF
│   ├── tests/                      61 automated tests
│   ├── requirements.txt
│   ├── .env.example
│   ├── scripts_setup.sh
│   └── scripts_run.sh
├── frontend/                       React application
├── data/
│   ├── processed/voyages_demo.csv  synthetic dataset + notice
│   └── greenfleet.db               SQLite database
├── models/                         trained model + metrics JSON
├── reports/                        generated PDFs
└── README.md
```

---

## 6. Installation

### Backend

```bash
cd backend
./scripts_setup.sh      # venv, deps, dataset, model training, database
./scripts_run.sh        # http://localhost:8000  (docs at /docs)
```

Manual equivalent:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.ml.dataset          # generate synthetic dataset
python -m app.ml.predictor        # train and persist the model
python -m app.database.session    # create tables and seed demo data
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

### Database

SQLite initialises automatically on first API start. To move to PostgreSQL, change one line in `.env`:

```
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/greenfleet
```

No SQLite-specific SQL is used anywhere, so no code changes are needed.

---

## 7. Mathematical model

### 7.1 Fuel consumption

Propulsion power for a displacement hull follows the Admiralty cube law:

```
P(v) = P_installed · (v / v_design)³ · k_load · k_weather · 0.74
```

* `k_load = (0.55 + 0.45·f)^0.42` — displacement resistance, `f` = cargo/DWT
* `k_weather = (1 + 0.0018·W^1.35)(1 + 0.030·H^1.6)(1 + 0.025·C) · S`
  with wind `W` kn, wave height `H` m, current `C` kn, sea-state factor `S`

Specific fuel oil consumption is load-dependent and minimised near 75% MCR:

```
SFOC = 172 · [1 + 0.45(L − 0.75)²/0.75² + 0.22·max(0, 0.35 − L)] · p_fuel · (1 + 0.006·age)
```

Fuel mass:

```
m = (P_prop · SFOC · t_sea + P_aux · SFOC · t_total) × 10⁻⁶   [tonnes]
```

Because SFOC rises at very low load, slow steaming has a genuine floor — the optimiser faces a real trade-off rather than driving speed to the lower bound.

**Calibration check** (design speed, 90% laden, HFO):

| Class | Modelled burn | Published range |
|---|---|---|
| Handysize | 19.3 t/day | ~18–20 |
| Supramax | 27.2 t/day | ~26–28 |
| Panamax | 34.1 t/day | ~32–35 |
| Capesize | 56.8 t/day | ~55–60 |

### 7.2 Emissions

Split well-to-tank (upstream) and tank-to-wake (combustion):

```
CO2e_lifecycle = m · (EF_wtt + EF_ttw)
```

Ammonia and hydrogen have `EF_ttw = 0` but non-zero `EF_wtt` — the platform never reports them as zero-emission on a lifecycle basis. Carbon cost is applied to the tank-to-wake share, matching EU ETS scope.

### 7.3 Fitness

Objectives are normalised against a fixed reference plan so user weights are dimensionless:

```
f = w_fuel·(F/F_ref) + w_cost·(C/C_ref) + w_emis·(E/E_ref) + w_rel·(1 − R) + penalty
```

Constraint handling is a weighted linear-plus-quadratic penalty on normalised violation:

```
penalty = Σ_k  W_k · (v_k + v_k²)
```

with `W_cargo = 50`, `W_emission_cap = W_cost_cap = 25`, `W_schedule = 8`, `W_no_deployment = 100`. Cargo commitments are contractual, so a 1% shortfall must cost more than any objective gain it could buy. Lower fitness is better throughout.

### 7.4 Constraints handled

Cargo capacity · vessel availability · speed limits per class · fuel compatibility per vessel · voyage deadline with configurable delay tolerance · lifecycle emission ceiling · total cost ceiling · operational feasibility (at least one deployment).

---

## 8. Machine learning methodology

```
synthetic generation → preprocessing → feature engineering → 80/20 split
→ train 2 candidates → evaluate on held-out set → promote best by RMSE
→ permutation importance → persist artefacts
```

**Engineered features:** `speed_cubed`, `speed_cubed × distance`, `power_proxy_kw = P_installed·(v/14)³`, `sea_hours`, `cargo_utilisation` — all physics-motivated rather than arbitrary.

**Injected noise** (so the model faces a real regression problem, not a closed form): flow-meter error σ=4%, per-hull unmodelled effect σ=3%, unlogged weather σ=3%.

**Measured performance** on 1,200 held-out voyages:

| Model | MAE (t) | RMSE (t) | R² | MAPE |
|---|---|---|---|---|
| RandomForest | 67.40 | 118.73 | 0.9481 | 11.98% |
| **GradientBoosting** (promoted) | **45.80** | **88.66** | **0.9711** | **7.62%** |

Top drivers by permutation importance: fuel type, speed³×distance, distance, DWT, power proxy, cargo tonnes.

Prediction intervals are RMSE-based 95% Gaussian bounds. The API returns the ML prediction alongside the physics-model value and their delta, so a judge can see the two agree.

---

## 9. QGA — Quantum-Inspired Genetic Algorithm

**Representation.** A classical GA stores one allele per gene. QGA stores a vector of probability amplitudes per gene:

```
Q_g = [α_g,1 … α_g,C],     Σ α²_g,k = 1
```

One individual is a superposition over all C choices. A concrete chromosome is produced by *observation* — sampling allele k with probability α²_g,k (Born rule).

**Update — quantum rotation gate.** Amplitudes rotate toward the attractor's allele, the multi-level generalisation of

```
|α'|   [cos Δθ   −sin Δθ] |α|
|β' | = [sin Δθ    cos Δθ] |β|
```

Mass proportional to `sin Δθ` moves to the attractor allele; the remainder is renormalised so unit norm is preserved exactly (asserted in the test suite). Δθ anneals from 0.05π to 0.005π.

**Quantum mutation.** With probability `p_mut` a gene is partially collapsed back toward uniform superposition, restoring diversity.

**Catastrophe operator.** After 15 stagnant generations the worst individuals reset to uniform superposition — a quantum-analogue restart for escaping deceptive basins.

**Elite strategy.** Elites rotate toward their own observation (local exploration); the rest rotate toward the global best (exploitation).

Solves: vessel deployment, route assignment, fuel selection, fleet configuration.

## 10. QPSO — Quantum-Inspired Particle Swarm Optimization

**Why this is not renamed PSO.** Standard PSO carries velocity, so a particle's reachable region is velocity-bounded. QPSO removes velocity entirely. Each particle is a quantum particle in a delta potential well centred on a stochastic attractor. From ψ(x) = L^(−1/2)·exp(−|x−p|/L), Monte-Carlo collapse of the position operator gives the closed form:

```
x = p ± (L/2)·ln(1/u),        u ~ U(0,1)
L = 2β·|mbest − x|
p_id = φ·pbest_id + (1−φ)·gbest_d,    φ ~ U(0,1)
```

`mbest` is the mean of all personal bests. Because `ln(1/u)` is unbounded, a particle has non-zero probability of appearing anywhere in the domain on any iteration — the tunnelling behaviour a velocity-bounded swarm cannot reproduce. β anneals 1.0 → 0.4 as the convergence control in place of inertia weight.

Solves: cruising speed per vessel, engine load, bunker quantity.

The test suite verifies QPSO escapes a Rastrigin-style multimodal trap, which is a direct check on the tunnelling claim.

## 11. Hybrid solve path

`QGA` optimises the assignment, then `QPSO` refines speeds on the winning assignment (and `GA` pairs with `PSO` identically). This is why the platform optimises vessel, route, fuel *and* speed jointly instead of one at a time.

---

## 12. Benchmarking methodology

**Equal evaluation budget.** Every algorithm receives the same number of objective evaluations (`population × iterations`). Comparing at equal *iteration* count would quietly favour whichever method spends more evaluations per iteration. Actual evaluation counts are reported so the comparison can be inspected.

**Repeated independent runs.** Metaheuristics are stochastic; a single run is not evidence. Mean, standard deviation, best and worst are reported across seeds.

**No presupposed winner.** The `winner` field is computed from the mean fitness. If GA or PSO performs better on a scenario, that is what the API returns and what the UI displays. The test suite asserts the reported winner follows arithmetically from the reported numbers.

**Observed result on the demo scenario (12 vessels, 3 routes, equal budget of 1,440 evaluations):**

| | QGA | GA |
|---|---|---|
| Mean fitness (8 seeds) | **0.7432** | 0.7755 |
| Std deviation | **0.0558** | 0.0697 |
| Single best run | 0.7120 | **0.7066** |
| Mean iterations to converge | **19** | 33 |

**Honest reading:** QGA converges in roughly half the iterations and is more consistent run to run; solution quality is comparable and seed-dependent, with GA occasionally finding a marginally better single solution. The defensible claim is *faster and more consistent convergence at comparable quality* — not blanket superiority. Run 20+ seeds before quoting figures.

---

## 13. Compliance module

Tracks carbon intensity in **grams CO2e per tonne-nautical-mile** of transport work actually performed. This denominator matters: a fleet that cuts emissions by carrying less cargo has not decarbonised, and an absolute-tonnage metric would wrongly reward it.

* IMO 2030 (40% intensity reduction vs 2008), IMO 2040 checkpoint (70%), IMO 2050 (net zero)
* EU ETS estimate: phase-in factor × voyage coverage fraction × tank-to-wake emissions × carbon price
* Status indicators: Compliant / Attention Required / Above Target
* Every parameter — baseline intensity, targets, phase-in, coverage, carbon price — is configurable

**These are model estimates, not regulatory calculations, certification, or legal advice.** Real compliance depends on audited operational data and the rules in force for the relevant year. The disclaimer is embedded in every API response and every generated PDF.

---

## 14. API reference

Base URL `http://localhost:8000`. Interactive docs at `/docs`, schema at `/openapi.json`.

### System & reference
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | subsystem status |
| GET | `/api/fuels` | six fuels with properties and current prices |
| GET | `/api/vessel-classes` | class definitions |

### Fleet data
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/vessels` | list / create |
| PUT/DELETE | `/api/vessels/{id}` | update / delete |
| GET | `/api/routes` | routes with cargo demand |
| POST | `/api/upload` | CSV fleet import (5 MB cap, per-row errors) |
| GET | `/api/dataset/download` | processed dataset |

### Prediction
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/predict/fuel` | ML prediction + physics cross-check + driver sensitivity |
| GET | `/api/model/performance` | metrics, candidates, importance, diagnostics |
| POST | `/api/model/train` | retrain on N samples |

### Optimization
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/optimize` | solve (set `async_run` for background execution) |
| POST | `/api/optimize/{qga\|qpso\|ga\|pso\|greedy}` | algorithm-specific |
| GET | `/api/optimize/status/{run_id}` | progress + full result |
| GET | `/api/optimize/runs` | run history |
| POST | `/api/pareto` | Pareto sweep with filters |
| POST | `/api/benchmark` | multi-seed comparison |

### Analysis
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/fuels/sandbox` | six-fuel ROI and payback |
| GET/POST | `/api/compliance` | IMO + EU ETS assessment |
| GET | `/api/dashboard` | KPIs, trends, generated insights |

### Scenarios & reports
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/scenarios` | list / create |
| GET/DELETE | `/api/scenarios/{id}` | fetch / delete (demo scenarios protected) |
| POST | `/api/scenarios/{id}/duplicate` | duplicate |
| POST | `/api/scenarios/compare` | run 2–5 scenarios side by side |
| POST | `/api/reports/generate` | 18-section PDF |
| GET | `/api/reports/{id}/download` | download PDF |
| POST | `/api/demo/load` | seed demo data, return judge flow |

### Long-running work

Set `"async_run": true` on `/api/optimize`. The response returns a `run_id` immediately; poll `/api/optimize/status/{run_id}` for `progress_pct`, `current_iteration` and live `best_fitness`. The frontend never blocks.

### Error handling

Validation errors return `422` with a readable `problems` array naming each offending field. Unhandled errors return a generic `500` message; stack traces go to the server log and are never exposed to the client.

```json
{
  "error": "Invalid input",
  "detail": "The request could not be processed because some values are invalid.",
  "problems": [{"field": "cargo_tonnes", "message": "Value error, cargo_tonnes (200,000) exceeds vessel deadweight (76,000)."}]
}
```

---

## 15. Demo mode & judge flow

`POST /api/demo/load` seeds everything and returns the flow below. Three case studies ship pre-configured:

| Case study | Goal | Measured outcome vs greedy baseline |
|---|---|---|
| 1 — Conventional Fleet | minimise operating cost | fuel −29.7%, cost −2.0%, CO2e −31.8%, cargo 100% |
| 2 — Green Fleet | minimise lifecycle emissions under a CO2e ceiling | CO2e −45.0%, cost +28.9%, fuel +12.0%, cargo 100% |
| 3 — Alternative Fuel Transition | evaluate switching at a $200/t carbon price | CO2e −25.5%, cost +8.4%, fuel −1.4%, cargo 100% |

Case Study 2 burns *more* fuel mass while cutting emissions 45% — methanol and ammonia have much lower energy density, so more tonnes are consumed for the same shaft energy. This is correct physics and a genuinely instructive result to walk a judge through.

**Judge flow:** Load Demo Scenario → Predict Fuel → Optimize Fleet → View Recommended Fleet → Compare QGA/QPSO vs Classical → Explore Alternative Fuels → View Pareto Front → Generate PDF Report.

---

## 16. Testing

```bash
cd backend
python -m pytest tests/ -q          # 61 tests
python -m pytest tests/test_core.py # algorithms, physics, ML
python -m pytest tests/test_api.py  # endpoints, validation, persistence
```

Coverage includes: physics monotonicity and calibration bounds, SFOC minimum location, lifecycle emission accounting, Born-rule normalisation of QGA amplitudes after repeated rotation and mutation, QGA recovery of a known discrete optimum, QPSO bound respect and multimodal escape, convergence monotonicity, constraint violation detection, penalty ordering, Pareto non-domination, comparison percentages matching their inputs, benchmark winner following from the data, every algorithm endpoint, input validation rejection paths, CSV import with row-level errors, scenario lifecycle, report generation and PDF integrity.

---

## 17. Delivery Table — Expected Deliverables

| No. | Deliverable | Expected Output | Status |
|---|---|---|---|
| 1 | Working Web Platform | Complete responsive web application containing all major modules | Backend complete; frontend in progress |
| 2 | Executive Dashboard | Fleet KPIs, fuel, cost, emissions, utilisation and generated insights | API complete |
| 3 | Fuel Consumption Prediction | ML regression model with prediction API and metrics | Complete — R² 0.971 |
| 4 | QGA Implementation | Quantum-Inspired Genetic Algorithm for discrete fleet decisions | Complete |
| 5 | QPSO Implementation | Quantum-Inspired PSO for continuous optimisation | Complete |
| 6 | Classical Algorithms | GA, PSO and greedy baseline implementations | Complete |
| 7 | Fleet Optimization | Vessel, route, fuel and speed optimisation under constraints | Complete |
| 8 | Multi-Objective Optimization | Cost, fuel and emission optimisation with constraint handling | Complete |
| 9 | Pareto Front Explorer | Cost-vs-emission Pareto generation with filters | API complete |
| 10 | Alternative Fuel Sandbox | Six-fuel comparison with ROI and payback | Complete |
| 11 | Benchmarking Engine | QGA vs GA, QPSO vs PSO, equal-budget multi-seed comparison | Complete |
| 12 | Compliance Module | IMO targets and configurable EU ETS carbon-cost estimation | Complete |
| 13 | Scenario Manager | Save, load, duplicate, compare and delete scenarios | API complete |
| 14 | Fleet Data Management | Vessel, route, fuel and cargo CRUD plus CSV import | Complete |
| 15 | Database | 12-table schema with seed data and persistence | Complete |
| 16 | Sample Dataset | 6,000-voyage synthetic dataset, explicitly labelled | Complete |
| 17 | PDF Reporting | 18-section downloadable analysis report | Complete |
| 18 | REST API | 33 FastAPI endpoints with Pydantic validation | Complete |
| 19 | Testing | Unit and API tests for major components | Complete — 61 tests |
| 20 | Documentation | Technical documentation, methodology and setup | Complete |
| 21 | SIH Demo Mode | One-click demo scenario for judge presentation | Complete |
| 22 | Source Code | Frontend, backend, algorithms, ML and database code | Backend complete |
| 23 | Case Studies | Three configurable fleet optimisation scenarios | Complete |
| 24 | Final Presentation Support | Dashboard views and generated charts | Frontend in progress |

---

## 18. Known limitations

1. **Synthetic dataset.** Relationships are physically motivated and calibrated against published burn rates, but no real voyage data is included. Model accuracy on real data would differ.
2. **Benchmark result is scenario-dependent.** QGA's advantage over GA is in convergence speed and consistency, not a decisive quality margin, and it varies by seed and scenario. Do not overclaim.
3. **Pareto via weighted-sum scalarisation.** Simple and transparent, but weighted-sum cannot reach non-convex regions of a front. NSGA-II would be the upgrade.
4. **Compliance figures are estimates.** Not regulatory output; parameters are demo defaults.
5. **Single-leg voyage model.** No multi-leg routing, ballast repositioning, port congestion, canal transit or bunkering logistics.
6. **Fuel prices and retrofit capex are indicative**, not quotations, and alternative-fuel economics are highly sensitive to them.
7. **No authentication yet.** The `users` table and role field exist so it can be added without a migration.
8. **In-process background tasks.** Fine for a demo; a production deployment would use Celery or RQ with a broker.

## 19. Future scope

NSGA-II / MOEA-D for true non-convex Pareto fronts · real AIS and noon-report ingestion · multi-leg routing with ballast legs · stochastic weather scenarios with robust optimisation · CII rating bands per vessel · authentication and role-based access · Celery task queue · PostgreSQL + Alembic migrations · quantum-annealing comparison on a real QPU as a research extension.

---

## 20. Attribution & honesty notes

* Quantum-inspired algorithms on classical hardware. No quantum computer involved.
* Synthetic demo dataset, labelled as such everywhere it appears.
* Compliance outputs are model estimates, not certified regulatory calculations.
* All improvement percentages are computed from two actual evaluations; none are assumed or hard-coded.
* Benchmark winners are determined by the experiment, and reported even when the classical algorithm wins.

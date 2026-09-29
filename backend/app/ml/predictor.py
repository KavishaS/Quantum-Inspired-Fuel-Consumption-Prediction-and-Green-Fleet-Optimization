"""
Fuel-consumption prediction pipeline.

preprocessing -> feature engineering -> train/test split -> training ->
evaluation -> persistence -> inference

Two candidate regressors are trained and compared on a held-out test set
(Random Forest and Histogram Gradient Boosting; XGBoost is used instead of
the latter when installed). The better model by test RMSE is promoted to
production. All metrics reported in the UI come from this evaluation, not
from hard-coded numbers.

Feature importance for tree ensembles is computed by permutation importance
on the test set, which is less biased toward high-cardinality features than
impurity-based importance.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .dataset import DATASET_NOTICE, build_and_save, generate_voyages

try:  # optional dependency
    from xgboost import XGBRegressor  # type: ignore
    HAS_XGB = True
except Exception:  # pragma: no cover
    HAS_XGB = False

NUMERIC_FEATURES = [
    "dwt", "engine_kw", "vessel_age_years", "speed_kn", "cargo_tonnes",
    "cargo_utilisation", "distance_nm", "port_hours", "wind_speed_kn",
    "wave_height_m", "current_speed_kn",
    # engineered
    "speed_cubed", "speed_cubed_x_distance", "power_proxy_kw", "sea_hours",
]
CATEGORICAL_FEATURES = ["vessel_class", "fuel_type", "weather", "route"]
TARGET = "fuel_tonnes"

ARTIFACT_DIR = Path(__file__).resolve().parents[3] / "models"


def engineer(df: pd.DataFrame) -> pd.DataFrame:
    """Add physics-motivated features. Pure function, used at train and inference."""
    out = df.copy()
    out["cargo_utilisation"] = out["cargo_tonnes"] / out["dwt"].clip(lower=1.0)
    out["speed_cubed"] = out["speed_kn"] ** 3
    out["sea_hours"] = out["distance_nm"] / out["speed_kn"].clip(lower=0.1)
    out["speed_cubed_x_distance"] = out["speed_cubed"] * out["distance_nm"]
    # Proportional to shaft power demanded: P ~ P_installed * (v/v_ref)^3
    out["power_proxy_kw"] = out["engine_kw"] * (out["speed_kn"] / 14.0) ** 3
    return out


def _make_pipeline(estimator) -> Pipeline:
    pre = ColumnTransformer(
        [
            ("num", StandardScaler(), NUMERIC_FEATURES),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ]
    )
    return Pipeline([("pre", pre), ("model", estimator)])


@dataclass
class ModelMetrics:
    name: str
    mae: float
    rmse: float
    r2: float
    mape_pct: float
    train_seconds: float

    def to_dict(self) -> dict:
        return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in asdict(self).items()}


def _evaluate(name: str, pipe: Pipeline, X_test, y_test, secs: float) -> ModelMetrics:
    pred = pipe.predict(X_test)
    return ModelMetrics(
        name=name,
        mae=float(mean_absolute_error(y_test, pred)),
        rmse=float(np.sqrt(mean_squared_error(y_test, pred))),
        r2=float(r2_score(y_test, pred)),
        mape_pct=float(np.mean(np.abs((y_test - pred) / np.clip(y_test, 1e-6, None))) * 100),
        train_seconds=secs,
    )


def train(
    df: Optional[pd.DataFrame] = None,
    artifact_dir: Optional[Path] = None,
    random_state: int = 42,
) -> Dict[str, Any]:
    """Train candidates, promote the best by RMSE, persist artefacts."""
    artifact_dir = Path(artifact_dir or ARTIFACT_DIR)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    if df is None:
        csv = Path(__file__).resolve().parents[3] / "data" / "processed" / "voyages_demo.csv"
        if not csv.exists():
            build_and_save()
        df = pd.read_csv(csv)

    df = engineer(df)
    X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
    y = df[TARGET].values

    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=random_state)

    candidates: List[tuple] = [
        ("RandomForest", RandomForestRegressor(
            n_estimators=300, max_depth=None, min_samples_leaf=2,
            n_jobs=-1, random_state=random_state)),
    ]
    if HAS_XGB:
        candidates.append(("XGBoost", XGBRegressor(
            n_estimators=500, learning_rate=0.05, max_depth=6,
            subsample=0.85, colsample_bytree=0.85, random_state=random_state,
            tree_method="hist", n_jobs=-1)))
    else:
        candidates.append(("GradientBoosting", HistGradientBoostingRegressor(
            max_iter=500, learning_rate=0.06, max_depth=None,
            random_state=random_state)))

    results: List[ModelMetrics] = []
    fitted: Dict[str, Pipeline] = {}
    for name, est in candidates:
        pipe = _make_pipeline(est)
        t0 = time.perf_counter()
        pipe.fit(X_tr, y_tr)
        secs = time.perf_counter() - t0
        results.append(_evaluate(name, pipe, X_te, y_te, secs))
        fitted[name] = pipe

    best = min(results, key=lambda m: m.rmse)
    best_pipe = fitted[best.name]

    # Permutation importance on the held-out set (subsampled for speed).
    idx = np.random.RandomState(random_state).choice(
        len(X_te), size=min(600, len(X_te)), replace=False)
    perm = permutation_importance(
        best_pipe, X_te.iloc[idx], y_te[idx], n_repeats=5,
        random_state=random_state, n_jobs=-1, scoring="neg_root_mean_squared_error")
    cols = NUMERIC_FEATURES + CATEGORICAL_FEATURES
    importance = sorted(
        [{"feature": c, "importance": float(max(0.0, v))}
         for c, v in zip(cols, perm.importances_mean)],
        key=lambda d: -d["importance"],
    )
    total = sum(d["importance"] for d in importance) or 1.0
    for d in importance:
        d["importance_pct"] = round(100 * d["importance"] / total, 2)

    # Diagnostic scatter / residual payload for the ML performance page.
    pred_te = best_pipe.predict(X_te)
    k = min(400, len(y_te))
    diag = [
        {"actual": float(a), "predicted": float(p), "residual": float(a - p)}
        for a, p in zip(y_te[:k], pred_te[:k])
    ]

    import joblib
    joblib.dump(best_pipe, artifact_dir / "fuel_model.joblib")
    meta = {
        "best_model": best.name,
        "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "n_samples": int(len(df)),
        "n_train": int(len(X_tr)),
        "n_test": int(len(X_te)),
        "dataset_notice": DATASET_NOTICE,
        "candidates": [m.to_dict() for m in results],
        "metrics": best.to_dict(),
        "feature_importance": importance,
        "diagnostics": diag,
        "target_mean_tonnes": float(np.mean(y)),
    }
    (artifact_dir / "model_meta.json").write_text(json.dumps(meta, indent=2))
    return meta


class FuelPredictor:
    """Lazy-loading inference wrapper used by the API."""

    def __init__(self, artifact_dir: Optional[Path] = None):
        self.dir = Path(artifact_dir or ARTIFACT_DIR)
        self._pipe = None
        self._meta: Optional[dict] = None

    def _ensure(self) -> None:
        if self._pipe is not None:
            return
        import joblib
        model_path = self.dir / "fuel_model.joblib"
        if not model_path.exists():
            train(artifact_dir=self.dir)
        self._pipe = joblib.load(model_path)
        self._meta = json.loads((self.dir / "model_meta.json").read_text())

    @property
    def meta(self) -> dict:
        self._ensure()
        return self._meta or {}

    def predict(self, record: Dict[str, Any]) -> Dict[str, Any]:
        self._ensure()
        row = engineer(pd.DataFrame([record]))
        X = row[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
        pred = float(self._pipe.predict(X)[0])
        rmse = float(self.meta["metrics"]["rmse"])
        return {
            "predicted_fuel_tonnes": max(0.0, pred),
            # 95% interval approximated from held-out RMSE (Gaussian assumption)
            "interval_low_tonnes": max(0.0, pred - 1.96 * rmse),
            "interval_high_tonnes": pred + 1.96 * rmse,
            "model": self.meta["best_model"],
            "test_rmse_tonnes": rmse,
            "test_r2": float(self.meta["metrics"]["r2"]),
        }


PREDICTOR = FuelPredictor()


if __name__ == "__main__":
    m = train()
    print(json.dumps({"best": m["best_model"], "candidates": m["candidates"]}, indent=2))
    print("Top drivers:", [d["feature"] for d in m["feature_importance"][:6]])

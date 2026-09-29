"""
Synthetic voyage dataset generator.

DEMO DATASET NOTICE
-------------------
This dataset is generated for simulation and algorithm validation. It is NOT
real shipping-company data and must not be presented as such. It is produced
by sampling operational conditions and evaluating the documented physical
model in app.services.physics, then adding measurement noise so that the ML
model faces a genuine, non-trivial regression problem rather than memorising
a closed-form equation.

Noise sources injected deliberately:
  * flow-meter error            (multiplicative, sigma 4%)
  * unmodelled hull/propeller   (per-vessel random effect, sigma 3%)
  * unlogged weather variation  (multiplicative, sigma 3%)
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from ..services.domain import FUELS, VESSEL_CLASSES, WEATHER_STATES
from ..services.physics import compute_voyage

DATASET_NOTICE = "Demo dataset generated for simulation and algorithm validation."

ROUTES = {
    "SINGAPORE-ROTTERDAM": 8300,
    "SANTOS-QINGDAO": 11200,
    "TUBARAO-ROTTERDAM": 5100,
    "NEWCASTLE-QINGDAO": 4300,
    "HOUSTON-CHENNAI": 9400,
    "PORT HEDLAND-QINGDAO": 3600,
    "PARADIP-SINGAPORE": 2100,
    "RICHARDS BAY-PARADIP": 4600,
}


def generate_voyages(n: int = 6000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    classes = list(VESSEL_CLASSES.keys())
    fuels = list(FUELS.keys())
    routes = list(ROUTES.keys())
    weathers = list(WEATHER_STATES.keys())

    # Per-vessel random effect: same hull keeps the same unmodelled bias.
    n_vessels = 60
    vessel_bias = rng.normal(1.0, 0.03, n_vessels)
    vessel_class_of = rng.choice(classes, n_vessels)
    vessel_age_of = rng.uniform(0, 22, n_vessels)

    rows = []
    for _ in range(n):
        vid = int(rng.integers(0, n_vessels))
        cls = vessel_class_of[vid]
        vc = VESSEL_CLASSES[cls]

        dwt = float(rng.uniform(vc.dwt_min, vc.dwt_max))
        engine_kw = vc.engine_kw * (dwt / vc.typical_dwt) ** 0.62
        age = float(vessel_age_of[vid])
        speed = float(rng.uniform(vc.min_speed_kn, vc.max_speed_kn))
        cargo = float(dwt * rng.uniform(0.25, 0.98))
        route = str(rng.choice(routes))
        distance = ROUTES[route] * float(rng.uniform(0.95, 1.05))
        fuel = str(rng.choice(fuels, p=[0.38, 0.24, 0.18, 0.10, 0.06, 0.04]))
        weather = str(rng.choice(weathers, p=[0.30, 0.42, 0.22, 0.06]))
        wind = float(np.clip(rng.gamma(4.0, 4.0), 0, 48))
        wave = float(np.clip(rng.gamma(2.2, 0.95), 0, 9))
        current = float(rng.normal(0.0, 0.6))
        port_hours = float(rng.uniform(12, 96))

        r = compute_voyage(
            vessel_class=cls, dwt=dwt, engine_kw=engine_kw, vessel_age_years=age,
            speed_kn=speed, cargo_tonnes=cargo, distance_nm=distance, fuel_key=fuel,
            wind_speed_kn=wind, wave_height_m=wave, current_speed_kn=current,
            weather=weather, port_hours=port_hours,
        )

        noise = (
            vessel_bias[vid]
            * rng.normal(1.0, 0.04)   # flow meter
            * rng.normal(1.0, 0.03)   # unlogged weather
        )
        observed = max(1.0, r.fuel_tonnes * noise)

        rows.append({
            "vessel_id": f"V{vid:03d}",
            "vessel_class": cls,
            "dwt": dwt,
            "engine_kw": engine_kw,
            "vessel_age_years": age,
            "speed_kn": speed,
            "cargo_tonnes": cargo,
            "cargo_utilisation": cargo / dwt,
            "distance_nm": distance,
            "route": route,
            "port_hours": port_hours,
            "fuel_type": fuel,
            "weather": weather,
            "wind_speed_kn": wind,
            "wave_height_m": wave,
            "current_speed_kn": current,
            "voyage_hours": r.voyage_hours,
            "engine_load_pct": r.engine_load_pct,
            "fuel_tonnes": observed,
        })

    df = pd.DataFrame(rows)
    df["fuel_tonnes_per_nm"] = df["fuel_tonnes"] / df["distance_nm"]
    return df


def build_and_save(
    out_dir: Optional[Path] = None, n: int = 6000, seed: int = 42
) -> Path:
    out_dir = out_dir or Path(__file__).resolve().parents[3] / "data" / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)
    df = generate_voyages(n=n, seed=seed)
    path = out_dir / "voyages_demo.csv"
    df.to_csv(path, index=False)
    (out_dir / "DATASET_NOTICE.txt").write_text(DATASET_NOTICE + "\n")
    return path


if __name__ == "__main__":
    p = build_and_save()
    print(f"{DATASET_NOTICE}\nWritten: {p}")

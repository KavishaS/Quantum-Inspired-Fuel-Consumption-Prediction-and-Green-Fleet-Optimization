"""Database session management, initialisation and demo seeding."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from ..services.domain import FUELS, VESSEL_CLASSES
from .models import (
    Base, CargoDemand, FuelPrice, FuelType, Route, Scenario, User, Vessel)

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB = f"sqlite:///{ROOT / 'data' / 'greenfleet.db'}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB)

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ------------------------------------------------------------------ seed data

DEMO_ROUTES = [
    # code, name, origin, dest, nm, weather, wind, wave, port_h, demand t, deadline h
    ("R01", "Port Hedland - Qingdao", "Port Hedland", "Qingdao", 3600, "MODERATE", 13, 1.6, 30, 240000, 340),
    ("R02", "Tubarao - Rotterdam", "Tubarao", "Rotterdam", 5100, "ROUGH", 22, 3.1, 42, 150000, 470),
    ("R03", "Paradip - Singapore", "Paradip", "Singapore", 2100, "CALM", 9, 1.0, 24, 90000, 215),
    ("R04", "Richards Bay - Paradip", "Richards Bay", "Paradip", 4600, "MODERATE", 16, 2.2, 36, 120000, 430),
    ("R05", "Newcastle - Qingdao", "Newcastle", "Qingdao", 4300, "MODERATE", 15, 2.0, 34, 160000, 400),
]

_FLEET_MIX = ["CAPESIZE", "PANAMAX", "PANAMAX", "SUPRAMAX", "SUPRAMAX", "HANDYSIZE"]
_FUEL_SETS = [
    ["HFO", "MGO"],
    ["HFO", "MGO", "LNG"],
    ["HFO", "MGO", "LNG", "METHANOL"],
    ["MGO", "LNG", "METHANOL", "AMMONIA"],
]


def seed(db: Session, n_vessels: int = 24) -> dict:
    """Idempotent: seeds only what is missing."""
    created = {"fuels": 0, "vessels": 0, "routes": 0, "scenarios": 0, "users": 0}

    for key, spec in FUELS.items():
        if db.scalar(select(FuelType).where(FuelType.key == key)):
            continue
        ft = FuelType(
            key=key, name=spec.name, lhv_mj_per_kg=spec.lhv_mj_per_kg,
            ttw_co2e_g_per_g=spec.ttw_co2e_g_per_g, wtt_co2e_g_per_g=spec.wtt_co2e_g_per_g,
            sfoc_penalty=spec.sfoc_penalty, availability=spec.availability,
            retrofit_musd_per_vessel=spec.retrofit_musd_per_vessel, notes=spec.notes)
        ft.prices.append(FuelPrice(
            price_usd_per_tonne=spec.price_usd_per_tonne,
            source="Demo reference price - configurable"))
        db.add(ft)
        created["fuels"] += 1

    if not db.scalar(select(Vessel).limit(1)):
        for i in range(n_vessels):
            cls = _FLEET_MIX[i % len(_FLEET_MIX)]
            vc = VESSEL_CLASSES[cls]
            dwt = vc.dwt_min + (vc.dwt_max - vc.dwt_min) * ((i * 37 % 100) / 100.0)
            db.add(Vessel(
                vessel_code=f"V{i + 1:03d}", name=f"MV {vc.name} {i + 1:02d}",
                vessel_class=cls, dwt=round(dwt, 0),
                engine_kw=round(vc.engine_kw * (dwt / vc.typical_dwt) ** 0.62, 0),
                age_years=float(2 + (i * 7) % 20),
                min_speed_kn=vc.min_speed_kn, max_speed_kn=vc.max_speed_kn,
                allowed_fuels=_FUEL_SETS[i % len(_FUEL_SETS)]))
            created["vessels"] += 1

    if not db.scalar(select(Route).limit(1)):
        for code, name, o, d, nm, w, wind, wave, ph, demand, dl in DEMO_ROUTES:
            r = Route(route_code=code, name=name, origin=o, destination=d,
                      distance_nm=nm, typical_weather=w, wind_speed_kn=wind,
                      wave_height_m=wave, port_hours=ph)
            r.demands.append(CargoDemand(cargo_tonnes=demand, deadline_hours=dl))
            db.add(r)
            created["routes"] += 1

    from ..services.auth import DEMO_USERS, hash_password
    for du in DEMO_USERS:
        existing = db.scalar(select(User).where(User.username == du["username"]))
        if not existing:
            db.add(User(
                username=du["username"],
                display_name=du["display_name"],
                email=du["email"],
                role=du["role"],
                password_hash=hash_password(du["password"]),
                is_active=True,
            ))
            created["users"] += 1

    db.commit()

    if not db.scalar(select(Scenario).limit(1)):
        from ..services.scenarios import DEMO_SCENARIOS, build_scenario_payload
        for spec in DEMO_SCENARIOS:
            db.add(Scenario(
                name=spec["name"], description=spec["description"], tag=spec["tag"],
                payload=build_scenario_payload(db, spec), is_demo=True))
            created["scenarios"] += 1
        db.commit()

    return created


def init_db(with_seed: bool = True) -> dict:
    (ROOT / "data").mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    # Lightweight schema migration for SQLite / Postgres
    from sqlalchemy import text
    with engine.begin() as conn:
        try:
            if DATABASE_URL.startswith("sqlite"):
                cols = [r[1] for r in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
                if cols:
                    if "email" not in cols:
                        conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(128) DEFAULT ''"))
                    if "password_hash" not in cols:
                        conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(256) DEFAULT ''"))
                    if "is_active" not in cols:
                        conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))
        except Exception:
            pass

    if not with_seed:
        return {}
    db = SessionLocal()
    try:
        return seed(db)
    finally:
        db.close()


if __name__ == "__main__":
    print("Database:", DATABASE_URL)
    print("Seeded:", init_db())

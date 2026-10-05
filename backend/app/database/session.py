"""Database session management, initialisation and demo seeding."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from ..services.domain import FUELS, VESSEL_CLASSES
from .models import (
    Base, CargoDemand, Contract, FuelPrice, FuelType, Route, Scenario, User, Vessel)

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

_HETEROGENEOUS_FLEET = [
    # code, name, type, size_class, vessel_class, imo, dwt, engine_kw, build_year, length_m, beam_m, draft_m, fuels
    # Bulk Carriers
    ("V001", "MV Ocean Titan", "Bulk Carrier", "Capesize", "CAPESIZE", 9412345, 182000, 16200, 2018, 292.0, 45.0, 18.2, ["HFO", "MGO", "LNG"]),
    ("V002", "MV Global Voyager", "Bulk Carrier", "Capesize", "CAPESIZE", 9412357, 178000, 15800, 2017, 289.0, 45.0, 18.0, ["HFO", "MGO"]),
    ("V003", "MV Pacific Horizon", "Bulk Carrier", "Panamax", "PANAMAX", 9482110, 82000, 10200, 2020, 229.0, 32.2, 14.5, ["HFO", "MGO", "LNG", "METHANOL"]),
    ("V004", "MV Atlantic Pioneer", "Bulk Carrier", "Panamax", "PANAMAX", 9482122, 76000, 9500, 2016, 225.0, 32.2, 14.1, ["HFO", "MGO"]),
    ("V005", "MV Iron Mariner", "Bulk Carrier", "Supramax", "SUPRAMAX", 9553101, 58000, 7800, 2019, 199.0, 32.2, 12.8, ["HFO", "MGO", "LNG"]),
    ("V006", "MV Mineral Pride", "Bulk Carrier", "Supramax", "SUPRAMAX", 9553113, 56000, 7600, 2015, 190.0, 32.2, 12.5, ["HFO", "MGO"]),
    ("V007", "MV Baltic Trader", "Bulk Carrier", "Handysize", "HANDYSIZE", 9621001, 35000, 5800, 2021, 180.0, 29.8, 10.5, ["HFO", "MGO", "METHANOL"]),
    ("V008", "MV Nordic Falcon", "Bulk Carrier", "Handysize", "HANDYSIZE", 9621013, 32000, 5400, 2014, 175.0, 28.0, 10.0, ["HFO", "MGO"]),

    # Container Ships
    ("V009", "MV Neptune Express", "Container Ship", "Post-Panamax", "POST_PANAMAX", 9710012, 115000, 39500, 2022, 336.0, 48.2, 15.5, ["HFO", "MGO", "LNG", "METHANOL"]),
    ("V010", "MV Orient Star", "Container Ship", "Post-Panamax", "POST_PANAMAX", 9710024, 108000, 37000, 2020, 330.0, 48.0, 15.0, ["HFO", "MGO", "LNG"]),
    ("V011", "MV Meridian Express", "Container Ship", "Panamax", "CONTAINER_PANAMAX", 9732101, 48000, 19200, 2018, 260.0, 32.2, 12.5, ["HFO", "MGO", "LNG"]),
    ("V012", "MV Sealand Voyager", "Container Ship", "Panamax", "CONTAINER_PANAMAX", 9732113, 44000, 17800, 2016, 250.0, 32.2, 12.0, ["HFO", "MGO"]),
    ("V013", "MV Coastal Link", "Container Ship", "Feeder", "FEEDER", 9820011, 18000, 7800, 2021, 158.0, 24.5, 9.2, ["MGO", "LNG", "METHANOL"]),
    ("V014", "MV Archipelago Feeder", "Container Ship", "Feeder", "FEEDER", 9820023, 14000, 6800, 2019, 145.0, 22.8, 8.5, ["MGO", "LNG"]),

    # Oil Tankers
    ("V015", "MT Arabian Gulf", "Oil Tanker", "Suezmax", "SUEZMAX", 9654101, 158000, 16800, 2021, 274.0, 48.0, 17.0, ["HFO", "MGO", "LNG"]),
    ("V016", "MT Equator Trader", "Oil Tanker", "Aframax", "AFRAMAX", 9678202, 108000, 13400, 2019, 245.0, 42.0, 15.0, ["HFO", "MGO", "LNG"]),
    ("V017", "MT Singapore Star", "Oil Tanker", "Aframax", "AFRAMAX", 9678214, 102000, 12800, 2017, 240.0, 42.0, 14.8, ["HFO", "MGO"]),
    ("V018", "MT Bengal Breeze", "Oil Tanker", "MR", "MR_TANKER", 9741005, 50000, 8800, 2020, 183.0, 32.2, 12.2, ["HFO", "MGO", "METHANOL"]),
    ("V019", "MT Gulf Chemist", "Oil Tanker", "Handysize", "TANKER_HANDYSIZE", 9765108, 32000, 6400, 2018, 168.0, 27.5, 10.2, ["HFO", "MGO"]),

    # General Cargo
    ("V020", "MV Universal Trader", "General Cargo", "Supramax", "GENERAL_CARGO_LARGE", 9845001, 32000, 7200, 2019, 178.0, 28.0, 10.4, ["HFO", "MGO", "LNG"]),
    ("V021", "MV Euro Carrier", "General Cargo", "Supramax", "GENERAL_CARGO_LARGE", 9845013, 28000, 6500, 2017, 170.0, 27.0, 9.8, ["HFO", "MGO"]),
    ("V022", "MV Island Freight", "General Cargo", "Handysize", "GENERAL_CARGO_SMALL", 9889102, 14000, 4600, 2020, 138.0, 21.0, 8.0, ["MGO", "LNG"]),
    ("V023", "MV Coastal Merchant", "General Cargo", "Handysize", "GENERAL_CARGO_SMALL", 9889114, 11000, 3900, 2016, 125.0, 20.0, 7.5, ["MGO"]),

    # Ro-Ro
    ("V024", "MV TransAuto Leader", "Ro-Ro", "Panamax", "RORO_LARGE", 9912001, 34000, 16000, 2022, 200.0, 32.2, 10.0, ["HFO", "MGO", "LNG", "METHANOL"]),
    ("V025", "MV Auto Carrier Express", "Ro-Ro", "Feeder", "RORO_COMPACT", 9912013, 15000, 9600, 2019, 155.0, 25.0, 8.5, ["MGO", "LNG"]),
]

DEMO_CONTRACTS = [
    # code, customer, origin, dest, cargo_type, tonnes, arrival_days, laycan_start, laycan_end, penalty_day, priority, status
    ("CNT-1024", "ArcelorMittal Global", "Mumbai", "Rotterdam", "Iron Ore", 60000, 18.0, "2026-10-15", "2026-10-25", 25000.0, "HIGH", "ACTIVE"),
    ("CNT-1025", "BHP Billiton Freight", "Port Hedland", "Qingdao", "Dry Bulk Minerals", 160000, 14.0, "2026-10-18", "2026-10-28", 30000.0, "HIGH", "ACTIVE"),
    ("CNT-1026", "Maersk Line Logistics", "Singapore", "Rotterdam", "Containerized Cargo", 45000, 22.0, "2026-10-20", "2026-11-05", 35000.0, "STANDARD", "ACTIVE"),
    ("CNT-1027", "Vale International SA", "Tubarao", "Rotterdam", "Iron Ore Pellets", 150000, 19.0, "2026-10-12", "2026-10-26", 28000.0, "STANDARD", "ACTIVE"),
    ("CNT-1028", "Reliance Petroleum Ltd", "Houston", "Chennai", "Petrochemical Distillates", 40000, 26.0, "2026-10-25", "2026-11-15", 22000.0, "FLEXIBLE", "ACTIVE"),
    ("CNT-1029", "Rio Tinto Marine", "Newcastle", "Qingdao", "Metallurgical Coal", 120000, 16.0, "2026-10-16", "2026-10-30", 26000.0, "HIGH", "ACTIVE"),
]


def seed(db: Session, n_vessels: int = 25) -> dict:
    """Idempotent: seeds only what is missing, backfills missing vessel fields."""
    created = {"fuels": 0, "vessels": 0, "routes": 0, "scenarios": 0, "users": 0, "contracts": 0}

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

    # Check and seed/update heterogeneous fleet
    existing_vessels = {v.vessel_code: v for v in db.scalars(select(Vessel)).all()}
    for item in _HETEROGENEOUS_FLEET[:n_vessels]:
        code, name, v_type, s_class, v_class, imo, dwt, eng_kw, yr, l_m, b_m, d_m, fuels = item
        vc = VESSEL_CLASSES.get(v_class, VESSEL_CLASSES["PANAMAX"])
        if code in existing_vessels:
            v = existing_vessels[code]
            v.name = name
            v.vessel_type = v_type
            v.size_class = s_class
            v.vessel_class = v_class
            v.imo = imo
            v.dwt = float(dwt)
            v.engine_kw = float(eng_kw)
            v.build_year = yr
            v.length_m = l_m
            v.beam_m = b_m
            v.draft_m = d_m
            v.age_years = float(max(1.0, 2026 - yr))
            v.allowed_fuels = fuels
            v.status = "active"
        else:
            v = Vessel(
                vessel_code=code,
                name=name,
                vessel_type=v_type,
                size_class=s_class,
                vessel_class=v_class,
                imo=imo,
                dwt=float(dwt),
                engine_kw=float(eng_kw),
                build_year=yr,
                length_m=l_m,
                beam_m=b_m,
                draft_m=d_m,
                age_years=float(max(1.0, 2026 - yr)),
                min_speed_kn=vc.min_speed_kn,
                max_speed_kn=vc.max_speed_kn,
                allowed_fuels=fuels,
                status="active",
                source="REAL_FLEET_REGISTRY",
                source_date="2024-01-01",
            )
            db.add(v)
            created["vessels"] += 1

    # Check and seed Contracts (commercial scenario records)
    if not db.scalar(select(Contract).limit(1)):
        for code, cust, orig, dest, c_type, qty, arr_days, l_start, l_end, pen, prio, st in DEMO_CONTRACTS:
            c = Contract(
                contract_code=code,
                customer=cust,
                origin_port=orig,
                destination_port=dest,
                cargo_type=c_type,
                cargo_quantity_tonnes=float(qty),
                required_arrival_days=float(arr_days),
                laycan_start=l_start,
                laycan_end=l_end,
                penalty_per_day=float(pen),
                priority=prio,
                status=st,
                data_type="SCENARIO",
            )
            db.add(c)
            created["contracts"] += 1

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
                # users migration
                user_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
                if user_cols:
                    if "email" not in user_cols:
                        conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(128) DEFAULT ''"))
                    if "password_hash" not in user_cols:
                        conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(256) DEFAULT ''"))
                    if "is_active" not in user_cols:
                        conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))

                # vessels migration
                vessel_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(vessels)")).fetchall()]
                if vessel_cols:
                    if "vessel_type" not in vessel_cols:
                        conn.execute(text("ALTER TABLE vessels ADD COLUMN vessel_type VARCHAR(64) DEFAULT 'Bulk Carrier'"))
                    if "size_class" not in vessel_cols:
                        conn.execute(text("ALTER TABLE vessels ADD COLUMN size_class VARCHAR(64) DEFAULT ''"))
                    if "imo" not in vessel_cols:
                        conn.execute(text("ALTER TABLE vessels ADD COLUMN imo INTEGER"))
                    if "build_year" not in vessel_cols:
                        conn.execute(text("ALTER TABLE vessels ADD COLUMN build_year INTEGER"))
                    if "length_m" not in vessel_cols:
                        conn.execute(text("ALTER TABLE vessels ADD COLUMN length_m FLOAT"))
                    if "beam_m" not in vessel_cols:
                        conn.execute(text("ALTER TABLE vessels ADD COLUMN beam_m FLOAT"))
                    if "draft_m" not in vessel_cols:
                        conn.execute(text("ALTER TABLE vessels ADD COLUMN draft_m FLOAT"))
                    if "source" not in vessel_cols:
                        conn.execute(text("ALTER TABLE vessels ADD COLUMN source VARCHAR(64) DEFAULT 'REAL_FLEET_REGISTRY'"))
                    if "source_date" not in vessel_cols:
                        conn.execute(text("ALTER TABLE vessels ADD COLUMN source_date VARCHAR(32) DEFAULT '2024-01-01'"))

                # predictions migration
                pred_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(predictions)")).fetchall()]
                if pred_cols:
                    if "co2_tonnes" not in pred_cols:
                        conn.execute(text("ALTER TABLE predictions ADD COLUMN co2_tonnes FLOAT DEFAULT 0.0"))
                    if "sox_kg" not in pred_cols:
                        conn.execute(text("ALTER TABLE predictions ADD COLUMN sox_kg FLOAT DEFAULT 0.0"))
                    if "nox_kg" not in pred_cols:
                        conn.execute(text("ALTER TABLE predictions ADD COLUMN nox_kg FLOAT DEFAULT 0.0"))
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

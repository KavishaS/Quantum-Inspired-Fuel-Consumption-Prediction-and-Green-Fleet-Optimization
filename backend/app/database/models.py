"""
Database schema.

SQLite by default for zero-setup local deployment. The engine is created from
a URL in settings, so switching to PostgreSQL is a connection-string change
and nothing else -- no SQLite-specific SQL is used anywhere in the codebase.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, func)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class User(Base):
    """Present so authentication can be layered on later without a migration."""
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(128), default="")
    role: Mapped[str] = mapped_column(String(32), default="analyst")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class Vessel(Base):
    __tablename__ = "vessels"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vessel_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    vessel_class: Mapped[str] = mapped_column(String(32), index=True)
    dwt: Mapped[float] = mapped_column(Float)
    engine_kw: Mapped[float] = mapped_column(Float)
    age_years: Mapped[float] = mapped_column(Float, default=5.0)
    min_speed_kn: Mapped[float] = mapped_column(Float, default=9.0)
    max_speed_kn: Mapped[float] = mapped_column(Float, default=15.5)
    allowed_fuels: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="available")
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class Route(Base):
    __tablename__ = "routes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    route_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    origin: Mapped[str] = mapped_column(String(64), default="")
    destination: Mapped[str] = mapped_column(String(64), default="")
    distance_nm: Mapped[float] = mapped_column(Float)
    typical_weather: Mapped[str] = mapped_column(String(32), default="MODERATE")
    wind_speed_kn: Mapped[float] = mapped_column(Float, default=14.0)
    wave_height_m: Mapped[float] = mapped_column(Float, default=1.8)
    current_speed_kn: Mapped[float] = mapped_column(Float, default=0.0)
    port_hours: Mapped[float] = mapped_column(Float, default=36.0)
    demands: Mapped[list["CargoDemand"]] = relationship(
        back_populates="route", cascade="all, delete-orphan")


class FuelType(Base):
    __tablename__ = "fuel_types"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    lhv_mj_per_kg: Mapped[float] = mapped_column(Float)
    ttw_co2e_g_per_g: Mapped[float] = mapped_column(Float)
    wtt_co2e_g_per_g: Mapped[float] = mapped_column(Float)
    sfoc_penalty: Mapped[float] = mapped_column(Float, default=1.0)
    availability: Mapped[float] = mapped_column(Float, default=1.0)
    retrofit_musd_per_vessel: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str] = mapped_column(Text, default="")
    prices: Mapped[list["FuelPrice"]] = relationship(
        back_populates="fuel", cascade="all, delete-orphan")


class FuelPrice(Base):
    __tablename__ = "fuel_prices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fuel_id: Mapped[int] = mapped_column(ForeignKey("fuel_types.id"))
    price_usd_per_tonne: Mapped[float] = mapped_column(Float)
    effective_date: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)
    source: Mapped[str] = mapped_column(String(128), default="demo")
    fuel: Mapped[FuelType] = relationship(back_populates="prices")


class CargoDemand(Base):
    __tablename__ = "cargo_demands"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"))
    cargo_tonnes: Mapped[float] = mapped_column(Float)
    deadline_hours: Mapped[float] = mapped_column(Float, default=500.0)
    cargo_type: Mapped[str] = mapped_column(String(64), default="dry bulk")
    route: Mapped[Route] = relationship(back_populates="demands")


class Scenario(Base):
    __tablename__ = "scenarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    tag: Mapped[str] = mapped_column(String(32), default="custom")
    payload: Mapped[dict] = mapped_column(JSON)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
    runs: Mapped[list["OptimizationRun"]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan")


class OptimizationRun(Base):
    __tablename__ = "optimization_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scenario_id: Mapped[Optional[int]] = mapped_column(ForeignKey("scenarios.id"), nullable=True)
    algorithm: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued")
    progress_pct: Mapped[float] = mapped_column(Float, default=0.0)
    current_iteration: Mapped[int] = mapped_column(Integer, default=0)
    total_iterations: Mapped[int] = mapped_column(Integer, default=0)
    best_fitness: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    mean_fitness: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    runtime_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)
    scenario: Mapped[Optional[Scenario]] = relationship(back_populates="runs")
    result: Mapped[Optional["OptimizationResult"]] = relationship(
        back_populates="run", cascade="all, delete-orphan", uselist=False)


class OptimizationResult(Base):
    __tablename__ = "optimization_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("optimization_runs.id"))
    summary: Mapped[dict] = mapped_column(JSON)
    baseline_summary: Mapped[dict] = mapped_column(JSON)
    assignments: Mapped[list] = mapped_column(JSON)
    comparison: Mapped[list] = mapped_column(JSON)
    traces: Mapped[list] = mapped_column(JSON)
    run: Mapped[OptimizationRun] = relationship(back_populates="result")


class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inputs: Mapped[dict] = mapped_column(JSON)
    predicted_fuel_tonnes: Mapped[float] = mapped_column(Float)
    physics_fuel_tonnes: Mapped[float] = mapped_column(Float)
    fuel_cost_usd: Mapped[float] = mapped_column(Float)
    lifecycle_co2e_tonnes: Mapped[float] = mapped_column(Float)
    model_name: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class BenchmarkResult(Base):
    __tablename__ = "benchmark_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scenario_id: Mapped[Optional[int]] = mapped_column(ForeignKey("scenarios.id"), nullable=True)
    config: Mapped[dict] = mapped_column(JSON)
    results: Mapped[dict] = mapped_column(JSON)
    convergence: Mapped[dict] = mapped_column(JSON)
    head_to_head: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(256))
    title: Mapped[str] = mapped_column(String(256), default="")
    scenario_id: Mapped[Optional[int]] = mapped_column(ForeignKey("scenarios.id"), nullable=True)
    run_id: Mapped[Optional[int]] = mapped_column(ForeignKey("optimization_runs.id"), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)


# ------------------------------------------------------------------- AIS tracking

class AISVessel(Base):
    """Latest known state for each vessel tracked via AIS."""
    __tablename__ = "ais_vessels"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mmsi: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    imo: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    call_sign: Mapped[str] = mapped_column(String(32), default="")
    ship_type: Mapped[int] = mapped_column(Integer, default=0)
    destination: Mapped[str] = mapped_column(String(128), default="")
    eta: Mapped[str] = mapped_column(String(64), default="")
    draught: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dimension_a: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dimension_b: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dimension_c: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dimension_d: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    speed_over_ground: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    course_over_ground: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    true_heading: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    navigational_status: Mapped[int] = mapped_column(Integer, default=15)
    last_ais_update: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)
    first_seen: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
    positions: Mapped[list["AISPosition"]] = relationship(
        back_populates="vessel", cascade="all, delete-orphan")


class AISPosition(Base):
    """Historical AIS position reports for track replay."""
    __tablename__ = "ais_positions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vessel_id: Mapped[int] = mapped_column(ForeignKey("ais_vessels.id"), index=True)
    mmsi: Mapped[int] = mapped_column(Integer, index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    speed_over_ground: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    course_over_ground: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    true_heading: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    navigational_status: Mapped[int] = mapped_column(Integer, default=15)
    timestamp: Mapped[dt.datetime] = mapped_column(DateTime, index=True)
    received_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_now)
    vessel: Mapped[AISVessel] = relationship(back_populates="positions")

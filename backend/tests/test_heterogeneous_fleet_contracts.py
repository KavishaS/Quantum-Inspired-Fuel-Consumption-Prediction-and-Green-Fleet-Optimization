"""
Tests for Heterogeneous Fleet, Fleet Master, Port Contracts, Voyage Engine,
Multi-Emissions (CO2, SOx, NOx), What-If Simulator, and Weather Impact.
"""
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

_tmpdir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmpdir) / 'test_fleet.db'}"
os.environ["SEED_ON_START"] = "1"

from app.main import app  # noqa: E402
from app.services.domain import VESSEL_TYPES, VESSEL_TYPE_SIZE_CLASSES  # noqa: E402
from app.services.emissions import calculate_emissions  # noqa: E402
from app.services.voyage_engine import calculate_voyage_plan, get_vessel_sanity_range  # noqa: E402
from app.services.what_if import SimulationCondition, simulate_what_if  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_heterogeneous_fleet_structure(client):
    """Verify vessel types and size classes are genuinely heterogeneous and separate."""
    res = client.get("/api/fleet/meta")
    assert res.status_code == 200
    data = res.json()
    assert "Bulk Carrier" in data["vessel_types"]
    assert "Container Ship" in data["vessel_types"]
    assert "Oil Tanker" in data["vessel_types"]
    assert "General Cargo" in data["vessel_types"]
    assert "Ro-Ro" in data["vessel_types"]

    # Verify size classes are appropriate and not mixed up
    assert "Capesize" in data["size_classes_by_type"]["Bulk Carrier"]
    assert "Post-Panamax" in data["size_classes_by_type"]["Container Ship"]
    assert "Suezmax" in data["size_classes_by_type"]["Oil Tanker"]


def test_fleet_endpoints_and_filtering(client):
    """Test /api/fleet filtering by type and size class."""
    res = client.get("/api/fleet")
    assert res.status_code == 200
    vessels = res.json()["vessels"]
    assert len(vessels) > 0

    # Test filtering by vessel_type
    bulk_res = client.get("/api/fleet?vessel_type=Bulk+Carrier")
    assert bulk_res.status_code == 200
    for v in bulk_res.json()["vessels"]:
        assert v["vessel_type"] == "Bulk Carrier"

    # Test vessel detail
    vid = vessels[0]["id"]
    detail = client.get(f"/api/fleet/{vid}")
    assert detail.status_code == 200
    v_data = detail.json()
    assert "vessel_type" in v_data
    assert "size_class" in v_data
    assert "reference_daily_fuel_range" in v_data


def test_fleet_analytics(client):
    """Test fleet analytics calculations from database."""
    res = client.get("/api/fleet/analytics")
    assert res.status_code == 200
    d = res.json()
    assert d["total_vessels"] > 0
    assert len(d["vessels_by_type"]) > 0
    assert len(d["vessels_by_size_class"]) > 0
    assert d["average_dwt"] > 0
    assert d["average_engine_power_kw"] > 0
    assert d["average_daily_fuel_mt"] > 0


def test_port_contracts_crud(client):
    """Test Contract listing, creation, and detail."""
    # List contracts
    res = client.get("/api/contracts")
    assert res.status_code == 200
    contracts = res.json()["contracts"]
    assert len(contracts) > 0
    assert res.json()["data_type"] == "SCENARIO"

    # Detail
    cid = contracts[0]["id"]
    detail = client.get(f"/api/contracts/{cid}")
    assert detail.status_code == 200
    c_data = detail.json()
    assert "penalty_per_day" in c_data
    assert "customer" in c_data

    # Create new contract
    new_c = {
        "contract_code": "CNT-TEST-9999",
        "customer": "Test Shipping Corp",
        "origin_port": "Singapore",
        "destination_port": "Rotterdam",
        "cargo_type": "Iron Ore",
        "cargo_quantity_tonnes": 75000,
        "required_arrival_days": 20.0,
        "laycan_start": "2026-11-01",
        "laycan_end": "2026-11-10",
        "penalty_per_day": 25000.0,
        "priority": "HIGH",
        "status": "ACTIVE",
    }
    c_res = client.post("/api/contracts", json=new_c)
    assert c_res.status_code in (201, 409)


def test_voyage_calculation_and_sanity_check(client):
    """Test Voyage Engine and fuel sanity validation."""
    req = {
        "vessel_class": "CAPESIZE",
        "distance_nm": 3600.0,
        "speed_kn": 13.5,
        "fuel_type": "HFO",
        "port_hours": 24.0,
    }
    res = client.post("/api/voyages/calculate", json=req)
    assert res.status_code == 200
    d = res.json()
    assert d["distance_nm"] == 3600.0
    assert d["voyage_hours"] > 0
    assert d["total_voyage_fuel_tonnes"] > 0
    assert d["sanity_status"] in ("Plausible", "Warning: Low", "Warning: High")
    assert "MT/day" in d["sanity_reference_range"]
    assert d["co2_tonnes"] > 0
    assert d["sox_kg"] > 0
    assert d["nox_kg"] > 0


def test_multi_emission_calculation(client):
    """Test centralized emission calculation for CO2, SOx, NOx."""
    req = {
        "fuel_tonnes": 100.0,
        "fuel_type": "HFO",
        "in_eca": False,
    }
    res = client.post("/api/emissions/calculate", json=req)
    assert res.status_code == 200
    d = res.json()
    assert 300 < d["co2_tonnes"] < 330
    assert 900 <= d["sox_kg"] <= 1100
    assert 7000 <= d["nox_kg"] <= 8500
    assert d["sox_compliance_status"] == "Compliant"


def test_what_if_simulator(client):
    """Test What-If simulator comparing baseline vs scenario with actual deltas."""
    req = {
        "baseline": {
            "vessel_class": "PANAMAX",
            "speed_kn": 12.0,
            "fuel_type": "HFO",
            "distance_nm": 5000.0,
        },
        "scenario": {
            "vessel_class": "PANAMAX",
            "speed_kn": 14.5,
            "fuel_type": "LNG",
            "distance_nm": 5000.0,
        },
    }
    res = client.post("/api/simulation/what-if", json=req)
    assert res.status_code == 200
    d = res.json()
    assert "baseline" in d
    assert "scenario" in d
    assert "deltas" in d
    assert "speed_kn" in d["deltas"]
    assert "total_fuel_tonnes" in d["deltas"]
    assert "co2_tonnes" in d["deltas"]
    assert "sox_kg" in d["deltas"]


def test_weather_impact_comparison(client):
    """Test weather impact explainer comparing calm baseline vs current conditions."""
    res = client.get("/api/weather/impact?vessel_class=PANAMAX&speed_kn=13&weather=ROUGH&wave_height_m=3.5&wind_speed_kn=25")
    assert res.status_code == 200
    d = res.json()
    assert "normal_conditions" in d
    assert "forecast_conditions" in d
    assert d["fuel_consumption_change_pct"] > 0
    assert "resistance" in d["explanation"].lower() or "drag" in d["explanation"].lower()

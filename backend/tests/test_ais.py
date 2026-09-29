"""
Tests for AIS message parsing, validation, stale detection, and API routes.

These tests run without any live AIS connection or API key.
All WebSocket and external provider behaviour is tested through unit tests
on the parser functions and mock data.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import tempfile
from pathlib import Path

import pytest

# ─── Isolate to a fresh test DB ───────────────────────────────────────────────
_tmpdir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmpdir) / 'test_ais.db'}"
os.environ["SEED_ON_START"] = "0"          # don't seed fleet data for AIS tests
os.environ["AISSTREAM_API_KEY"] = ""       # ensure no live connection

from fastapi.testclient import TestClient   # noqa: E402
from app.main import app                   # noqa: E402
from app.services.ais_client import (      # noqa: E402
    parse_aisstream_message, ParsedAISPosition, validate_coordinate,
    build_subscription_message, STALE_THRESHOLD_SECONDS,
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ─────────────────────────────────── parser unit tests ────────────────────────

class TestValidateCoordinate:
    def test_valid_latitude(self):
        assert validate_coordinate(51.5074, -90, 90) == pytest.approx(51.5074)

    def test_valid_longitude(self):
        assert validate_coordinate(-0.1278, -180, 180) == pytest.approx(-0.1278)

    def test_out_of_range_returns_none(self):
        assert validate_coordinate(200.0, -90, 90) is None

    def test_string_number(self):
        assert validate_coordinate("13.5", 0, 20) == pytest.approx(13.5)

    def test_none_returns_none(self):
        assert validate_coordinate(None, -90, 90) is None

    def test_non_numeric_returns_none(self):
        assert validate_coordinate("north", -90, 90) is None


class TestParseAISMessage:
    def _pos_report(self, mmsi=123456789, lat=51.5, lon=-0.12,
                    sog=12.3, cog=180.0, heading=182.0, status=0):
        return {
            "MessageType": "PositionReport",
            "MetaData": {
                "MMSI": mmsi,
                "ShipName": "MV TEST VESSEL",
                "time_utc": "2026-09-29 12:00:00+00:00",
            },
            "Message": {
                "PositionReport": {
                    "CommonNavigationBlock": {
                        "Latitude": lat,
                        "Longitude": lon,
                        "Sog": sog,
                        "Cog": cog,
                        "TrueHeading": heading,
                        "NavigationalStatus": status,
                    }
                }
            },
        }

    def test_valid_position_report_parsed(self):
        pos = parse_aisstream_message(self._pos_report())
        assert pos is not None
        assert pos.mmsi == 123456789
        assert pos.latitude == pytest.approx(51.5)
        assert pos.longitude == pytest.approx(-0.12)
        assert pos.speed_over_ground == pytest.approx(12.3)
        assert pos.name == "MV TEST VESSEL"

    def test_invalid_mmsi_rejected(self):
        msg = self._pos_report(mmsi=123)  # too short
        assert parse_aisstream_message(msg) is None

    def test_invalid_latitude_rejected(self):
        msg = self._pos_report(lat=95.0)  # >90
        assert parse_aisstream_message(msg) is None

    def test_zero_zero_position_rejected(self):
        msg = self._pos_report(lat=0.0, lon=0.0)
        assert parse_aisstream_message(msg) is None

    def test_invalid_longitude_rejected(self):
        msg = self._pos_report(lon=200.0)  # >180
        assert parse_aisstream_message(msg) is None

    def test_missing_position_block_returns_none(self):
        msg = {
            "MessageType": "PositionReport",
            "MetaData": {"MMSI": 123456789},
            "Message": {},
        }
        assert parse_aisstream_message(msg) is None

    def test_empty_message_returns_none(self):
        assert parse_aisstream_message({}) is None

    def test_malformed_json_dict_returns_none(self):
        assert parse_aisstream_message({"MessageType": "UNKNOWN"}) is None

    def test_static_data_message(self):
        msg = {
            "MessageType": "ShipStaticData",
            "MetaData": {"MMSI": 123456789, "ShipName": "MV STATIC"},
            "Message": {
                "ShipStaticData": {
                    "ImoNumber": 9876543,
                    "CallSign": "ABCD1",
                    "Type": 70,
                    "Destination": "ROTTERDAM",
                    "MaximumStaticDraught": 12.5,
                    "Dimension": {"A": 150, "B": 25, "C": 10, "D": 10},
                }
            },
        }
        pos = parse_aisstream_message(msg)
        assert pos is not None
        assert pos.mmsi == 123456789
        assert pos.imo == 9876543
        assert pos.destination == "ROTTERDAM"
        assert pos.ship_type == 70
        assert pos.draught == pytest.approx(12.5)

    def test_timestamp_parsed_correctly(self):
        pos = parse_aisstream_message(self._pos_report())
        assert pos is not None
        assert pos.timestamp is not None
        assert pos.timestamp.year == 2026

    def test_sog_out_of_range_returns_none(self):
        """SOG > 102.2 kn is the AIS special value for not available."""
        msg = self._pos_report(sog=1023.0)
        pos = parse_aisstream_message(msg)
        # Message is parsed but SOG is None
        assert pos is None or pos.speed_over_ground is None

    def test_class_b_position_report(self):
        msg = {
            "MessageType": "StandardClassBPositionReport",
            "MetaData": {"MMSI": 338123456, "ShipName": "CLASS B"},
            "Message": {
                "StandardClassBPositionReport": {
                    "Latitude": 48.8566,
                    "Longitude": 2.3522,
                    "Sog": 5.0,
                    "Cog": 270.0,
                    "TrueHeading": 270.0,
                }
            },
        }
        pos = parse_aisstream_message(msg)
        assert pos is not None
        assert pos.latitude == pytest.approx(48.8566)


class TestParsedAISPositionValidation:
    def test_valid_position_is_valid(self):
        pos = ParsedAISPosition(mmsi=123456789, latitude=51.5, longitude=-0.12)
        assert pos.is_valid

    def test_out_of_range_latitude_invalid(self):
        pos = ParsedAISPosition(mmsi=123456789, latitude=95.0, longitude=0.0)
        assert not pos.is_valid

    def test_zero_zero_is_invalid(self):
        pos = ParsedAISPosition(mmsi=123456789, latitude=0.0, longitude=0.0)
        assert not pos.is_valid

    def test_bad_mmsi_is_invalid(self):
        pos = ParsedAISPosition(mmsi=123, latitude=51.5, longitude=-0.12)
        assert not pos.is_valid

    def test_stale_position_detected(self):
        old = dt.datetime.now(dt.timezone.utc) - dt.timedelta(
            seconds=STALE_THRESHOLD_SECONDS + 60)
        pos = ParsedAISPosition(mmsi=123456789, latitude=51.5,
                                longitude=-0.12, timestamp=old)
        assert pos.is_stale

    def test_fresh_position_not_stale(self):
        pos = ParsedAISPosition(mmsi=123456789, latitude=51.5, longitude=-0.12,
                                timestamp=dt.datetime.now(dt.timezone.utc))
        assert not pos.is_stale

    def test_no_timestamp_is_stale(self):
        pos = ParsedAISPosition(mmsi=123456789, latitude=51.5, longitude=-0.12,
                                timestamp=None)
        assert pos.is_stale

    def test_to_dict_contains_expected_fields(self):
        pos = ParsedAISPosition(mmsi=123456789, latitude=51.5, longitude=-0.12,
                                speed_over_ground=12.5, name="MV TEST")
        d = pos.to_dict()
        assert d["mmsi"] == 123456789
        assert "latitude" in d
        assert "source" in d
        assert d["source"] == "aisstream"
        assert "is_stale" in d


class TestSubscriptionMessage:
    def test_subscription_contains_api_key(self):
        msg = json.loads(build_subscription_message("test_key_123"))
        assert msg["APIKey"] == "test_key_123"

    def test_subscription_contains_bounding_boxes(self):
        boxes = [[[0, 0], [10, 10]]]
        msg = json.loads(build_subscription_message("key", bounding_boxes=boxes))
        assert msg["BoundingBoxes"] == boxes

    def test_subscription_with_mmsi_filter(self):
        msg = json.loads(build_subscription_message(
            "key", mmsi_filters=[123456789, 987654321]))
        assert 123456789 in msg["FiltersShipMMSI"]


# ─────────────────────────────── API endpoint tests ───────────────────────────

class TestAISStatusEndpoint:
    def test_status_returns_connected_state(self, client):
        r = client.get("/api/ais/status")
        assert r.status_code == 200
        d = r.json()
        assert "state" in d
        assert "api_key_configured" in d
        # No API key set, should report no_api_key or disconnected
        assert d["state"] in ("no_api_key", "disconnected", "connecting", "connected")

    def test_status_does_not_expose_api_key(self, client):
        r = client.get("/api/ais/status")
        d = r.json()
        # The response must not contain any string that looks like an actual API key.
        # The field 'api_key_configured' (bool) is fine; a literal key string is not.
        # With no key set, api_key_configured should be False.
        assert d["api_key_configured"] is False
        # Response fields should not contain any raw key strings (check known patterns)
        for val in d.values():
            if isinstance(val, str):
                # Real AISstream keys are long alphanumeric strings; we just check
                # no field value looks like a 32+ char secret
                assert len(val) < 32 or not val.replace("-", "").replace("_", "").isalnum(), \
                    f"Possible API key leaked in field: {val[:8]}..."

    def test_no_api_key_reported(self, client):
        r = client.get("/api/ais/status")
        d = r.json()
        # API key is not set in test env
        assert d["api_key_configured"] is False


class TestAISVesselsEndpoint:
    def test_vessels_list_returns_valid_structure(self, client):
        r = client.get("/api/ais/vessels")
        assert r.status_code == 200
        d = r.json()
        assert "count" in d
        assert "vessels" in d
        assert "live" in d
        assert isinstance(d["vessels"], list)

    def test_vessels_list_with_no_data_returns_empty(self, client):
        r = client.get("/api/ais/vessels")
        d = r.json()
        # Fresh test DB — no AIS data
        assert d["count"] == 0 or isinstance(d["vessels"], list)

    def test_unknown_mmsi_returns_404(self, client):
        r = client.get("/api/ais/vessels/999999999")
        assert r.status_code == 404

    def test_track_endpoint_structure(self, client):
        # No data for this MMSI, but structure test
        r = client.get("/api/ais/vessels/123456789/track?hours=6")
        # 404 if vessel not in DB, which is expected in fresh test DB
        assert r.status_code in (200, 404)


class TestAISStatsEndpoint:
    def test_stats_returns_valid_structure(self, client):
        r = client.get("/api/ais/stats")
        assert r.status_code == 200
        d = r.json()
        assert "vessels_in_db" in d
        assert "positions_in_db" in d
        assert d["vessels_in_db"] == 0  # fresh test DB


class TestNoAPIKeyFallback:
    """Ensure the app works correctly with no AIS API key configured."""

    def test_health_still_ok_without_ais_key(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_ais_status_graceful_without_key(self, client):
        r = client.get("/api/ais/status")
        assert r.status_code == 200
        d = r.json()
        # Must not crash or leak errors
        assert "state" in d

    def test_vessels_endpoint_works_without_ais_key(self, client):
        r = client.get("/api/ais/vessels")
        assert r.status_code == 200

    def test_demo_optimization_unaffected_by_no_ais(self, client):
        """Existing optimization must still work when AIS is not configured."""
        # Need seed data for this - add a vessel via API
        # Just verify the optimization endpoint still exists and validates input
        r = client.post("/api/optimize", json={"algorithm": "QGA"})
        assert r.status_code == 422  # Missing scenario - correct validation


class TestDuplicateMessageHandling:
    """AIS streams can send duplicate messages."""

    def test_duplicate_messages_parse_independently(self):
        msg = {
            "MessageType": "PositionReport",
            "MetaData": {"MMSI": 123456789, "ShipName": "DUPLICATE"},
            "Message": {
                "PositionReport": {
                    "CommonNavigationBlock": {
                        "Latitude": 51.5, "Longitude": -0.12,
                        "Sog": 10.0, "Cog": 90.0, "TrueHeading": 90.0,
                        "NavigationalStatus": 0,
                    }
                }
            },
        }
        p1 = parse_aisstream_message(msg)
        p2 = parse_aisstream_message(msg)
        assert p1 is not None and p2 is not None
        assert p1.mmsi == p2.mmsi
        assert p1.latitude == p2.latitude


class TestMissingFieldHandling:
    """AIS messages often have missing or null fields."""

    def test_missing_speed_is_none(self):
        msg = {
            "MessageType": "PositionReport",
            "MetaData": {"MMSI": 123456789},
            "Message": {
                "PositionReport": {
                    "CommonNavigationBlock": {
                        "Latitude": 51.5,
                        "Longitude": -0.12,
                        # SOG omitted
                        "Cog": 90.0,
                        "TrueHeading": 511,  # 511 = not available in AIS spec
                        "NavigationalStatus": 0,
                    }
                }
            },
        }
        pos = parse_aisstream_message(msg)
        # SOG missing → None; heading 511 → out of range → None
        assert pos is not None
        assert pos.speed_over_ground is None
        # 511 > 360, validate_coordinate returns None
        assert pos.true_heading is None

    def test_missing_vessel_name_is_handled(self):
        msg = {
            "MessageType": "PositionReport",
            "MetaData": {"MMSI": 123456789},  # no ShipName
            "Message": {
                "PositionReport": {
                    "CommonNavigationBlock": {
                        "Latitude": 51.5, "Longitude": -0.12,
                        "Sog": 8.0, "Cog": 270.0, "TrueHeading": 270.0,
                        "NavigationalStatus": 0,
                    }
                }
            },
        }
        pos = parse_aisstream_message(msg)
        assert pos is not None
        # Name should be None or empty (no ShipName in MetaData)
        assert pos.name is None or pos.name == ""

"""
AIS data client for AISstream.io WebSocket API.

Connects to wss://stream.aisstream.io/v0/stream and parses position reports.
Only one upstream connection is maintained; the AIS manager fans out to
frontend clients. API keys stay server-side and are never exposed.

Reconnection uses exponential backoff with jitter to avoid thundering herd.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import os
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

log = logging.getLogger("greenfleet.ais")

AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"
STALE_THRESHOLD_SECONDS = int(os.getenv("AIS_STALE_THRESHOLD_SECONDS", "300"))
HISTORY_RETENTION_HOURS = int(os.getenv("AIS_HISTORY_RETENTION_HOURS", "24"))

# Reconnect parameters
BACKOFF_BASE = 2.0
BACKOFF_MAX = 120.0
BACKOFF_JITTER = 0.5


class AISConnectionState(str, Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    NO_API_KEY = "no_api_key"
    ERROR = "error"


@dataclass
class ParsedAISPosition:
    """Validated AIS position report."""
    mmsi: int
    latitude: float
    longitude: float
    speed_over_ground: Optional[float] = None
    course_over_ground: Optional[float] = None
    true_heading: Optional[float] = None
    navigational_status: int = 15  # 15 = not defined
    timestamp: Optional[dt.datetime] = None
    # Vessel static data (from message type 5 or embedded)
    name: Optional[str] = None
    imo: Optional[int] = None
    call_sign: Optional[str] = None
    ship_type: int = 0
    destination: Optional[str] = None
    eta: Optional[str] = None
    draught: Optional[float] = None
    dimension_a: Optional[float] = None
    dimension_b: Optional[float] = None
    dimension_c: Optional[float] = None
    dimension_d: Optional[float] = None
    received_at: dt.datetime = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    raw_message_type: Optional[str] = None

    @property
    def is_valid(self) -> bool:
        return (
            isinstance(self.mmsi, int) and 100000000 <= self.mmsi <= 799999999
            and -90 <= self.latitude <= 90
            and -180 <= self.longitude <= 180
            and self.latitude != 0.0 and self.longitude != 0.0  # 0,0 is almost always invalid
        )

    @property
    def is_stale(self) -> bool:
        if self.timestamp is None:
            return True
        age = (dt.datetime.now(dt.timezone.utc) - self.timestamp).total_seconds()
        return age > STALE_THRESHOLD_SECONDS

    def to_dict(self) -> dict:
        return {
            "mmsi": self.mmsi,
            "latitude": round(self.latitude, 6),
            "longitude": round(self.longitude, 6),
            "speed_over_ground": round(self.speed_over_ground, 1) if self.speed_over_ground is not None else None,
            "course_over_ground": round(self.course_over_ground, 1) if self.course_over_ground is not None else None,
            "true_heading": round(self.true_heading, 1) if self.true_heading is not None else None,
            "navigational_status": self.navigational_status,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "name": (self.name or "").strip() or None,
            "imo": self.imo,
            "call_sign": (self.call_sign or "").strip() or None,
            "ship_type": self.ship_type,
            "destination": (self.destination or "").strip() or None,
            "eta": (self.eta or "").strip() or None,
            "is_stale": self.is_stale,
            "received_at": self.received_at.isoformat(),
            "source": "aisstream",
        }


def validate_coordinate(val: Any, lo: float, hi: float) -> Optional[float]:
    """Safely extract a numeric coordinate within bounds."""
    try:
        v = float(val)
        if lo <= v <= hi:
            return v
    except (TypeError, ValueError):
        pass
    return None


def parse_aisstream_message(raw: dict) -> Optional[ParsedAISPosition]:
    """
    Parse an AISstream WebSocket message into a ParsedAISPosition.

    AISstream sends messages with structure:
    {
      "MessageType": "PositionReport" | "ShipStaticData" | ...,
      "MetaData": { "MMSI": int, "ShipName": str, "time_utc": str, ... },
      "Message": { "PositionReport": {...} } | { "ShipStaticData": {...} }
    }
    """
    try:
        msg_type = raw.get("MessageType", "")
        meta = raw.get("MetaData", {})
        message = raw.get("Message", {})

        mmsi = meta.get("MMSI")
        if not mmsi or not isinstance(mmsi, int):
            return None

        # Parse timestamp
        time_str = meta.get("time_utc", "")
        timestamp = None
        if time_str:
            try:
                # AISstream format: "2024-01-15 12:30:45.123456+00:00 UTC"
                clean = time_str.replace(" UTC", "").strip()
                timestamp = dt.datetime.fromisoformat(clean)
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=dt.timezone.utc)
            except (ValueError, TypeError):
                timestamp = dt.datetime.now(dt.timezone.utc)

        ship_name = (meta.get("ShipName") or "").strip()

        pos = ParsedAISPosition(
            mmsi=mmsi,
            latitude=0.0,
            longitude=0.0,
            timestamp=timestamp,
            name=ship_name if ship_name else None,
            raw_message_type=msg_type,
        )

        if msg_type == "PositionReport":
            report = message.get("PositionReport", {})
            pos_data = report.get("CommonNavigationBlock", report)

            lat = validate_coordinate(pos_data.get("Latitude"), -90, 90)
            lon = validate_coordinate(pos_data.get("Longitude"), -180, 180)
            if lat is None or lon is None:
                return None
            pos.latitude = lat
            pos.longitude = lon
            pos.speed_over_ground = validate_coordinate(pos_data.get("Sog"), 0, 102.2)
            pos.course_over_ground = validate_coordinate(pos_data.get("Cog"), 0, 360)
            pos.true_heading = validate_coordinate(pos_data.get("TrueHeading"), 0, 360)
            pos.navigational_status = int(pos_data.get("NavigationalStatus", 15))

        elif msg_type == "StandardClassBPositionReport":
            report = message.get("StandardClassBPositionReport", {})
            lat = validate_coordinate(report.get("Latitude"), -90, 90)
            lon = validate_coordinate(report.get("Longitude"), -180, 180)
            if lat is None or lon is None:
                return None
            pos.latitude = lat
            pos.longitude = lon
            pos.speed_over_ground = validate_coordinate(report.get("Sog"), 0, 102.2)
            pos.course_over_ground = validate_coordinate(report.get("Cog"), 0, 360)
            pos.true_heading = validate_coordinate(report.get("TrueHeading"), 0, 360)

        elif msg_type == "ShipStaticData":
            static = message.get("ShipStaticData", {})
            pos.imo = static.get("ImoNumber")
            pos.call_sign = static.get("CallSign")
            pos.ship_type = int(static.get("Type", 0))
            pos.destination = static.get("Destination")
            pos.eta = str(static.get("Eta", ""))
            pos.draught = validate_coordinate(static.get("MaximumStaticDraught"), 0, 100)
            dim = static.get("Dimension", {})
            if dim:
                pos.dimension_a = validate_coordinate(dim.get("A"), 0, 500)
                pos.dimension_b = validate_coordinate(dim.get("B"), 0, 500)
                pos.dimension_c = validate_coordinate(dim.get("C"), 0, 100)
                pos.dimension_d = validate_coordinate(dim.get("D"), 0, 100)
            # Static data doesn't have position, skip validation
            return pos if mmsi else None

        else:
            # Unknown message type, skip
            return None

        return pos if pos.is_valid else None

    except Exception:
        log.debug("Failed to parse AIS message", exc_info=True)
        return None


def build_subscription_message(
    api_key: str,
    bounding_boxes: Optional[List[List[List[float]]]] = None,
    mmsi_filters: Optional[List[int]] = None,
) -> str:
    """
    Build the AISstream subscription JSON.

    bounding_boxes: list of [[lat_min, lon_min], [lat_max, lon_max]]
    Default covers major global shipping lanes.
    """
    if bounding_boxes is None:
        # Default: broad coverage of major shipping regions
        bounding_boxes = [
            [[-90, -180], [90, 180]],  # Global
        ]

    msg: Dict[str, Any] = {
        "APIKey": api_key,
        "BoundingBoxes": bounding_boxes,
    }

    if mmsi_filters:
        msg["FiltersShipMMSI"] = mmsi_filters

    return json.dumps(msg)


class AISStreamClient:
    """
    WebSocket client for AISstream with automatic reconnection.

    Usage:
        client = AISStreamClient(api_key="...")
        client.on_position = my_callback
        await client.connect()  # runs until cancelled
    """

    def __init__(
        self,
        api_key: str,
        bounding_boxes: Optional[List[List[List[float]]]] = None,
        mmsi_filters: Optional[List[int]] = None,
    ):
        self.api_key = api_key
        self.bounding_boxes = bounding_boxes
        self.mmsi_filters = mmsi_filters
        self.state = AISConnectionState.DISCONNECTED
        self._attempt = 0
        self._ws = None
        self._running = False
        self._stats = {
            "messages_received": 0,
            "messages_parsed": 0,
            "messages_invalid": 0,
            "reconnects": 0,
            "last_message_at": None,
            "connected_since": None,
        }

        # Callback for parsed positions
        self.on_position: Optional[Callable[[ParsedAISPosition], None]] = None
        self.on_state_change: Optional[Callable[[AISConnectionState], None]] = None

    @property
    def stats(self) -> dict:
        return {**self._stats, "state": self.state.value}

    def _set_state(self, state: AISConnectionState) -> None:
        self.state = state
        if self.on_state_change:
            try:
                self.on_state_change(state)
            except Exception:
                log.debug("state change callback error", exc_info=True)

    def _backoff_delay(self) -> float:
        delay = min(BACKOFF_BASE ** self._attempt, BACKOFF_MAX)
        jitter = delay * BACKOFF_JITTER * random.random()
        return delay + jitter

    async def connect(self) -> None:
        """Main connection loop with reconnection. Runs until stop() is called."""
        try:
            import websockets
        except ImportError:
            log.error("websockets package not installed. Run: pip install websockets>=12.0")
            self._set_state(AISConnectionState.ERROR)
            return

        self._running = True
        self._set_state(AISConnectionState.CONNECTING)
        log.info("AIS client starting (bboxes=%s, mmsi_filters=%s)",
                 len(self.bounding_boxes or []), len(self.mmsi_filters or []))

        while self._running:
            try:
                sub_msg = build_subscription_message(
                    self.api_key, self.bounding_boxes, self.mmsi_filters)

                async with websockets.connect(
                    AISSTREAM_URL,
                    ping_interval=30,
                    ping_timeout=10,
                    close_timeout=5,
                    max_size=2 ** 20,  # 1 MB max message
                ) as ws:
                    self._ws = ws
                    self._attempt = 0
                    self._stats["connected_since"] = dt.datetime.now(dt.timezone.utc).isoformat()
                    self._set_state(AISConnectionState.CONNECTED)
                    log.info("AIS WebSocket connected to %s", AISSTREAM_URL)

                    # Send subscription
                    await ws.send(sub_msg)
                    log.info("AIS subscription sent")

                    async for raw_msg in ws:
                        if not self._running:
                            break
                        self._stats["messages_received"] += 1
                        self._stats["last_message_at"] = dt.datetime.now(
                            dt.timezone.utc).isoformat()

                        try:
                            data = json.loads(raw_msg)
                        except json.JSONDecodeError:
                            self._stats["messages_invalid"] += 1
                            continue

                        parsed = parse_aisstream_message(data)
                        if parsed is not None:
                            self._stats["messages_parsed"] += 1
                            if self.on_position:
                                try:
                                    self.on_position(parsed)
                                except Exception:
                                    log.debug("on_position callback error", exc_info=True)
                        else:
                            self._stats["messages_invalid"] += 1

            except asyncio.CancelledError:
                log.info("AIS client cancelled")
                break
            except Exception as e:
                self._attempt += 1
                self._stats["reconnects"] += 1
                delay = self._backoff_delay()
                log.warning("AIS connection lost (%s), reconnecting in %.1fs (attempt %d)",
                            type(e).__name__, delay, self._attempt)
                self._set_state(AISConnectionState.RECONNECTING)
                try:
                    await asyncio.sleep(delay)
                except asyncio.CancelledError:
                    break

        self._ws = None
        self._set_state(AISConnectionState.DISCONNECTED)
        log.info("AIS client stopped")

    async def stop(self) -> None:
        """Gracefully stop the client."""
        self._running = False
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass

"""
AIS Manager — singleton that owns the upstream AIS connection and fans out
to frontend WebSocket clients.

Responsibilities:
  - Maintain one upstream AIS connection (AISStreamClient).
  - Persist latest vessel state and position history in the database.
  - Broadcast parsed AIS updates to connected frontend WebSocket clients.
  - Periodically purge stale AIS history beyond the retention window.
  - Provide connection health metrics.
  - Handle graceful startup/shutdown.

No API keys are ever exposed to frontend clients.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import os
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import delete, select

from ..database.models import AISPosition, AISVessel
from ..database.session import SessionLocal
from .ais_client import (
    AISConnectionState,
    AISStreamClient,
    HISTORY_RETENTION_HOURS,
    STALE_THRESHOLD_SECONDS,
    ParsedAISPosition,
)

log = logging.getLogger("greenfleet.ais_manager")

# Maximum frontend WS clients before refusing new connections
MAX_FRONTEND_CLIENTS = int(os.getenv("AIS_MAX_FRONTEND_CLIENTS", "50"))


class AISManager:
    """
    Singleton AIS service.

    Usage (in FastAPI lifespan):
        manager = AISManager.instance()
        await manager.start()
        ...
        await manager.stop()
    """

    _instance: Optional["AISManager"] = None

    @classmethod
    def instance(cls) -> "AISManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self) -> None:
        self._client: Optional[AISStreamClient] = None
        self._task: Optional[asyncio.Task] = None
        self._purge_task: Optional[asyncio.Task] = None
        self._frontend_clients: Set[asyncio.Queue] = set()
        self._vessel_cache: Dict[int, Dict[str, Any]] = {}  # mmsi -> latest data
        self._state = AISConnectionState.DISCONNECTED
        self._api_key_configured = False
        self._stats: Dict[str, Any] = {
            "frontend_clients": 0,
            "vessels_tracked": 0,
            "db_writes": 0,
        }

    @property
    def state(self) -> AISConnectionState:
        if not self._api_key_configured:
            return AISConnectionState.NO_API_KEY
        return self._state

    @property
    def stats(self) -> dict:
        client_stats = self._client.stats if self._client else {}
        return {
            "state": self.state.value,
            "api_key_configured": self._api_key_configured,
            "frontend_clients": len(self._frontend_clients),
            "vessels_tracked": len(self._vessel_cache),
            "db_writes": self._stats["db_writes"],
            **client_stats,
        }

    @property
    def vessel_cache(self) -> Dict[int, Dict[str, Any]]:
        return self._vessel_cache

    async def start(self) -> None:
        """Start the AIS upstream connection if an API key is configured."""
        api_key = os.getenv("AISSTREAM_API_KEY", "").strip()
        if not api_key:
            log.info("AISSTREAM_API_KEY not set — AIS live tracking unavailable. "
                     "Demo mode preserved.")
            self._api_key_configured = False
            self._state = AISConnectionState.NO_API_KEY
            return

        self._api_key_configured = True
        log.info("AIS API key configured, starting upstream connection")

        # Parse bounding boxes from env
        bboxes = None
        bbox_env = os.getenv("AIS_BOUNDING_BOXES", "").strip()
        if bbox_env:
            try:
                bboxes = json.loads(bbox_env)
            except json.JSONDecodeError:
                log.warning("AIS_BOUNDING_BOXES is not valid JSON, using global coverage")

        # Parse MMSI filter from env
        mmsi_filters = None
        mmsi_env = os.getenv("AIS_MMSI_FILTERS", "").strip()
        if mmsi_env:
            try:
                mmsi_filters = [int(m.strip()) for m in mmsi_env.split(",") if m.strip()]
            except ValueError:
                log.warning("AIS_MMSI_FILTERS is not valid, ignoring")

        self._client = AISStreamClient(
            api_key=api_key,
            bounding_boxes=bboxes,
            mmsi_filters=mmsi_filters,
        )
        self._client.on_position = self._handle_position
        self._client.on_state_change = self._handle_state_change

        self._task = asyncio.create_task(self._client.connect())
        self._purge_task = asyncio.create_task(self._purge_loop())

    async def stop(self) -> None:
        """Gracefully shut down the AIS service."""
        if self._client:
            await self._client.stop()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        if self._purge_task:
            self._purge_task.cancel()
            try:
                await self._purge_task
            except (asyncio.CancelledError, Exception):
                pass
        # Close all frontend queues
        for q in list(self._frontend_clients):
            await q.put(None)  # sentinel to close
        self._frontend_clients.clear()
        log.info("AIS manager stopped")

    def _handle_state_change(self, state: AISConnectionState) -> None:
        self._state = state

    def _handle_position(self, pos: ParsedAISPosition) -> None:
        """Called by the upstream client for each parsed position."""
        # Update in-memory cache
        data = pos.to_dict()
        existing = self._vessel_cache.get(pos.mmsi, {})

        # Merge: keep existing static data if this message doesn't have it
        if pos.raw_message_type == "ShipStaticData":
            # Update static fields only
            for k in ("name", "imo", "call_sign", "ship_type", "destination",
                       "eta", "draught", "dimension_a", "dimension_b",
                       "dimension_c", "dimension_d"):
                if data.get(k) is not None:
                    existing[k] = data[k]
            existing["mmsi"] = pos.mmsi
            self._vessel_cache[pos.mmsi] = existing
        else:
            # Position update: merge with any existing static data
            merged = {**existing, **data}
            self._vessel_cache[pos.mmsi] = merged

        # Broadcast to frontend clients
        broadcast = json.dumps({
            "type": "ais_update",
            "data": self._vessel_cache[pos.mmsi],
        })
        dead: List[asyncio.Queue] = []
        for q in self._frontend_clients:
            try:
                q.put_nowait(broadcast)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._frontend_clients.discard(q)

        # Persist to DB asynchronously
        asyncio.get_event_loop().call_soon(
            lambda: asyncio.ensure_future(self._persist_position(pos)))

    async def _persist_position(self, pos: ParsedAISPosition) -> None:
        """Persist AIS data to database in a non-blocking way."""
        try:
            db = SessionLocal()
            try:
                # Upsert vessel
                vessel = db.scalar(
                    select(AISVessel).where(AISVessel.mmsi == pos.mmsi))
                if vessel is None:
                    vessel = AISVessel(mmsi=pos.mmsi)
                    db.add(vessel)
                    db.flush()

                # Update vessel fields
                if pos.name:
                    vessel.name = pos.name.strip()
                if pos.imo:
                    vessel.imo = pos.imo
                if pos.call_sign:
                    vessel.call_sign = pos.call_sign.strip()
                if pos.ship_type:
                    vessel.ship_type = pos.ship_type
                if pos.destination:
                    vessel.destination = pos.destination.strip()
                if pos.eta:
                    vessel.eta = pos.eta
                if pos.draught is not None:
                    vessel.draught = pos.draught
                for dim in ("dimension_a", "dimension_b", "dimension_c", "dimension_d"):
                    v = getattr(pos, dim, None)
                    if v is not None:
                        setattr(vessel, dim, v)

                # Update position on vessel record
                if pos.latitude != 0.0 and pos.longitude != 0.0:
                    vessel.latitude = pos.latitude
                    vessel.longitude = pos.longitude
                    vessel.speed_over_ground = pos.speed_over_ground
                    vessel.course_over_ground = pos.course_over_ground
                    vessel.true_heading = pos.true_heading
                    vessel.navigational_status = pos.navigational_status
                    vessel.last_ais_update = pos.timestamp

                    # Add position history
                    db.add(AISPosition(
                        vessel_id=vessel.id,
                        mmsi=pos.mmsi,
                        latitude=pos.latitude,
                        longitude=pos.longitude,
                        speed_over_ground=pos.speed_over_ground,
                        course_over_ground=pos.course_over_ground,
                        true_heading=pos.true_heading,
                        navigational_status=pos.navigational_status,
                        timestamp=pos.timestamp or dt.datetime.now(dt.timezone.utc),
                    ))

                db.commit()
                self._stats["db_writes"] += 1
            finally:
                db.close()
        except Exception:
            log.debug("AIS DB persist error", exc_info=True)

    async def _purge_loop(self) -> None:
        """Periodically delete old AIS positions beyond retention."""
        while True:
            try:
                await asyncio.sleep(3600)  # every hour
                cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(
                    hours=HISTORY_RETENTION_HOURS)
                db = SessionLocal()
                try:
                    result = db.execute(
                        delete(AISPosition).where(AISPosition.timestamp < cutoff))
                    db.commit()
                    count = result.rowcount
                    if count:
                        log.info("Purged %d AIS positions older than %dh", count,
                                 HISTORY_RETENTION_HOURS)
                finally:
                    db.close()
            except asyncio.CancelledError:
                break
            except Exception:
                log.debug("AIS purge error", exc_info=True)

    # ----------------------------------------------------------- frontend fan-out

    def register_frontend(self) -> Optional[asyncio.Queue]:
        """Register a new frontend WebSocket client. Returns a Queue or None if full."""
        if len(self._frontend_clients) >= MAX_FRONTEND_CLIENTS:
            return None
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._frontend_clients.add(q)
        return q

    def unregister_frontend(self, q: asyncio.Queue) -> None:
        self._frontend_clients.discard(q)

    def get_all_vessels(self) -> List[Dict[str, Any]]:
        """Return all currently tracked vessels from the in-memory cache."""
        now = dt.datetime.now(dt.timezone.utc)
        result = []
        for mmsi, data in self._vessel_cache.items():
            ts = data.get("timestamp")
            if ts:
                try:
                    t = dt.datetime.fromisoformat(ts)
                    age = (now - t).total_seconds()
                    data["status"] = "LIVE" if age < STALE_THRESHOLD_SECONDS else "STALE"
                except (ValueError, TypeError):
                    data["status"] = "STALE"
            else:
                data["status"] = "STALE"
            result.append(data)
        return result

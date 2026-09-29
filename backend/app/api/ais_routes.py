"""
AIS tracking API routes.

Provides:
  - REST endpoints for vessel list, vessel detail, position history
  - WebSocket endpoint for live streaming to frontend clients
  - Connection health/status endpoint
  - No API keys or provider error details are ever exposed
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..database.models import AISPosition, AISVessel
from ..database.session import get_db
from ..services.ais_manager import AISManager

log = logging.getLogger("greenfleet.ais_api")
router = APIRouter(prefix="/api/ais", tags=["ais"])


@router.get("/status")
def ais_status() -> dict:
    """AIS connection health and statistics. Never exposes the API key."""
    mgr = AISManager.instance()
    stats = mgr.stats
    # Strip any sensitive fields
    stats.pop("api_key", None)
    return {
        "state": stats.get("state", "disconnected"),
        "api_key_configured": stats.get("api_key_configured", False),
        "frontend_clients": stats.get("frontend_clients", 0),
        "vessels_tracked": stats.get("vessels_tracked", 0),
        "messages_received": stats.get("messages_received", 0),
        "messages_parsed": stats.get("messages_parsed", 0),
        "last_message_at": stats.get("last_message_at"),
        "connected_since": stats.get("connected_since"),
        "reconnects": stats.get("reconnects", 0),
    }


@router.get("/vessels")
def list_ais_vessels(
    db: Session = Depends(get_db),
    limit: int = Query(200, ge=1, le=1000),
    include_stale: bool = Query(True),
) -> dict:
    """
    Return tracked AIS vessels. Prefers in-memory cache for speed;
    falls back to DB if cache is empty.
    """
    mgr = AISManager.instance()
    cached = mgr.get_all_vessels()

    if cached:
        if not include_stale:
            cached = [v for v in cached if v.get("status") != "STALE"]
        return {
            "count": len(cached),
            "vessels": cached[:limit],
            "source": "aisstream",
            "live": mgr.state.value == "connected",
        }

    # Fallback to DB
    query = select(AISVessel).order_by(AISVessel.updated_at.desc()).limit(limit)
    rows = db.scalars(query).all()
    vessels = []
    now = dt.datetime.now(dt.timezone.utc)
    from ..services.ais_client import STALE_THRESHOLD_SECONDS
    for v in rows:
        age = (now - v.last_ais_update).total_seconds() if v.last_ais_update else float("inf")
        status = "LIVE" if age < STALE_THRESHOLD_SECONDS else "STALE"
        if not include_stale and status == "STALE":
            continue
        vessels.append({
            "mmsi": v.mmsi,
            "name": v.name or None,
            "imo": v.imo,
            "call_sign": v.call_sign or None,
            "ship_type": v.ship_type,
            "destination": v.destination or None,
            "eta": v.eta or None,
            "latitude": v.latitude,
            "longitude": v.longitude,
            "speed_over_ground": v.speed_over_ground,
            "course_over_ground": v.course_over_ground,
            "true_heading": v.true_heading,
            "navigational_status": v.navigational_status,
            "timestamp": v.last_ais_update.isoformat() if v.last_ais_update else None,
            "status": status,
            "source": "aisstream",
        })
    return {
        "count": len(vessels),
        "vessels": vessels,
        "source": "database",
        "live": mgr.state.value == "connected",
    }


@router.get("/vessels/{mmsi}")
def get_ais_vessel(mmsi: int, db: Session = Depends(get_db)) -> dict:
    """Detail view for a single AIS vessel."""
    v = db.scalar(select(AISVessel).where(AISVessel.mmsi == mmsi))
    if not v:
        raise HTTPException(404, f"No AIS data for MMSI {mmsi}")

    now = dt.datetime.now(dt.timezone.utc)
    from ..services.ais_client import STALE_THRESHOLD_SECONDS
    age = (now - v.last_ais_update).total_seconds() if v.last_ais_update else float("inf")

    # Length from dimensions
    length = None
    if v.dimension_a is not None and v.dimension_b is not None:
        length = v.dimension_a + v.dimension_b

    return {
        "mmsi": v.mmsi,
        "name": v.name or None,
        "imo": v.imo,
        "call_sign": v.call_sign or None,
        "ship_type": v.ship_type,
        "destination": v.destination or None,
        "eta": v.eta or None,
        "draught": v.draught,
        "length_m": length,
        "latitude": v.latitude,
        "longitude": v.longitude,
        "speed_over_ground": v.speed_over_ground,
        "course_over_ground": v.course_over_ground,
        "true_heading": v.true_heading,
        "navigational_status": v.navigational_status,
        "last_ais_update": v.last_ais_update.isoformat() if v.last_ais_update else None,
        "first_seen": v.first_seen.isoformat(),
        "status": "LIVE" if age < STALE_THRESHOLD_SECONDS else "STALE",
        "source": "aisstream",
    }


@router.get("/vessels/{mmsi}/track")
def get_vessel_track(
    mmsi: int,
    db: Session = Depends(get_db),
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(500, ge=1, le=5000),
) -> dict:
    """Position history for route replay."""
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)
    rows = db.scalars(
        select(AISPosition)
        .where(AISPosition.mmsi == mmsi, AISPosition.timestamp >= cutoff)
        .order_by(AISPosition.timestamp.asc())
        .limit(limit)
    ).all()

    return {
        "mmsi": mmsi,
        "hours": hours,
        "count": len(rows),
        "track": [{
            "latitude": p.latitude,
            "longitude": p.longitude,
            "speed_over_ground": p.speed_over_ground,
            "course_over_ground": p.course_over_ground,
            "timestamp": p.timestamp.isoformat(),
        } for p in rows],
        "note": ("AIS coverage can be intermittent. Gaps in the track may not "
                 "indicate the vessel was stationary."),
    }


@router.get("/stats")
def ais_stats(db: Session = Depends(get_db)) -> dict:
    """Database-level AIS statistics."""
    vessel_count = db.scalar(select(func.count(AISVessel.id))) or 0
    position_count = db.scalar(select(func.count(AISPosition.id))) or 0
    latest = db.scalar(
        select(func.max(AISPosition.timestamp))) if position_count else None

    return {
        "vessels_in_db": vessel_count,
        "positions_in_db": position_count,
        "latest_position_at": latest.isoformat() if latest else None,
        "retention_hours": int(
            __import__("os").getenv("AIS_HISTORY_RETENTION_HOURS", "24")),
    }


@router.websocket("/ws")
async def ais_websocket(ws: WebSocket):
    """
    Frontend WebSocket endpoint for live AIS updates.

    Sends JSON messages of the form:
      {"type": "ais_update", "data": {...vessel data...}}
      {"type": "snapshot", "data": [...all vessels...]}

    The client receives a snapshot on connect, then incremental updates.
    """
    mgr = AISManager.instance()
    queue = mgr.register_frontend()

    if queue is None:
        await ws.close(code=1013, reason="Too many clients")
        return

    await ws.accept()
    log.info("Frontend AIS WebSocket connected (total: %d)",
             len(mgr._frontend_clients))

    try:
        # Send initial snapshot
        vessels = mgr.get_all_vessels()
        await ws.send_json({
            "type": "snapshot",
            "data": vessels,
            "state": mgr.state.value,
            "api_key_configured": mgr._api_key_configured,
        })

        # Stream updates
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send heartbeat
                await ws.send_json({"type": "heartbeat", "state": mgr.state.value})
                continue

            if msg is None:
                break  # Shutdown sentinel

            await ws.send_text(msg)

    except WebSocketDisconnect:
        log.debug("Frontend AIS WebSocket disconnected normally")
    except Exception:
        log.debug("Frontend AIS WebSocket error", exc_info=True)
    finally:
        mgr.unregister_frontend(queue)
        log.info("Frontend AIS WebSocket closed (remaining: %d)",
                 len(mgr._frontend_clients))

"""
Port and maritime route geography.

Real-world port coordinates and great-circle waypoints for the 5 demo
shipping lanes. Waypoints follow actual maritime routing (avoiding land)
rather than straight geodesic lines.

Data drawn from publicly available port authority coordinates (Wikipedia,
Falkensteiner port databases). These are reference positions for the
demonstration platform — always verify with official charts before any
real navigation use.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

# (latitude, longitude) — WGS-84 decimal degrees
PORT_COORDS: Dict[str, Tuple[float, float]] = {
    # Australia / Pacific
    "Port Hedland":  (-20.3135,  118.5748),
    "Newcastle":     (-32.9249,  151.7693),   # Newcastle NSW, Australia
    # Asia
    "Qingdao":       (36.0671,   120.3826),
    "Singapore":     (1.2655,    103.8198),
    # South America
    "Tubarao":       (-20.2831,  -40.2414),   # Tubarão/Vitória, Brazil
    # Europe
    "Rotterdam":     (51.9244,     4.4777),
    # Africa / Indian Ocean
    "Richards Bay":  (-28.7830,   32.0681),
    "Paradip":       (20.2600,    86.6700),   # Paradip Port, Odisha, India
}


# Waypoints (lat, lon) along each route, avoiding major land masses.
# Great-circle paths are used where ocean is continuous; waypoints are
# inserted around capes and straits.
ROUTE_WAYPOINTS: Dict[str, List[Tuple[float, float]]] = {
    # ── R01: Port Hedland → Qingdao (3 600 nm) ─────────────────────────
    # Indian Ocean → Lombok/Makassar Strait → South China Sea
    "R01": [
        (-20.3135,  118.5748),   # Port Hedland
        (-15.0,     119.0),      # NW Cape area
        (-8.0,      114.5),      # Lombok Strait approach
        (-8.4,      115.6),      # Lombok Strait
        (-3.0,      116.0),      # Makassar Strait
        (4.0,       115.0),      # Brunei / South China Sea
        (10.0,      114.0),      # South China Sea
        (18.0,      117.5),      # Taiwan Strait south
        (24.5,      120.0),      # Taiwan Strait north
        (30.0,      122.5),      # East China Sea
        (36.0671,   120.3826),   # Qingdao
    ],
    # ── R02: Tubarão → Rotterdam (5 100 nm) ─────────────────────────────
    # South Atlantic → NW Africa → English Channel
    "R02": [
        (-20.2831,  -40.2414),   # Tubarão
        (-15.0,     -34.0),      # Mid S Atlantic
        (0.0,       -20.0),      # Equator crossing
        (10.0,      -17.0),      # Gulf of Guinea
        (14.0,      -17.5),      # Cape Verde latitude
        (25.0,      -18.0),      # Canary Islands latitude
        (36.0,      -10.0),      # Gibraltar approach
        (36.1,      -5.4),       # Strait of Gibraltar
        (43.0,       -9.0),      # NW Spain / Bay of Biscay
        (48.5,       -5.5),      # Finisterre rounding
        (50.0,       -2.5),      # English Channel west
        (51.3,        2.0),      # English Channel east
        (51.9244,    4.4777),    # Rotterdam
    ],
    # ── R03: Paradip → Singapore (2 100 nm) ─────────────────────────────
    # Bay of Bengal → Andaman Sea → Strait of Malacca
    "R03": [
        (20.2600,   86.6700),    # Paradip
        (14.0,      84.0),       # Bay of Bengal SE
        (10.0,      94.0),       # Andaman Sea north
        (6.0,       97.0),       # Andaman Sea → Malacca
        (4.0,       99.5),       # Northern Malacca Strait
        (2.5,      101.5),       # Central Malacca Strait
        (1.2655,   103.8198),    # Singapore
    ],
    # ── R04: Richards Bay → Paradip (4 600 nm) ──────────────────────────
    # East Africa → around Sri Lanka → Bay of Bengal
    "R04": [
        (-28.7830,   32.0681),   # Richards Bay
        (-22.0,      37.0),      # Mozambique Channel
        (-12.0,      44.0),      # Northern Mozambique / Comoros
        (-4.0,       42.0),      # Kenya coast
        (2.0,        46.0),      # Somali coast approach
        (8.0,        52.0),      # Gulf of Aden
        (12.0,       55.0),      # Guardafui rounding
        (10.0,       66.0),      # Arabian Sea
        (6.0,        76.0),      # Indian Ocean mid
        (6.0,        80.5),      # Sri Lanka south
        (9.5,        80.5),      # Palk Strait area
        (13.0,       82.0),      # NE Sri Lanka
        (17.0,       84.5),      # Andhra Pradesh coast
        (20.2600,    86.6700),   # Paradip
    ],
    # ── R05: Newcastle → Qingdao (4 300 nm) ─────────────────────────────
    # Tasman Sea → Coral Sea → Philippine Sea → East China Sea
    "R05": [
        (-32.9249,  151.7693),   # Newcastle NSW
        (-26.0,     155.0),      # Tasman Sea
        (-18.0,     157.0),      # Coral Sea
        (-10.0,     156.0),      # Solomon Sea
        (-3.0,      152.0),      # Bismarck Sea
        (5.0,       145.0),      # Philippine Sea
        (10.0,      135.0),      # Western Pacific
        (18.0,      128.0),      # Philippine Sea west
        (22.0,      124.0),      # Luzon north
        (26.0,      122.0),      # East China Sea
        (30.0,      122.5),      # East China Sea north
        (36.0671,   120.3826),   # Qingdao
    ],
}


def get_port_coords(port_name: str) -> Tuple[float, float] | None:
    """Return (lat, lon) for a port name, case-insensitive partial match."""
    name = port_name.strip()
    # Exact match first
    if name in PORT_COORDS:
        return PORT_COORDS[name]
    # Case-insensitive
    for k, v in PORT_COORDS.items():
        if k.lower() == name.lower():
            return v
    # Partial match
    for k, v in PORT_COORDS.items():
        if k.lower() in name.lower() or name.lower() in k.lower():
            return v
    return None


def get_route_waypoints(route_code: str) -> List[List[float]]:
    """Return [[lat, lon], ...] for a route code."""
    pts = ROUTE_WAYPOINTS.get(route_code, [])
    return [[lat, lon] for lat, lon in pts]

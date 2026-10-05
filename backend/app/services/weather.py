"""
Live Global Marine Weather & Oceanographic Service.

Powered by Open-Meteo Marine & Atmospheric Weather APIs:
- 100% Free, Open-Access (No API key required)
- Global coverage backed by ECMWF, NOAA GFS, and DWD models
- High-resolution wave spectra (Hs, period, swell, wind-waves, surface currents)
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

from .ports import ROUTE_WAYPOINTS

log = logging.getLogger("greenfleet.weather")

WEATHER_PROVIDER = os.getenv("WEATHER_PROVIDER", "open-meteo").lower()
CACHE_TTL_SECONDS = int(os.getenv("WEATHER_CACHE_TTL_SECONDS", os.getenv("OPEN_METEO_CACHE_SECONDS", "900")))

OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# In-memory coordinate cache: (round(lat, 1), round(lon, 1)) -> (timestamp, data)
_WEATHER_CACHE: Dict[Tuple[float, float], Tuple[float, Dict[str, Any]]] = {}


def _classify_sea_state(wave_height_m: float, wind_speed_kn: float) -> str:
    """Classify sea conditions into standard maritime simulation states."""
    if wave_height_m >= 4.0 or wind_speed_kn >= 34.0:
        return "EXTREME"
    if wave_height_m >= 2.5 or wind_speed_kn >= 22.0:
        return "ROUGH"
    if wave_height_m >= 1.25 or wind_speed_kn >= 12.0:
        return "MODERATE"
    return "CALM"


async def fetch_live_marine_weather(
    lat: float, lon: float, client: Optional[httpx.AsyncClient] = None
) -> Dict[str, Any]:
    """
    Fetch real-time wave height, period, swell, current, wind speed, and pressure
    for any global marine coordinate.
    """
    cache_key = (round(lat, 1), round(lon, 1))
    now = time.time()
    if cache_key in _WEATHER_CACHE:
        ts, cached = _WEATHER_CACHE[cache_key]
        if now - ts < CACHE_TTL_SECONDS:
            return dict(cached, cached=True)

    params_marine = {
        "latitude": lat,
        "longitude": lon,
        "current": [
            "wave_height", "wave_direction", "wave_period",
            "wind_wave_height", "wind_wave_direction", "wind_wave_period",
            "swell_wave_height", "swell_wave_direction", "swell_wave_period",
            "ocean_current_velocity", "ocean_current_direction",
        ],
    }

    params_weather = {
        "latitude": lat,
        "longitude": lon,
        "current": [
            "temperature_2m", "surface_pressure",
            "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
        ],
        "wind_speed_unit": "kn",
    }

    close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=8.0)
        close_client = True

    try:
        marine_res, weather_res = await asyncio.gather(
            client.get(OPEN_METEO_MARINE_URL, params=params_marine),
            client.get(OPEN_METEO_FORECAST_URL, params=params_weather),
            return_exceptions=True,
        )

        marine_data = (
            marine_res.json().get("current", {})
            if isinstance(marine_res, httpx.Response) and marine_res.status_code == 200
            else {}
        )
        weather_data = (
            weather_res.json().get("current", {})
            if isinstance(weather_res, httpx.Response) and weather_res.status_code == 200
            else {}
        )

        wave_height = float(marine_data.get("wave_height") or 0.8)
        wave_period = float(marine_data.get("wave_period") or 5.5)
        wind_speed_kn = float(weather_data.get("wind_speed_10m") or 12.0)
        wind_gusts_kn = float(weather_data.get("wind_gusts_10m") or (wind_speed_kn * 1.35))
        current_vel_kmh = float(marine_data.get("ocean_current_velocity") or 0.5)
        current_kn = round(current_vel_kmh * 0.539957, 2)  # km/h to knots

        sea_state = _classify_sea_state(wave_height, wind_speed_kn)

        result: Dict[str, Any] = {
            "latitude": lat,
            "longitude": lon,
            "wave_height_m": round(wave_height, 2),
            "wave_period_s": round(wave_period, 1),
            "wave_direction_deg": marine_data.get("wave_direction"),
            "wind_wave_height_m": round(float(marine_data.get("wind_wave_height") or 0.0), 2),
            "swell_wave_height_m": round(float(marine_data.get("swell_wave_height") or 0.0), 2),
            "swell_wave_period_s": round(float(marine_data.get("swell_wave_period") or 5.0), 1),
            "ocean_current_velocity_kn": current_kn,
            "ocean_current_direction_deg": marine_data.get("ocean_current_direction"),
            "wind_speed_kn": round(wind_speed_kn, 1),
            "wind_gusts_kn": round(wind_gusts_kn, 1),
            "wind_direction_deg": weather_data.get("wind_direction_10m"),
            "temperature_c": round(float(weather_data.get("temperature_2m") or 20.0), 1),
            "surface_pressure_hpa": round(float(weather_data.get("surface_pressure") or 1013.25), 1),
            "sea_state": sea_state,
            "source": "Open-Meteo Marine Real-Time API",
            "cached": False,
            "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        }

        _WEATHER_CACHE[cache_key] = (now, result)
        return result

    except Exception as e:
        log.warning("Failed to fetch live weather for (%s, %s): %s", lat, lon, e)
        # Fallback to physical maritime standard defaults
        return {
            "latitude": lat,
            "longitude": lon,
            "wave_height_m": 1.2,
            "wave_period_s": 5.5,
            "wave_direction_deg": 180,
            "wind_wave_height_m": 0.4,
            "swell_wave_height_m": 0.8,
            "swell_wave_period_s": 6.0,
            "ocean_current_velocity_kn": 0.2,
            "ocean_current_direction_deg": 90,
            "wind_speed_kn": 14.0,
            "wind_gusts_kn": 18.0,
            "wind_direction_deg": 180,
            "temperature_c": 22.0,
            "surface_pressure_hpa": 1013.25,
            "sea_state": "MODERATE",
            "source": "Fallback Defaults",
            "cached": False,
            "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        }
    finally:
        if close_client:
            await client.aclose()


async def fetch_route_weather_profile(route_code: str) -> Dict[str, Any]:
    """
    Sample live oceanographic weather at waypoints along a designated route
    and return aggregate route-wide environmental statistics.
    """
    waypoints = ROUTE_WAYPOINTS.get(route_code.upper(), [])
    if not waypoints:
        return {"error": f"Unknown route code '{route_code}'"}

    # Sample up to 5 evenly spaced waypoints along the route
    n_pts = len(waypoints)
    if n_pts <= 5:
        sample_indices = list(range(n_pts))
    else:
        sample_indices = [
            0,
            n_pts // 4,
            n_pts // 2,
            (3 * n_pts) // 4,
            n_pts - 1,
        ]

    sampled_coords = [waypoints[i] for i in sample_indices]

    async with httpx.AsyncClient(timeout=10.0) as client:
        tasks = [
            fetch_live_marine_weather(lat, lon, client=client)
            for lat, lon in sampled_coords
        ]
        results = await asyncio.gather(*tasks)

    # Compute aggregate route statistics
    wave_heights = [r["wave_height_m"] for r in results]
    wind_speeds = [r["wind_speed_kn"] for r in results]
    currents = [r["ocean_current_velocity_kn"] for r in results]

    avg_wave = round(sum(wave_heights) / len(wave_heights), 2)
    max_wave = max(wave_heights)
    avg_wind = round(sum(wind_speeds) / len(wind_speeds), 1)
    max_wind = max(wind_speeds)
    avg_current = round(sum(currents) / len(currents), 2)

    return {
        "route_code": route_code.upper(),
        "sampled_waypoints_count": len(results),
        "summary": {
            "avg_wave_height_m": avg_wave,
            "max_wave_height_m": max_wave,
            "avg_wind_speed_kn": avg_wind,
            "max_wind_speed_kn": max_wind,
            "avg_current_kn": avg_current,
            "dominant_sea_state": _classify_sea_state(avg_wave, avg_wind),
        },
        "waypoint_observations": results,
    }

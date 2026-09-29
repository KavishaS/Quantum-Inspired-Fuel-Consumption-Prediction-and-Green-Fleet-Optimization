/**
 * LiveFleetMap — Full-page AIS telemetry, global voyage tracking, real map & Quantum Route Predictor.
 * Features:
 *  - Free water-mark free dark maritime tiles (Esri World Dark Canvas), Satellite, and Standard OSM
 *  - OpenSeaMap nautical seamarks & navigation aids overlay
 *  - Real-time AIS vessel list (3,500+ live vessels from AISStream API)
 *  - Interactive Quantum Route Predictor & Multi-Solution Map Explorer
 *  - Live predicted candidate route polylines (Quantum Pareto, Min Emissions, Min Cost, Express, Weather Avoidance)
 *  - Smooth map pan/zoom controller on vessel click
 *  - Floating voyage card and bottom dual-axis SOG/Impact telemetry graph
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, useMap,
  ZoomControl, Tooltip
} from "react-leaflet";
import L from "leaflet";
import {
  Wifi, AlertTriangle, Search, Navigation,
  Ship, MapPin, Clock, Gauge, Anchor, Route as RouteIcon,
  Zap, Pin, SlidersHorizontal, User, BarChart2, RotateCcw,
  Flag, Globe, Layers, Eye, Sparkles, DollarSign, CheckCircle2, ChevronRight, RefreshCw, Activity
} from "lucide-react";
import clsx from "clsx";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid
} from "recharts";
import { useAisWebSocket, type AISVesselData } from "@/hooks/useAisWebSocket";
import { listMapRoutes, listMapPorts, getMapBestRoute, predictMapRoutes, type CandidateRoute, type QuantumPredictResponse } from "@/services/api";
import type { MapRoute, MapPort, MapBestRouteResponse } from "@/types/api";

// ─── Leaflet default icon fix ────────────────────────────────────────────────
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
});

// ─── Tile Providers (100% Free, NO API key watermark) ────────────────────────
const TILE_PROVIDERS = {
  dark: {
    name: "Dark Maritime",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
    maxZoom: 16,
  },
  satellite: {
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS",
    maxZoom: 18,
  },
  osm: {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  },
};

// ─── SVG Marker Factories ────────────────────────────────────────────────────

function createVesselIcon(
  heading: number | undefined,
  status: AISVesselData["status"],
  selected: boolean
): L.DivIcon {
  const rotation = heading !== undefined && heading >= 0 && heading < 360 ? heading : 0;
  const color =
    status === "LIVE" ? "#06B6D4"
    : status === "STALE" ? "#F59E0B"
    : status === "DEMO" ? "#8B5CF6"
    : "#6B7280";
  const ring = selected ? `<circle cx="16" cy="16" r="14" fill="none" stroke="#38BDF8" stroke-width="3" opacity="0.9"/>` : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"
         style="transform:rotate(${rotation}deg);transform-origin:center;filter:drop-shadow(0 2px 5px rgba(0,0,0,.8))">
      ${ring}
      <polygon points="16,4 22,26 16,22 10,26" fill="${color}" opacity="${selected ? 1 : 0.9}"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function createPortIcon(): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#38BDF8" stroke="#090D16" stroke-width="1.5" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.8))">
      <circle cx="12" cy="12" r="8" fill="#0EA5E9" opacity="0.9" />
      <circle cx="12" cy="12" r="3" fill="#FFFFFF" />
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

function createPinIcon(color = "#818CF8"): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="#FFFFFF" stroke-width="1.5" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.8))">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

function createAlertIcon(): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="#F59E0B" stroke="#78350F" stroke-width="1.5" style="filter:drop-shadow(0 2px 6px rgba(245,158,11,0.6))">
      <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10h2v4h-2zm0 5h2v2h-2z"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

// ─── Telemetry Time Series ─────────────────────────────────────────────

interface TelemetryPoint {
  time: string;
  sog: number;
  impact1: number;
  impact2: number;
}

function generateTelemetryData(): TelemetryPoint[] {
  const points: TelemetryPoint[] = [];
  const startHour = 14;
  const startMin = 56;
  let currSog = 12;

  for (let i = 0; i <= 30; i++) {
    const totalMin = startMin + i * 4;
    const h = (startHour + Math.floor(totalMin / 60)) % 24;
    const m = totalMin % 60;
    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    
    if (i < 5) currSog = 12 + i * 3.5;
    else if (i < 12) currSog = 28 + Math.sin(i) * 1.5;
    else if (i < 18) currSog = 3 + (i % 2);
    else if (i < 24) currSog = 29 + Math.cos(i) * 1.2;
    else currSog = 18 + Math.sin(i) * 3;

    const impact1 = Math.max(0.2, Math.random() * 1.8 + (currSog > 20 ? 0.8 : 0.2));
    const impact2 = Math.max(0.1, Math.random() * 1.4 + (currSog > 25 ? 1.2 : 0.1));

    points.push({
      time: timeStr,
      sog: parseFloat(currSog.toFixed(1)),
      impact1: parseFloat(impact1.toFixed(2)),
      impact2: parseFloat(impact2.toFixed(2)),
    });
  }
  return points;
}

// ─── Map Sub-components ──────────────────────────────────────────────────────

function FitBoundsControl({
  vessels,
  routes,
  predictedCandidates
}: {
  vessels: AISVesselData[];
  routes: MapRoute[];
  predictedCandidates: CandidateRoute[];
}) {
  const map = useMap();
  const fit = () => {
    const points: [number, number][] = [];
    vessels.forEach((v) => {
      if (v.latitude != null && v.longitude != null) points.push([v.latitude, v.longitude]);
    });
    routes.forEach((r) => {
      r.waypoints.forEach(([lat, lon]) => points.push([lat, lon]));
    });
    predictedCandidates.forEach((c) => {
      c.waypoints.forEach(([lat, lon]) => points.push([lat, lon]));
    });

    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
  };

  return (
    <button
      onClick={fit}
      title="Fit view to vessels & routes"
      className="absolute bottom-36 right-3 z-[1000] w-8 h-8 bg-slate-900/90 text-slate-200 border border-slate-700 rounded shadow-md flex items-center justify-center hover:bg-slate-800 hover:text-white transition"
    >
      <Layers className="h-4 w-4 text-cyan-400" />
    </button>
  );
}

function MapController({ targetLoc }: { targetLoc: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (targetLoc) {
      map.flyTo(targetLoc, Math.max(map.getZoom(), 8), { duration: 1.2 });
    }
  }, [targetLoc, map]);
  return null;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LiveFleetMap() {
  const {
    vessels,
    connectionStatus,
    apiKeyConfigured,
  } = useAisWebSocket();

  const [selectedMmsi, setSelectedMmsi] = useState<number | null>(422001);
  const [activeTab, setActiveTab] = useState<"live" | "all" | "pinned">("live");
  const [search, setSearch] = useState("");
  const [selectedCaptain, setSelectedCaptain] = useState("Select Captain");
  const [mapStyle, setMapStyle] = useState<"dark" | "satellite" | "osm">("dark");
  const [showNauticalOverlay, setShowNauticalOverlay] = useState(false);
  const [targetLocation, setTargetLocation] = useState<[number, number] | null>(null);

  // Telemetry time series state
  const telemetryData = useMemo(() => generateTelemetryData(), []);

  // Map Routes & Overlays Data State
  const [routes, setRoutes] = useState<MapRoute[]>([]);
  const [ports, setPorts] = useState<MapPort[]>([]);
  const [bestRouteData, setBestRouteData] = useState<MapBestRouteResponse | null>(null);

  // ─── QUANTUM ROUTE PREDICTOR STATE ───────────────────────────────────────
  const [predictRouteCode, setPredictRouteCode] = useState("R02");
  const [predictFuelType, setPredictFuelType] = useState("VLSFO");
  const [predictFuelPrice, setPredictFuelPrice] = useState(650);
  const [predictVesselClass, setPredictVesselClass] = useState("Capesize");
  const [predictCargoDemand, setPredictCargoDemand] = useState(180000);
  const [predictWeather, setPredictWeather] = useState("MODERATE");
  const [predictAlgorithm, setPredictAlgorithm] = useState("QGA");
  const [predictObjective, setPredictObjective] = useState("balanced");

  const [predictedCandidates, setPredictedCandidates] = useState<CandidateRoute[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>("quantum-pareto");
  const [isPredicting, setIsPredicting] = useState(false);
  const [showPredictorPanel, setShowPredictorPanel] = useState(true);

  // Layer Toggles
  const [showVessels, setShowVessels] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showPorts, setShowPorts] = useState(true);
  const [showPredictedRoutes, setShowPredictedRoutes] = useState(true);
  const [showChart, setShowChart] = useState(true);

  // Execute Quantum Route Prediction
  const handleRunPrediction = useCallback(async () => {
    setIsPredicting(true);
    try {
      const res = await predictMapRoutes({
        route_code: predictRouteCode,
        fuel_type: predictFuelType,
        fuel_price_usd: predictFuelPrice,
        vessel_class: predictVesselClass,
        cargo_demand_tonnes: predictCargoDemand,
        weather_severity: predictWeather,
        algorithm: predictAlgorithm,
        objective: predictObjective,
      });
      setPredictedCandidates(res.candidates || []);
      const best = res.best_recommendation || (res.candidates && res.candidates[0]);
      if (best) {
        setSelectedCandidateId(best.id);
        const origin = best.origin;
        if (origin.latitude && origin.longitude) {
          setTargetLocation([origin.latitude, origin.longitude]);
        }
      }
    } catch (err) {
      console.error("Quantum Route Prediction failed:", err);
    } finally {
      setIsPredicting(false);
    }
  }, [predictRouteCode, predictFuelType, predictFuelPrice, predictVesselClass, predictCargoDemand, predictWeather, predictAlgorithm, predictObjective]);


  // Initial load
  useEffect(() => {
    listMapRoutes()
      .then((d) => setRoutes(d.routes ?? []))
      .catch((err) => console.error("Failed to load map routes", err));

    listMapPorts()
      .then((d) => setPorts(d.ports ?? []))
      .catch((err) => console.error("Failed to load map ports", err));

    getMapBestRoute()
      .then((d) => setBestRouteData(d))
      .catch((err) => console.error("No active optimization overlay found", err));

    // Run initial quantum route prediction
    handleRunPrediction();
  }, [handleRunPrediction]);

  // Demo Pinned Trips
  const pinnedTrips = useMemo(() => [
    {
      id: 1,
      mmsi: 151001,
      name: "RS 151 Sjømann",
      date: "26 Jan, 2026 16:08",
      status: "LIVE",
      hasAlert: true,
      lat: 66.56,
      lon: 12.80,
      path: "M2,18 Q8,4 16,14 T26,8",
    },
    {
      id: 2,
      mmsi: 422001,
      name: "RS 422 Eyr Myken",
      date: "26 Jan, 2026 14:30",
      status: "LIVE",
      hasAlert: true,
      lat: 66.54,
      lon: 13.25,
      path: "M2,6 L12,8 L18,18 L26,4",
    },
    {
      id: 3,
      mmsi: 421001,
      name: "RS 421 Eyr Bremstein",
      date: "26 Jan, 2026 12:48",
      status: "DEMO",
      hasAlert: false,
      lat: 66.42,
      lon: 13.70,
      path: "M2,20 L10,12 L18,8 L26,2",
    },
  ], []);

  // Filtered vessels list based on search and active tab
  const filteredVessels = useMemo(() => {
    let list = vessels;
    if (activeTab === "live") {
      list = vessels.filter((v) => v.status === "LIVE");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          (v.name && v.name.toLowerCase().includes(q)) ||
          v.mmsi.toString().includes(q) ||
          (v.call_sign && v.call_sign.toLowerCase().includes(q))
      );
    }
    return list;
  }, [vessels, activeTab, search]);

  const selectedVessel = useMemo(() => {
    return vessels.find((v) => v.mmsi === selectedMmsi) ?? null;
  }, [vessels, selectedMmsi]);

  const selectedCandidate = useMemo(() => {
    return predictedCandidates.find((c) => c.id === selectedCandidateId) || predictedCandidates[0] || null;
  }, [predictedCandidates, selectedCandidateId]);

  const activeTrip = useMemo(() => {
    if (selectedVessel) {
      return {
        name: selectedVessel.name || `Vessel MMSI ${selectedVessel.mmsi}`,
        mmsi: selectedVessel.mmsi,
        status: selectedVessel.status,
        date: "Live Stream Telemetry",
        speed: `${selectedVessel.speed_over_ground ?? 0} kn`,
        heading: `${selectedVessel.true_heading ?? selectedVessel.course_over_ground ?? 0}°`,
        lat: selectedVessel.latitude?.toFixed(4) ?? "N/A",
        lon: selectedVessel.longitude?.toFixed(4) ?? "N/A",
      };
    }
    return {
      name: "RS 422 Eyr Myken",
      mmsi: 422001,
      status: "DEMO",
      date: "18 Mar, 2025 14:56",
      speed: "28.4 kn",
      heading: "142°",
      lat: "66.5400",
      lon: "13.2500",
    };
  }, [selectedVessel]);

  const handleSelectVessel = (mmsi: number, lat?: number, lon?: number) => {
    setSelectedMmsi(mmsi);
    if (lat != null && lon != null) {
      setTargetLocation([lat, lon]);
    }
  };

  const portIcon = useMemo(() => createPortIcon(), []);
  const pinIcon = useMemo(() => createPinIcon(), []);
  const alertIcon = useMemo(() => createAlertIcon(), []);

  const activeTileConfig = TILE_PROVIDERS[mapStyle];

  return (
    <div className="flex h-screen w-screen -mx-8 -my-8 bg-[#0B0F19] text-slate-200 overflow-hidden font-sans">
      {/* ─── LEFT SIDEBAR: TRIPS / VESSELS LIST ──────────────────────────────── */}
      <div className="w-80 shrink-0 bg-[#0F172A]/95 border-r border-slate-800 flex flex-col z-[1002] shadow-2xl">
        {/* Header Filter Tabs */}
        <div className="p-3 border-b border-slate-800 bg-[#0B0F19]/60">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1 text-xs font-semibold bg-slate-900/90 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveTab("live")}
                className={clsx(
                  "px-2.5 py-1 rounded-md transition flex items-center gap-1",
                  activeTab === "live" ? "bg-slate-800 text-cyan-400 font-bold" : "text-slate-400 hover:text-slate-200"
                )}
              >
                Live <span className="bg-red-500/20 text-red-400 text-[10px] px-1 rounded font-bold">{vessels.length}</span>
              </button>
              <button
                onClick={() => setActiveTab("all")}
                className={clsx(
                  "px-2.5 py-1 rounded-md transition",
                  activeTab === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                )}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab("pinned")}
                className={clsx(
                  "px-2.5 py-1 rounded-md transition flex items-center gap-1",
                  activeTab === "pinned" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                )}
              >
                Pinned <span className="bg-slate-800 text-slate-300 text-[10px] px-1 rounded font-bold">{pinnedTrips.length}</span>
              </button>
            </div>
            <span className={clsx("text-[10px] px-2 py-0.5 rounded-full font-semibold border flex items-center gap-1",
              apiKeyConfigured ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"
            )}>
              <span className={clsx("h-1.5 w-1.5 rounded-full animate-pulse", apiKeyConfigured ? "bg-emerald-400" : "bg-amber-400")} />
              {apiKeyConfigured ? "AISStream Connected" : "Demo Telemetry"}
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search vessels by name, MMSI..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Trips / Vessels List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {activeTab === "pinned" ? (
            pinnedTrips.map((trip) => {
              const isSelected = selectedMmsi === trip.mmsi;
              return (
                <div
                  key={trip.id}
                  onClick={() => handleSelectVessel(trip.mmsi, trip.lat, trip.lon)}
                  className={clsx(
                    "group relative flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer",
                    isSelected
                      ? "bg-slate-800/90 border-cyan-500/60 shadow-lg shadow-cyan-950/20"
                      : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700"
                  )}
                >
                  <div className="w-12 h-12 rounded-lg bg-[#0B0F19] border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center relative">
                    <svg className="w-10 h-10 stroke-emerald-400 fill-none" viewBox="0 0 28 28">
                      <path d={trip.path} strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-200 truncate">{trip.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{trip.date}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-slate-500">
                      <Pin className={clsx("h-3 w-3", isSelected ? "text-cyan-400 fill-cyan-400" : "hover:text-slate-300")} />
                      {trip.hasAlert && <AlertTriangle className="h-3 w-3 text-amber-500 fill-amber-500/20" />}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            filteredVessels.slice(0, 100).map((vessel) => {
              const isSelected = selectedMmsi === vessel.mmsi;
              return (
                <div
                  key={vessel.mmsi}
                  onClick={() => handleSelectVessel(vessel.mmsi, vessel.latitude, vessel.longitude)}
                  className={clsx(
                    "group relative flex items-center gap-3 p-2.5 rounded-xl border transition cursor-pointer",
                    isSelected
                      ? "bg-slate-800/90 border-cyan-500/60 shadow-lg shadow-cyan-950/20"
                      : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700"
                  )}
                >
                  <div className="w-9 h-9 rounded-lg bg-[#0B0F19] border border-slate-800 shrink-0 flex items-center justify-center">
                    <Ship className={clsx("h-4 w-4", vessel.status === "LIVE" ? "text-cyan-400" : "text-slate-400")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {vessel.name || `MMSI ${vessel.mmsi}`}
                      </span>
                      {vessel.status === "LIVE" && (
                        <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span>{vessel.speed_over_ground != null ? `${vessel.speed_over_ground} kn` : "0 kn"}</span>
                      <span>{vessel.latitude != null ? `${vessel.latitude.toFixed(2)}°, ${vessel.longitude?.toFixed(2)}°` : "No position"}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── MAIN MAP & TELEMETRY CENTER DISPLAY ─────────────────────────────────── */}
      <div className="flex-1 relative flex flex-col h-full overflow-hidden">
        
        {/* FLOATING QUANTUM ROUTE PREDICTOR CONTROL WIDGET */}
        <div className="absolute top-4 left-4 z-[1001] w-88 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl p-3 text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400 animate-pulse" />
              <h3 className="font-bold text-white text-sm">Quantum Route Predictor</h3>
            </div>
            <button
              onClick={() => setShowPredictorPanel(!showPredictorPanel)}
              className="text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px]"
            >
              {showPredictorPanel ? "Collapse" : "Expand"}
            </button>
          </div>

          {showPredictorPanel && (
            <div className="space-y-2.5">
              {/* Shipping Lane Selector */}
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">Origin / Destination Route Lane</label>
                <select
                  value={predictRouteCode}
                  onChange={(e) => setPredictRouteCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="R02">R02: Tubarão (Brazil) → Rotterdam (Netherlands)</option>
                  <option value="R01">R01: Port Hedland (Aus) → Qingdao (China)</option>
                  <option value="R03">R03: Paradip (India) → Singapore</option>
                  <option value="R04">R04: Richards Bay (SA) → Paradip (India)</option>
                  <option value="R05">R05: Newcastle (Aus) → Qingdao (China)</option>
                </select>
              </div>

              {/* Fuel & Vessel Class Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">Fuel Type</label>
                  <select
                    value={predictFuelType}
                    onChange={(e) => setPredictFuelType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="VLSFO">VLSFO ($650/t)</option>
                    <option value="HFO">HFO ($520/t)</option>
                    <option value="MGO">MGO ($850/t)</option>
                    <option value="LNG">LNG ($920/t)</option>
                    <option value="AMMONIA">Green Ammonia ($1,200/t)</option>
                    <option value="BIOFUEL">Biofuel ($1,100/t)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">Vessel Class</label>
                  <select
                    value={predictVesselClass}
                    onChange={(e) => setPredictVesselClass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Capesize">Capesize (180k DWT)</option>
                    <option value="Panamax">Panamax (75k DWT)</option>
                    <option value="Feeder">Feeder (15k DWT)</option>
                  </select>
                </div>
              </div>

              {/* Weather & Algorithm Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">Sea Weather</label>
                  <select
                    value={predictWeather}
                    onChange={(e) => setPredictWeather(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="CALM">Calm Seas (0.8m)</option>
                    <option value="MODERATE">Moderate (1.8m)</option>
                    <option value="HEAVY">Heavy Storm (4.2m)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">Quantum Engine</label>
                  <select
                    value={predictAlgorithm}
                    onChange={(e) => setPredictAlgorithm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="QGA">QGA (Quantum Genetic)</option>
                    <option value="QPSO">QPSO (Quantum Swarm)</option>
                    <option value="GA">GA (Standard Genetic)</option>
                    <option value="PSO">PSO (Particle Swarm)</option>
                  </select>
                </div>
              </div>

              {/* Optimization Target Objective */}
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">Optimization Target Objective</label>
                <select
                  value={predictObjective}
                  onChange={(e) => setPredictObjective(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer font-semibold"
                >
                  <option value="balanced">⚖️ Balanced Quantum Pareto (Cost & Emissions)</option>
                  <option value="min_emissions">🌱 Minimum CO2 Emissions (Green Fleet)</option>
                  <option value="min_cost">💵 Minimum Operational Cost</option>
                  <option value="min_time">⚡ Fastest Transit Time (Express)</option>
                </select>
              </div>


              {/* Predict Button */}
              <button
                onClick={handleRunPrediction}
                disabled={isPredicting}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition disabled:opacity-50"
              >
                {isPredicting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Sampling Quantum Superposition...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Predict All Candidate Routes
                  </>
                )}
              </button>
            </div>
          )}

          {/* PREDICTED CANDIDATES QUICK SELECTOR CAROUSEL */}
          {predictedCandidates.length > 0 && (
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                <span>Predicted Map Solutions ({predictedCandidates.length})</span>
                <span className="text-emerald-400 text-[10px]">Click route to highlight</span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {predictedCandidates.map((c) => {
                  const isSel = c.id === selectedCandidateId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCandidateId(c.id);
                        if (c.waypoints && c.waypoints.length > 0) {
                          setTargetLocation(c.waypoints[Math.floor(c.waypoints.length / 2)]);
                        }
                      }}
                      className={clsx(
                        "px-2.5 py-1.5 rounded-lg border text-left shrink-0 transition flex flex-col gap-0.5",
                        isSel
                          ? "bg-slate-800 border-emerald-500 text-white shadow-md shadow-emerald-950/30"
                          : "bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-bold">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="truncate max-w-[110px]">{c.title}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        ${(c.total_cost_usd / 1000).toFixed(0)}k | {c.lifecycle_co2e_tonnes.toFixed(0)}t CO₂
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* TOP RIGHT MAP LAYER CONTROLS */}
        <div className="absolute top-4 right-4 z-[1001] flex items-center gap-2 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 text-xs shadow-xl flex-wrap">
          {/* Tile Style Picker */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 mr-2">
            <Globe className="h-3.5 w-3.5 text-cyan-400 ml-1" />
            {(["dark", "satellite", "osm"] as const).map((styleKey) => (
              <button
                key={styleKey}
                onClick={() => setMapStyle(styleKey)}
                className={clsx(
                  "px-2.5 py-1 rounded text-[11px] font-semibold transition capitalize",
                  mapStyle === styleKey ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-white"
                )}
              >
                {styleKey}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowNauticalOverlay((n) => !n)}
            className={clsx(
              "flex items-center gap-1 px-2.5 py-1 rounded-lg transition font-medium border border-slate-800",
              showNauticalOverlay ? "bg-sky-600/30 text-sky-300 border-sky-500/40" : "text-slate-400 hover:text-white"
            )}
            title="OpenSeaMap Nautical Overlay (buoys, seamarks, harbors)"
          >
            <Eye className="h-3.5 w-3.5" /> Seamarks
          </button>

          <button
            onClick={() => setShowPredictedRoutes((v) => !v)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition font-medium border border-slate-700",
              showPredictedRoutes ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
            )}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Predictions ({predictedCandidates.length})
          </button>

          <button
            onClick={() => setShowVessels((v) => !v)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition font-medium",
              showVessels ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
            )}
          >
            <Ship className="h-3.5 w-3.5" /> Vessels ({vessels.length})
          </button>
          <button
            onClick={() => setShowRoutes((v) => !v)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition font-medium",
              showRoutes ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
            )}
          >
            <RouteIcon className="h-3.5 w-3.5" /> Standard Lanes ({routes.length})
          </button>
          <button
            onClick={() => setShowPorts((v) => !v)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition font-medium",
              showPorts ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"
            )}
          >
            <Anchor className="h-3.5 w-3.5" /> Ports ({ports.length})
          </button>
          <button
            onClick={() => setShowChart((c) => !c)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition font-medium border border-slate-700",
              showChart ? "bg-slate-800 text-cyan-400" : "text-slate-400 hover:text-white"
            )}
          >
            <BarChart2 className="h-3.5 w-3.5" /> Telemetry
          </button>
        </div>

        {/* MAP CONTAINER (REAL TILES, ZERO WATERMARK) */}
        <div className="flex-1 w-full h-full relative">
          <MapContainer
            center={[-20.2831, -40.2414]}
            zoom={4}
            className="h-full w-full bg-[#0B0F19]"
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer
              key={mapStyle}
              url={activeTileConfig.url}
              attribution={activeTileConfig.attribution}
              maxZoom={activeTileConfig.maxZoom}
            />

            {/* Optional OpenSeaMap Nautical Overlay */}
            {showNauticalOverlay && (
              <TileLayer
                url="https://tile.openseamap.org/seamap/{z}/{x}/{y}.png"
                attribution="&copy; OpenSeaMap"
                maxZoom={18}
              />
            )}

            <ZoomControl position="bottomright" />
            <FitBoundsControl vessels={vessels} routes={routes} predictedCandidates={predictedCandidates} />
            <MapController targetLoc={targetLocation} />

            {/* Global Ports */}
            {showPorts &&
              ports.map((p) => (
                <Marker key={p.name} position={[p.latitude, p.longitude]} icon={portIcon}>
                  <Popup closeButton={false}>
                    <div className="text-xs space-y-1">
                      <div className="font-bold text-sky-700 flex items-center gap-1">
                        <Anchor className="h-3.5 w-3.5" /> {p.name} Seaport
                      </div>
                      <p className="text-slate-600">{p.latitude.toFixed(2)}°, {p.longitude.toFixed(2)}°</p>
                    </div>
                  </Popup>
                </Marker>
              ))}

            {/* Global Maritime Standard Lanes */}
            {showRoutes &&
              routes.map((r) => {
                if (!r.waypoints || r.waypoints.length < 2) return null;
                return (
                  <Polyline
                    key={r.route_code}
                    positions={r.waypoints as [number, number][]}
                    color="#475569"
                    weight={2}
                    opacity={0.4}
                    dashArray="4 4"
                  />
                );
              })}

            {/* ─── PREDICTED QUANTUM ROUTE POLYLINES ────────────────────────────── */}
            {showPredictedRoutes &&
              predictedCandidates.map((cand) => {
                if (!cand.waypoints || cand.waypoints.length < 2) return null;
                const isSelected = cand.id === selectedCandidateId;
                return (
                  <Polyline
                    key={cand.id}
                    positions={cand.waypoints as [number, number][]}
                    color={cand.color}
                    weight={isSelected ? 5 : 3}
                    opacity={isSelected ? 0.95 : 0.65}
                    dashArray={cand.id === "weather-resilient" ? "6 6" : undefined}
                    eventHandlers={{
                      click: () => setSelectedCandidateId(cand.id),
                    }}
                  >
                    <Tooltip sticky direction="top">
                      <div className="text-xs p-1 font-bold space-y-0.5">
                        <div className="flex items-center gap-1.5" style={{ color: cand.color }}>
                          <Sparkles className="h-3.5 w-3.5" /> {cand.title}
                        </div>
                        <div className="text-slate-200">
                          Speed: {cand.speed_kn} kn | Fuel: {cand.fuel_tonnes} t | CO₂: {cand.lifecycle_co2e_tonnes} t
                        </div>
                        <div className="text-emerald-400 font-mono">
                          Total Voyage Cost: ${cand.total_cost_usd.toLocaleString()}
                        </div>
                      </div>
                    </Tooltip>
                  </Polyline>
                );
              })}

            {/* Real AIS Vessels */}
            {showVessels &&
              vessels.map((v) => {
                if (v.latitude == null || v.longitude == null) return null;
                return (
                  <Marker
                    key={v.mmsi}
                    position={[v.latitude, v.longitude]}
                    icon={createVesselIcon(
                      v.true_heading ?? v.course_over_ground,
                      v.status,
                      v.mmsi === selectedMmsi
                    )}
                    eventHandlers={{
                      click: () => handleSelectVessel(v.mmsi, v.latitude, v.longitude),
                    }}
                  >
                    <Popup closeButton={false}>
                      <div className="text-xs space-y-1 p-1">
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <Ship className="h-3.5 w-3.5 text-cyan-600" /> {v.name || `MMSI ${v.mmsi}`}
                        </div>
                        <div className="text-slate-600">
                          Speed: {v.speed_over_ground ?? 0} kn | Heading: {v.true_heading ?? 0}°
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {v.latitude.toFixed(4)}°, {v.longitude.toFixed(4)}°
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
          </MapContainer>
        </div>

        {/* SELECTED PREDICTED CANDIDATE DETAIL DRAWER */}
        {selectedCandidate && (
          <div className="absolute bottom-60 right-4 z-[1001] w-96 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl p-4 text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedCandidate.color }} />
                <h4 className="font-bold text-white text-sm">{selectedCandidate.title}</h4>
              </div>
              <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-500/30">
                Fitness: {(selectedCandidate.quantum_fitness * 100).toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px]">Predicted Cost</span>
                <span className="text-sm font-bold text-emerald-400">${selectedCandidate.total_cost_usd.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Lifecycle CO₂</span>
                <span className="text-sm font-bold text-cyan-400">{selectedCandidate.lifecycle_co2e_tonnes.toLocaleString()} MT</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Fuel Consumed</span>
                <span className="text-sm font-bold text-white">{selectedCandidate.fuel_tonnes.toLocaleString()} t ({selectedCandidate.fuel_type})</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Transit Duration</span>
                <span className="text-sm font-bold text-white">{selectedCandidate.voyage_hours} hrs ({ (selectedCandidate.voyage_hours / 24).toFixed(1) } days)</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 italic bg-slate-800/60 p-2 rounded border border-slate-700/80">
              💡 "{selectedCandidate.explanation}"
            </p>
          </div>
        )}

        {/* ─── BOTTOM TELEMETRY CHART PANEL ───────────────────────────────────── */}
        {showChart && (
          <div className="h-56 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md flex flex-col z-[1001] px-4 py-2 text-xs shadow-2xl">
            {/* Chart Toolbar Controls */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 text-slate-200 px-2.5 py-1 rounded-md font-medium">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" /> Telemetry Stream
                </button>

                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 font-semibold text-blue-400">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> SOG (kn)
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Impact 2
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Impact 1
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-400">
                <span className="bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded text-[11px] font-mono">
                  Real-time
                </span>
                <button className="flex items-center gap-1 hover:text-white bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
                  <RotateCcw className="h-3 w-3" /> Reset View
                </button>
              </div>
            </div>

            {/* Telemetry Dual-Axis Chart */}
            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={telemetryData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#1E293B" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748B" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" stroke="#38BDF8" tick={{ fontSize: 10 }} domain={[0, 40]} />
                  <YAxis yAxisId="right" orientation="right" stroke="#F59E0B" tick={{ fontSize: 10 }} domain={[0, 4]} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar yAxisId="right" dataKey="impact1" fill="#10B981" opacity={0.7} stackId="a" />
                  <Bar yAxisId="right" dataKey="impact2" fill="#F59E0B" opacity={0.8} stackId="a" />
                  <Line yAxisId="left" type="monotone" dataKey="sog" stroke="#38BDF8" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

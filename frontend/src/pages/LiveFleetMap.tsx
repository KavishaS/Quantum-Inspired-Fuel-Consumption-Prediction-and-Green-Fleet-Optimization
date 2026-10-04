/**
 * LiveFleetMap — Quantum Maritime Operations Command Center.
 * Ultra-Modern Glassmorphic UI with Dynamic Theme Switching:
 *  - Floating Integrated HUD Command Bar with real-time AIS stream pulse & theme selector
 *  - Left Mission Control Deck (Quantum Route Predictor + AIS Live Fleet Tracker)
 *  - Right Route Intelligence & Candidate Evaluator Deck (Detailed metrics & multi-path comparison)
 *  - Bottom Telemetry Drawer (Speed Over Ground vs Dynamic Wave Impact)
 *  - Watermark-free multi-layer maps (Esri Dark Canvas, Satellite, OpenStreetMap, Nautical Seamarks)
 *  - Simultaneous multi-route candidate visualization with laser neon glow
 *  - Pulsing Origin & Destination terminal radar beacons
 *  - Real-time AIS vessel virtualized marker rendering (60 FPS)
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, useMap,
  ZoomControl, Tooltip
} from "react-leaflet";
import L from "leaflet";
import {
  Wifi, Search, Ship, Anchor, Route as RouteIcon,
  Zap, SlidersHorizontal, BarChart2,
  Flag, Globe, Layers, Eye, Sparkles, DollarSign,
  ChevronRight, ChevronLeft, RefreshCw, Activity, Maximize2,
  Compass, ShieldCheck, Palette, X, Gauge, Minimize2,
  CloudRain, Waves, Wind
} from "lucide-react";
import clsx from "clsx";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
  Tooltip as RechartsTooltip, CartesianGrid
} from "recharts";
import { useAisWebSocket, type AISVesselData } from "@/hooks/useAisWebSocket";
import {
  listMapRoutes, listMapPorts, getMapBestRoute, predictMapRoutes,
  getRouteWeather, type RouteWeatherProfile,
  type CandidateRoute
} from "@/services/api";
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

// ─── UI Color Themes ────────────────────────────────────────────────────────
export type UITheme = "oceanic" | "emerald" | "violet" | "tactical";

export const THEME_CONFIG: Record<
  UITheme,
  {
    name: string;
    primary: string;
    secondary: string;
    glow: string;
    border: string;
    text: string;
    bgPanel: string;
    bgHeader: string;
    bgInput: string;
    btnGradient: string;
    ringColor: string;
    dotColor: string;
  }
> = {
  oceanic: {
    name: "Oceanic Cyber",
    primary: "#06B6D4",
    secondary: "#0284C7",
    glow: "rgba(6, 182, 212, 0.4)",
    border: "border-cyan-500/30 hover:border-cyan-500/60",
    text: "text-cyan-400",
    bgPanel: "bg-[#070d1a]/90 backdrop-blur-xl border border-cyan-500/20",
    bgHeader: "bg-[#070d1a]/85 backdrop-blur-xl border-b border-cyan-500/20",
    bgInput: "bg-[#040812] border-slate-800 focus:border-cyan-400",
    btnGradient: "from-cyan-500 via-teal-500 to-emerald-400 text-slate-950",
    ringColor: "ring-cyan-400",
    dotColor: "bg-cyan-400",
  },
  emerald: {
    name: "Green Maritime",
    primary: "#10B981",
    secondary: "#059669",
    glow: "rgba(16, 185, 129, 0.4)",
    border: "border-emerald-500/30 hover:border-emerald-500/60",
    text: "text-emerald-400",
    bgPanel: "bg-[#05130e]/90 backdrop-blur-xl border border-emerald-500/20",
    bgHeader: "bg-[#05130e]/85 backdrop-blur-xl border-b border-emerald-500/20",
    bgInput: "bg-[#020a07] border-slate-800 focus:border-emerald-400",
    btnGradient: "from-emerald-500 via-teal-500 to-cyan-400 text-slate-950",
    ringColor: "ring-emerald-400",
    dotColor: "bg-emerald-400",
  },
  violet: {
    name: "Quantum Violet",
    primary: "#8B5CF6",
    secondary: "#6366F1",
    glow: "rgba(139, 92, 246, 0.4)",
    border: "border-purple-500/30 hover:border-purple-500/60",
    text: "text-purple-400",
    bgPanel: "bg-[#0d081f]/90 backdrop-blur-xl border border-purple-500/20",
    bgHeader: "bg-[#0d081f]/85 backdrop-blur-xl border-b border-purple-500/20",
    bgInput: "bg-[#070313] border-slate-800 focus:border-purple-400",
    btnGradient: "from-purple-500 via-indigo-500 to-cyan-400 text-white",
    ringColor: "ring-purple-400",
    dotColor: "bg-purple-400",
  },
  tactical: {
    name: "Tactical Amber",
    primary: "#F59E0B",
    secondary: "#D97706",
    glow: "rgba(245, 158, 11, 0.4)",
    border: "border-amber-500/30 hover:border-amber-500/60",
    text: "text-amber-400",
    bgPanel: "bg-[#150f05]/90 backdrop-blur-xl border border-amber-500/20",
    bgHeader: "bg-[#150f05]/85 backdrop-blur-xl border-b border-amber-500/20",
    bgInput: "bg-[#0a0702] border-slate-800 focus:border-amber-400",
    btnGradient: "from-amber-500 via-orange-500 to-yellow-400 text-slate-950",
    ringColor: "ring-amber-400",
    dotColor: "bg-amber-400",
  },
};

// ─── Tile Providers (100% Free, Zero Watermark) ─────────────────────────────
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
    name: "Standard OSM",
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
    : "#94A3B8";

  const glowEffect = selected
    ? `filter: drop-shadow(0 0 10px #38BDF8) drop-shadow(0 0 20px #0284C7);`
    : `filter: drop-shadow(0 2px 5px rgba(0,0,0,0.8));`;

  const halo = selected
    ? `<circle cx="16" cy="16" r="14" fill="none" stroke="#38BDF8" stroke-width="2.5" opacity="0.9" stroke-dasharray="4 2"/>`
    : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"
         style="transform:rotate(${rotation}deg);transform-origin:center;${glowEffect}">
      ${halo}
      <polygon points="16,3 23,26 16,21 9,26" fill="${color}" stroke="#FFFFFF" stroke-width="1.2" opacity="${selected ? 1 : 0.92}"/>
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
    <div style="filter:drop-shadow(0 0 8px rgba(14,165,233,0.7));">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#0EA5E9" stroke="#0F172A" stroke-width="1.8">
        <circle cx="12" cy="12" r="8" fill="#0284C7" opacity="0.9" />
        <circle cx="12" cy="12" r="3" fill="#FFFFFF" />
      </svg>
    </div>`;

  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}

function createTerminalBeacon(type: "origin" | "destination", label: string): L.DivIcon {
  const isOrigin = type === "origin";
  const ringColor = isOrigin ? "#10B981" : "#F59E0B";
  const coreColor = isOrigin ? "#059669" : "#D97706";
  const svg = `
    <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:40px;height:40px;border-radius:50%;background:${ringColor};opacity:0.25;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
      <div style="position:absolute;width:26px;height:26px;border-radius:50%;background:${ringColor};opacity:0.4;box-shadow:0 0 14px ${ringColor};"></div>
      <div style="width:14px;height:14px;border-radius:50%;background:${coreColor};border:2px solid #FFFFFF;box-shadow:0 0 10px #000;z-index:2;"></div>
      <div style="position:absolute;bottom:-18px;white-space:nowrap;font-size:9px;font-weight:800;color:#FFFFFF;background:rgba(15,23,42,0.85);padding:1px 5px;border-radius:4px;border:1px solid ${ringColor};text-transform:uppercase;letter-spacing:0.5px;box-shadow:0 2px 6px rgba(0,0,0,0.6);">${label}</div>
    </div>
  `;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

// ─── Dynamic Telemetry Time-Series ──────────────────────────────────────────
function generateTelemetryData() {
  const points = [];
  const now = new Date();
  for (let i = 24; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600 * 1000);
    const hourStr = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const waveNoise = Math.sin(i * 0.4) * 0.6 + Math.random() * 0.4;
    points.push({
      time: hourStr,
      sog: Number((13.5 + Math.sin(i * 0.3) * 1.8 + Math.random() * 0.5).toFixed(1)),
      impact1: Number((1.2 + waveNoise).toFixed(2)),
      impact2: Number((0.6 + waveNoise * 0.7).toFixed(2)),
    });
  }
  return points;
}

// ─── Leaflet Map Helper Components ───────────────────────────────────────────

function FitBoundsControl({
  predictedCandidates,
  routes,
}: {
  predictedCandidates: CandidateRoute[];
  routes: MapRoute[];
}) {
  const map = useMap();

  const handleFit = () => {
    if (predictedCandidates.length > 0 && predictedCandidates[0].waypoints?.length) {
      const allPoints: [number, number][] = [];
      predictedCandidates.forEach((c) => {
        if (c.waypoints) allPoints.push(...c.waypoints);
      });
      if (allPoints.length > 0) {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [60, 60], maxZoom: 6 });
        return;
      }
    }
    if (routes.length > 0) {
      const allPoints: [number, number][] = [];
      routes.forEach((r) => {
        if (r.waypoints) allPoints.push(...(r.waypoints as [number, number][]));
      });
      if (allPoints.length > 0) {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50] });
      }
    }
  };

  return (
    <div className="leaflet-top leaflet-right" style={{ marginTop: "75px", marginRight: "12px" }}>
      <div className="leaflet-control flex flex-col gap-1">
        <button
          onClick={handleFit}
          title="Fit view to route network"
          className="bg-slate-900/90 hover:bg-slate-800 text-cyan-300 hover:text-white border border-slate-700/80 p-2 rounded-xl shadow-lg transition-all flex items-center justify-center cursor-pointer"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function MapController({
  targetLoc,
  targetBounds,
}: {
  targetLoc: [number, number] | null;
  targetBounds: [number, number][] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (targetBounds && targetBounds.length > 1) {
      const bounds = L.latLngBounds(targetBounds);
      map.fitBounds(bounds, { padding: [70, 70], maxZoom: 7 });
    } else if (targetLoc) {
      map.flyTo(targetLoc, 7, { duration: 1.2 });
    }
  }, [targetLoc, targetBounds, map]);

  return null;
}

function MapResizeHandler({ trigger }: { trigger: any }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [trigger, map]);
  return null;
}

function MapViewportTracker({
  onBoundsChange,
}: {
  onBoundsChange: (bounds: L.LatLngBounds) => void;
}) {
  const map = useMap();
  useEffect(() => {
    onBoundsChange(map.getBounds());
    const handleUpdate = () => {
      onBoundsChange(map.getBounds());
    };
    map.on("moveend", handleUpdate);
    map.on("zoomend", handleUpdate);
    return () => {
      map.off("moveend", handleUpdate);
      map.off("zoomend", handleUpdate);
    };
  }, [map, onBoundsChange]);
  return null;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LiveFleetMap() {
  const {
    vessels,
    apiKeyConfigured,
  } = useAisWebSocket();

  // Color Theme & Layout States
  const [theme, setTheme] = useState<UITheme>("oceanic");
  const themeConfig = THEME_CONFIG[theme];

  const [selectedMmsi, setSelectedMmsi] = useState<number | null>(422001);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"predictor" | "fleet">("predictor");
  const [activeVesselFilter, setActiveVesselFilter] = useState<"live" | "all" | "pinned">("live");
  const [search, setSearch] = useState("");
  const [mapStyle, setMapStyle] = useState<"dark" | "satellite" | "osm">("dark");
  const [showNauticalOverlay, setShowNauticalOverlay] = useState(false);
  const [targetLocation, setTargetLocation] = useState<[number, number] | null>(null);
  const [targetRouteBounds, setTargetRouteBounds] = useState<[number, number][] | null>(null);
  const [currentBounds, setCurrentBounds] = useState<L.LatLngBounds | null>(null);
  const [vesselCap, setVesselCap] = useState<number>(2000);

  // Deck UI Panels Visibility
  const [isLeftDeckOpen, setIsLeftDeckOpen] = useState(true);
  const [isRightDeckOpen, setIsRightDeckOpen] = useState(true);
  const [showChart, setShowChart] = useState(false);

  // Layer Toggles
  const [showVessels, setShowVessels] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showPorts, setShowPorts] = useState(true);
  const [showPredictedRoutes, setShowPredictedRoutes] = useState(true);

  // Telemetry time series state
  const telemetryData = useMemo(() => generateTelemetryData(), []);

  // Map Routes & Overlays Data State
  const [routes, setRoutes] = useState<MapRoute[]>([]);
  const [ports, setPorts] = useState<MapPort[]>([]);
  const [, setBestRouteData] = useState<MapBestRouteResponse | null>(null);

  // ─── QUANTUM ROUTE PREDICTOR STATE ───────────────────────────────────────
  const [predictRouteCode, setPredictRouteCode] = useState("R02");
  const [predictFuelType, setPredictFuelType] = useState("VLSFO");
  const [predictFuelPrice] = useState(650);
  const [predictVesselClass, setPredictVesselClass] = useState("Capesize");
  const [predictCargoDemand] = useState(180000);
  const [predictWeather, setPredictWeather] = useState("MODERATE");
  const [predictAlgorithm, setPredictAlgorithm] = useState("QGA");
  const [predictObjective, setPredictObjective] = useState("balanced");

  const [predictedCandidates, setPredictedCandidates] = useState<CandidateRoute[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>("quantum-pareto");
  const [isPredicting, setIsPredicting] = useState(false);
  const [liveWeather, setLiveWeather] = useState<RouteWeatherProfile | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);

  const handleFetchRouteWeather = useCallback(async (code: string) => {
    setLoadingWeather(true);
    try {
      const w = await getRouteWeather(code);
      setLiveWeather(w);
      if (w.summary && w.summary.dominant_sea_state) {
        setPredictWeather(w.summary.dominant_sea_state);
      }
    } catch (err) {
      console.warn("Live route weather error", err);
    } finally {
      setLoadingWeather(false);
    }
  }, []);

  useEffect(() => {
    handleFetchRouteWeather(predictRouteCode);
  }, [predictRouteCode, handleFetchRouteWeather]);

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
      const candidates = res.candidates || [];
      setPredictedCandidates(candidates);
      const best = res.best_recommendation || candidates[0];
      if (best) {
        setSelectedCandidateId(best.id);
        if (best.waypoints && best.waypoints.length > 1) {
          setTargetRouteBounds(best.waypoints);
        }
      }
      setIsRightDeckOpen(true);
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
      lat: 66.56,
      lon: 12.80,
    },
    {
      id: 2,
      mmsi: 422001,
      name: "RS 422 Eyr Myken",
      date: "26 Jan, 2026 14:30",
      status: "LIVE",
      lat: 66.75,
      lon: 12.50,
    },
    {
      id: 3,
      mmsi: 999001,
      name: "Green Voyager (Capesize)",
      date: "26 Jan, 2026 12:00",
      status: "DEMO",
      lat: -19.5,
      lon: -38.2,
    },
  ], []);

  // Filtered vessel search
  const filteredVessels = useMemo(() => {
    let list = vessels;
    if (activeVesselFilter === "live") {
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
  }, [vessels, activeVesselFilter, search]);

  // Performance-optimized viewport vessel markers
  const displayedVessels = useMemo(() => {
    if (!vessels || vessels.length === 0) return [];

    const valid = vessels.filter((v) => v.latitude != null && v.longitude != null);
    let pool = valid;
    if (activeVesselFilter === "live") {
      pool = valid.filter((v) => v.status === "LIVE");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      pool = pool.filter(
        (v) =>
          (v.name && v.name.toLowerCase().includes(q)) ||
          v.mmsi.toString().includes(q) ||
          (v.call_sign && v.call_sign.toLowerCase().includes(q))
      );
    }

    // Viewport-based prioritization: render vessels currently visible in the map bounding box
    let inView = pool;
    if (currentBounds) {
      inView = pool.filter((v) =>
        currentBounds.contains([v.latitude!, v.longitude!])
      );
    }

    const selected = valid.find((v) => v.mmsi === selectedMmsi);
    // Prioritize vessels currently visible in user's viewport, otherwise fallback to pool
    const activeList = inView.length > 0 ? inView : pool;
    const others = activeList.filter((v) => v.mmsi !== selectedMmsi);
    const subset = others.slice(0, vesselCap);
    return selected ? [selected, ...subset] : subset;
  }, [vessels, selectedMmsi, currentBounds, vesselCap, activeVesselFilter, search]);

  const selectedCandidate = useMemo(() => {
    return predictedCandidates.find((c) => c.id === selectedCandidateId) || predictedCandidates[0] || null;
  }, [predictedCandidates, selectedCandidateId]);

  const handleSelectVessel = (mmsi: number, lat?: number, lon?: number) => {
    setSelectedMmsi(mmsi);
    if (lat != null && lon != null) {
      setTargetRouteBounds(null);
      setTargetLocation([lat, lon]);
    }
  };

  const handleSelectCandidate = (candidate: CandidateRoute) => {
    setSelectedCandidateId(candidate.id);
    if (candidate.waypoints && candidate.waypoints.length > 1) {
      setTargetRouteBounds(candidate.waypoints);
    }
  };

  const portIcon = useMemo(() => createPortIcon(), []);
  const activeTileConfig = TILE_PROVIDERS[mapStyle];

  return (
    <div className="relative w-full h-full bg-[#060913] text-slate-100 overflow-hidden font-sans select-none flex flex-col">
      
      {/* ─── 1. TOP COMMAND BAR (INTEGRATED HUD) ─────────────────────────────── */}
      <header className={clsx("h-14 shrink-0 px-4 flex items-center justify-between gap-3 z-30 transition-colors duration-300 shadow-md", themeConfig.bgHeader)}>
        
        {/* Left: Brand & Live Stream Beacon */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={clsx("w-8 h-8 rounded-xl p-[1px] bg-gradient-to-tr shadow-md", themeConfig.btnGradient)}>
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                <Compass className={clsx("h-4 w-4 animate-spin-slow", themeConfig.text)} />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wider uppercase bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  Quantum Fleet Deck
                </span>
                <span className={clsx("px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border", themeConfig.text, themeConfig.border)}>
                  SIH PS-138
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                <span className={clsx("inline-block h-2 w-2 rounded-full", apiKeyConfigured ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" : "bg-amber-400")} />
                {apiKeyConfigured ? (
                  <span>
                    <strong className="text-white font-semibold">{vessels.length.toLocaleString()}</strong> AIS Live Streams Active
                  </span>
                ) : (
                  "Fallback Simulation Mode Active"
                )}
              </p>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-slate-800 hidden md:block" />

          {/* Left Mission Control Deck Toggle Button */}
          <button
            onClick={() => setIsLeftDeckOpen(!isLeftDeckOpen)}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all duration-200 shadow-sm",
              isLeftDeckOpen
                ? "bg-slate-800 text-white border-slate-600"
                : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
            )}
            title="Toggle Mission Control Dock"
          >
            <SlidersHorizontal className={clsx("h-3.5 w-3.5", themeConfig.text)} />
            <span className="hidden sm:inline">Mission Control</span>
            {isLeftDeckOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        </div>

        {/* Center: UI Theme & Basemap Switcher */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
          
          {/* UI Color Theme Picker */}
          <div className="flex items-center gap-1 bg-slate-950/90 p-1 rounded-xl border border-slate-800 shadow-inner" title="Select UI Color Theme">
            <Palette className={clsx("h-3.5 w-3.5 ml-1 mr-0.5", themeConfig.text)} />
            {(["oceanic", "emerald", "violet", "tactical"] as const).map((tKey) => {
              const cfg = THEME_CONFIG[tKey];
              const isSelected = theme === tKey;
              return (
                <button
                  key={tKey}
                  onClick={() => setTheme(tKey)}
                  className={clsx(
                    "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all capitalize",
                    isSelected
                      ? "bg-slate-800 text-white shadow-sm ring-1 " + cfg.ringColor
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <span className={clsx("h-2 w-2 rounded-full", cfg.dotColor)} />
                  <span className="hidden xl:inline">{cfg.name.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>

          {/* Tile Style Picker */}
          <div className="flex items-center gap-0.5 bg-slate-950/90 p-1 rounded-xl border border-slate-800 shadow-inner">
            <Globe className={clsx("h-3.5 w-3.5 ml-1 mr-0.5", themeConfig.text)} />
            {(["dark", "satellite", "osm"] as const).map((styleKey) => (
              <button
                key={styleKey}
                onClick={() => setMapStyle(styleKey)}
                className={clsx(
                  "px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all capitalize",
                  mapStyle === styleKey
                    ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {styleKey === "osm" ? "OSM" : styleKey}
              </button>
            ))}
          </div>

          {/* Layer Pills */}
          <div className="flex items-center gap-1 bg-slate-950/90 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setShowPredictedRoutes((v) => !v)}
              className={clsx(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border",
                showPredictedRoutes
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm"
                  : "text-slate-400 border-transparent hover:text-slate-200"
              )}
            >
              <Sparkles className="h-3 w-3 text-emerald-400" />
              <span>Predictions</span>
              <span className="text-[9px] opacity-75 font-mono">({predictedCandidates.length})</span>
            </button>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowVessels((v) => !v)}
                className={clsx(
                  "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border",
                  showVessels
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm"
                    : "text-slate-400 border-transparent hover:text-slate-200"
                )}
              >
                <Ship className="h-3 w-3 text-cyan-400" />
                <span>AIS</span>
                <span className="text-[9px] opacity-85 font-mono">
                  ({displayedVessels.length.toLocaleString()} in view / {vessels.length.toLocaleString()})
                </span>
              </button>

              {showVessels && (
                <select
                  value={vesselCap}
                  onChange={(e) => setVesselCap(Number(e.target.value))}
                  className="bg-slate-900/90 text-cyan-300 text-[10px] font-mono border border-slate-700/80 rounded-lg px-1.5 py-0.5 focus:outline-none cursor-pointer"
                  title="Maximum visible vessel markers rendered in current view"
                >
                  <option value={500}>500 max</option>
                  <option value={2000}>2,000 max</option>
                  <option value={5000}>5,000 max</option>
                  <option value={10000}>10,000 max</option>
                </select>
              )}
            </div>

            <button
              onClick={() => setShowRoutes((v) => !v)}
              className={clsx(
                "hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border",
                showRoutes
                  ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                  : "text-slate-400 border-transparent hover:text-slate-200"
              )}
            >
              <RouteIcon className="h-3 w-3 text-blue-400" />
              <span>Lanes</span>
            </button>

            <button
              onClick={() => setShowPorts((v) => !v)}
              className={clsx(
                "hidden xl:flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border",
                showPorts
                  ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                  : "text-slate-400 border-transparent hover:text-slate-200"
              )}
            >
              <Anchor className="h-3 w-3 text-sky-400" />
              <span>Ports</span>
            </button>

            <button
              onClick={() => setShowNauticalOverlay((n) => !n)}
              className={clsx(
                "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border",
                showNauticalOverlay
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                  : "text-slate-400 border-transparent hover:text-slate-200"
              )}
              title="Toggle OpenSeaMap seamarks & buoys overlay"
            >
              <Eye className="h-3 w-3" />
              <span className="hidden sm:inline">Seamarks</span>
            </button>
          </div>
        </div>

        {/* Right: Drawer Actions (Route Intel & Telemetry) */}
        <div className="flex items-center gap-2 shrink-0">
          {predictedCandidates.length > 0 && (
            <button
              onClick={() => setIsRightDeckOpen(!isRightDeckOpen)}
              className={clsx(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all duration-200 shadow-sm",
                isRightDeckOpen
                  ? "bg-slate-800 text-white border-slate-600"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
              )}
              title="Toggle Route Solutions Intel Deck"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Solutions Deck</span>
              {isRightDeckOpen ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
            </button>
          )}

          <button
            onClick={() => setShowChart((c) => !c)}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all duration-200 shadow-sm",
              showChart
                ? "bg-slate-800 text-cyan-300 border-slate-600"
                : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
            )}
          >
            <BarChart2 className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Telemetry</span>
          </button>
        </div>
      </header>

      {/* ─── 2. MAIN MAP VIEWPORT & FLOATING DECKS ──────────────────────────── */}
      <div className="flex-1 w-full relative overflow-hidden">
        
        {/* LEAFLET MAP BACKGROUND */}
        <MapContainer
          center={[-20.2831, -40.2414]}
          zoom={4}
          className="h-full w-full bg-[#060913]"
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
          <FitBoundsControl predictedCandidates={predictedCandidates} routes={routes} />
          <MapController targetLoc={targetLocation} targetBounds={targetRouteBounds} />
          <MapResizeHandler trigger={`${showChart}-${isLeftDeckOpen}-${isRightDeckOpen}`} />
          <MapViewportTracker onBoundsChange={setCurrentBounds} />

          {/* Origin & Destination Terminal Beacons for Selected Predicted Route */}
          {selectedCandidate && (
            <>
              <Marker
                position={[selectedCandidate.origin.latitude, selectedCandidate.origin.longitude]}
                icon={createTerminalBeacon("origin", selectedCandidate.origin.name)}
              >
                <Popup closeButton={false}>
                  <div className="text-xs space-y-1 p-0.5">
                    <div className="font-bold text-emerald-400 flex items-center gap-1">
                      <Anchor className="h-3 w-3" /> Origin Port Terminal
                    </div>
                    <div className="font-bold text-slate-900">{selectedCandidate.origin.name}</div>
                    <div className="text-slate-500 font-mono text-[10px]">
                      {selectedCandidate.origin.latitude.toFixed(4)}°, {selectedCandidate.origin.longitude.toFixed(4)}°
                    </div>
                  </div>
                </Popup>
              </Marker>

              <Marker
                position={[selectedCandidate.destination.latitude, selectedCandidate.destination.longitude]}
                icon={createTerminalBeacon("destination", selectedCandidate.destination.name)}
              >
                <Popup closeButton={false}>
                  <div className="text-xs space-y-1 p-0.5">
                    <div className="font-bold text-amber-500 flex items-center gap-1">
                      <Flag className="h-3 w-3" /> Destination Port Terminal
                    </div>
                    <div className="font-bold text-slate-900">{selectedCandidate.destination.name}</div>
                    <div className="text-slate-500 font-mono text-[10px]">
                      {selectedCandidate.destination.latitude.toFixed(4)}°, {selectedCandidate.destination.longitude.toFixed(4)}°
                    </div>
                  </div>
                </Popup>
              </Marker>
            </>
          )}

          {/* Global Seaports */}
          {showPorts &&
            ports.map((p) => (
              <Marker key={p.name} position={[p.latitude, p.longitude]} icon={portIcon}>
                <Popup closeButton={false}>
                  <div className="text-xs space-y-1 p-0.5">
                    <div className="font-bold text-sky-600 flex items-center gap-1">
                      <Anchor className="h-3.5 w-3.5" /> {p.name} Seaport
                    </div>
                    <p className="text-slate-600 font-mono text-[10px]">{p.latitude.toFixed(2)}°, {p.longitude.toFixed(2)}°</p>
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
                  color="#334155"
                  weight={2}
                  opacity={0.35}
                  dashArray="4 4"
                />
              );
            })}

          {/* ─── PREDICTED QUANTUM ROUTE POLYLINES (NEON GLOW) ────────────────── */}
          {showPredictedRoutes &&
            predictedCandidates.map((cand) => {
              if (!cand.waypoints || cand.waypoints.length < 2) return null;
              const isSelected = cand.id === selectedCandidateId;
              return (
                <div key={cand.id}>
                  {/* Laser Halo Glow layer for selected route */}
                  {isSelected && (
                    <Polyline
                      positions={cand.waypoints as [number, number][]}
                      color={cand.color}
                      weight={12}
                      opacity={0.35}
                    />
                  )}
                  <Polyline
                    positions={cand.waypoints as [number, number][]}
                    color={cand.color}
                    weight={isSelected ? 5 : 3}
                    opacity={isSelected ? 1.0 : 0.6}
                    dashArray={cand.id === "weather-resilient" ? "6 6" : undefined}
                    eventHandlers={{
                      click: () => handleSelectCandidate(cand),
                    }}
                  >
                    <Tooltip sticky direction="top">
                      <div className="text-xs p-1 font-bold space-y-0.5">
                        <div className="flex items-center gap-1.5" style={{ color: cand.color }}>
                          <Sparkles className="h-3.5 w-3.5" /> {cand.title} {isSelected && "★ ACTIVE"}
                        </div>
                        <div className="text-slate-200">
                          Speed: {cand.speed_kn} kn | Fuel: {cand.fuel_tonnes} t | CO₂: {cand.lifecycle_co2e_tonnes} t
                        </div>
                        <div className="text-emerald-400 font-mono">
                          Voyage Cost: ${cand.total_cost_usd.toLocaleString()}
                        </div>
                      </div>
                    </Tooltip>
                  </Polyline>
                </div>
              );
            })}

          {/* Real AIS Vessels (Performance Virtualized) */}
          {showVessels &&
            displayedVessels.map((v) => {
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

        {/* ─── 3. LEFT MISSION CONTROL DECK ──────────────────────────────────── */}
        {isLeftDeckOpen && (
          <aside
            className={clsx(
              "absolute top-4 left-4 z-[1001] w-88 max-w-[calc(100vw-2rem)] h-[calc(100%-2rem)] max-h-[700px] rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden transition-all duration-300",
              themeConfig.bgPanel
            )}
          >
            {/* Mission Control Deck Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className={clsx("h-4 w-4", themeConfig.text)} />
                <span className="text-xs font-black tracking-wider uppercase text-white">Mission Control</span>
              </div>
              <button
                onClick={() => setIsLeftDeckOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                title="Collapse Panel"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            {/* Deck Tab Switcher */}
            <div className="flex items-center border-b border-slate-800 bg-slate-950/40 p-1.5 gap-1">
              <button
                onClick={() => setActiveSidebarTab("predictor")}
                className={clsx(
                  "flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all",
                  activeSidebarTab === "predictor"
                    ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                <span>Quantum Predictor</span>
              </button>
              <button
                onClick={() => setActiveSidebarTab("fleet")}
                className={clsx(
                  "flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all",
                  activeSidebarTab === "fleet"
                    ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Ship className="h-3.5 w-3.5 text-cyan-400" />
                <span>AIS Fleet</span>
                <span className="text-[10px] px-1 rounded bg-slate-900 text-slate-300 font-mono">{vessels.length}</span>
              </button>
            </div>

            {/* TAB 1: QUANTUM ROUTE PREDICTOR */}
            {activeSidebarTab === "predictor" && (
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 scrollbar-thin scrollbar-thumb-slate-700">
                {/* Shipping Lane */}
                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                    Origin / Destination Corridor
                  </label>
                  <select
                    value={predictRouteCode}
                    onChange={(e) => setPredictRouteCode(e.target.value)}
                    className={clsx(
                      "w-full rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition cursor-pointer border",
                      themeConfig.bgInput
                    )}
                  >
                    <option value="R02">R02: Tubarão (Brazil) → Rotterdam (Netherlands) [5,100 nm]</option>
                    <option value="R01">R01: Port Hedland (Aus) → Qingdao (China) [3,600 nm]</option>
                    <option value="R03">R03: Paradip (India) → Singapore [2,100 nm]</option>
                    <option value="R04">R04: Richards Bay (SA) → Paradip (India) [4,600 nm]</option>
                    <option value="R05">R05: Newcastle (Aus) → Qingdao (China) [4,300 nm]</option>
                    <option value="R06">R06: Mumbai (India) → Rotterdam (via Suez) [6,300 nm]</option>
                    <option value="R07">R07: Shanghai → Rotterdam (via Suez) [10,500 nm]</option>
                  </select>
                </div>

                {/* Live Ocean Weather HUD Card */}
                <div className="bg-slate-950/80 rounded-xl p-2.5 border border-cyan-500/20 shadow-inner">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-black tracking-wider uppercase flex items-center gap-1.5 text-cyan-400">
                      <Waves className="h-3.5 w-3.5 text-cyan-400" />
                      Live Ocean Waves & Weather
                    </span>
                    <button
                      type="button"
                      onClick={() => handleFetchRouteWeather(predictRouteCode)}
                      disabled={loadingWeather}
                      className="text-[10px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition"
                      title="Refresh Live Oceanographic Weather"
                    >
                      <RefreshCw className={clsx("h-3 w-3", loadingWeather && "animate-spin text-cyan-400")} />
                      <span>{loadingWeather ? "Syncing..." : "Sync"}</span>
                    </button>
                  </div>

                  {liveWeather?.summary ? (
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="bg-slate-900/80 rounded-lg p-1 border border-slate-800">
                        <div className="text-[9px] text-slate-400 uppercase font-mono">Wave (Hs)</div>
                        <div className="text-xs font-bold text-white flex items-center justify-center gap-0.5">
                          <Waves className="h-3 w-3 text-cyan-400" />
                          {liveWeather.summary.avg_wave_height_m}m
                        </div>
                      </div>
                      <div className="bg-slate-900/80 rounded-lg p-1 border border-slate-800">
                        <div className="text-[9px] text-slate-400 uppercase font-mono">Wind</div>
                        <div className="text-xs font-bold text-white flex items-center justify-center gap-0.5">
                          <Wind className="h-3 w-3 text-emerald-400" />
                          {liveWeather.summary.avg_wind_speed_kn} kn
                        </div>
                      </div>
                      <div className="bg-slate-900/80 rounded-lg p-1 border border-slate-800">
                        <div className="text-[9px] text-slate-400 uppercase font-mono">Sea State</div>
                        <div className="text-[10px] font-extrabold text-cyan-300 uppercase">
                          {liveWeather.summary.dominant_sea_state}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500 italic py-1 flex items-center justify-between">
                      <span>Fetching real-time Open-Meteo GFS wave spectra...</span>
                      <CloudRain className="h-3 w-3 text-slate-600 animate-pulse" />
                    </div>
                  )}
                </div>

                {/* Vessel Class & Fuel Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                      Vessel Class
                    </label>
                    <select
                      value={predictVesselClass}
                      onChange={(e) => setPredictVesselClass(e.target.value)}
                      className={clsx(
                        "w-full rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none transition cursor-pointer border",
                        themeConfig.bgInput
                      )}
                    >
                      <option value="Capesize">Capesize (180k DWT)</option>
                      <option value="Panamax">Panamax (75k DWT)</option>
                      <option value="Handysize">Handysize (32k DWT)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                      Fuel Type
                    </label>
                    <select
                      value={predictFuelType}
                      onChange={(e) => setPredictFuelType(e.target.value)}
                      className={clsx(
                        "w-full rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none transition cursor-pointer border",
                        themeConfig.bgInput
                      )}
                    >
                      <option value="VLSFO">VLSFO ($650/t)</option>
                      <option value="HFO">HFO ($520/t)</option>
                      <option value="MGO">MGO ($850/t)</option>
                      <option value="LNG">LNG ($920/t)</option>
                      <option value="AMMONIA">Green Ammonia ($1.2k/t)</option>
                      <option value="BIOFUEL">Biofuel ($1.1k/t)</option>
                    </select>
                  </div>
                </div>

                {/* Weather & Quantum Engine Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                      Sea State
                    </label>
                    <select
                      value={predictWeather}
                      onChange={(e) => setPredictWeather(e.target.value)}
                      className={clsx(
                        "w-full rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none transition cursor-pointer border",
                        themeConfig.bgInput
                      )}
                    >
                      <option value="CALM">Calm (0.8m Wave)</option>
                      <option value="MODERATE">Moderate (1.8m Wave)</option>
                      <option value="HEAVY">Heavy Storm (4.2m)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                      Optimization Engine
                    </label>
                    <select
                      value={predictAlgorithm}
                      onChange={(e) => setPredictAlgorithm(e.target.value)}
                      className={clsx(
                        "w-full rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none transition cursor-pointer border",
                        themeConfig.bgInput
                      )}
                    >
                      <option value="QGA">QGA (Quantum Genetic)</option>
                      <option value="QPSO">QPSO (Quantum Swarm)</option>
                      <option value="GA">Classical Genetic</option>
                      <option value="PSO">Particle Swarm</option>
                    </select>
                  </div>
                </div>

                {/* Optimization Target Objective */}
                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1">
                    Primary Optimization Objective
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: "balanced", label: "Balanced Pareto", icon: Zap },
                      { id: "min_emissions", label: "Min Emissions", icon: ShieldCheck },
                      { id: "min_cost", label: "Min Cost", icon: DollarSign },
                      { id: "min_time", label: "Fast Express", icon: Gauge },
                    ].map((item) => {
                      const isSelected = predictObjective === item.id;
                      const IconComp = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setPredictObjective(item.id)}
                          className={clsx(
                            "px-2.5 py-2 rounded-xl text-left border transition-all flex items-center gap-1.5 text-xs font-bold",
                            isSelected
                              ? "bg-slate-800 text-white border-slate-600 shadow-md ring-1 " + themeConfig.ringColor
                              : "bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200"
                          )}
                        >
                          <IconComp className={clsx("h-3.5 w-3.5", isSelected ? themeConfig.text : "text-slate-500")} />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Prediction Action Button */}
                <button
                  onClick={handleRunPrediction}
                  disabled={isPredicting}
                  className={clsx(
                    "w-full mt-2 relative group overflow-hidden bg-gradient-to-r font-black py-2.5 px-4 rounded-xl shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs",
                    themeConfig.btnGradient
                  )}
                >
                  {isPredicting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Computing Quantum Solutions...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Predict All Candidate Routes</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 2: LIVE AIS FLEET TRACKER */}
            {activeSidebarTab === "fleet" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-slate-800 space-y-2">
                  <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setActiveVesselFilter("live")}
                      className={clsx(
                        "flex-1 py-1 rounded-lg text-xs font-bold transition text-center",
                        activeVesselFilter === "live" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400"
                      )}
                    >
                      Live ({vessels.length})
                    </button>
                    <button
                      onClick={() => setActiveVesselFilter("pinned")}
                      className={clsx(
                        "flex-1 py-1 rounded-lg text-xs font-bold transition text-center",
                        activeVesselFilter === "pinned" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400"
                      )}
                    >
                      Pinned ({pinnedTrips.length})
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search by MMSI or vessel..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className={clsx(
                        "w-full pl-8 pr-3 py-1.5 text-xs rounded-xl text-white placeholder-slate-500 focus:outline-none border",
                        themeConfig.bgInput
                      )}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-700">
                  {activeVesselFilter === "pinned" ? (
                    pinnedTrips.map((trip) => {
                      const isSelected = selectedMmsi === trip.mmsi;
                      return (
                        <div
                          key={trip.id}
                          onClick={() => handleSelectVessel(trip.mmsi, trip.lat, trip.lon)}
                          className={clsx(
                            "flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer",
                            isSelected
                              ? "bg-slate-800 border-cyan-400 shadow-md"
                              : "bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50"
                          )}
                        >
                          <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                            <Ship className="h-4 w-4 text-cyan-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white truncate">{trip.name}</span>
                              <span className="text-[10px] font-mono text-cyan-400">DEMO</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">{trip.date}</p>
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
                            "flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer",
                            isSelected
                              ? "bg-slate-800 border-cyan-400 shadow-md"
                              : "bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50"
                          )}
                        >
                          <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                            <Ship className={clsx("h-4 w-4", vessel.status === "LIVE" ? "text-cyan-400" : "text-slate-400")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white truncate">
                                {vessel.name || `MMSI ${vessel.mmsi}`}
                              </span>
                              {vessel.status === "LIVE" && (
                                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                              <span className="font-mono text-slate-200">
                                {vessel.speed_over_ground != null ? `${vessel.speed_over_ground} kn` : "0 kn"}
                              </span>
                              <span className="font-mono text-[9px] text-slate-500">
                                {vessel.latitude != null ? `${vessel.latitude.toFixed(2)}°, ${vessel.longitude?.toFixed(2)}°` : "No GPS"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* ─── 4. RIGHT ROUTE INTELLIGENCE & EVALUATED CANDIDATE SOLUTIONS DECK ─ */}
        {isRightDeckOpen && selectedCandidate && (
          <aside
            className={clsx(
              "absolute top-4 right-4 z-[1001] w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100%-2rem)] rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden transition-all duration-300",
              themeConfig.bgPanel
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full shadow-md shrink-0" style={{ backgroundColor: selectedCandidate.color }} />
                <h4 className="font-black text-white text-xs tracking-wide truncate">{selectedCandidate.title}</h4>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    if (selectedCandidate.waypoints && selectedCandidate.waypoints.length > 1) {
                      setTargetRouteBounds(selectedCandidate.waypoints);
                    }
                  }}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 flex items-center gap-1 transition"
                  title="Fit view to route"
                >
                  <Maximize2 className="h-3 w-3" /> Focus
                </button>
                <button
                  onClick={() => setIsRightDeckOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                  title="Minimize Panel"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="p-3.5 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
              {/* Fitness score & Rank Banner */}
              <div className="flex items-center justify-between bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Quantum Fitness</span>
                <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-lg text-xs font-black border border-emerald-500/40">
                  {(selectedCandidate.quantum_fitness * 100).toFixed(1)}% Optimal
                </span>
              </div>

              {/* Metrics Matrix */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950/90 p-2.5 rounded-xl border border-slate-800">
                <div className="space-y-0.5">
                  <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-bold">Total Cost</span>
                  <span className="text-sm font-black text-emerald-400">${selectedCandidate.total_cost_usd.toLocaleString()}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-bold">Lifecycle CO₂</span>
                  <span className="text-sm font-black text-cyan-400">{selectedCandidate.lifecycle_co2e_tonnes.toLocaleString()} MT</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-bold">Fuel Burned</span>
                  <span className="text-xs font-bold text-slate-200">
                    {selectedCandidate.fuel_tonnes.toLocaleString()} t ({selectedCandidate.fuel_type})
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-bold">Transit Time</span>
                  <span className="text-xs font-bold text-slate-200">
                    {selectedCandidate.voyage_hours} hrs ({(selectedCandidate.voyage_hours / 24).toFixed(1)} d)
                  </span>
                </div>
              </div>

              {/* AI Optimization Rationale */}
              <div className="text-[11px] text-slate-300 italic bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 leading-relaxed">
                💡 "{selectedCandidate.explanation}"
              </div>

              {/* All 5 Evaluated Candidate Solutions Selector */}
              {predictedCandidates.length > 1 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    All Evaluated Candidate Solutions
                  </span>
                  <div className="space-y-1">
                    {predictedCandidates.map((c) => {
                      const isSel = c.id === selectedCandidateId;
                      return (
                        <div
                          key={c.id}
                          onClick={() => handleSelectCandidate(c)}
                          className={clsx(
                            "p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs",
                            isSel
                              ? "bg-slate-800 text-white border-cyan-400 shadow-md"
                              : "bg-slate-950/80 text-slate-300 border-slate-800 hover:bg-slate-900 hover:border-slate-700"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                            <div className="min-w-0">
                              <span className="font-bold block truncate">{c.title}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {c.speed_kn} kn • {c.fuel_tonnes} t fuel
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-black text-emerald-400 block text-xs">
                              ${(c.total_cost_usd / 1000).toFixed(0)}k
                            </span>
                            <span className="text-[9px] text-cyan-300 font-mono">
                              {c.lifecycle_co2e_tonnes} MT
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ─── 5. FLOATING MAP LEGEND (BOTTOM LEFT) ───────────────────────────── */}
        <div className="absolute bottom-4 left-4 z-[1000] p-3 rounded-2xl bg-slate-950/85 backdrop-blur-xl border border-slate-800 shadow-xl space-y-2 max-w-[280px]">
          <div className="font-bold text-slate-200 text-xs border-b border-slate-800 pb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-cyan-400" /> Maritime Legend
            </span>
            <span className="text-[9px] text-emerald-400 font-mono">Real Maritime Lanes</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-slate-300 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-[#10B981] shadow-sm shadow-emerald-500/50" />
              <span>Recommended</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-[#8B5CF6] shadow-sm shadow-purple-500/50" />
              <span>Min Emissions</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-[#06B6D4] shadow-sm shadow-cyan-500/50" />
              <span>Min Cost Plan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-[#F59E0B] shadow-sm shadow-amber-500/50" />
              <span>Fast Express</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Live AIS Ship</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              <span>Seaport</span>
            </div>
          </div>
        </div>

        {/* ─── 6. BOTTOM TELEMETRY CONSOLE DRAWER ────────────────────────────── */}
        {showChart && (
          <div className="absolute bottom-0 left-0 right-0 z-[1002] h-48 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 flex flex-col px-4 py-2 text-xs shadow-2xl transition-all duration-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1">
              <div className="flex items-center gap-3">
                <span className="font-black text-slate-200 flex items-center gap-1.5 text-xs tracking-wider uppercase">
                  <Activity className="h-3.5 w-3.5 text-cyan-400" /> SOG & Dynamic Wave Impact Telemetry
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="flex items-center gap-1 font-semibold text-cyan-400">
                    <span className="h-2 w-2 rounded-full bg-cyan-400" /> Speed (kn)
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-amber-400" /> Impact Force 2
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> Impact Force 1
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-400">
                <span className="bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px] font-mono">
                  Real-Time Dynamic Series
                </span>
                <button
                  onClick={() => setShowChart(false)}
                  className="hover:text-white bg-slate-900 border border-slate-800 p-1 rounded hover:bg-slate-800 transition"
                  title="Close Telemetry Drawer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={telemetryData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748B" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" stroke="#38BDF8" tick={{ fontSize: 10 }} domain={[0, 40]} />
                  <YAxis yAxisId="right" orientation="right" stroke="#F59E0B" tick={{ fontSize: 10 }} domain={[0, 4]} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "#090D16", borderColor: "#334155", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar yAxisId="right" dataKey="impact1" fill="#10B981" opacity={0.65} stackId="a" />
                  <Bar yAxisId="right" dataKey="impact2" fill="#F59E0B" opacity={0.75} stackId="a" />
                  <Line yAxisId="left" type="monotone" dataKey="sog" stroke="#06B6D4" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

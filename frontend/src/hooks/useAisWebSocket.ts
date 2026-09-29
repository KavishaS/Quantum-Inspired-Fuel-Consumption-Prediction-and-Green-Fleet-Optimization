/**
 * useAisWebSocket — React hook for receiving live AIS updates.
 *
 * Connects to the backend WebSocket endpoint /api/ais/ws,
 * maintains vessel state, and handles reconnection automatically.
 * Never connects directly to AISstream — the backend owns that connection.
 *
 * Connection states:
 *   CONNECTING   — initial WebSocket handshake
 *   LIVE         — receiving AIS data from upstream
 *   STALE        — connected but upstream AIS not configured / no recent data
 *   DEMO         — no API key configured, showing demo data
 *   OFFLINE      — WebSocket disconnected
 */
import { useEffect, useRef, useState, useCallback } from "react";

export type AISStatus = "CONNECTING" | "LIVE" | "STALE" | "DEMO" | "OFFLINE";

export interface AISVesselData {
  mmsi: number;
  name?: string;
  imo?: number;
  call_sign?: string;
  ship_type?: number;
  destination?: string;
  eta?: string;
  latitude?: number;
  longitude?: number;
  speed_over_ground?: number;
  course_over_ground?: number;
  true_heading?: number;
  navigational_status?: number;
  timestamp?: string;
  received_at?: string;
  is_stale?: boolean;
  status?: "LIVE" | "STALE" | "OFFLINE" | "DEMO";
  source?: string;
  draught?: number;
  dimension_a?: number;
  dimension_b?: number;
  dimension_c?: number;
  dimension_d?: number;
}

interface AISState {
  vessels: Map<number, AISVesselData>;
  connectionStatus: AISStatus;
  apiKeyConfigured: boolean;
  upstreamState: string;
  lastMessageAt: string | null;
  error: string | null;
}

const WS_BASE =
  (typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1")
    ? `ws://${window.location.host}`
    : "ws://localhost:8000";

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

export function useAisWebSocket() {
  const [state, setState] = useState<AISState>({
    vessels: new Map(),
    connectionStatus: "CONNECTING",
    apiKeyConfigured: false,
    upstreamState: "disconnected",
    lastMessageAt: null,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    setState((prev) => ({ ...prev, connectionStatus: "CONNECTING", error: null }));

    try {
      const ws = new WebSocket(`${WS_BASE}/api/ais/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        // State will be set when we receive the snapshot message
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data as string);

          if (msg.type === "snapshot") {
            const apiConfigured: boolean = msg.api_key_configured ?? false;
            const upstreamState: string = msg.state ?? "disconnected";
            const newVessels = new Map<number, AISVesselData>();
            for (const v of (msg.data as AISVesselData[] | undefined) ?? []) {
              if (v.mmsi) newVessels.set(v.mmsi, v);
            }
            const status = resolveStatus(upstreamState, apiConfigured, newVessels.size);
            setState((prev) => ({
              ...prev,
              vessels: newVessels,
              connectionStatus: status,
              apiKeyConfigured: apiConfigured,
              upstreamState,
              lastMessageAt: new Date().toISOString(),
            }));
          } else if (msg.type === "ais_update") {
            const v: AISVesselData = msg.data;
            if (v?.mmsi) {
              setState((prev) => {
                const updated = new Map(prev.vessels);
                updated.set(v.mmsi, { ...prev.vessels.get(v.mmsi), ...v });
                const status = resolveStatus(
                  prev.upstreamState, prev.apiKeyConfigured, updated.size);
                return {
                  ...prev,
                  vessels: updated,
                  connectionStatus: status,
                  lastMessageAt: new Date().toISOString(),
                };
              });
            }
          } else if (msg.type === "heartbeat") {
            const upstreamState: string = msg.state ?? "disconnected";
            setState((prev) => {
              const status = resolveStatus(
                upstreamState, prev.apiKeyConfigured, prev.vessels.size);
              return { ...prev, upstreamState, connectionStatus: status };
            });
          }
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setState((prev) => ({
          ...prev,
          connectionStatus: "OFFLINE",
          error: "WebSocket connection error",
        }));
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setState((prev) => ({ ...prev, connectionStatus: "OFFLINE" }));
        scheduleReconnect();
      };
    } catch (err) {
      setState((prev) => ({
        ...prev,
        connectionStatus: "OFFLINE",
        error: "Failed to open WebSocket",
      }));
      scheduleReconnect();
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** attemptRef.current,
      RECONNECT_MAX_MS
    );
    attemptRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    vessels: Array.from(state.vessels.values()),
    vesselMap: state.vessels,
    connectionStatus: state.connectionStatus,
    apiKeyConfigured: state.apiKeyConfigured,
    upstreamState: state.upstreamState,
    lastMessageAt: state.lastMessageAt,
    error: state.error,
  };
}

function resolveStatus(
  upstreamState: string,
  apiKeyConfigured: boolean,
  vesselCount: number
): AISStatus {
  if (!apiKeyConfigured) return "DEMO";
  if (upstreamState === "connected") return "LIVE";
  if (upstreamState === "reconnecting" || upstreamState === "connecting") return "STALE";
  if (upstreamState === "no_api_key") return "DEMO";
  return vesselCount > 0 ? "STALE" : "OFFLINE";
}

import { useState } from "react";
import {
  ShieldCheck, Crown, Zap, Eye, X, Lock, User, CheckCircle2, AlertCircle, ArrowRight
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/types/auth";
import { ApiError } from "@/services/api";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DemoCard {
  role: UserRole;
  title: string;
  name: string;
  email: string;
  icon: typeof Crown;
  color: string;
  borderHover: string;
  bgGlow: string;
  badge: string;
  description: string;
  permissions: string[];
}

const ROLES_INFO: DemoCard[] = [
  {
    role: "admin",
    title: "Fleet Director / Admin",
    name: "Capt. Eleanor Vance",
    email: "eleanor.vance@greenfleet.io",
    icon: Crown,
    color: "text-purple-400",
    borderHover: "hover:border-purple-500/60 hover:shadow-[0_0_20px_rgba(168,85,247,0.25)]",
    bgGlow: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    badge: "Full Authority",
    description: "Full control over fleet assets, routes, fuel prices, scenario deletions, and optimizations.",
    permissions: ["Full CRUD on Vessels & Routes", "Trigger Quantum Optimizations", "Delete Scenarios", "Generate Audit Reports"],
  },
  {
    role: "analyst",
    title: "Quantum Fleet Analyst",
    name: "Dr. Marcus Chen",
    email: "marcus.chen@greenfleet.io",
    icon: Zap,
    color: "text-cyan-400",
    borderHover: "hover:border-cyan-500/60 hover:shadow-[0_0_20px_rgba(6,182,212,0.25)]",
    bgGlow: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    badge: "Optimization & ML",
    description: "Authority to execute quantum metaheuristics, ML predictions, and what-if sandbox evaluations.",
    permissions: ["Execute QGA & QPSO Runs", "Run Telemetry ML Models", "What-If Fuel Sandbox", "Compare Scenarios"],
  },
  {
    role: "auditor",
    title: "ESG & IMO Auditor",
    name: "Sarah Jenkins",
    email: "sarah.jenkins@imo-compliance.org",
    icon: ShieldCheck,
    color: "text-emerald-400",
    borderHover: "hover:border-emerald-500/60 hover:shadow-[0_0_20px_rgba(16,185,129,0.25)]",
    bgGlow: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    badge: "Read-Only Compliance",
    description: "Inspection of environmental metrics, CII ratings, EU ETS penalties, and certified audit reports.",
    permissions: ["View Live AIS Fleet Map", "Audit IMO CII & EU ETS", "Inspect Pareto Fronts", "Download Certified PDFs"],
  },
];

const PERMISSIONS_MATRIX = [
  { feature: "Trigger Quantum Optimizations (QGA/QPSO)", admin: true, analyst: true, auditor: false, note: "Locked in Auditor mode" },
  { feature: "Run Telemetry ML Models (R² = 0.997)", admin: true, analyst: true, auditor: false, note: "Auditor read-only inspection" },
  { feature: "What-If Alternative Fuel Sandbox Tuning", admin: true, analyst: true, auditor: false, note: "Read-only for Auditor" },
  { feature: "Create & Duplicate Fleet Scenarios", admin: true, analyst: true, auditor: false, note: "Locked in Auditor mode" },
  { feature: "Delete Fleet Planning Scenarios", admin: true, analyst: false, auditor: false, note: "Admin only (Analyst/Auditor blocked)" },
  { feature: "Manage Base Fleet Registry & Ports", admin: true, analyst: false, auditor: false, note: "Admin authority required" },
  { feature: "Real-Time AIS Fleet & Ocean Waves Map", admin: true, analyst: true, auditor: true, note: "All roles" },
  { feature: "Inspect Pareto Frontiers & Trade-offs", admin: true, analyst: true, auditor: true, note: "All roles" },
  { feature: "IMO CII Rating & EU ETS Compliance", admin: true, analyst: true, auditor: true, note: "Primary Auditor focus" },
  { feature: "Generate & Export Audit PDF Reports", admin: true, analyst: true, auditor: true, note: "All roles" },
];

export function LoginModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, role, demoLogin, login, logout, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"quick" | "matrix" | "custom">("quick");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDemoSwitch = async (targetRole: UserRole) => {
    setError(null);
    try {
      await demoLogin(targetRole);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to switch role.");
    }
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }
    setError(null);
    try {
      await login(username.trim(), password);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Invalid credentials.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl glass-panel rounded-2xl border border-slate-line/80 shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-navy/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-signal/10 border border-signal/30 text-signal shadow-glow">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-100 flex items-center gap-2">
                Role-Based Access Control
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  RBAC Active
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Switch operational personas or inspect the strict permissions matrix.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-6 pt-4 pb-2 border-b border-white/5 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("quick")}
            className={clsx(
              "px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 shrink-0",
              activeTab === "quick"
                ? "bg-signal/20 text-signal border border-signal/40 shadow-glow"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Zap className="h-3.5 w-3.5" /> 1-Click Role Switcher
          </button>
          <button
            onClick={() => setActiveTab("matrix")}
            className={clsx(
              "px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 shrink-0",
              activeTab === "matrix"
                ? "bg-signal/20 text-signal border border-signal/40 shadow-glow"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Permissions Matrix
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            className={clsx(
              "px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 shrink-0",
              activeTab === "custom"
                ? "bg-signal/20 text-signal border border-signal/40 shadow-glow"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <User className="h-3.5 w-3.5" /> Enterprise Login
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {activeTab === "quick" ? (
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
                Select an Operational Persona:
              </div>
              {ROLES_INFO.map((item) => {
                const isActive = user?.role === item.role;
                const Icon = item.icon;
                return (
                  <div
                    key={item.role}
                    onClick={() => !isActive && handleDemoSwitch(item.role)}
                    className={clsx(
                      "p-4 rounded-xl border transition-all duration-200 cursor-pointer relative flex flex-col gap-2.5",
                      isActive
                        ? "bg-white/[0.08] border-signal/70 shadow-[0_0_20px_rgba(6,182,212,0.25)] ring-1 ring-signal/50"
                        : clsx("bg-white/[0.02] border-white/10 hover:bg-white/[0.05]", item.borderHover)
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={clsx("p-2 rounded-lg bg-black/40 border border-white/10", item.color)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-100">{item.title}</span>
                            <span className={clsx("text-[10px] font-medium px-2 py-0.5 rounded-full border", item.bgGlow)}>
                              {item.badge}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {item.name} &bull; <span className="text-slate-500">{item.email}</span>
                          </div>
                        </div>
                      </div>

                      {isActive ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-signal bg-signal/10 px-2.5 py-1 rounded-lg border border-signal/30">
                          <CheckCircle2 className="h-4 w-4" /> Active
                        </div>
                      ) : (
                        <button
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-signal/20 hover:text-signal text-xs font-medium text-slate-300 border border-white/10 transition-colors flex items-center gap-1"
                        >
                          Switch <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {item.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {item.permissions.map((p) => (
                        <span key={p} className="text-[10px] px-2 py-0.5 rounded bg-black/30 text-slate-400 border border-white/5 font-mono">
                          ✓ {p}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : activeTab === "matrix" ? (
            <div className="space-y-4">
              <div className="text-xs text-slate-300">
                Detailed Role Authority &amp; Access Control Matrix. Your active session is highlighted:
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-black/40 text-slate-300 border-b border-white/10 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Capability / Action</th>
                      <th className={clsx("py-2.5 px-2.5 text-center font-semibold", role === "admin" && "bg-purple-500/20 text-purple-300")}>
                        Fleet Director {role === "admin" && "(You)"}
                      </th>
                      <th className={clsx("py-2.5 px-2.5 text-center font-semibold", role === "analyst" && "bg-cyan-500/20 text-cyan-300")}>
                        Quantum Analyst {role === "analyst" && "(You)"}
                      </th>
                      <th className={clsx("py-2.5 px-2.5 text-center font-semibold", role === "auditor" && "bg-emerald-500/20 text-emerald-300")}>
                        ESG Auditor {role === "auditor" && "(You)"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {PERMISSIONS_MATRIX.map((row, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3 text-slate-200">
                          <div>{row.feature}</div>
                          <div className="text-[10px] text-slate-500">{row.note}</div>
                        </td>
                        <td className={clsx("py-2.5 px-2.5 text-center font-bold", role === "admin" && "bg-purple-500/10")}>
                          {row.admin ? <span className="text-emerald-400">✓ Full</span> : <span className="text-red-400">✗</span>}
                        </td>
                        <td className={clsx("py-2.5 px-2.5 text-center font-bold", role === "analyst" && "bg-cyan-500/10")}>
                          {row.analyst ? <span className="text-emerald-400">✓ Full</span> : <span className="text-red-400">✗ Blocked</span>}
                        </td>
                        <td className={clsx("py-2.5 px-2.5 text-center font-bold", role === "auditor" && "bg-emerald-500/10")}>
                          {row.auditor ? <span className="text-emerald-400">✓ View</span> : <span className="text-amber-400">🔒 Locked</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCustomLogin} className="space-y-4 max-w-md mx-auto py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin or analyst"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-signal"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-signal"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-lg bg-signal hover:bg-cyan-400 text-navy font-semibold text-sm transition-all duration-200 shadow-glow disabled:opacity-50"
              >
                {isLoading ? "Authenticating…" : "Sign In with Credentials"}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-navy/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Current Session:</span>
            <strong className="text-slate-200">{user?.display_name || "Guest"}</strong>
            <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-white/10 font-mono text-cyan-300">
              {role}
            </span>
          </div>

          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            Sign Out
          </button>
        </div>

      </div>
    </div>
  );
}

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
    email: "eleanor.vance@vates.io",
    icon: Crown,
    color: "text-violet-600",
    borderHover: "hover:border-violet-300 hover:shadow-[0_0_20px_rgba(139,92,246,0.10)]",
    bgGlow: "bg-violet-50 text-violet-700 border-violet-200",
    badge: "Full Authority",
    description: "Full control over fleet assets, routes, fuel prices, scenario deletions, and optimizations.",
    permissions: ["Full CRUD on Vessels & Routes", "Trigger Quantum Optimizations", "Delete Scenarios", "Generate Audit Reports"],
  },
  {
    role: "analyst",
    title: "Quantum Fleet Analyst",
    name: "Dr. Marcus Chen",
    email: "marcus.chen@vates.io",
    icon: Zap,
    color: "text-sky-600",
    borderHover: "hover:border-sky-300 hover:shadow-[0_0_20px_rgba(2,132,199,0.10)]",
    bgGlow: "bg-sky-50 text-sky-700 border-sky-200",
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
    color: "text-emerald-600",
    borderHover: "hover:border-emerald-300 hover:shadow-[0_0_20px_rgba(5,150,105,0.10)]",
    bgGlow: "bg-emerald-50 text-emerald-700 border-emerald-200",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-elevated overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src="/vates-emblem.png"
                alt="VATES Emblem"
                className="h-10 w-10 object-contain drop-shadow-[0_3px_8px_rgba(11,45,79,0.22)]"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <img
                  src="/vates-wordmark.png"
                  alt="VATES"
                  className="h-4.5 w-auto object-contain"
                />
                <span className="text-sm font-bold text-slate-800">
                  Role-Based Access
                </span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                  RBAC Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Switch operational personas or inspect the strict permissions matrix.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-100 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("quick")}
            className={clsx(
              "px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 shrink-0",
              activeTab === "quick"
                ? "bg-sky-50 text-signal border border-sky-200"
                : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            )}
          >
            <Zap className="h-3.5 w-3.5" /> 1-Click Role Switcher
          </button>
          <button
            onClick={() => setActiveTab("matrix")}
            className={clsx(
              "px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 shrink-0",
              activeTab === "matrix"
                ? "bg-sky-50 text-signal border border-sky-200"
                : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Permissions Matrix
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            className={clsx(
              "px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 shrink-0",
              activeTab === "custom"
                ? "bg-sky-50 text-signal border border-sky-200"
                : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            )}
          >
            <User className="h-3.5 w-3.5" /> Enterprise Login
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
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
                      "p-4 rounded-2xl border transition-all duration-200 cursor-pointer relative flex flex-col gap-2.5",
                      isActive
                        ? "bg-sky-50/50 border-sky-300 shadow-sm ring-1 ring-sky-200"
                        : clsx("bg-white border-slate-200 hover:bg-slate-50/50", item.borderHover)
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={clsx("p-2 rounded-xl bg-slate-50 border border-slate-200", item.color)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-800">{item.title}</span>
                            <span className={clsx("text-[10px] font-medium px-2 py-0.5 rounded-full border", item.bgGlow)}>
                              {item.badge}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {item.name} &bull; <span className="text-slate-300">{item.email}</span>
                          </div>
                        </div>
                      </div>

                      {isActive ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-signal bg-sky-50 px-2.5 py-1 rounded-xl border border-sky-200">
                          <CheckCircle2 className="h-4 w-4" /> Active
                        </div>
                      ) : (
                        <button
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-sky-50 hover:text-signal text-xs font-medium text-slate-500 border border-slate-200 transition-colors flex items-center gap-1"
                        >
                          Switch <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                      {item.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {item.permissions.map((p) => (
                        <span key={p} className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-50 text-slate-500 border border-slate-200 font-mono">
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
              <div className="text-xs text-slate-500">
                Detailed Role Authority &amp; Access Control Matrix. Your active session is highlighted:
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Capability / Action</th>
                      <th className={clsx("py-2.5 px-2.5 text-center font-semibold", role === "admin" && "bg-violet-50 text-violet-700")}>
                        Fleet Director {role === "admin" && "(You)"}
                      </th>
                      <th className={clsx("py-2.5 px-2.5 text-center font-semibold", role === "analyst" && "bg-sky-50 text-sky-700")}>
                        Quantum Analyst {role === "analyst" && "(You)"}
                      </th>
                      <th className={clsx("py-2.5 px-2.5 text-center font-semibold", role === "auditor" && "bg-emerald-50 text-emerald-700")}>
                        ESG Auditor {role === "auditor" && "(You)"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PERMISSIONS_MATRIX.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 text-slate-700">
                          <div>{row.feature}</div>
                          <div className="text-[10px] text-slate-300">{row.note}</div>
                        </td>
                        <td className={clsx("py-2.5 px-2.5 text-center font-bold", role === "admin" && "bg-violet-50/50")}>
                          {row.admin ? <span className="text-emerald-600">✓ Full</span> : <span className="text-red-500">✗</span>}
                        </td>
                        <td className={clsx("py-2.5 px-2.5 text-center font-bold", role === "analyst" && "bg-sky-50/50")}>
                          {row.analyst ? <span className="text-emerald-600">✓ Full</span> : <span className="text-red-500">✗ Blocked</span>}
                        </td>
                        <td className={clsx("py-2.5 px-2.5 text-center font-bold", role === "auditor" && "bg-emerald-50/50")}>
                          {row.auditor ? <span className="text-emerald-600">✓ View</span> : <span className="text-amber-500">🔒 Locked</span>}
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
                <label className="text-xs font-medium text-slate-600">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-300" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. admin or analyst"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-signal focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-300" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-signal focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-signal hover:bg-sky-600 text-white font-semibold text-sm transition-all duration-200 shadow-sm disabled:opacity-50"
              >
                {isLoading ? "Authenticating…" : "Sign In with Credentials"}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Current Session:</span>
            <strong className="text-slate-700">{user?.display_name || "Guest"}</strong>
            <span className="uppercase text-[9px] px-1.5 py-0.5 rounded-full bg-sky-50 font-mono text-sky-600 border border-sky-200">
              {role}
            </span>
          </div>

          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            Sign Out
          </button>
        </div>

      </div>
    </div>
  );
}

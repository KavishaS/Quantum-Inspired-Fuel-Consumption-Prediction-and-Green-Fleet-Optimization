import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Gauge, Compass, FlaskConical, GitBranch, BarChart3,
  ShieldCheck, Ship, FolderKanban, Info, Waves, CircleDot, MapPin,
  Crown, Zap, ChevronDown, FileText, PieChart, Sliders
} from "lucide-react";

import { getHealth } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { LoginModal } from "@/components/auth/LoginModal";

const NAV = [
  { to: "/", label: "Executive Dashboard", icon: LayoutDashboard, end: true },
  { to: "/predictor", label: "Fuel Predictor", icon: Gauge },
  { to: "/optimizer", label: "Fleet Optimizer", icon: Compass },
  { to: "/what-if", label: "What-If Simulator", icon: Sliders },
  { to: "/sandbox", label: "Alternative Fuel Sandbox", icon: FlaskConical },
  { to: "/pareto", label: "Pareto Explorer", icon: GitBranch },
  { to: "/benchmark", label: "Benchmarking", icon: BarChart3 },
  { to: "/compliance", label: "Compliance & Reports", icon: ShieldCheck },
  { to: "/fleet", label: "Fleet Master", icon: Ship },
  { to: "/contracts", label: "Port Contracts", icon: FileText, badge: "SCENARIO" },
  { to: "/analytics", label: "Fleet Analytics", icon: PieChart },
  { to: "/scenarios", label: "Scenario Manager", icon: FolderKanban },
  { to: "/live-map", label: "Live Fleet Map", icon: MapPin, badge: "LIVE" },
  { to: "/about", label: "About / Methodology", icon: Info },
];


export function Layout() {
  const location = useLocation();
  const isLiveMap = location.pathname === "/live-map";
  const [status, setStatus] = useState<"checking" | "ok" | "down">("checking");
  const [datasetSeeded, setDatasetSeeded] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const { isAuditor } = useAuth();

  useEffect(() => {
    let alive = true;
    getHealth()
      .then((h) => {
        if (!alive) return;
        setStatus(h.status === "ok" ? "ok" : "down");
        setDatasetSeeded(h.dataset === "seeded");
        setModelReady(h.ml_model === "trained");
      })
      .catch(() => alive && setStatus("down"));
    return () => { alive = false; };
  }, []);

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 bg-navy/90 backdrop-blur-md border-r border-slate-line/50 text-white flex flex-col z-20">
        <div className="px-6 py-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-signal/10 text-signal shadow-glow">
              <Waves className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <span className="font-display text-[16px] font-bold tracking-wide">GREENFLEET</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
            Quantum-Inspired Fuel Prediction &amp; Green Fleet Optimization
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={(item as any).end}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-200",
                  isActive
                    ? "bg-signal/15 text-signal shadow-[inset_2px_0_0_0_#06B6D4]"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span className="flex-1">{item.label}</span>
              {(item as any).badge && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 leading-none">
                  {(item as any).badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/5 px-6 py-5 text-[11px] text-slate-400 space-y-2 bg-black/10">
          <div className="flex items-center justify-between">
            <span>System</span>
            <StatusDot ok={status === "ok"} pending={status === "checking"} />
          </div>
          <div className="flex items-center justify-between">
            <span>Dataset</span>
            <span className={datasetSeeded ? "text-positive" : "text-warn"}>{datasetSeeded ? "seeded" : "empty"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Optimization engine</span>
            <span className="text-positive">ready</span>
          </div>
          <div className="flex items-center justify-between">
            <span>ML model</span>
            <span className={modelReady ? "text-positive" : "text-warn"}>{modelReady ? "trained" : "not trained"}</span>
          </div>
          <div className="pt-3 mt-3 border-t border-white/5 text-white/30 text-[10px]">
            Classical hardware · quantum-inspired algorithms
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        <TopBar onOpenLogin={() => setIsLoginOpen(true)} />
        {isAuditor && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-8 py-2 text-xs text-emerald-300 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                <strong>ESG Auditor View:</strong> You have read-only compliance verification authority.
              </span>
            </div>
            <button
              onClick={() => setIsLoginOpen(true)}
              className="text-emerald-200 underline hover:text-white transition-colors"
            >
              Switch Role
            </button>
          </div>
        )}
        <main className={clsx("flex-1 relative z-0", isLiveMap ? "overflow-hidden h-full p-0" : "overflow-y-auto bg-transparent")}>
          {isLiveMap ? (
            <Outlet />
          ) : (
            <div className="max-w-[1400px] mx-auto px-8 py-8 animate-fade-in-up">
              <Outlet />
            </div>
          )}
        </main>
      </div>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}

function StatusDot({ ok, pending }: { ok: boolean; pending: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <CircleDot className={clsx("h-2.5 w-2.5", pending ? "text-slate-500" : ok ? "text-positive animate-pulse-slow shadow-[0_0_8px_rgba(16,185,129,0.4)] rounded-full" : "text-danger")} />
      {pending ? "checking" : ok ? "online" : "offline"}
    </span>
  );
}

function TopBar({ onOpenLogin }: { onOpenLogin: () => void }) {
  const { user, role } = useAuth();
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const roleConfig = {
    admin: { label: "Fleet Director", color: "from-purple-500 to-indigo-600", text: "text-purple-300", bg: "bg-purple-500/15 border-purple-500/30", Icon: Crown },
    analyst: { label: "Quantum Analyst", color: "from-cyan-500 to-blue-600", text: "text-cyan-300", bg: "bg-cyan-500/15 border-cyan-500/30", Icon: Zap },
    auditor: { label: "ESG Auditor", color: "from-emerald-500 to-teal-600", text: "text-emerald-300", bg: "bg-emerald-500/15 border-emerald-500/30", Icon: ShieldCheck },
  }[role] || { label: "Analyst", color: "from-signal to-blue-600", text: "text-signal", bg: "bg-signal/15 border-signal/30", Icon: Zap };

  const initials = user?.display_name
    ? user.display_name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
    : "FA";

  const RoleIcon = roleConfig.Icon;

  return (
    <header className="h-16 shrink-0 border-b border-slate-line/50 glass-panel flex items-center justify-between px-8 sticky top-0 z-10">
      <div className="text-[13px] font-medium text-slate-400">{today}</div>
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenLogin}
          className="flex items-center gap-3 px-3 py-1.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-left group"
          title="Click to switch role or view credentials"
        >
          <div className="text-right">
            <div className="text-[13px] font-semibold text-slate-100 group-hover:text-signal transition-colors flex items-center gap-1.5 justify-end">
              {user?.display_name || "Fleet Officer"}
              <ChevronDown className="h-3 w-3 text-slate-400 group-hover:text-signal transition-colors" />
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className={clsx("text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1", roleConfig.bg, roleConfig.text)}>
                <RoleIcon className="h-2.5 w-2.5" /> {roleConfig.label}
              </span>
            </div>
          </div>
          <div className={clsx("h-9 w-9 rounded-full bg-gradient-to-br text-white flex items-center justify-center text-xs font-bold font-display shadow-glow", roleConfig.color)}>
            {initials}
          </div>
        </button>
      </div>
    </header>
  );
}

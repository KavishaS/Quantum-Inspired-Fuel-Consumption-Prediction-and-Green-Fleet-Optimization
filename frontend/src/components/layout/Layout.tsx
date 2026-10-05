import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Gauge, Compass, FlaskConical, GitBranch, BarChart3,
  ShieldCheck, Ship, FolderKanban, Info, Waves, CircleDot, MapPin,
  Crown, Zap, ChevronDown, FileText, PieChart, Sliders, Menu, X
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuditor } = useAuth();

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "fixed lg:relative z-40 w-72 lg:w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col h-full transition-transform duration-300 lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3.5 group">
              <div className="relative shrink-0">
                <img
                  src="/vates-emblem.png"
                  alt="VATES Emblem"
                  className="h-14 w-14 object-contain drop-shadow-[0_6px_16px_rgba(11,45,79,0.30)] transition-all duration-300 group-hover:scale-105 group-hover:drop-shadow-[0_8px_20px_rgba(2,132,199,0.45)]"
                />
              </div>
              <div className="flex flex-col items-center justify-center">
                <img
                  src="/vates-wordmark.png"
                  alt="VATES"
                  className="h-[23px] w-auto object-contain drop-shadow-[0_1px_2px_rgba(11,45,79,0.15)] transition-transform duration-300 group-hover:scale-105"
                />
                <span className="text-[9.5px] font-bold tracking-[0.18em] text-sky-700/90 uppercase mt-1 font-brand text-center w-full pl-[0.18em]">
                  Quantum Fleet
                </span>
              </div>
            </Link>
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={(item as any).end}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-200",
                  isActive
                    ? "bg-sky-50 text-signal font-semibold shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span className="flex-1">{item.label}</span>
              {(item as any).badge && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-signal border border-sky-200 leading-none">
                  {(item as any).badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 px-5 py-4 text-[11px] text-slate-400 space-y-2 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <span>System</span>
            <StatusDot ok={status === "ok"} pending={status === "checking"} />
          </div>
          <div className="flex items-center justify-between">
            <span>Dataset</span>
            <span className={datasetSeeded ? "text-positive font-medium" : "text-warn font-medium"}>{datasetSeeded ? "seeded" : "empty"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Optimization engine</span>
            <span className="text-positive font-medium">ready</span>
          </div>
          <div className="flex items-center justify-between">
            <span>ML model</span>
            <span className={modelReady ? "text-positive font-medium" : "text-warn font-medium"}>{modelReady ? "trained" : "not trained"}</span>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-200 text-slate-300 text-[10px]">
            Classical hardware · quantum-inspired algorithms
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        <TopBar onOpenLogin={() => setIsLoginOpen(true)} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        {isAuditor && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 sm:px-8 py-2 text-xs text-emerald-700 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <strong>ESG Auditor View:</strong> You have read-only compliance verification authority.
              </span>
            </div>
            <button
              onClick={() => setIsLoginOpen(true)}
              className="text-emerald-600 underline hover:text-emerald-800 transition-colors"
            >
              Switch Role
            </button>
          </div>
        )}
        <main className={clsx("flex-1 relative z-0", isLiveMap ? "overflow-hidden h-full p-0" : "overflow-y-auto bg-foam")}>
          {isLiveMap ? (
            <Outlet />
          ) : (
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-in-up">
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
      <CircleDot className={clsx("h-2.5 w-2.5", pending ? "text-slate-300" : ok ? "text-positive animate-pulse-slow" : "text-danger")} />
      <span className="font-medium">{pending ? "checking" : ok ? "online" : "offline"}</span>
    </span>
  );
}

function TopBar({ onOpenLogin, onToggleSidebar }: { onOpenLogin: () => void; onToggleSidebar: () => void }) {
  const { user, role } = useAuth();
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const roleConfig = {
    admin: { label: "Fleet Director", color: "from-violet-500 to-purple-600", text: "text-violet-700", bg: "bg-violet-50 border-violet-200", Icon: Crown },
    analyst: { label: "Quantum Analyst", color: "from-sky-500 to-blue-600", text: "text-sky-700", bg: "bg-sky-50 border-sky-200", Icon: Zap },
    auditor: { label: "ESG Auditor", color: "from-emerald-500 to-teal-600", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", Icon: ShieldCheck },
  }[role] || { label: "Analyst", color: "from-sky-500 to-blue-600", text: "text-signal", bg: "bg-sky-50 border-sky-200", Icon: Zap };

  const initials = user?.display_name
    ? user.display_name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
    : "FA";

  const RoleIcon = roleConfig.Icon;

  return (
    <header className="h-16 shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-4 sm:px-8 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
          onClick={onToggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="lg:hidden flex items-center gap-2">
          <img
            src="/vates-emblem.png"
            alt="VATES Emblem"
            className="h-8 w-8 object-contain drop-shadow-[0_2px_8px_rgba(11,45,79,0.25)]"
          />
          <img
            src="/vates-wordmark.png"
            alt="VATES"
            className="h-4.5 w-auto object-contain"
          />
        </div>
        <div className="text-[13px] font-medium text-slate-400 hidden sm:block">{today}</div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenLogin}
          className="flex items-center gap-3 px-3 py-1.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all text-left group"
          title="Click to switch role or view credentials"
        >
          <div className="text-right">
            <div className="text-[13px] font-semibold text-slate-700 group-hover:text-signal transition-colors flex items-center gap-1.5 justify-end">
              {user?.display_name || "Fleet Officer"}
              <ChevronDown className="h-3 w-3 text-slate-400 group-hover:text-signal transition-colors" />
            </div>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className={clsx("text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1", roleConfig.bg, roleConfig.text)}>
                <RoleIcon className="h-2.5 w-2.5" /> {roleConfig.label}
              </span>
            </div>
          </div>
          <div className={clsx("h-9 w-9 rounded-full bg-gradient-to-br text-white flex items-center justify-center text-xs font-bold font-display shadow-soft", roleConfig.color)}>
            {initials}
          </div>
        </button>
      </div>
    </header>
  );
}

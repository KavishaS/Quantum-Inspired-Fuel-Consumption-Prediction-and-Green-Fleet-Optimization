import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import clsx from "clsx";

export interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: { value: string; positive: boolean } | null;
  tone?: "default" | "positive" | "warn" | "danger";
  hint?: string;
}

const toneRing: Record<string, string> = {
  default: "text-signal bg-sky-50",
  positive: "text-positive bg-emerald-50",
  warn: "text-warn bg-amber-50",
  danger: "text-danger bg-red-50",
};

export function KpiCard({ label, value, icon: Icon, delta, tone = "default", hint }: KpiCardProps) {
  return (
    <div className="bg-white p-5 flex flex-col gap-2 min-w-0 rounded-2xl border border-slate-200/90 shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        <div className={clsx("p-2 rounded-xl", toneRing[tone])}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
      </div>
      <div className="font-display text-2xl sm:text-3xl font-bold text-slate-800 tabular truncate">{value}</div>
      {delta && (
        <div className={clsx("flex items-center gap-1.5 text-xs font-semibold",
          delta.positive ? "text-positive" : "text-danger")}>
          {delta.positive ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          {delta.value}
        </div>
      )}
      {hint && !delta && (
        <div className="text-[11px] text-slate-400 font-medium truncate">{hint}</div>
      )}
    </div>
  );
}

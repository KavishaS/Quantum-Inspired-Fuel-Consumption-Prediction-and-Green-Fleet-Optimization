import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import clsx from "clsx";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: { value: string; positive: boolean } | null;
  tone?: "default" | "positive" | "warn" | "danger";
}

const toneRing: Record<string, string> = {
  default: "text-signal",
  positive: "text-positive",
  warn: "text-warn",
  danger: "text-danger",
};

export function KpiCard({ label, value, icon: Icon, delta, tone = "default" }: KpiCardProps) {
  return (
    <div className="glass-panel p-5 flex flex-col gap-3 min-w-0 rounded-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-body uppercase tracking-widest">{label}</span>
        <div className={clsx("p-2 rounded-lg bg-white/5", toneRing[tone])}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
      </div>
      <div className="font-display text-3xl font-bold text-slate-ink tabular truncate">{value}</div>
      {delta && (
        <div className={clsx("flex items-center gap-1.5 text-xs font-semibold",
          delta.positive ? "text-positive" : "text-danger")}>
          {delta.positive ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          {delta.value}
        </div>
      )}
    </div>
  );
}

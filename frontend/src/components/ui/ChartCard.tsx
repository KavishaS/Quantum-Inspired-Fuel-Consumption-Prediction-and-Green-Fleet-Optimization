import type { ReactNode } from "react";

export function ChartCard({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-ink">{title}</h3>
          {subtitle && <p className="text-xs text-slate-body mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

import { AlertTriangle, Compass, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-10 justify-center text-slate-body text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}…
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center px-6">
      <Compass className="h-7 w-7 text-slate-line" strokeWidth={1.5} />
      <h3 className="font-display text-sm font-semibold text-slate-ink">{title}</h3>
      {body && <p className="text-sm text-slate-body max-w-sm">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body, action }: {
  title?: string; body?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center px-6 border border-danger/20 bg-danger/5">
      <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.75} />
      <h3 className="font-display text-sm font-semibold text-slate-ink">{title}</h3>
      {body && <p className="text-sm text-slate-body max-w-md">{body}</p>}
      {action}
    </div>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full bg-slate-line overflow-hidden">
      <div className="h-full bg-signal transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

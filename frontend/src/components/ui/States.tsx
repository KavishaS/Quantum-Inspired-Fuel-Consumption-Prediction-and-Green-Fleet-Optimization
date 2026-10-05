import { AlertTriangle, Compass, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-10 justify-center text-slate-400 text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}…
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center px-6">
      <Compass className="h-7 w-7 text-slate-300" strokeWidth={1.5} />
      <h3 className="font-display text-sm font-semibold text-slate-700">{title}</h3>
      {body && <p className="text-sm text-slate-400 max-w-sm">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", body, action }: {
  title?: string; body?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center px-6 border border-red-200 bg-red-50 rounded-2xl">
      <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.75} />
      <h3 className="font-display text-sm font-semibold text-slate-700">{title}</h3>
      {body && <p className="text-sm text-slate-500 max-w-md">{body}</p>}
      {action}
    </div>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full bg-signal rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

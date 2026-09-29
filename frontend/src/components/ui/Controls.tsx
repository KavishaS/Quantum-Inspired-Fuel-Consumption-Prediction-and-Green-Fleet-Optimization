import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import clsx from "clsx";

export function Button({ variant = "primary", className, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm",
        variant === "primary" && "bg-signal text-navy-deep hover:bg-sky-400 hover:shadow-glow",
        variant === "secondary" && "bg-white/5 border border-slate-line/50 text-slate-ink hover:bg-white/10",
        variant === "ghost" && "text-slate-body hover:bg-white/5 hover:text-white shadow-none",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-slate-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-body">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "rounded-lg border border-slate-line/50 px-3 py-2 text-sm text-slate-ink bg-navy-50/50",
        "focus:border-signal focus:outline-none focus:ring-1 focus:ring-signal/50 transition-colors",
        props.className,
      )}
    />
  );
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "rounded-lg border border-slate-line/50 px-3 py-2 text-sm text-slate-ink bg-navy-50/50",
        "focus:border-signal focus:outline-none focus:ring-1 focus:ring-signal/50 transition-colors",
        props.className,
      )}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm font-medium text-slate-ink"
      aria-pressed={checked}
    >
      <span className={clsx("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-signal" : "bg-slate-line")}>
        <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
          checked ? "translate-x-4.5" : "translate-x-0.5")} />
      </span>
      {label}
    </button>
  );
}

export function SectionLabel(props: LabelHTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={clsx("text-[11px] font-bold text-slate-body tracking-wider uppercase mb-2", props.className)} />;
}

import clsx from "clsx";

type Tone = "ok" | "warn" | "danger" | "neutral" | "info";

const styles: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-slate-50 text-slate-500 border-slate-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
};

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 border px-2.5 py-0.5 text-xs font-medium rounded-full", styles[tone])}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", {
        "bg-emerald-500": tone === "ok", "bg-amber-500": tone === "warn", "bg-red-500": tone === "danger",
        "bg-slate-400": tone === "neutral", "bg-sky-500": tone === "info",
      })} />
      {label}
    </span>
  );
}

export function complianceTone(status: string): Tone {
  if (status === "Compliant") return "ok";
  if (status === "Attention Required") return "warn";
  if (status === "Above Target") return "danger";
  return "neutral";
}

import clsx from "clsx";

type Tone = "ok" | "warn" | "danger" | "neutral" | "info";

const styles: Record<Tone, string> = {
  ok: "bg-positive/10 text-positive border-positive/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  neutral: "bg-slate-line/40 text-slate-body border-slate-line",
  info: "bg-signal/10 text-steel border-signal/25",
};

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium", styles[tone])}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", {
        "bg-positive": tone === "ok", "bg-warn": tone === "warn", "bg-danger": tone === "danger",
        "bg-slate-body": tone === "neutral", "bg-steel": tone === "info",
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

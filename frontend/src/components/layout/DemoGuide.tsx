import { useState } from "react";
import { Compass, X } from "lucide-react";
import { Link } from "react-router-dom";

const STEPS: { label: string; to: string }[] = [
  { label: "Load Demo Scenario", to: "/scenarios" },
  { label: "Predict Fuel Consumption", to: "/predictor" },
  { label: "Optimize Fleet", to: "/optimizer" },
  { label: "View Recommended Fleet", to: "/optimizer" },
  { label: "Compare QGA/QPSO vs Classical", to: "/benchmark" },
  { label: "Explore Alternative Fuels", to: "/sandbox" },
  { label: "View Pareto Front", to: "/pareto" },
  { label: "Generate PDF Report", to: "/compliance" },
];

export function DemoGuide() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-signal text-white px-4 py-2.5 text-sm font-medium rounded-xl shadow-lg hover:bg-sky-600 transition-colors"
      >
        <Compass className="h-4 w-4" /> Demo Guide
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-72 bg-white rounded-2xl shadow-elevated border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <span className="text-sm font-display font-semibold text-slate-700">Judge Demo Flow</span>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="h-4 w-4" /></button>
      </div>
      <ol className="p-3 flex flex-col gap-1">
        {STEPS.map((s, i) => (
          <Link key={i} to={s.to} onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-2 py-2 text-sm text-slate-700 hover:bg-sky-50 rounded-xl transition-colors">
            <span className="h-5 w-5 rounded-full bg-sky-50 text-signal text-[11px] font-semibold flex items-center justify-center shrink-0 border border-sky-200">
              {i + 1}
            </span>
            {s.label}
          </Link>
        ))}
      </ol>
    </div>
  );
}

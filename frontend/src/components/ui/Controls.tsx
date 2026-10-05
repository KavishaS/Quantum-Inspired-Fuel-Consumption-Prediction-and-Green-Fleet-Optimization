import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import clsx from "clsx";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "emerald";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed select-none",
        size === "sm" && "px-3 py-1.5 rounded-lg text-xs",
        size === "md" && "px-4 py-2.5 rounded-xl text-sm",
        size === "lg" && "px-5 py-3 rounded-xl text-base shadow-md",
        variant === "primary" &&
          "bg-gradient-to-r from-sky-600 to-cyan-600 text-white hover:from-sky-700 hover:to-cyan-700 shadow-sm hover:shadow-md active:scale-[0.98]",
        variant === "emerald" &&
          "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-sm hover:shadow-md active:scale-[0.98]",
        variant === "secondary" &&
          "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs active:scale-[0.98]",
        variant === "ghost" &&
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-none",
        variant === "danger" &&
          "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 shadow-xs",
        className
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  badge,
  children,
  className,
}: {
  label: string;
  hint?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("flex flex-col gap-1.5 text-sm", className)}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-xs text-slate-700 tracking-wide uppercase">{label}</span>
        {badge}
      </div>
      {children}
      {hint && <span className="text-[11px] text-slate-500 leading-tight">{hint}</span>}
    </label>
  );
}

export function Input({
  prefix,
  suffix,
  className,
  wrapperClassName,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  prefix?: ReactNode;
  suffix?: ReactNode;
  wrapperClassName?: string;
}) {
  if (prefix || suffix) {
    return (
      <div
        className={clsx(
          "flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-xs transition-all duration-200",
          "focus-within:border-sky-500 focus-within:ring-4 focus-within:ring-sky-500/10 hover:border-slate-300",
          wrapperClassName
        )}
      >
        {prefix && <span className="mr-2 text-slate-400 shrink-0">{prefix}</span>}
        <input
          {...props}
          className={clsx(
            "w-full bg-transparent text-slate-800 placeholder:text-slate-400 focus:outline-none text-sm font-medium",
            className
          )}
        />
        {suffix && (
          <span className="ml-2 text-xs font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
            {suffix}
          </span>
        )}
      </div>
    );
  }

  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 bg-white shadow-xs",
        "focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-500/10 hover:border-slate-300 transition-all duration-200",
        "placeholder:text-slate-400 font-medium",
        className
      )}
    />
  );
}

export function Select({ children, className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select
        {...props}
        className={clsx(
          "w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-8 text-sm font-medium text-slate-800 shadow-xs",
          "focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-500/10 hover:border-slate-300 transition-all duration-200 cursor-pointer",
          className
        )}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
        <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </div>
    </div>
  );
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { label: string; value: T; icon?: ReactNode; badge?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx("flex p-1 bg-slate-100 rounded-xl gap-1 border border-slate-200 shadow-inner", className)}>
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all duration-150",
              isSelected
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            )}
          >
            {opt.icon && <span className={clsx("shrink-0", isSelected ? "text-sky-600" : "text-slate-400")}>{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
            {opt.badge && (
              <span
                className={clsx(
                  "text-[9px] px-1 py-0.2 rounded font-mono font-normal",
                  isSelected ? "bg-sky-100 text-sky-800" : "bg-slate-200 text-slate-600"
                )}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className="flex flex-col gap-2 p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 hover:border-slate-300 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-16 text-right font-mono font-bold text-xs text-slate-900 focus:outline-none"
          />
          {unit && <span className="text-[11px] font-semibold text-slate-500 font-sans">{unit}</span>}
        </div>
      </div>

      <div className="relative flex items-center py-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-600 focus:outline-none"
          style={{
            background: `linear-gradient(to right, #0284c7 0%, #0284c7 ${percentage}%, #e2e8f0 ${percentage}%, #e2e8f0 100%)`,
          }}
        />
      </div>

      <div className="flex justify-between items-center text-[10px] text-slate-600 font-mono">
        <span>
          {min} {unit}
        </span>
        {hint && <span className="text-slate-500 font-sans">{hint}</span>}
        <span>
          {max} {unit}
        </span>
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 text-left w-full p-2.5 rounded-xl hover:bg-slate-50 transition-colors"
      aria-pressed={checked}
    >
      <span
        className={clsx(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none mt-0.5",
          checked ? "bg-sky-600" : "bg-slate-200"
        )}
      >
        <span
          className={clsx(
            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </span>
      <div className="flex flex-col">
        <span className="text-xs font-bold text-slate-800">{label}</span>
        {description && <span className="text-[11px] text-slate-500 leading-tight">{description}</span>}
      </div>
    </button>
  );
}

export function SectionLabel(props: LabelHTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={clsx(
        "text-[11px] font-extrabold text-slate-500 tracking-wider uppercase flex items-center gap-2",
        props.className
      )}
    />
  );
}

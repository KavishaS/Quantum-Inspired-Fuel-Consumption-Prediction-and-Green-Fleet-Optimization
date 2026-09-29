export const fmtNum = (n: number | null | undefined, digits = 0): string =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const fmtUsd = (n: number | null | undefined, digits = 0): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : `$${fmtNum(n, digits)}`;

export const fmtPct = (n: number | null | undefined, digits = 1, signed = false): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const s = signed && n > 0 ? "+" : "";
  return `${s}${fmtNum(n, digits)}%`;
};

export const fmtCompactUsd = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return fmtUsd(n);
};

export const titleCase = (s: string): string =>
  s.toLowerCase().replace(/(^|\s|_)\w/g, (c) => c.toUpperCase()).replace(/_/g, " ");

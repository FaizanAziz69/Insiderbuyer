import { formatCurrency } from "@/lib/api";

/** Percent with optional leading "+", or an em dash for a missing value. */
export function pct(v: number | null, withSign = false, dp = 2): string {
  if (v == null) return "—";
  const s = withSign && v > 0 ? "+" : "";
  return `${s}${v.toFixed(dp)}%`;
}

/** Green at or above zero, red below, muted when missing. */
export const signColor = (v: number | null): string =>
  v == null ? "var(--text-mute)" : v >= 0 ? "var(--good)" : "var(--bad)";

/** Signed compact dollars: +$1.20M / −$340.00K / — */
export function signedMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (v === 0) return "$0";
  return `${v > 0 ? "+" : "−"}${formatCurrency(Math.abs(v))}`;
}

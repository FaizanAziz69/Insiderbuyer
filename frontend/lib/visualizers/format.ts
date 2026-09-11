/** Formatting shared by every panel and bubble label in the suite. */

export function fmtUsd(v: number | null | undefined, dp?: number): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(dp ?? 2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(dp ?? (a >= 1e10 ? 1 : 2))}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(dp ?? (a >= 1e7 ? 0 : 1))}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(dp ?? 0)}K`;
  return `${sign}$${a.toFixed(dp ?? 0)}`;
}

export function fmtNum(v: number | null | undefined, dp = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: dp });
}

export function fmtPct(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '' : ''}${v.toFixed(dp)}%`;
}

/** 0.185 → "19%" — prediction-market prices read as probabilities. */
export function fmtProb(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const pct = v * 100;
  return `${pct < 1 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "4s ago" / "12m ago" — the trades feed and the freshness stamps. */
export function agoLabel(tsMs: number): string {
  const s = Math.max(0, Math.round((Date.now() - tsMs) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Days between now and a date, floor'd — the catalyst countdowns. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function countdownLabel(days: number | null): string {
  if (days == null) return '—';
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days}d`;
}

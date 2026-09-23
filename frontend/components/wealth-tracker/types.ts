/** Shapes served by /api/backend/wealth-tracker/* (Brief v7 Build 1). */
export type BadgeKey = "TOP_PERFORMER" | "HOT_HAND" | "SHARPSHOOTER" | "HIGH_VOLUME" | "FAST_FILER" | "GOLD_GRADE";
export type Grade = "A+" | "A" | "B+" | "B" | "C+" | "C";

export interface WtMember {
  bioguide: string;
  name: string;
  displayName: string;
  slug: string;
  party: "D" | "R" | "I" | null;
  chamber: "House" | "Senate";
  state: string | null;
  district: string | null;
  age: number | null;
  ageBracket: string | null;
  current: boolean;
  trackedSince: string | null;
  photoUrl: string | null;
}

export interface WtStats {
  value: number;
  invested: number;
  realized: number;
  unrealized: number;
  retAll: number | null;
  ret90d: number | null;
  retYtd: number | null;
  ret7d: number | null;
  benchAll: number | null;
  bench90d: number | null;
  benchYtd: number | null;
  wowChange: number | null;
  hitRate: number | null;
  hitSample: number;
  tradesTotal: number;
  trades12m: number;
  buysTotal: number;
  pricedTrades: number;
  lastTrade: string | null;
  avgLagDays: number | null;
  holdings: number;
  qualifies: boolean;
  grade: Grade | null;
  badges: BadgeKey[];
  topHoldings: Array<{ ticker: string; name: string; value: number }>;
  unpricedBuys: number;
  computedAt: string;
}

export interface WtLeaderboardRow {
  rank: number;
  member: WtMember;
  stats: WtStats;
  metric: number | null;
}

export interface WtLeaderboard {
  view: string;
  total: number;
  rows: WtLeaderboardRow[];
  frame: string;
  estimateNote: string;
  badgeMeta: Record<BadgeKey, { label: string; description: string }>;
  minTrades: number;
  computedAt: string | null;
  membersTracked: number;
}

export interface WtHolding {
  ticker: string;
  name: string;
  sector: string | null;
  shares: number;
  costBasis: number;
  avgCost: number;
  price: number;
  priceAsOf: string;
  value: number;
  unrealized: number;
  unrealizedPct: number | null;
  realized: number;
  buys: number;
  sells: number;
  firstBought: string | null;
  lastAction: string | null;
  status: "live" | "stale";
}

export interface WtMemberPayload {
  member: WtMember | null;
  stats: WtStats | null;
  holdings: WtHolding[];
  holdingsTotal: number;
  holdingsFree: number;
  holdingsLocked: boolean;
  curve: Array<{ t: number; v: number; s: number; b: number }>;
  benchmark: string;
  frame: string;
  estimateNote: string;
  badgeMeta: Record<BadgeKey, { label: string; description: string }>;
  premium?: boolean;
}

export const VIEWS: Array<{ key: string; label: string; short: string; metricLabel: string; kind: "pct" | "count" | "money" }> = [
  { key: "growth90d", label: "Growing fastest right now", short: "90-day growth", metricLabel: "90d est. return", kind: "pct" },
  { key: "ytd", label: "Year to date", short: "YTD", metricLabel: "YTD est. return", kind: "pct" },
  { key: "alltime", label: "Most successful all-time", short: "All-time", metricLabel: "Est. return since tracked", kind: "pct" },
  { key: "hitrate", label: "Best trade hit rate", short: "Hit rate", metricLabel: "Buys profitable", kind: "pct" },
  { key: "active", label: "Most active", short: "Most active", metricLabel: "Trades, 12 months", kind: "count" },
  { key: "movers", label: "Biggest movers this week", short: "Movers", metricLabel: "Est. value change, 7 days", kind: "money" },
];

export function partyMeta(p: string | null | undefined) {
  const c = (p || "").charAt(0).toUpperCase();
  if (c === "D") return { label: "Democrat", color: "#1e40af", soft: "rgba(30,64,175,0.12)" };
  if (c === "R") return { label: "Republican", color: "#b91c1c", soft: "rgba(185,28,28,0.12)" };
  if (c === "I") return { label: "Independent", color: "#7c3aed", soft: "rgba(124,58,237,0.12)" };
  return { label: "—", color: "var(--text-mute)", soft: "var(--bg-3)" };
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function signedMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const s = abs >= 999.995e6 ? `$${(abs / 1e9).toFixed(2)}B` : abs >= 999.995e3 ? `$${(abs / 1e6).toFixed(2)}M` : abs >= 999.995 ? `$${(abs / 1e3).toFixed(1)}K` : `$${Math.round(abs)}`;
  return `${v < 0 ? "−" : "+"}${s}`;
}

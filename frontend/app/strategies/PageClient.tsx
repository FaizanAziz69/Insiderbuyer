"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { API_BASE } from "@/lib/api";
import { usePremiumSWR } from "@/lib/premium-fetch";
import { usePremium } from "@/components/premium/PremiumContext";
import { PaywallOverlay } from "@/components/PaywallOverlay";
import { decoyCardFigures, decoyWalk } from "@/components/strategies/decoy";
import { Landmark, TrendingUp, Megaphone, FileText, Briefcase, Layers } from "lucide-react";
import { RecordBadge, type RecordType } from "@/components/strategies/RecordBadge";
import { Sparkline } from "@/components/strategies/Sparkline";

/**
 * Brief v8 §5.1 — the strategies index.
 *
 * Faizan 2026-09-29: "paygate this page". The API now deletes every figure
 * from a guest's payload (backend strategies/gating.ts) — the library sits
 * behind the site's one paywall overlay, drawn over decoy cards, while the
 * header and the internal-portfolio panel stay in the open. The card's free
 * fields (name, dataset, cadence, record badge, start date) are real; the
 * numbers and sparkline under the blur are seeded stand-ins, never data.
 */

type Card = {
  slug: string;
  name: string;
  dataset: string;
  version: string;
  rebalanceDays: number;
  rulesPlain: string;
  recordType: RecordType;
  startDate: string | null;
  spark: Array<{ v: number; b: number }>;
  cagr?: number | null;
  sortino?: number | null;
  maxDrawdown?: number | null;
  totalReturn?: number | null;
  benchmarkTotalReturn?: number | null;
  return1y?: number | null;
  thin: boolean;
};

/** Everything the reader pays for on this page, in the wall's own words. */
const STRATEGY_BULLETS = [
  "Every strategy's full record — CAGR, Sortino, drawdown and 1-year return",
  "The equity curve against the S&P 500, Russell 2000 and a 60/20/20 blend",
  "Current holdings with weights and entry dates, exportable to CSV",
  "Every rebalance the engine has made, with the trigger for each",
];

/** §5.1's dataset icon — one per filter category, so a card is placeable at a glance. */
const DATASET_ICON: Record<string, any> = {
  Congress: Landmark,
  Insiders: TrendingUp,
  Lobbying: Megaphone,
  Contracts: FileText,
  Funds: Briefcase,
  Sector: Layers,
};

const pct = (v: number | null | undefined, digits = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
const num = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);

const CADENCE = (d: number) =>
  d <= 7 ? "Weekly" : d <= 31 ? "Monthly" : d <= 95 ? "Quarterly" : `${d}-day`;

type SortKey = "sortino" | "cagr" | "maxDrawdown" | "return1y";

export default function PageClient() {
  // The read carries the bearer token when signed in, so a subscriber's key
  // differs from the SSR seed and the free (figure-less) payload is never
  // shown to someone who paid — see lib/premium-fetch.ts.
  const { data } = usePremiumSWR<any>(`${API_BASE}/strategies`, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });
  const { unlocked } = usePremium();
  // Locked when the browser says so OR the API withheld the figures — the
  // server's word wins, because a test-env unlock cannot conjure deleted fields.
  const locked = !!data && (!unlocked || data.premium === false);
  // §5.1: "Default sort is Sortino, not return."
  const [sort, setSort] = useState<SortKey>("sortino");
  const [dataset, setDataset] = useState<string>("All");
  const [record, setRecord] = useState<string>("All");

  const cards: Card[] = data?.cards ?? [];
  const shown = useMemo(() => {
    // Locked: the API returns no figure, so every sort key is null and the
    // registry order stands — no ranking leaks through the blur.
    const f = cards.filter(
      (c) =>
        (dataset === "All" || c.dataset === dataset) &&
        (record === "All" || c.recordType === record),
    );
    return [...f].sort((a, b) => {
      // A strategy with no run yet sorts last whichever column is chosen —
      // "no data" is not a score of zero.
      const av = a[sort] ?? null;
      const bv = b[sort] ?? null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sort === "maxDrawdown" ? av - bv : bv - av;
    });
  }, [cards, sort, dataset, record]);

  const internal = data?.internal;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[32px] sm:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: "-0.6px" }}>
          Top Performing Strategies
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          Rules-based strategies built on public alternative data — congressional trades, insider
          buying, federal lobbying, government contracts and quarterly fund filings. Every strategy
          here is computed by our own engine from our own data. Each one publishes its rules, its
          exact parameters and what it cannot see.
        </p>
      </header>

      {/* §4 — the internal portfolio panel, at the top. */}
      {internal && <InternalPanel internal={internal} />}

      {/* The library — free for a subscriber, a blurred peek for everyone else.
          The wall is the site's one overlay, so its copy and look never drift
          from the other paywalls. */}
      <Library locked={locked}>
        {/* §3 — the pair the brief asks to be shown together. */}
        {data?.sideBySide && <SideBySide data={data} locked={locked} />}

        {/* §5.1 filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <Chips label="Dataset" value={dataset} onChange={setDataset} options={["All", ...(data?.datasets ?? [])]} />
          <Chips label="Record" value={record} onChange={setRecord} options={["All", ...(data?.recordTypes ?? [])]} />
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[11px] text-mute uppercase tracking-wider font-bold">Sort</span>
            {(["sortino", "cagr", "return1y", "maxDrawdown"] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className="px-2.5 h-7 rounded-md text-[12px] font-semibold"
                style={{
                  background: sort === k ? "var(--accent)" : "var(--bg-2)",
                  color: sort === k ? "var(--on-accent)" : "var(--text-mute)",
                  border: "1px solid var(--border)",
                }}
              >
                {k === "sortino" ? "Sortino" : k === "cagr" ? "CAGR" : k === "return1y" ? "1Y return" : "Drawdown"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <StrategyCard key={c.slug} c={c} locked={locked} />
          ))}
          {!cards.length && (
            <div className="text-[13px] text-mute col-span-full py-8">Loading the library…</div>
          )}
        </div>
      </Library>

      <p className="text-[12px] text-mute leading-relaxed">{data?.disclaimer}</p>
    </div>
  );
}

/**
 * §3: strategies 7 and 8 "are deliberately published side by side with a plain
 * buy-and-hold S&P 500 line, so readers can see whether the insider filter adds
 * anything".
 *
 * Put plainly rather than left for a reader to assemble from two cards in a
 * sorted grid — the comparison is the point of publishing both.
 */
function SideBySide({ data, locked }: { data: any; locked: boolean }) {
  const pair: Card[] = (data.sideBySide.slugs || [])
    .map((slug: string) => data.cards.find((c: Card) => c.slug === slug))
    .filter(Boolean);
  if (pair.length < 2 || pair.some((c) => c.thin)) return null;
  return (
    <section className="card p-5" style={{ border: "1px solid var(--border)" }}>
      <h2 className="text-[16px] font-bold">{data.sideBySide.heading}</h2>
      <p className="text-[13px] text-mute mt-1.5 max-w-3xl leading-relaxed">
        {data.sideBySide.explainer}
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        {pair.map((c) => {
          const f = figures(c, locked);
          return (
            <Link
              key={c.slug}
              href={`/strategies/${c.slug}`}
              className="rounded-lg p-3.5 block hover:border-[var(--accent)] transition"
              style={{ border: "1px solid var(--border)", background: "var(--bg-elevated)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-[14px] leading-tight">{c.name}</div>
                <Sparkline points={f.spark} width={96} height={30} />
              </div>
              <div className="mt-2">
                <RecordBadge type={c.recordType} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <Stat label="Strategy" value={pct(f.totalReturn, 0)} />
                <Stat label="S&P 500" value={pct(f.benchmarkTotalReturn, 0)} />
                <Stat label="Difference" value={pct(f.beat, 0)} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Chips({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-mute uppercase tracking-wider font-bold">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className="px-2.5 h-7 rounded-md text-[12px] font-semibold capitalize"
          style={{
            background: value === o ? "var(--accent-soft)" : "transparent",
            color: value === o ? "var(--accent)" : "var(--text-mute)",
            border: "1px solid var(--border)",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * The figures a card prints. Real when the reader is entitled; when locked
 * the API has deleted them and a seeded decoy stands in under the blur —
 * a card of dashes under a paywall reads as a broken page, not a locked one.
 */
function figures(c: Card, locked: boolean) {
  if (locked) {
    const d = decoyCardFigures(c.slug);
    return {
      spark: decoyWalk(c.slug),
      sortino: d.sortino,
      cagr: d.cagr,
      maxDrawdown: d.maxDrawdown,
      totalReturn: d.cagr * 4,
      benchmarkTotalReturn: d.cagr * 4 - d.beat,
      beat: d.beat,
    };
  }
  return {
    spark: c.spark ?? [],
    sortino: c.sortino ?? null,
    cagr: c.cagr ?? null,
    maxDrawdown: c.maxDrawdown ?? null,
    totalReturn: c.totalReturn ?? null,
    benchmarkTotalReturn: c.benchmarkTotalReturn ?? null,
    beat:
      c.totalReturn != null && c.benchmarkTotalReturn != null
        ? c.totalReturn - c.benchmarkTotalReturn
        : null,
  };
}

/**
 * The wall. Header and internal panel sit above it; the disclaimer below.
 * `peekHeight` shows roughly the comparison pair and the first row of cards
 * before the fade — enough to see what is being sold, not enough to read it.
 */
function Library({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  if (!locked) return <div className="space-y-6">{children}</div>;
  return (
    <PaywallOverlay
      title="Unlock every strategy's full record"
      subtitle="Thirteen rules-based strategies on public alternative data — the curves, the metrics and the holdings are for members."
      bullets={STRATEGY_BULLETS}
      peekHeight={760}
    >
      <div className="space-y-6">{children}</div>
    </PaywallOverlay>
  );
}

function StrategyCard({ c, locked }: { c: Card; locked: boolean }) {
  const Icon = DATASET_ICON[c.dataset] ?? Layers;
  const f = figures(c, locked);
  const beat = f.beat;
  return (
    <Link
      href={`/strategies/${c.slug}`}
      className="card p-4 block hover:border-[var(--accent)] transition"
      style={{ border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--accent)" }} aria-hidden />
          <div className="min-w-0">
            <div className="font-bold text-[14.5px] leading-tight">{c.name}</div>
            <div className="text-[11px] text-mute mt-0.5">
              {c.dataset} · {CADENCE(c.rebalanceDays)} · v{c.version}
            </div>
            {/* §5.1 lists the start date on the card: a three-year record and a
                three-month one should not look alike at a glance. */}
            {c.startDate && (
              <div className="text-[10.5px] text-faint mt-0.5">Tested from {c.startDate}</div>
            )}
          </div>
        </div>
        <Sparkline points={f.spark} />
      </div>

      {/* §4.1: a record badge on every performance surface, this one included. */}
      <div className="mt-2.5">
        <RecordBadge type={c.recordType} />
      </div>

      {c.thin ? (
        <p className="text-[12px] text-mute mt-3 leading-snug">
          Not enough qualifying names yet to publish a curve for this rule set.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Stat label="Sortino" value={num(f.sortino)} />
          <Stat label="CAGR" value={pct(f.cagr)} />
          <Stat label="Max DD" value={pct(f.maxDrawdown)} />
        </div>
      )}

      {beat != null && (
        <div className="text-[11.5px] mt-2.5" style={{ color: beat >= 0 ? "var(--good)" : "var(--bad)" }}>
          {beat >= 0 ? "Ahead of" : "Behind"} the S&P 500 by {pct(Math.abs(beat))} over the test
        </div>
      )}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-mute font-bold">{label}</div>
      <div className="text-[14px] font-bold tabular">{value}</div>
    </div>
  );
}

/**
 * §4 / §4.1. Until a real paper or live record exists this renders the
 * "track record begins" state and NO curve — the brief forbids a placeholder or
 * illustrative line here in so many words.
 */
function InternalPanel({ internal }: { internal: any }) {
  const notStarted = internal.state === "not-started";
  return (
    <section
      className="card p-5"
      style={{ border: "1px solid var(--border)", background: "var(--bg-2)" }}
      aria-label="Internal portfolio"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-[17px] font-bold">Conviction Quant — our own portfolio</h2>
        {internal.recordType && <RecordBadge type={internal.recordType} size="md" />}
      </div>
      <p className="text-[13px] text-mute mt-2 max-w-3xl leading-relaxed">
        {notStarted ? internal.detail : internal.detail}
      </p>
      {notStarted ? (
        <div
          className="mt-3 rounded-lg px-4 py-3 text-[13px] font-semibold"
          style={{ background: "var(--bg-elevated)", border: "1px dashed var(--border)" }}
        >
          {internal.headline}
          {/* §4.1's wording is "Track record begins [date] — methodology here".
              The date arrives once George sets it; until then the headline says
              what is true instead of a placeholder date. */}
          {internal.methodologyHref && (
            <>
              {" — "}
              <Link href={internal.methodologyHref} className="text-accent hover:underline">
                methodology
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="text-[12.5px] text-mute mt-3">
          {internal.orders} orders recorded since {String(internal.startedAt || "").slice(0, 10)}.
        </div>
      )}
    </section>
  );
}

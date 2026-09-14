import { Suspense } from "react";
import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback, ARENA_MAX_BYTES } from "@/lib/ssr/prefetch";
import { SeoTable } from "@/components/visualizers/SeoTable";

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";

interface Bubble {
  id: string;
  name: string;
  ticker: string | null;
  totalUsd: number;
  trendPct: number | null;
  isPublic: boolean;
}

const usd = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v}`;

export default async function Page() {
  // Seed the arena's dataset server-side: the page IS its dataset, and
  // without this the canvas waits a full round trip after hydration before
  // it can draw anything (George 2026-09-14: the visualizers are slow to
  // load). ARENA_MAX_BYTES keeps the seed whole — a sliced one paints a
  // partial field and reflows.
  const fallback = await ssrFallback('visualizers/government-contracts', {}, { maxBytes: ARENA_MAX_BYTES });

  let rows: Bubble[] = [];
  try {
    const res = await fetch(`${BACKEND}/api/visualizers/contracts?region=us&window=1y`, {
      next: { revalidate: 900 },
    });
    if (res.ok) rows = ((await res.json()) as { bubbles?: Bubble[] }).bubbles?.slice(0, 25) ?? [];
  } catch {
    /* the table simply does not render */
  }

  return (
    <>
      <Suspense fallback={<div style={{ minHeight: "70vh", background: "var(--bg-1)" }} />}>
        <SwrFallback fallback={fallback}>
          <PageClient />
        </SwrFallback>
      </Suspense>
      <SeoTable
        title="Biggest federal contract recipients, last twelve months"
        intro="Obligations recorded by USAspending.gov, rolled up by legal entity and matched to a listed parent where we can prove one."
        columns={["Recipient", "Ticker", "Awarded", "vs prior year"]}
        rows={rows.map((b) => ({
          href: `/visualizers/government-contracts?region=us&window=1y&m=${encodeURIComponent(b.id)}`,
          cells: [
            b.name,
            b.ticker ?? "—",
            usd(b.totalUsd),
            b.trendPct == null ? "—" : `${b.trendPct >= 0 ? "+" : ""}${b.trendPct.toFixed(0)}%`,
          ],
        }))}
        note={
          <>
            Contract totals are obligations recorded in the window, not company-reported revenue.
          </>
        }
      />
    </>
  );
}

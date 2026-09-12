import { Suspense } from "react";
import Link from "next/link";
import PageClient from "./PageClient";
import { SeoTable } from "@/components/visualizers/SeoTable";

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";

interface Company {
  ticker: string;
  name: string;
  marketCap: number | null;
  runwayQuarters: number | null;
  nextCatalystDays: number | null;
  catalysts: { eventDate: string; type: string; description: string }[];
}

const usd = (v: number | null) =>
  v == null ? "—" : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;

export default async function Page() {
  let rows: Company[] = [];
  try {
    const res = await fetch(`${BACKEND}/api/visualizers/biotech`, { next: { revalidate: 1800 } });
    if (res.ok) {
      const all = ((await res.json()) as { companies?: Company[] }).companies ?? [];
      rows = all
        .filter((c) => c.nextCatalystDays != null)
        .sort((a, b) => (a.nextCatalystDays ?? 1e9) - (b.nextCatalystDays ?? 1e9))
        .slice(0, 25);
    }
  } catch {
    /* the table simply does not render */
  }

  return (
    <>
      <Suspense fallback={<div style={{ minHeight: "70vh", background: "var(--bg-1)" }} />}>
        <PageClient />
      </Suspense>
      <SeoTable
        title="Nearest biotech catalysts"
        intro="The next dated event for each company, soonest first. Readout dates are the sponsor's own projection and move."
        columns={["Company", "Ticker", "Next catalyst", "In days", "Market cap", "Runway"]}
        rows={rows.map((c) => ({
          href: `/visualizers/biotech?m=${encodeURIComponent(c.ticker)}`,
          cells: [
            c.name,
            c.ticker,
            c.catalysts[0]?.eventDate ?? "—",
            c.nextCatalystDays ?? "—",
            usd(c.marketCap),
            c.runwayQuarters != null ? `${c.runwayQuarters.toFixed(1)}Q` : "—",
          ],
        }))}
        note={
          <>
            Nothing here is investment or medical advice.{" "}
            <Link href="/methodology#biotech-catalysts" style={{ color: "var(--accent)" }}>
              Methodology
            </Link>
            .
          </>
        }
      />
    </>
  );
}

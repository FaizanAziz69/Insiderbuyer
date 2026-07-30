"use client";
import useSWR from "swr";
import { Users } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";

interface Activity {
  summary: string;
  bullets: string[];
}

/** The four questions the summary is built to answer, shown as labels so the
 *  section reads as an answer even before the copy is scanned. */
const LABELS = [
  "What the filings say",
  "How much insiders own",
  "Net buying vs selling",
  "Conviction or compensation",
];

/**
 * "What Are Insiders Doing?" — sits at the very top of a stock profile's
 * datasets. Written by the model from our own Form 4 record only; when a
 * category isn't in our data the copy says so rather than reporting a zero.
 */
export function InsiderActivitySummary({ ticker }: { ticker: string }) {
  const { data, isLoading } = useSWR<{ activity: Activity | null }>(
    `${API_BASE}/content/insider-activity?ticker=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );

  if (isLoading) {
    return <div className="card p-5 shimmer" style={{ minHeight: 150 }} />;
  }
  const a = data?.activity;
  if (!a?.summary) return null;

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Users className="h-4 w-4" />
        </span>
        <h2 className="text-[20px] sm:text-[22px] font-bold tracking-tight">
          What Are Insiders Doing?
        </h2>
      </div>

      <p className="text-[15.5px] leading-relaxed" style={{ color: "var(--text-soft)" }}>
        {a.summary}
      </p>

      {a.bullets.length > 0 && (
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          {a.bullets.map((b, i) => (
            <div key={b} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <dt className="text-[11px] uppercase tracking-wider font-bold text-mute">
                {LABELS[i] ?? "Also"}
              </dt>
              <dd className="text-[14.5px] leading-relaxed mt-1" style={{ color: "var(--text)" }}>
                {b}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="text-[11.5px] text-faint mt-4 leading-relaxed">
        Generated from this company&rsquo;s SEC Form 4 filings only — open-market
        purchases and sales, plus grants, option exercises and other
        acquisitions where we hold them. Insider ownership counts insiders who
        have filed a transaction, so it is a floor rather than the full
        beneficial-ownership figure in the proxy statement. Informational only.
      </p>
    </section>
  );
}

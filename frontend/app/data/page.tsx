import Link from "next/link";
import { notFound } from "next/navigation";
import { ComplianceFooter } from "@/components/ComplianceFooter";
import { DATA_ARTICLES_ENABLED } from "@/lib/data-articles-flag";

/**
 * Data articles index — Developer Project Brief (Aug 24 2026), Workstream A.
 * Evergreen, auto-refreshing question-style pages; each card shows the data
 * refresh cadence and the last rebuild.
 */

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";

interface Item {
  slug: string;
  headline: string;
  dek: string;
  category: string;
  refresh: "weekly" | "monthly" | "quarterly";
  refreshedAt: string | null;
  href: string;
}

const REFRESH = { weekly: "Refreshes weekly", monthly: "Refreshes monthly", quarterly: "Refreshes quarterly" } as const;

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const revalidate = 300;

export default async function DataIndexPage() {
  if (!DATA_ARTICLES_ENABLED) notFound();
  let items: Item[] = [];
  try {
    const res = await fetch(`${BACKEND}/api/data-articles`, { next: { revalidate: 300 } });
    if (res.ok) items = ((await res.json())?.articles ?? []) as Item[];
  } catch {
    /* render the shell; the list is non-critical */
  }
  return (
    <div className="w-full max-w-[960px] mx-auto space-y-6">
      <header>
        <p className="text-[12px] uppercase tracking-[2px] font-semibold" style={{ color: "var(--text-mute)" }}>
          Data
        </p>
        <h1 className="text-[28px] sm:text-[36px] font-bold tracking-tight leading-tight mt-1" style={{ fontFamily: "var(--font-display)" }}>
          The questions investors ask, answered with live filings
        </h1>
        <p className="mt-2 text-[15px] max-w-[64ch]" style={{ color: "var(--text-soft)" }}>
          Evergreen data pages built from SEC Form 4, 13F and analyst-rating data. Each chart rebuilds on its
          own schedule; the headline never changes, the numbers always do.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((a) => (
          <li key={a.slug}>
            <Link
              href={a.href}
              className="card block h-full p-5 rounded-xl transition-shadow hover:shadow-md"
              style={{ border: "1px solid var(--border)", background: "var(--bg-elevated)" }}
            >
              <div className="flex items-center justify-between gap-2 text-[11.5px] font-mono uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>
                <span style={{ color: "var(--accent)" }}>{a.category}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--good)" }} />
                  {REFRESH[a.refresh]}
                </span>
              </div>
              <h2 className="mt-2 text-[20px] font-bold leading-snug" style={{ fontFamily: "var(--font-display)" }}>
                {a.headline}
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed line-clamp-3" style={{ color: "var(--text-soft)" }}>
                {a.dek}
              </p>
              <p className="mt-3 text-[12px]" style={{ color: "var(--text-mute)" }}>
                Updated {fmt(a.refreshedAt)}
              </p>
            </Link>
          </li>
        ))}
        {!items.length && (
          <li className="text-[13px] py-8" style={{ color: "var(--text-mute)" }}>
            Articles are being built from the latest filings — check back in a moment.
          </li>
        )}
      </ul>

      <ComplianceFooter methodology="/methodology#data-articles" />
    </div>
  );
}

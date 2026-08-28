"use client";

/**
 * IPO CALENDAR — Developer Project Brief (Aug 24 2026), Workstream E.
 *
 *  §7.1 Window: IPOs that began trading within the last 90 days; older rows roll
 *       off automatically. Sort: most recent listing first (fixed default);
 *       allow re-sort by performance. Prices update daily after the close.
 *  §7.2 Row: logo/name/ticker/exchange · listing date ("Aug 12, 2026 — 12 days
 *       ago") · IPO price (mono) · current price (previous close, mono) ·
 *       return since IPO (hero stat, green/red) · insider activity badge
 *       linking to the filing when any Form 4 buy landed since listing.
 *  Upcoming IPOs live in a secondary tab.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Rocket, ArrowUpDown, ExternalLink } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { ComplianceFooter } from "@/components/ComplianceFooter";
import { useStalled } from "@/lib/useStalled";

interface IpoListing {
  symbol: string;
  name: string;
  exchange: string | null;
  listingDate: string;
  daysSinceListing: number;
  ipoPrice: number | null;
  ipoPriceSource: "priced" | "range-midpoint" | "first-open" | null;
  currentPrice: number | null;
  priceAsOf: string | null;
  returnPct: number | null;
  marketCap: number | null;
  insider: null | { buys: number; insiders: number; totalBought: number; lastBuyDate: string; filingUrl: string | null; ticker: string };
}
interface Recent {
  window: number;
  asOf: string | null;
  count: number;
  rows: IpoListing[];
}
interface Upcoming {
  count: number;
  rows: Array<{ symbol: string; name: string; exchange: string | null; expectedDate: string | null; priceRange: string | null; sharesOffered: number | null }>;
}

type Sort = "date" | "return";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function ago(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
function mono(n: number | null): string {
  return n === null || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}`;
}
function fmtUsd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
const SOURCE_NOTE: Record<NonNullable<IpoListing["ipoPriceSource"]>, string> = {
  priced: "Offering price",
  "range-midpoint": "Midpoint of the filed price range — the final offering price was not published to our feeds",
  "first-open": "First-session opening price — no offering price was published to our feeds",
};

export default function IposPage() {
  const [tab, setTab] = useState<"recent" | "upcoming">("recent");
  const [sort, setSort] = useState<Sort>("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useSWR<Recent>(`${API_BASE}/ipo/recent?sort=${sort}&dir=${dir}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  });
  const { data: up } = useSWR<Upcoming>(tab === "upcoming" ? `${API_BASE}/ipo/upcoming` : null, fetcher, { revalidateOnFocus: false });
  const stalled = useStalled(!!data);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const withInsider = rows.filter((r) => r.insider).length;

  const toggle = (s: Sort) => {
    if (sort === s) setDir(dir === "desc" ? "asc" : "desc");
    else {
      setSort(s);
      setDir("desc");
    }
  };

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-[2px] font-semibold" style={{ color: "var(--text-mute)" }}>
            IPO Calendar
          </p>
          <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight leading-tight mt-1 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
            <Rocket size={26} style={{ color: "var(--accent)" }} aria-hidden />
            How the last 90 days of IPOs are performing
          </h1>
          <p className="mt-2 text-[14.5px] max-w-[70ch]" style={{ color: "var(--text-soft)" }}>
            Every company that began trading in the trailing {data?.window ?? 90} days, priced against its offering and marked to the
            previous close each evening. The badge flags companies where an insider has already bought stock on the open market since
            listing — with a link to the Form 4.
          </p>
        </div>
        <div className="text-[12px] font-mono" style={{ color: "var(--text-mute)" }}>
          Prices as of {fmtDate(data?.asOf ?? null)} · updated nightly after the close
        </div>
      </header>

      <nav role="tablist" aria-label="IPO views" className="flex gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
        {(
          [
            ["recent", `Recently listed${data ? ` (${data.count})` : ""}`],
            ["upcoming", `Upcoming${up ? ` (${up.count})` : ""}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className="px-3.5 py-2 text-[13.5px] font-semibold -mb-px rounded-t-md"
            style={{
              color: tab === k ? "var(--text)" : "var(--text-mute)",
              borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "recent" && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]" style={{ color: "var(--text-mute)" }}>
            <span>Sort:</span>
            {(
              [
                ["date", "Most recent listing"],
                ["return", "Return since IPO"],
              ] as Array<[Sort, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => toggle(k)}
                aria-pressed={sort === k}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold"
                style={{
                  background: sort === k ? "var(--brand-surface)" : "var(--bg-2)",
                  color: sort === k ? "var(--on-accent)" : "var(--text-soft)",
                  border: "1px solid var(--border)",
                }}
              >
                {label}
                {sort === k && <ArrowUpDown size={12} aria-label={dir === "desc" ? "descending" : "ascending"} />}
              </button>
            ))}
            {withInsider > 0 && (
              <span className="ml-auto">
                {withInsider} of {rows.length} with insider buying since listing
              </span>
            )}
          </div>

          <div className="card overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full text-[13.5px]" style={{ minWidth: 760 }}>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide font-mono" style={{ color: "var(--text-mute)", background: "var(--bg-2)" }}>
                  <th className="px-3 py-2.5 font-semibold">Company</th>
                  <th className="px-3 py-2.5 font-semibold">
                    <button onClick={() => toggle("date")} className="inline-flex items-center gap-1 uppercase">
                      Listing date <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-semibold text-right">IPO price</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Current price</th>
                  <th className="px-3 py-2.5 font-semibold text-right">
                    <button onClick={() => toggle("return")} className="inline-flex items-center gap-1 uppercase">
                      Return since IPO <ArrowUpDown size={11} />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Insider activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ret = r.returnPct;
                  const color = ret === null ? "var(--text-mute)" : ret >= 0 ? "var(--good)" : "var(--bad)";
                  return (
                    <tr key={r.symbol} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CompanyLogo ticker={r.symbol} name={r.name} size={30} />
                          <div className="min-w-0">
                            <Link href={`/companies/${r.symbol}`} className="font-semibold hover:underline block truncate" style={{ color: "var(--text)" }}>
                              {r.name}
                            </Link>
                            <div className="font-mono text-[11.5px]" style={{ color: "var(--text-mute)" }}>
                              {r.symbol}
                              {r.exchange ? ` · ${r.exchange}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span>{fmtDate(r.listingDate)}</span>
                        <span style={{ color: "var(--text-mute)" }}> — {ago(r.daysSinceListing)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums" title={r.ipoPriceSource ? SOURCE_NOTE[r.ipoPriceSource] : undefined}>
                        {mono(r.ipoPrice)}
                        {r.ipoPriceSource && r.ipoPriceSource !== "priced" && (
                          <sup className="ml-0.5" style={{ color: "var(--text-mute)" }} aria-label={SOURCE_NOTE[r.ipoPriceSource]}>
                            *
                          </sup>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{mono(r.currentPrice)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-[15px]" style={{ color }}>
                        {ret === null ? "—" : `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.insider ? (
                          <a
                            href={r.insider.filingUrl || `/companies/${r.symbol}`}
                            target={r.insider.filingUrl ? "_blank" : undefined}
                            rel={r.insider.filingUrl ? "noopener noreferrer" : undefined}
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap"
                            style={{ background: "var(--good-soft)", color: "var(--good-strong)", border: "1px solid var(--good)" }}
                            title={`${r.insider.buys} open-market buy${r.insider.buys === 1 ? "" : "s"} by ${r.insider.insiders} insider${r.insider.insiders === 1 ? "" : "s"}, ${fmtUsd(r.insider.totalBought)} total, latest ${fmtDate(r.insider.lastBuyDate)}`}
                          >
                            Insider buying · {fmtUsd(r.insider.totalBought)}
                            <ExternalLink size={11} aria-hidden />
                          </a>
                        ) : (
                          <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
                            No Form 4 buys yet
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-[13px]" style={{ color: "var(--text-mute)" }}>
                      {stalled ? "The IPO feed is taking longer than usual — please refresh in a moment." : isLoading ? "Loading listings…" : "No IPOs began trading in the last 90 days."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>
            * IPO price is the filed-range midpoint or first-session open where the offering price was not published to our feeds; hover
            the figure for the note. Rows leave the table automatically 90 days after listing.
          </p>
        </>
      )}

      {tab === "upcoming" && (
        <div className="card overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-[13.5px]" style={{ minWidth: 640 }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide font-mono" style={{ color: "var(--text-mute)", background: "var(--bg-2)" }}>
                <th className="px-3 py-2.5 font-semibold">Company</th>
                <th className="px-3 py-2.5 font-semibold">Expected</th>
                <th className="px-3 py-2.5 font-semibold text-right">Price range</th>
                <th className="px-3 py-2.5 font-semibold text-right">Shares offered</th>
              </tr>
            </thead>
            <tbody>
              {(up?.rows ?? []).map((r) => (
                <tr key={r.symbol} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <CompanyLogo ticker={r.symbol} name={r.name} size={30} />
                      <div>
                        <div className="font-semibold">{r.name}</div>
                        <div className="font-mono text-[11.5px]" style={{ color: "var(--text-mute)" }}>
                          {r.symbol}
                          {r.exchange ? ` · ${r.exchange}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{fmtDate(r.expectedDate)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.priceRange ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.sharesOffered ? r.sharesOffered.toLocaleString() : "—"}</td>
                </tr>
              ))}
              {up && !up.rows.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-[13px]" style={{ color: "var(--text-mute)" }}>
                    No upcoming IPOs on the calendar right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ComplianceFooter methodology="/methodology#ipo-calendar" />
    </div>
  );
}

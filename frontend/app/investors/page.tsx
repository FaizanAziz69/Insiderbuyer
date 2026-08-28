"use client";

/**
 * TOP INSIDERS — Developer Project Brief (Aug 24 2026), Workstream B §4.1.
 *
 * "Tab bar across the top, matching the reference screenshot: Popular
 *  (default) · Best Performance · Growth Investors · Value Investors · Short
 *  Sellers · Long-Term. Each tab renders a card grid. Category assignments
 *  per investor are an editorial input — build them as a taggable field in
 *  the admin, not hardcoded."
 *
 * Tabs read the admin-set tags server-side (/investors?tab=…); nothing here
 * decides who is a growth or value investor.
 */

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { InvestorCard, type InvestorCardData } from "@/components/investors/InvestorCard";
import { ComplianceFooter } from "@/components/ComplianceFooter";

const TABS: Array<[string, string]> = [
  ["popular", "Popular"],
  ["performance", "Best Performance"],
  ["growth", "Growth Investors"],
  ["value", "Value Investors"],
  ["short", "Short Sellers"],
  ["longterm", "Long-Term"],
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function InvestorsPage() {
  const [tab, setTab] = useState("popular");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some(([k]) => k === t)) setTab(t);
  }, []);
  useEffect(() => {
    const qs = tab === "popular" ? "" : `?tab=${tab}`;
    window.history.replaceState(null, "", `/investors${qs}`);
  }, [tab]);

  const { data, isLoading } = useSWR<{ tab: string; count: number; cards: InvestorCardData[] }>(
    `${API_BASE}/investors?tab=${tab}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 120_000, keepPreviousData: true },
  );
  const cards = data?.cards ?? [];

  return (
    <div className="w-full space-y-5">
      <header>
        <p className="text-[12px] uppercase tracking-[2px] font-semibold" style={{ color: "var(--text-mute)" }}>
          Top Insiders
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight leading-tight mt-1">
          The portfolios of the world&rsquo;s most-watched investors
        </h1>
        <p className="mt-2 text-[15px] max-w-[72ch]" style={{ color: "var(--text-mute)" }}>
          Quarterly 13F holdings, trailing-12-month performance on those disclosed positions, and
          the one thing nobody else shows: where a fund&rsquo;s holdings overlap with insiders
          buying their own stock right now.
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Investor categories">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className="px-3.5 py-2 text-[13px] font-semibold rounded-lg whitespace-nowrap"
            style={{
              background: tab === key ? "var(--accent)" : "var(--bg-2)",
              color: tab === key ? "#fff" : "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {isLoading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4" style={{ minHeight: 232 }}>
              <div className="shimmer h-12 w-12 rounded-full mb-3" />
              <div className="shimmer h-4 w-3/5 rounded mb-2" />
              <div className="shimmer h-3 w-2/5 rounded" />
            </div>
          ))}
        </div>
      ) : cards.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cards.map((c) => (
            <InvestorCard key={c.slug} c={c} />
          ))}
        </div>
      ) : (
        <div className="card p-6 text-[14px]" style={{ color: "var(--text-mute)" }}>
          {tab === "performance"
            ? "Performance figures appear once the first 13F ingest and nightly price run have completed."
            : "No investors are tagged in this category yet — editorial sets the tags in the admin."}
        </div>
      )}

      <p className="text-[12px]" style={{ color: "var(--text-mute)" }}>
        Performance = trailing-12-month value-weighted return of disclosed 13F long positions,
        rebalanced at each filing date; suppressed for portfolios under $100M or with fewer than 4
        positions.{" "}
        <Link href="/methodology#top-insiders" className="font-semibold text-accent">
          Methodology
        </Link>
      </p>

      <ComplianceFooter methodology="/methodology#top-insiders" />
    </div>
  );
}

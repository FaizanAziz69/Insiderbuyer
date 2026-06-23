"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { MapPin, Target } from "lucide-react";
import { API_BASE, InsiderRow, fetcher, formatCurrency } from "@/lib/api";

interface TrackRecord {
  name: string;
  role: string;
  ticker: string | null;
  trades: number;
  wins: number;
  accuracy: number;
  totalValue: number;
}

export default function InsidersPage() {
  const [country, setCountry] = useState<string>("");

  const { data, isLoading } = useSWR<InsiderRow[]>(
    `${API_BASE}/insiders?limit=50${country ? `&country=${encodeURIComponent(country)}` : ""}`,
    fetcher,
    { refreshInterval: 120000 },
  );
  const { data: countryData } = useSWR<{ countries: { country: string; count: number }[] }>(
    `${API_BASE}/insiders/countries`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: trackData } = useSWR<{ rows: TrackRecord[] }>(
    `${API_BASE}/insiders/track-record?limit=8`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000 },
  );
  const trackRows = trackData?.rows || [];

  const rows = data || [];

  // Show the priority countries from the spec (US / Canada / UK) first — always
  // visible — then merge in any other countries the SEC data actually contains
  // (some foreign private issuers file Form 4). Counts come from the API;
  // Canada/UK read 0 until their disclosure feeds (SEDI / FCA) are wired.
  const PRIORITY = ["United States", "Canada", "United Kingdom"];
  const apiCounts = new Map(
    (countryData?.countries || []).map((c) => [c.country.toUpperCase(), c.count]),
  );
  const extras = (countryData?.countries || [])
    .filter((c) => !PRIORITY.some((p) => p.toUpperCase() === c.country.toUpperCase()))
    .map((c) => ({ country: c.country, count: c.count }));
  const countries = [
    ...PRIORITY.map((p) => ({ country: p, count: apiCounts.get(p.toUpperCase()) || 0 })),
    ...extras,
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight">Top insiders</h1>
        <p className="text-mute text-sm mt-1">
          Insiders ranked by total recent purchase volume, descending — with each
          insider&rsquo;s live track-record accuracy.
        </p>
      </header>

      {/* Country filter — data-driven. Location is the SEC filing address
          (≈ company HQ); non-US countries appear as those feeds come online. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider font-bold text-mute mr-1">
          Country
        </span>
        <button
          onClick={() => setCountry("")}
          className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
          style={{
            background: country === "" ? "var(--accent)" : "var(--bg-2)",
            color: country === "" ? "#fff" : "var(--text-soft)",
            border: "1px solid var(--border-strong)",
          }}
        >
          All
        </button>
        {countries.map((c) => {
          const empty = c.count === 0;
          const active = country === c.country;
          return (
            <button
              key={c.country}
              onClick={() => setCountry(c.country)}
              title={empty ? `No ${c.country} insider filings yet` : undefined}
              className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
              style={{
                background: active ? "var(--accent)" : "var(--bg-2)",
                color: active ? "#fff" : empty ? "var(--text-mute)" : "var(--text-soft)",
                border: "1px solid var(--border-strong)",
                opacity: empty && !active ? 0.6 : 1,
              }}
            >
              {c.country} <span className="opacity-60">({c.count})</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <div className="text-[15px] font-semibold">Ranked by buying volume</div>
                <div className="text-xs text-mute mt-0.5">Last 90 days · descending</div>
              </div>
            </div>
            {isLoading || !data ? (
              <div className="px-5 py-10 text-center text-mute">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="px-5 py-10 text-center text-mute">
                {country && country !== "United States" ? (
                  <>
                    No {country} insider filings yet — {country} disclosures
                    {country === "Canada"
                      ? " (SEDI)"
                      : country === "United Kingdom"
                      ? " (FCA)"
                      : ""}{" "}
                    are being added. US coverage is live now.
                  </>
                ) : (
                  "No insiders ranked yet."
                )}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {rows.map((row, i) => (
                  <InsiderItem key={`${row.name}-${row.ticker}-${i}`} row={row} rank={i + 1} />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Track-record accuracy — real, computed from buys vs the live price. */}
        <div className="card p-5 h-fit">
          <div className="flex items-center gap-1.5">
            <Target className="h-4 w-4 text-accent" />
            <div className="text-[15px] font-semibold">Track-Record Accuracy</div>
          </div>
          <div className="text-xs text-mute mt-0.5 leading-relaxed">
            Share of each insider&rsquo;s open-market buys now trading{" "}
            <span className="text-good font-semibold">above</span> their purchase
            price (vs the live quote).
          </div>

          {trackRows.length === 0 ? (
            <div className="mt-5 text-xs text-mute py-6 text-center">
              Building track records as price history accrues…
            </div>
          ) : (
            <div className="mt-5 space-y-3.5">
              {trackRows.map((t) => {
                const color =
                  t.accuracy >= 70
                    ? "var(--good)"
                    : t.accuracy >= 45
                    ? "var(--warn)"
                    : "var(--bad)";
                return (
                  <div key={`${t.name}-${t.ticker}`}>
                    <div className="flex items-center justify-between text-[12px] mb-1 gap-2">
                      <span className="font-semibold truncate">
                        {t.ticker ? (
                          <Link
                            href={`/companies/${encodeURIComponent(t.ticker)}`}
                            className="hover:text-accent"
                          >
                            {t.name}
                          </Link>
                        ) : (
                          t.name
                        )}
                        <span className="text-faint font-normal ml-1">· {t.role}</span>
                      </span>
                      <span className="font-bold tabular flex-shrink-0" style={{ color }}>
                        {t.accuracy}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-3)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${t.accuracy}%`, background: color }}
                      />
                    </div>
                    <div className="text-[10px] text-faint mt-0.5">
                      {t.wins}/{t.trades} buys in profit
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div
            className="mt-4 pt-3 text-[10px] text-faint leading-relaxed"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            Accuracy = winning buys ÷ total open-market buys, scored against the
            current price. Needs ≥2 priced buys per insider. Not investment advice.
          </div>
        </div>
      </div>
    </div>
  );
}

function InsiderItem({ row, rank }: { row: InsiderRow; rank: number }) {
  return (
    <li className="px-5 py-4 flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]">
      <span
        className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: "var(--bg-3)", color: "var(--text-soft)" }}
      >
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{row.name}</div>
        <div className="text-xs text-mute truncate">
          {row.company}
          {row.ticker && (
            <>
              {" · "}
              <Link
                href={`/companies/${encodeURIComponent(row.ticker)}`}
                className="text-accent hover:underline font-mono"
              >
                {row.ticker}
              </Link>
            </>
          )}
        </div>
        {(row.city || row.country) && (
          <div className="text-[11px] text-faint truncate inline-flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3" />
            {[row.city, row.state, row.country].filter(Boolean).join(", ")}
          </div>
        )}
      </div>
      <span className="badge badge-neutral">{row.role}</span>
      <div className="text-right hidden sm:block">
        <div className="text-sm font-semibold tabular">{formatCurrency(row.totalValue)}</div>
        <div className="text-[11px] text-mute">
          {row.trades} trade{row.trades === 1 ? "" : "s"}
        </div>
      </div>
    </li>
  );
}

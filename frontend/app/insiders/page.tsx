"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { MapPin, Target } from "lucide-react";
import { API_BASE, InsiderRow, fetcher, formatCurrency } from "@/lib/api";
import { usePremium } from "@/components/premium/PremiumContext";
import { FREE_ROWS, PremiumRowWall } from "@/components/premium/PremiumRowWall";

interface TrackRecord {
  name: string;
  role: string;
  ticker: string | null;
  trades: number;
  wins: number;
  accuracy: number;
  totalValue: number;
}

/** Preset groups. Politicians come from congressional disclosures rather than
 *  Form 4 — members of Congress aren't corporate insiders — so that preset
 *  swaps the data source behind the same table. */
const GROUPS: { key: string; label: string; hint: string }[] = [
  { key: "", label: "All insiders", hint: "Every Form 4 open-market buyer" },
  { key: "ceo", label: "CEOs", hint: "Filings where the insider's role is CEO" },
  { key: "cfo", label: "CFOs", hint: "Filings where the insider's role is CFO" },
  {
    key: "politician",
    label: "Politicians",
    hint: "Members of Congress, from STOCK Act disclosures",
  },
  {
    key: "hedge-fund",
    label: "Hedge Funds",
    hint: "Funds, advisers and partnerships filing as 10% owners",
  },
];

export default function InsidersPage() {
  const [country, setCountry] = useState<string>("");
  const [group, setGroup] = useState<string>("");

  const { data, isLoading } = useSWR<InsiderRow[]>(
    `${API_BASE}/insiders?limit=50${country ? `&country=${encodeURIComponent(country)}` : ""}${
      group ? `&group=${group}` : ""
    }`,
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

  const { unlocked } = usePremium();
  const allRows = data || [];
  // Same freemium shape as the other leaderboards: ranked best-first so rank 1
  // is the biggest buyer, but listed bottom-up so the page counts down to it.
  const ordered = allRows.map((r, i) => ({ row: r, rank: i + 1 })).reverse();
  const rows = unlocked ? ordered : ordered.slice(0, FREE_ROWS + 1);

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
    <div className="space-y-6 w-full">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight">Top insiders</h1>
        <p className="text-mute text-sm mt-1">
          Insiders ranked by total recent purchase volume, descending — with each
          insider&rsquo;s live track-record accuracy.
        </p>
      </header>

      {/* Preset group filter — one bar across the page. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider font-bold text-mute mr-1">
          Filter
        </span>
        {GROUPS.map((g) => {
          const active = group === g.key;
          return (
            <button
              key={g.key || "all"}
              onClick={() => setGroup(g.key)}
              title={g.hint}
              className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
              style={{
                background: active ? "var(--accent)" : "var(--bg-2)",
                color: active ? "#fff" : "var(--text-soft)",
                border: "1px solid var(--border-strong)",
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {/* Country filter — data-driven. Location is the SEC filing address
          (≈ company HQ); non-US countries appear as those feeds come online.
          Hidden for Politicians, whose disclosures are US-only and carry no
          filing address to filter on. */}
      <div
        className="flex flex-wrap items-center gap-2"
        style={{ display: group === "politician" ? "none" : undefined }}
      >
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
                <div className="text-[15px] font-semibold">
                  {group === "politician"
                    ? "Ranked by disclosed purchase value"
                    : "Ranked by buying volume"}
                </div>
                <div className="text-xs text-mute mt-0.5">
                  {group === "politician"
                    ? "STOCK Act disclosures · amount-band midpoints · descending"
                    : "Last 90 days · descending"}
                </div>
              </div>
            </div>
            {isLoading || !data ? (
              <div className="px-5 py-10 text-center text-mute">Loading…</div>
            ) : allRows.length === 0 ? (
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
                ) : group ? (
                  `No ${GROUPS.find((g) => g.key === group)?.label.toLowerCase() ?? "matching"} buyers in the current data.`
                ) : (
                  "No insiders ranked yet."
                )}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {rows.map(({ row, rank }, i) => (
                  <InsiderItem
                    key={`${row.name}-${row.ticker}-${rank}`}
                    row={row}
                    rank={rank}
                    teaser={!unlocked && i === FREE_ROWS}
                  />
                ))}
              </ul>
            )}
            <PremiumRowWall
              label="Top Insiders"
              total={allRows.length}
              bullets={[
                "Every ranked insider, not just the preview",
                "Track-record accuracy on each buyer",
                "CEO, CFO, politician and fund presets in full",
                "Every new Form 4 the moment it lands",
              ]}
            />
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

function InsiderItem({
  row,
  rank,
  teaser = false,
}: {
  row: InsiderRow;
  rank: number;
  teaser?: boolean;
}) {
  return (
    <li
      className="px-5 py-4 flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
      style={{ opacity: teaser ? 0.28 : 1, pointerEvents: teaser ? "none" : undefined }}
    >
      <span
        className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: "var(--bg-3)", color: "var(--text-soft)" }}
      >
        {rank}
      </span>
      {/* Politicians show their official headshot (client spec). */}
      {row.kind === "politician" && (
        <span
          className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
          style={{ background: "var(--bg-3)", color: "var(--text-mute)" }}
        >
          {row.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.photoUrl}
              alt={row.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            row.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase()
          )}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <Link
          href={
            row.kind === "politician"
              ? `/politicians/${encodeURIComponent(row.name)}`
              : `/insiders/${encodeURIComponent(row.name)}`
          }
          className="font-semibold text-sm truncate block hover:text-accent transition"
        >
          {row.name}
        </Link>
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

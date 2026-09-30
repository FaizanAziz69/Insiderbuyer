"use client";

/**
 * The InsiderBuying Conviction Index (IBCX) — Brief v6 §1, published as a
 * data product under §10.
 *
 * §10 governs what this page may say, and the rules are load-bearing rather
 * than decorative: the index is information and not advice, it is not an
 * offer of any fund, agency clients are excluded by rule and the page says so
 * (turning a conflict risk into a credibility feature), and nothing
 * forward-looking is promised. Any backtested figure shown here would have to
 * be labelled hypothetical and reviewed by counsel first, so this page shows
 * only the live index level and its constituents.
 */

import useSWR from "swr";
import Link from "next/link";
import { LineChart, Lock, ShieldCheck } from "lucide-react";
import { API_BASE, fetcher, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { BacktestChart } from "@/components/backtest/BacktestChart";
import { useDataAccess } from "@/lib/data-access";
import { RequestAccessGate } from "@/components/promoter/RequestAccessGate";
import { decoyFor } from "@/components/premium/lockedDecoys";

interface IndexPayload {
  indexId: string;
  name: string;
  level: number | null;
  inception: string | null;
  sinceInception: number | null;
  series: Array<{ date: string; level: number; reconstituted: boolean }>;
  /** `symbol` is absent on every row until the reader is granted access — the
   *  backend deletes it rather than masking it, so there is nothing in the DOM
   *  to un-blur. `rank` arrives in its place so the rows stay ordered. */
  constituents: Array<{ symbol?: string; rank?: number; weight: number; sector: string | null; sleeves: string[] }>;
  constituentCount?: number;
  constituentsWithheld?: boolean;
  asOf: string | null;
  disclaimer: string;
  liveFrom: string | null;
  reconstructed: boolean;
  hypotheticalNote: string;
}

const SLEEVE_LABEL: Record<string, string> = {
  core: "Core",
  contrarian: "Contrarian",
  smallcap: "Small cap",
};

export default function IbcxPage() {
  const { granted, checking, token } = useDataAccess("ibcx");

  // The KEY changes when a token is held, and that is load-bearing rather than
  // tidy. The page is SSR-seeded under the plain string key, and SwrFallback
  // exempts a seeded key from its first revalidation — so an approved reader
  // on the seeded key would sit looking at the withheld payload until the ISR
  // window turned over. An array key is a different key, and refetches.
  const { data, isLoading } = useSWR<IndexPayload>(
    token ? [`${API_BASE}/quant/index`, token] : `${API_BASE}/quant/index`,
    (k: string | [string, string]) =>
      typeof k === "string"
        ? fetcher(k)
        : fetch(k[0], { headers: { "X-Data-Access": k[1] } }).then((r) => r.json()),
    { revalidateOnFocus: false },
  );
  const series = data?.series || [];
  const curve = series.map((p) => ({ t: new Date(`${p.date}T00:00:00Z`).getTime(), s: p.level / 10, b: 100 }));

  return (
    <div className="w-full space-y-5">
      <header>
        <div className="flex items-center gap-2 mb-1.5">
          <LineChart className="h-5 w-5" style={{ color: "var(--accent)" }} />
          <span className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: "var(--text-mute)" }}>
            Proprietary index
          </span>
        </div>
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight">
          {data?.name || "InsiderBuying Conviction Index"}
        </h1>
        <p className="mt-2 text-[15px] max-w-[76ch]" style={{ color: "var(--text-mute)" }}>
          A rules-based index of companies that clear a downside-protection screen and show real insider conviction.
          Built only from public disclosures and as-reported financial statements, scored on what was knowable on each
          date, and reconstituted quarterly.
        </p>
      </header>

      {isLoading && !data ? (
        <div className="card p-6">
          <div className="shimmer h-8 w-40 rounded mb-3" />
          <div className="shimmer h-64 w-full rounded" />
        </div>
      ) : !data?.level ? (
        <div className="card p-6 text-[14px]" style={{ color: "var(--text-mute)" }}>
          The index publishes once the ranking engine has produced its first reconstitution.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label="Index level" value={data.level.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
            <Tile
              label="Since inception"
              value={data.sinceInception == null ? "—" : `${data.sinceInception >= 0 ? "+" : ""}${(data.sinceInception * 100).toFixed(1)}%`}
              tone={data.sinceInception == null ? undefined : data.sinceInception >= 0 ? "up" : "down"}
            />
            <Tile label="Constituents" value={String(data.constituentCount ?? data.constituents.length)} />
            <Tile label="As of" value={data.asOf ? formatDate(data.asOf) : "—"} />
          </div>

          {data.reconstructed ? (
            <p className="rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-soft)" }}>
              <strong>Reconstructed history.</strong> {data.hypotheticalNote}
              {data.liveFrom ? ` Levels from ${data.liveFrom} onward are published as the engine runs.` : ""}
            </p>
          ) : null}

          {curve.length > 1 ? (
            <section className="card p-4 sm:p-5">
              <h2 className="text-[15px] font-bold mb-3">Index level</h2>
              <BacktestChart curve={curve} height={280} strategyLabel="IBCX" benchmarkLabel="Base 1000" />
              <p className="text-[11px] mt-2" style={{ color: "var(--text-faint)" }}>
                Base 1000 at inception{data.inception ? ` (${formatDate(data.inception)})` : ""}. The index holds no cash
                buffer and applies no tranche or liquidity logic; those belong to a managed portfolio, not to a published index.
              </p>
            </section>
          ) : null}

          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className="text-[15px] font-bold uppercase tracking-wide">Constituents</h2>
              {data.constituentsWithheld ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-mute)" }}>
                  <Lock className="h-3.5 w-3.5" />
                  Names available on request
                </span>
              ) : null}
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wider" style={{ background: "var(--bg-2)", color: "var(--text-mute)" }}>
                      <th className="text-left font-bold px-3.5 py-2">Company</th>
                      <th className="text-left font-bold px-3.5 py-2">Sector</th>
                      <th className="text-left font-bold px-3.5 py-2">Sleeve</th>
                      <th className="text-right font-bold px-3.5 py-2">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.constituents.map((c, i) => (
                      <tr key={c.symbol ?? `row-${c.rank ?? i}`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-3.5 py-2.5">
                          {c.symbol ? (
                            <Link href={`/companies/${c.symbol}`} className="flex items-center gap-2 group">
                              <CompanyLogo ticker={c.symbol} name={c.symbol} size={22} />
                              <span className="font-mono font-semibold group-hover:text-accent transition">{c.symbol}</span>
                            </Link>
                          ) : (
                            // Nothing real is under this blur. The symbol never
                            // arrived, the decoy is an invented ticker, there is
                            // no /companies link to follow and no logo request
                            // to read off the network tab — a logo is fetched BY
                            // TICKER, so rendering one would have announced the
                            // holding to anyone watching DevTools while the page
                            // looked properly locked.
                            <span className="flex items-center gap-2" aria-label="Constituent withheld">
                              <span
                                className="inline-block rounded-full shrink-0"
                                style={{ width: 22, height: 22, background: "var(--bg-3)", border: "1px solid var(--border)" }}
                              />
                              <span
                                className="font-mono font-semibold select-none"
                                style={{ filter: "blur(4.5px)", opacity: 0.75 }}
                                aria-hidden="true"
                              >
                                {decoyFor(i)[0]}
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-[12.5px]" style={{ color: "var(--text-soft)" }}>{c.sector || "—"}</td>
                        <td className="px-3.5 py-2.5">
                          <span className="inline-flex gap-1 flex-wrap">
                            {(c.sleeves || []).map((s) => (
                              <span key={s} className="text-[10.5px] font-semibold rounded-full px-2 py-0.5"
                                style={{ background: "var(--bg-3)", color: "var(--text-soft)", border: "1px solid var(--border)" }}>
                                {SLEEVE_LABEL[s] || s}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular font-semibold">{(c.weight * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* The gate sits UNDER the table rather than over it, because the
                weights, sectors and sleeves above are genuinely public: the
                reader can see the shape of the index and judge whether the
                names are worth asking for. `checking` is waited out so an
                approved reader never sees the form flash before their token
                comes back verified. */}
            {!checking && !granted && data.constituentsWithheld ? (
              <div className="mt-4">
                <RequestAccessGate
                  dataset="ibcx"
                  title="Constituent names are available on request"
                  blurb="The index level, its history, and every constituent's sector, sleeve and weight are published openly. The company names and tickers are released to institutions on request — tell us who you are and we will review it."
                  bullets={[
                    "Every constituent name and ticker, at the current reconstitution",
                    "Sector, sleeve and weight for each holding, as published above",
                    "Reviewed by hand; approval is emailed to your company address",
                  ]}
                />
              </div>
            ) : null}
          </section>
        </>
      )}

      <section className="rounded-lg p-4 text-[12.5px] leading-relaxed" style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-4 w-4" style={{ color: "var(--accent)" }} />
          <span className="font-bold uppercase tracking-wider text-[11px]">How this index is built, and what it is not</span>
        </div>
        <p className="mb-2">
          Two gates decide membership. The first is absolute: more assets than debt, a healthy current ratio and interest
          coverage, growing revenue, free cash flow that is positive or clearly improving, and enough size and traded volume
          to be buyable. A company failing any one of them is ineligible regardless of anything else. The second scores
          insider conviction over 24 months of filings, weighting the last six months most heavily, counting open-market
          purchases as the dominant signal and excluding planned sales entirely, because a scheduled sale says nothing about
          conviction.
        </p>
        <p>{data?.disclaimer}</p>
      </section>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
      <div className="text-[10.5px] uppercase tracking-wider font-bold" style={{ color: "var(--text-mute)" }}>{label}</div>
      <div className="text-[20px] font-bold tabular mt-0.5" style={{ color: tone === "up" ? "#10B981" : tone === "down" ? "#EF4444" : "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { DataTable, Column } from "@/components/DataTable";
import { PromoterSpendChart } from "@/components/promoter/PromoterSpendChart";
import { PromoterBacktest } from "@/components/promoter/PromoterBacktest";
import { PromoterScoreCell } from "@/components/promoter/PromoterScoreCell";
import { PromoterEmailSignup } from "@/components/promoter/PromoterEmailSignup";
import { useDataAccess } from "@/lib/data-access";
import { RequestAccessGate } from "@/components/promoter/RequestAccessGate";
import { MaskedCell } from "@/components/premium/MaskedCell";
import { issuerDecoyFor } from "@/components/premium/lockedDecoys";

/** Free rows on the ranking before the unlock wall — same count as Top IR Promoters. */
const LOCKED_ROWS = 8;

/**
 * Workstream F §2.5 — the ranking page: "most-promoted stocks (by score, by
 * spend, by spend/market cap), filterable by sector, standard data-article
 * chart module on top".
 *
 * FRAMING (§2.6). George owns the house position on whether promotion spend
 * reads as visibility or as caution, and he has not settled it. Rather than
 * block the page or pick a side for him, every line of copy here is
 * descriptive: what was disclosed, by whom, for how much. No adjective calls
 * a number good or bad, and the page says outright that spending is legal,
 * disclosed and normal. When the house position arrives it is a copy change
 * in this file and in `methodology`, not a rebuild.
 */

interface Row {
  ticker: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  score: number | null;
  spendCad: number | null;
  priorSpendCad: number | null;
  qoqChange: number | null;
  spendPerMcapBps: number | null;
  activeContracts: number;
  newContracts: number;
  endedContracts: number;
  marketCap: number | null;
  components: Record<string, number | null>;
  /** Share price change since the issuer's first priced IR contract began, as a fraction. */
  perfSinceStart: number | null;
  perf90d: number | null;
  perfStartDate: string | null;
  perfNote: string | null;
  /** Shares traded through German venues from the first contract start through day 90 (or today). */
  deVolPost: number | null;
  dePostDays: number | null;
  /** German volume as a fraction of German + home-exchange volume over the same span. */
  dePctOfTotal: number | null;
  deVolAvg30: number | null;
  deVolAvg90: number | null;
  deVolBefore: number | null;
  deVolGrowth30: number | null;
  deVolGrowth90: number | null;
  deVenues: Array<{ code: string; name: string; volume: number }> | null;
  deNote: string | null;
  /** The issuer's earliest dated IR contract — when the promotion began. */
  promotionStart: string | null;
  /** Dollar value traded on the home listing since the promotion began, in CAD. */
  dollarVolumeCad: number | null;
  dollarVolumeNative: number | null;
  dollarVolumeCurrency: string | null;
  dollarVolumeDays: number | null;
  dollarVolumeSessions: number | null;
  /** Cash IR fees accrued over that period across all of the issuer's contracts, CAD. */
  spendToDateCad: number | null;
  spendContracts: number;
  totalContracts: number;
  /** dollarVolumeCad ÷ spendToDateCad, one decimal. */
  volumeMultiple: number | null;
}

function fullDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

function multiple(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 100) return `${Math.round(v)}x`;
  return `${v.toFixed(1)}x`;
}

function shares(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}K`;
  return `${Math.round(v)}`;
}

interface Payload {
  quarter: string;
  quarters: string[];
  sectors: Array<{ sector: string; count: number }>;
  rows: Row[];
  weights: Record<string, number>;
}

function money(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e6) return `C$${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M`;
  if (v >= 1e3) return `C$${(v / 1e3).toFixed(0)}K`;
  return `C$${Math.round(v)}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return "start";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "start";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function pct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${(v * 100).toFixed(0)}%`;
}

export default function PromoterScorePage() {
  // Paygate (George 2026-09-16, "same as top promoters"): every figure stays
  // visible, the issuer identity is what the unlock buys. Locked rows carry
  // fixed decoy tickers and names — never the real ones, not even blurred.
  // George 2026-09-21: this dataset is NOT sold through the subscription —
  // access comes from a reviewed Request Access form, so nothing here reads
  // `premium`. A paying subscriber without an approved request still sees the
  // gate, which is the point.
  const { granted, checking } = useDataAccess("promoter-score");
  const locked = !granted;
  const [quarter, setQuarter] = useState<string>("");
  const [sector, setSector] = useState<string>("");
  const [sort, setSort] = useState<"score" | "spend" | "perMcap" | "contracts" | "perf" | "deVol" | "start" | "dvol" | "multiple">("score");
  /** Stock-performance filter: every issuer, only priced ones, or only gainers. */
  const [perfFilter, setPerfFilter] = useState<"all" | "priced" | "up" | "down">("all");
  const [q, setQ] = useState("");

  const key = `${API_BASE}/promoter/ranking?limit=250${quarter ? `&quarter=${quarter}` : ""}${
    sector ? `&sector=${encodeURIComponent(sector)}` : ""
  }&sort=${sort}`;
  const { data, isLoading } = useSWR<Payload>(key, fetcher, { revalidateOnFocus: false });

  const rows = useMemo(
    () =>
      (data?.rows || []).filter(
        (r) =>
          (perfFilter === "all" ||
            (perfFilter === "priced" && r.perfSinceStart != null) ||
            (perfFilter === "up" && r.perfSinceStart != null && r.perfSinceStart > 0) ||
            (perfFilter === "down" && r.perfSinceStart != null && r.perfSinceStart < 0)) &&
          // Search only works unlocked: matching a hidden name would confirm it.
          (locked ||
            !q ||
            r.ticker.toLowerCase().includes(q.toLowerCase()) ||
            (r.name || "").toLowerCase().includes(q.toLowerCase()) ||
            (r.sector || "").toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, perfFilter, locked],
  );

  /** Chart rows for a locked visitor: same bars, decoy identities. */
  const chartRows = useMemo(
    () =>
      locked
        ? rows.slice(0, 12).map((r, i) => {
            const [t, n, ex] = issuerDecoyFor(i);
            return { ...r, ticker: t, name: n, exchange: ex, sector: null };
          })
        : rows.slice(0, 12),
    [rows, locked],
  );

  const columns: Column<Row>[] = [
    {
      key: "ticker",
      label: "Issuer",
      sortable: !locked,
      sortValue: (r) => r.ticker,
      render: (r, index) =>
        locked ? (
          (() => {
            const [dTicker, dName, dExchange] = issuerDecoyFor(index);
            return (
              <MaskedCell label="the issuers" lock href="#request-access">
                <span className="block font-bold text-[13.5px] leading-tight" style={{ color: "var(--text)" }}>
                  {dTicker}
                  <span className="ml-1.5 text-[10.5px] font-semibold text-faint">{dExchange}</span>
                </span>
                <span className="block text-[11.5px] text-mute leading-tight">{dName}</span>
              </MaskedCell>
            );
          })()
        ) : (
        <Link href={`/promoter-score/${r.ticker}`} className="group min-w-0 block">
          <span className="block font-bold text-[13.5px] leading-tight group-hover:text-accent" style={{ color: "var(--text)" }}>
            {r.ticker}
            {r.exchange ? <span className="ml-1.5 text-[10.5px] font-semibold text-faint">{r.exchange}</span> : null}
          </span>
          <span className="block text-[11.5px] text-mute leading-tight truncate max-w-[210px]">{r.name || "—"}</span>
          {r.sector ? (
            <span className="block text-[10.5px] text-faint leading-tight truncate max-w-[210px]">{r.sector}</span>
          ) : null}
        </Link>
        ),
    },
    {
      key: "score",
      label: "Score",
      align: "center",
      info: "A 0–100 percentile rank against sector peers, blending disclosed IR spend, spend relative to market capitalisation, the change versus last quarter, options granted to promoters, and the number of concurrent providers. It measures how much promotion a company has disclosed — not whether the company is a good or bad investment.",
      sortValue: (r) => r.score ?? null,
      render: (r) => <PromoterScoreCell score={r.score} components={r.components} weights={data?.weights} />,
    },
    {
      key: "spendCad",
      label: "IR spend",
      align: "right",
      info: "Cash fees payable under the issuer's active investor-relations, promotional and market-making agreements for this quarter, converted to Canadian dollars. Contracts are pro-rated over the months they actually run.",
      sortValue: (r) => r.spendCad ?? 0,
      render: (r) => <span className="tabular font-bold text-[14px]" style={{ color: "var(--text)" }}>{money(r.spendCad)}</span>,
    },
    {
      key: "promotionStart",
      label: "Promotion start",
      align: "right",
      info: "The start date of the issuer's earliest disclosed IR, promotional or market-making contract — the day the promotion began. Where a release said only \"effective immediately\", the release date stands in. Every since-start figure on this row is measured from here.",
      sortValue: (r) => (r.promotionStart ? Date.parse(r.promotionStart) : -Infinity),
      render: (r) =>
        r.promotionStart ? (
          <span className="inline-block text-right">
            <span className="block tabular text-[13px] font-semibold" style={{ color: "var(--text)" }}>
              {fullDate(r.promotionStart)}
            </span>
            <span className="block text-[11px] leading-tight text-mute">
              {daysSince(r.promotionStart) != null ? `${daysSince(r.promotionStart)}d ago` : ""}
              {r.totalContracts > 1 ? ` · ${r.totalContracts} contracts` : ""}
            </span>
          </span>
        ) : (
          <span className="text-[12px]" style={{ color: "var(--text-soft)" }}>
            No dated contract
          </span>
        ),
    },
    {
      key: "qoqChange",
      label: "QoQ",
      align: "right",
      info: "Change in disclosed spend versus the prior quarter. A new contract shows as an increase; an expiry or termination shows as a decrease.",
      sortValue: (r) => r.qoqChange ?? -Infinity,
      render: (r) => (
        <span
          className="tabular text-[13px] font-semibold"
          style={{ color: r.qoqChange == null ? "var(--text-mute)" : r.qoqChange > 0 ? "var(--good)" : r.qoqChange < 0 ? "var(--bad)" : "var(--text-mute)" }}
        >
          {pct(r.qoqChange)}
        </span>
      ),
    },
    {
      key: "spendPerMcapBps",
      label: "Spend/cap",
      align: "right",
      info: "Quarterly IR spend as basis points of market capitalisation — the comparable that means the same thing for a C$4M shell and a C$300M producer. Blank where no market capitalisation is available for the issuer.",
      sortValue: (r) => r.spendPerMcapBps ?? -1,
      render: (r) => (
        <span className="tabular text-[13px]" style={{ color: "var(--text-soft)" }}>
          {r.spendPerMcapBps == null ? "—" : `${r.spendPerMcapBps.toFixed(1)} bps`}
        </span>
      ),
    },
    {
      key: "perfSinceStart",
      label: "Stock performance",
      align: "right",
      info: "Share price change from the first session on or after the issuer's earliest IR contract start date to the latest close. It measures what the stock did after the engagement began; it is not a claim that the promotion caused the move. Blank where our price data does not cover the listing.",
      sortValue: (r) => r.perfSinceStart ?? -Infinity,
      render: (r) =>
        r.perfSinceStart == null ? (
          <span className="text-[12px] leading-tight inline-block max-w-[150px]" style={{ color: "var(--text-soft)" }} title={r.perfNote || undefined}>
            No price data
          </span>
        ) : (
          <span className="inline-block text-right">
            <span
              className="block tabular text-[13.5px] font-bold"
              style={{ color: r.perfSinceStart > 0 ? "var(--good)" : r.perfSinceStart < 0 ? "var(--bad)" : "var(--text-mute)" }}
            >
              {pct(r.perfSinceStart)}
            </span>
            <span className="block text-[11px] leading-tight text-mute">
              since {shortDate(r.perfStartDate)}
              {r.perf90d != null ? ` · 90d ${pct(r.perf90d)}` : ""}
            </span>
          </span>
        ),
    },
    {
      key: "dollarVolumeCad",
      label: "$ traded since start",
      align: "right",
      info: "Dollar value of every share traded on the issuer's home exchange from the promotion start date to the latest close — each session's close price times its volume, summed — converted to Canadian dollars. Every trade has a buyer, so this is the money that changed hands for the stock after the promotion began. German-venue trades are not included (that data comes as shares, not prices). Blank where our price data does not cover the listing.",
      sortValue: (r) => r.dollarVolumeCad ?? -Infinity,
      render: (r) =>
        r.dollarVolumeCad == null ? (
          <span className="text-[12px] leading-tight inline-block max-w-[150px]" style={{ color: "var(--text-soft)" }} title={r.perfNote || undefined}>
            No price data
          </span>
        ) : (
          <span className="inline-block text-right">
            <span className="block tabular text-[13.5px] font-bold" style={{ color: "var(--text)" }}>
              {money(r.dollarVolumeCad)}
            </span>
            <span className="block text-[11px] leading-tight text-mute">
              {r.dollarVolumeDays != null ? `${r.dollarVolumeDays}d` : "since start"}
              {r.perfStartDate && r.promotionStart && r.perfStartDate.slice(0, 10) !== r.promotionStart.slice(0, 10)
                ? ` since ${shortDate(r.perfStartDate)}`
                : ""}
              {r.dollarVolumeDays ? ` · ${money(r.dollarVolumeCad / Math.max(1, r.dollarVolumeDays))}/day` : ""}
              {r.dollarVolumeCurrency && r.dollarVolumeCurrency !== "CAD" ? ` · from ${r.dollarVolumeCurrency}` : ""}
            </span>
          </span>
        ),
    },
    {
      key: "volumeMultiple",
      label: "Traded ÷ IR spend",
      align: "right",
      info: "Dollars traded since the issuer's first priced contract began, divided by the cash IR fees accrued by all of the issuer's disclosed contracts since each began — 8.0x means eight dollars changed hands for every dollar of disclosed fees. Fees accrue by elapsed months at the disclosed monthly rate (or pro rata over the term for a contract disclosed as a total); options and share grants are not cash and are not counted. It measures what the market traded against what the promotion cost; it does not mean the promotion caused the trading, and it is not a return to shareholders.",
      sortValue: (r) => r.volumeMultiple ?? -Infinity,
      render: (r) =>
        r.volumeMultiple == null ? (
          <span
            className="text-[12px] leading-tight inline-block max-w-[150px]"
            style={{ color: "var(--text-soft)" }}
            title={
              r.dollarVolumeCad == null
                ? r.perfNote || "No price data for this listing."
                : "No cash fee was disclosed for this issuer's contracts, so there is nothing to divide by."
            }
          >
            {r.dollarVolumeCad == null ? "No price data" : "No fee disclosed"}
          </span>
        ) : (
          <span className="inline-block text-right">
            <span
              className="block tabular text-[14px] font-extrabold"
              style={{ color: r.volumeMultiple >= 1 ? "var(--text)" : "var(--bad)" }}
            >
              {multiple(r.volumeMultiple)}
            </span>
            <span className="block text-[11px] leading-tight text-mute">
              {money(r.dollarVolumeCad)} traded ÷ {money(r.spendToDateCad)} fees
            </span>
            {r.spendContracts < r.totalContracts ? (
              <span className="block text-[10.5px] leading-tight text-faint">
                fees known for {r.spendContracts} of {r.totalContracts} contracts
              </span>
            ) : null}
          </span>
        ),
    },
    {
      key: "deVolPost",
      label: "Volume · Germany",
      align: "right",
      info: "Shares traded on German venues — Frankfurt, Stuttgart, Tradegate, gettex, LS Exchange, Quotrix, Munich, Düsseldorf, Hamburg, Berlin — from the issuer's earliest IR contract start date through the 90th day after it (or today, if sooner). The percentage is German volume as a share of German plus home-exchange volume over the same span; the growth figure compares average daily German volume in the first 30 days with the 30 sessions before the start. Source: onvista end-of-day data. A dash means no German quotation was found.",
      sortValue: (r) => r.deVolPost ?? -Infinity,
      render: (r) =>
        r.deVolPost == null || r.deVolPost <= 0 ? (
          <span
            className="text-[12px] leading-tight inline-block max-w-[150px]"
            style={{ color: "var(--text-soft)" }}
            title={r.deNote || (r.perfStartDate ? undefined : "No agreement with a start date on file for this issuer.")}
          >
            {r.deVenues && r.deVenues.length ? "No German trades" : r.deNote ? "No German listing" : r.perfStartDate ? "Not yet computed" : "No dated contract"}
          </span>
        ) : (
          <span className="inline-block text-right" title={r.deVenues?.map((v) => `${v.name}: ${shares(v.volume)}`).join(" · ") || undefined}>
            <span className="block tabular text-[13.5px] font-bold" style={{ color: "var(--text)" }}>
              {shares(r.deVolPost)}
              <span className="ml-1 text-[10.5px] font-semibold text-mute">sh</span>
            </span>
            <span className="block text-[11px] leading-tight text-mute">
              {r.dePostDays != null ? `${r.dePostDays}d post-start` : "post-start"}
              {r.dePctOfTotal != null ? ` · ${(r.dePctOfTotal * 100).toFixed(r.dePctOfTotal < 0.1 ? 1 : 0)}% of flow` : ""}
              {r.deVolGrowth30 != null ? (
                <>
                  {" · "}
                  <span style={{ color: r.deVolGrowth30 > 0 ? "var(--good)" : r.deVolGrowth30 < 0 ? "var(--bad)" : undefined }}>
                    {pct(r.deVolGrowth30)}
                  </span>
                  {" vs pre"}
                </>
              ) : null}
            </span>
            {r.deVenues && r.deVenues.length ? (
              <span className="block text-[10.5px] leading-tight text-mute truncate max-w-[170px]">
                {r.deVenues.slice(0, 3).map((v) => v.name).join(", ")}
                {r.deVenues.length > 3 ? ` +${r.deVenues.length - 3}` : ""}
              </span>
            ) : null}
          </span>
        ),
    },
    {
      key: "activeContracts",
      label: "Providers",
      align: "center",
      info: "Number of investor-relations or promotional providers under contract during the quarter.",
      sortValue: (r) => r.activeContracts,
      render: (r) => (
        <span className="tabular text-[13px] font-semibold" style={{ color: "var(--text)" }}>
          {r.activeContracts}
          {r.newContracts > 0 ? <span className="ml-1 text-[10.5px] font-bold" style={{ color: "var(--good)" }}>+{r.newContracts}</span> : null}
          {r.endedContracts > 0 ? <span className="ml-1 text-[10.5px] font-bold" style={{ color: "var(--bad)" }}>−{r.endedContracts}</span> : null}
        </span>
      ),
    },
  ];

  return (
    // 1400, not the site's usual 1180: eleven columns since the start-date /
    // dollars-traded / multiple additions, and a table that scrolls sideways
    // hides exactly the columns George asked for.
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <header className="mb-5">
        <div className="flex items-center gap-2.5 mb-2">
          <Megaphone size={20} style={{ color: "var(--accent)" }} />
          <h1 className="text-[26px] font-extrabold leading-none" style={{ color: "var(--text)" }}>
            Promoter Score
          </h1>
        </div>
        <p className="text-[13.5px] leading-relaxed max-w-[760px]" style={{ color: "var(--text-soft)" }}>
          How much Canadian venture issuers pay to be promoted. TSX Venture Policy 3.4 and the Canadian Securities
          Exchange require issuers to disclose every investor-relations, promotional and market-making agreement by news
          release — the provider, the fee, the term, and any options granted. We read those releases and total the spend
          per quarter.{" "}
          <span style={{ color: "var(--text-mute)" }}>
            Paying for investor relations is legal, disclosed and ordinary, and we take no view on whether it is a good
            sign or a bad one. Open any issuer to see what its share price did after each contract began.
          </span>
        </p>
      </header>

      {/* §2.5 "standard data-article chart module on top" */}
      <PromoterSpendChart rows={chartRows} loading={isLoading} quarter={data?.quarter} locked={locked} />

      <div className="flex flex-wrap items-center gap-2 mt-5 mb-3">
        <select
          value={quarter || data?.quarter || ""}
          onChange={(e) => setQuarter(e.target.value)}
          className="text-[12.5px] font-semibold rounded-md px-2.5 py-1.5"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
          aria-label="Quarter"
        >
          {(data?.quarters?.length ? data.quarters : [data?.quarter || ""]).map((qt) => (
            <option key={qt} value={qt}>
              {qt}
            </option>
          ))}
        </select>

        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="text-[12.5px] font-semibold rounded-md px-2.5 py-1.5"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
          aria-label="Sector"
        >
          <option value="">All sectors</option>
          {(data?.sectors || []).map((s) => (
            <option key={s.sector} value={s.sector}>
              {s.sector} ({s.count})
            </option>
          ))}
        </select>

        <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {([
            ["score", "Score"],
            ["spend", "Spend"],
            ["perMcap", "Spend / cap"],
            ["contracts", "Providers"],
            ["perf", "Performance"],
            ["start", "Start date"],
            ["dvol", "$ traded"],
            ["multiple", "Traded ÷ spend"],
            ["deVol", "German volume"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setSort(v)}
              className="text-[12px] font-semibold px-2.5 py-1.5"
              style={{
                background: sort === v ? "var(--accent)" : "var(--bg-elevated)",
                color: sort === v ? "#fff" : "var(--text-soft)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={perfFilter}
          onChange={(e) => setPerfFilter(e.target.value as typeof perfFilter)}
          className="text-[12.5px] font-semibold rounded-md px-2.5 py-1.5"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
          aria-label="Stock performance filter"
        >
          <option value="all">Performance: all</option>
          <option value="priced">Performance: with price data</option>
          <option value="up">Performance: gainers only</option>
          <option value="down">Performance: decliners only</option>
        </select>

        {!locked ? (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search issuer or sector"
            className="text-[12.5px] rounded-md px-2.5 py-1.5 flex-1 min-w-[160px]"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        ) : null}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.ticker}
        initialSort={{
          key:
            sort === "spend" ? "spendCad"
            : sort === "perMcap" ? "spendPerMcapBps"
            : sort === "contracts" ? "activeContracts"
            : sort === "perf" ? "perfSinceStart"
            : sort === "deVol" ? "deVolPost"
            : sort === "start" ? "promotionStart"
            : sort === "dvol" ? "dollarVolumeCad"
            : sort === "multiple" ? "volumeMultiple"
            : "score",
          dir: "desc",
        }}
        // The row wall still limits what a visitor sees, but its CTA is no
        // longer a subscribe button — the Request Access form below is the
        // only way in, so the wall carries no bullets of its own.
        gate={{
          label: "Promoter Score",
          freeRows: LOCKED_ROWS,
          teaser: true,
          bullets: [],
          // Not a subscription product: the page owns the lock.
          locked,
          ctaHref: "#request-access",
          ctaLabel: "Request access",
        }}
        empty={
          isLoading
            ? "Loading disclosed agreements…"
            : "No disclosed IR agreements for this quarter yet."
        }
      />

      {locked && !checking && (
        <RequestAccessGate
          dataset="promoter-score"
          title="The Promoter Score dataset is available on request"
          bullets={[
            "Every TSXV and CSE issuer with a disclosed IR, promotional or market-making contract, named",
            "Disclosed spend, spend against market cap, promotion start date, and what the stock did after",
            "Dollars traded since the promotion began against the fees paid, and the volume through German venues",
          ]}
        />
      )}

      {/* George 2026-09-21: the promotion backtest. */}
      <PromoterBacktest locked={locked} />

      <PromoterEmailSignup source="promoter-score" />

      <section
        className="mt-6 rounded-lg p-4"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-[15px] font-bold mb-1.5" style={{ color: "var(--text)" }}>
          The full agreement table
        </h2>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-soft)" }}>
          Every parsed agreement — issuer, provider, start date, term, monthly fee, total contract value, options
          granted, and a link to the source news release — is available as a data feed for IR firms, agencies and
          investor-relations teams. It is a separate B2B product, not part of a Premium subscription.{" "}
          <a href="mailto:devs@insiderbuying.com?subject=IR%20agreement%20data%20feed" className="text-accent font-semibold hover:underline">
            Request access
          </a>
          .
        </p>
      </section>
    </div>
  );
}

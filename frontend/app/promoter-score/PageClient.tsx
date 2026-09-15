"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { DataTable, Column } from "@/components/DataTable";
import { PromoterSpendChart } from "@/components/promoter/PromoterSpendChart";
import { PromoterScoreCell } from "@/components/promoter/PromoterScoreCell";

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
  const [quarter, setQuarter] = useState<string>("");
  const [sector, setSector] = useState<string>("");
  const [sort, setSort] = useState<"score" | "spend" | "perMcap" | "contracts" | "perf">("score");
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
          (!q ||
            r.ticker.toLowerCase().includes(q.toLowerCase()) ||
            (r.name || "").toLowerCase().includes(q.toLowerCase()) ||
            (r.sector || "").toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, perfFilter],
  );

  const columns: Column<Row>[] = [
    {
      key: "ticker",
      label: "Issuer",
      sortValue: (r) => r.ticker,
      render: (r) => (
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
          <span className="text-[11px] leading-tight text-faint inline-block max-w-[150px]" title={r.perfNote || undefined}>
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
            <span className="block text-[10.5px] leading-tight text-faint">
              since {shortDate(r.perfStartDate)}
              {r.perf90d != null ? ` · 90d ${pct(r.perf90d)}` : ""}
            </span>
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
    <div className="max-w-[1180px] mx-auto px-4 py-6">
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
      <PromoterSpendChart rows={rows.slice(0, 12)} loading={isLoading} quarter={data?.quarter} />

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

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search issuer or sector"
          className="text-[12.5px] rounded-md px-2.5 py-1.5 flex-1 min-w-[160px]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
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
            : "score",
          dir: "desc",
        }}
        empty={
          isLoading
            ? "Loading disclosed agreements…"
            : "No disclosed IR agreements for this quarter yet."
        }
      />

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

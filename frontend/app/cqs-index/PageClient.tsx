"use client";
import { usePremiumSWR } from "@/lib/premium-fetch";
import Link from "next/link";
import { useState } from "react";
import { Landmark, Clock } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { DataTable, Column } from "@/components/DataTable";
import { CompanyLogo } from "@/components/CompanyLogo";
import { rankColumn } from "@/components/tableColumns";
import { CqsScoreCell, CqsGradeBadge, gradeOf } from "@/components/CqsScoreCell";
import { PremiumValue } from "@/components/premium/PremiumValue";
import { IqsScoreCell } from "@/components/IqsScoreCell";

/** One qualifying stock on the Congress Quality Score index (Brief v9 §6). */
export interface CqsRow {
  id: string;
  ticker: string;
  companyName: string;
  cqs: number | null;
  grade: string;
  isGoldRing: boolean;
  distinctMembers: number;
  isBipartisan: boolean;
  partyCounts: { R: number; D: number; I: number } | null;
  totalEstBuyValue: number | null;
  largestSingleBand: string | null;
  buyCount: number;
  sellCount: number;
  buyers: Array<{ name: string; party: string | null; grade: string | null; estValue: number }> | null;
  committees: string[] | null;
  highestRole: string | null;
  contractValue12m: number | null;
  contractCount12m: number;
  topAgency: string | null;
  iqs: number | null;
  bestCtsScore: number | null;
  firstBuyDate: string | null;
  lastBuyDate: string | null;
  lastFilingDate: string | null;
  avgFilingLagDays: number | null;
  hasLateFiling: boolean;
  tradeRoiPct: number | null;
  sinceFilingRoiPct: number | null;
  avgClusterRoiPct: number | null;
  estPnlUsd: number | null;
  c7Freshness: number | null;
  multiplierInsiderOverlap: number | null;
  sector: string | null;
  marketCap: number | null;
  lastPrice: number | null;
}

/**
 * Postgres hands `numeric` columns back as strings through node-postgres, so a
 * field typed `number` can still arrive as "4458011.50". The API coerces now,
 * but every formatter and sort key here coerces too: a string reaching
 * Number.isFinite renders a dash on a row that has data, and a string reaching
 * a sort comparator orders "9" above "1279004".
 */
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Compact dollars: $28.4B, $970M, $4.1M — the same shape the other boards use. */
function fmtBig(raw: number | string | null | undefined): string {
  const v = num(raw);
  if (v == null || v === 0) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${Math.round(a)}`;
}

function fmtPct(raw: number | string | null | undefined): React.ReactNode {
  const v = num(raw);
  if (v == null) return <span className="text-faint">—</span>;
  return (
    <span
      className="tabular font-semibold"
      style={{ color: v > 0 ? "var(--good)" : v < 0 ? "var(--bad)" : "var(--text-mute)" }}
    >
      {v > 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

const shortDate = (d: string | null): string =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—";

const ROLE_LABEL: Record<string, string> = {
  chair: "Chair",
  ranking: "Ranking member",
  viceChair: "Vice chair",
  member: "Member",
};

export default function CqsIndexPage() {
  const [q, setQ] = useState("");
  // The API strips the paid fields for anyone without a subscription, so this
  // read has to carry the token (see lib/premium-fetch.ts). Signed out it uses
  // the same key as before, which keeps the SSR seed and the Googlebot HTML.
  const { data, isLoading } = usePremiumSWR<{
    rows: CqsRow[];
    asOfDate: string | null;
    frame: string;
    total?: number;
    premium?: boolean;
  }>(`${API_BASE}/cqs/leaderboard?limit=100`, {
    refreshInterval: 30 * 60_000,
    revalidateOnFocus: false,
  });

  const rows = (data?.rows || []).filter(
    (r) =>
      !q ||
      r.ticker.toLowerCase().includes(q.toLowerCase()) ||
      (r.companyName || "").toLowerCase().includes(q.toLowerCase()) ||
      (r.sector || "").toLowerCase().includes(q.toLowerCase()) ||
      (r.buyers || []).some((b) => b.name.toLowerCase().includes(q.toLowerCase())),
  );

  /**
   * The API removes the paid fields rather than blanking them (George
   * 2026-09-24), so an absent `committees` or `contractValue12m` means "not
   * entitled", not "no oversight link" and not "$0". Those two cells have a
   * real empty state — most stocks genuinely have neither — so without this
   * flag a logged-out reader would be told, confidently and wrongly, that no
   * stock on the board has an oversight connection.
   */
  const withheld = data?.premium === false;

  const columns: Column<CqsRow>[] = [
    rankColumn<CqsRow>(),
    {
      key: "ticker",
      label: "Company",
      sortValue: (r) => r.ticker,
      render: (r) => (
        <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2.5 group">
          <span
            className="flex-shrink-0 rounded-md overflow-hidden bg-white flex items-center justify-center"
            style={{ width: 30, height: 30, padding: 3, border: "1px solid var(--border)" }}
          >
            <CompanyLogo ticker={r.ticker} name={r.companyName} size={24} />
          </span>
          <span className="min-w-0">
            <span
              className="block font-bold text-[13.5px] leading-tight group-hover:text-accent"
              style={{ color: "var(--text)" }}
            >
              {r.ticker}
            </span>
            <span className="block text-[11.5px] text-mute leading-tight truncate max-w-[190px]">
              {r.companyName}
            </span>
          </span>
        </Link>
      ),
    },
    {
      key: "cqs",
      label: "CQS",
      group: "Congress Quality Score",
      align: "center",
      pro: true,
      filterable: true,
      filterType: "range",
      info: "The 0–100 Congress Quality Score: how strong the congressional buying signal on this stock is right now, from cluster breadth, position sizes, committee jurisdiction, contract proximity, the buyers' own track records, conviction against their habit, freshness and net direction. The grade is free; the number is part of the subscription.",
      sortValue: (r) => num(r.cqs),
      // Brief v9 §6: grade free, number premium. The grade stays visible so a
      // visitor can see the ranking is real without being handed the score.
      render: (r) =>
        num(r.cqs) == null ? (
          <span className="text-faint text-[11px]">Not scored</span>
        ) : (
          <span className="inline-flex flex-col items-center gap-1 leading-none">
            <PremiumValue label="Congress Quality Score">
              <span className="tabular text-[15px] font-bold" style={{ color: "var(--accent)" }}>
                {Math.round(num(r.cqs)!)}
              </span>
            </PremiumValue>
            <CqsGradeBadge grade={r.grade || gradeOf(num(r.cqs)!)} isGoldRing={r.isGoldRing} />
          </span>
        ),
    },
    {
      key: "iqs",
      label: "Insider Score",
      group: "Congress Quality Score",
      align: "center",
      filterable: true,
      filterType: "preset",
      filterLabelText: "Insider overlap",
      filterPresets: [
        {
          key: "overlap",
          label: "Insiders buying too (70+)",
          test: (r) => (num(r.multiplierInsiderOverlap) ?? 1) > 1,
        },
        { key: "scored", label: "Has an Insider Score", test: (r) => num(r.iqs) != null },
      ],
      info: "Our 0–99 Insider Score for the same stock, from corporate Form 4 buying. At 70 or better the two independent groups agree and the Congress Quality Score is lifted by 20% — the overlap flag. Most stocks members buy are large caps whose executives are paid in stock and sell rather than buy, so there is often no score to show.",
      // Brief v9 §6 lists the Insider Score as its own free column beside CQS.
      // It was only being used as an on/off overlap flag, which is off for every
      // row today, so the column read as a row of dashes on live data.
      sortValue: (r) => num(r.iqs),
      render: (r) => {
        const iqs = num(r.iqs);
        const overlap = (num(r.multiplierInsiderOverlap) ?? 1) > 1;
        return (
          <span className="inline-flex flex-col items-center gap-1 leading-none">
            <IqsScoreCell iqs={iqs} />
            {overlap && (
              <span
                className="px-1.5 h-[17px] inline-flex items-center rounded-full text-[9.5px] font-bold uppercase tracking-wide"
                style={{ background: "var(--good-soft)", color: "var(--good)", border: "1px solid var(--good)" }}
                title="Corporate insiders are net buyers too — the score is lifted 20%."
              >
                Overlap
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "distinctMembers",
      label: "Buying members",
      group: "Congress activity",
      align: "center",
      filterable: true,
      filterType: "range",
      info: "Distinct members of Congress who disclosed a purchase of this stock in the trailing 90 days. Repeat filings by the same member count once.",
      sortValue: (r) => num(r.distinctMembers) ?? 0,
      render: (r) => (
        <span className="tabular text-[14px] font-bold" style={{ color: "var(--text)" }}>
          {r.distinctMembers}
        </span>
      ),
    },
    {
      key: "party",
      label: "Party mix",
      group: "Congress activity",
      align: "center",
      filterable: true,
      filterType: "preset",
      filterLabelText: "Party",
      filterPresets: [
        { key: "bipartisan", label: "Bipartisan clusters", test: (r) => r.isBipartisan },
        { key: "r", label: "Any Republican buyer", test: (r) => (num(r.partyCounts?.R) || 0) > 0 },
        { key: "d", label: "Any Democrat buyer", test: (r) => (num(r.partyCounts?.D) || 0) > 0 },
      ],
      info: "How the buying members split by party. A bipartisan cluster — members of opposing parties independently buying the same stock — is harder to explain by shared politics, and earns a bonus in the score.",
      sortValue: (r) => (r.isBipartisan ? 1 : 0),
      render: (r) => (
        <span className="inline-flex items-center justify-center gap-1.5">
          {(r.partyCounts?.R || 0) > 0 && (
            <span className="tabular text-[11px] font-bold" style={{ color: "var(--bad)" }}>
              {r.partyCounts!.R}R
            </span>
          )}
          {(r.partyCounts?.D || 0) > 0 && (
            <span className="tabular text-[11px] font-bold" style={{ color: "var(--accent-2)" }}>
              {r.partyCounts!.D}D
            </span>
          )}
          {(r.partyCounts?.I || 0) > 0 && (
            <span className="tabular text-[11px] font-bold text-mute">{r.partyCounts!.I}I</span>
          )}
          {r.isBipartisan && (
            <span
              className="px-1.5 h-[18px] inline-flex items-center rounded-full text-[9.5px] font-bold uppercase tracking-wide"
              style={{ background: "var(--gold-soft)", color: "var(--text)", border: "1px solid var(--gold)" }}
              title="Members of both parties bought this stock in the window."
            >
              Bipartisan
            </span>
          )}
        </span>
      ),
    },
    {
      key: "totalEstBuyValue",
      label: "Est. buy value",
      group: "Congress activity",
      align: "right",
      filterable: true,
      filterType: "range",
      info: "Sum of the midpoints of every disclosed purchase band in the window. Periodic Transaction Reports give ranges, not amounts, so this is an estimate — labelled est. everywhere it appears.",
      sortValue: (r) => num(r.totalEstBuyValue) ?? 0,
      render: (r) => (
        <span className="tabular font-bold text-[14px]" style={{ color: "var(--text)" }}>
          {fmtBig(r.totalEstBuyValue)} <span className="text-mute font-normal text-[11px]">est.</span>
        </span>
      ),
    },
    {
      key: "largestSingleBand",
      label: "Largest band",
      group: "Congress activity",
      align: "center",
      info: "The highest disclosure band any single member reported on this stock in the window. The $100,001+ band on its own qualifies a stock for the index.",
      sortValue: (r) => r.largestSingleBand || "",
      render: (r) => (
        <span className="text-[11px] tabular text-mute whitespace-nowrap">
          {r.largestSingleBand || "—"}
        </span>
      ),
    },
    {
      key: "buySell",
      label: "Buys : sells",
      group: "Congress activity",
      align: "center",
      info: "Member transactions in the window. Sales are tracked and shown, but they weigh about a third of a purchase in the score: members sell for tax, divestment and ethics reasons that say nothing about the company.",
      sortValue: (r) => num(r.buyCount) ?? 0,
      render: (r) => (
        <span className="tabular text-[12px]" style={{ color: "var(--text)" }}>
          {r.buyCount}
          <span className="text-mute"> : {r.sellCount}</span>
        </span>
      ),
    },
    {
      key: "committee",
      label: "Committee",
      group: "Influence",
      pro: true,
      info: "A committee one of the buying members sits on that has jurisdiction over an agency awarding this company federal work, with the most senior seat any buyer holds. Seats come from the committee roster and the jurisdiction table, not from a contract flag, so oversight can register even where no flagged intersection exists. Empty for most stocks, which is the honest answer: most congressional buying has no oversight connection at all.",
      sortValue: (r) => r.committees?.[0] || "",
      render: (r) =>
        withheld || r.committees?.length ? (
          <PremiumValue label="Committee influence">
            <span className="inline-flex flex-col leading-tight">
              <span className="text-[11.5px] font-semibold truncate max-w-[180px]" style={{ color: "var(--text)" }}>
                {r.committees?.[0]}
                {r.committees.length > 1 ? ` +${r.committees.length - 1}` : ""}
              </span>
              <span className="text-[10.5px] text-mute">
                {ROLE_LABEL[r.highestRole || "member"] || r.highestRole}
              </span>
            </span>
          </PremiumValue>
        ) : (
          <span className="text-faint text-[11px]">No oversight link</span>
        ),
    },
    {
      key: "contractValue12m",
      label: "Contracts (12m)",
      group: "Influence",
      align: "right",
      pro: true,
      info: "Federal award dollars to this company over the last twelve months, with its top awarding agency. Sourced from USAspending.gov award records and our verified contract flags only — never inferred from a company-name match, which is how a bank ends up holding Coast Guard contracts.",
      sortValue: (r) => num(r.contractValue12m) ?? 0,
      render: (r) =>
        withheld || r.contractValue12m ? (
          <PremiumValue label="Contract alignment">
            <span className="inline-flex flex-col leading-tight items-end">
              <span className="tabular font-bold text-[13px]" style={{ color: "var(--good)" }}>
                {fmtBig(r.contractValue12m)}
              </span>
              <span className="text-[10.5px] text-mute truncate max-w-[150px]">
                {r.topAgency || `${r.contractCount12m} awards`}
              </span>
            </span>
          </PremiumValue>
        ) : (
          <span className="text-faint text-[11px]">—</span>
        ),
    },
    {
      key: "avgClusterRoiPct",
      label: "Avg cluster ROI",
      group: "Trade performance",
      align: "right",
      filterable: true,
      filterType: "range",
      info: "Mean return across the qualifying buys, each measured from the close on the member's own transaction date to the latest close. How the members' calls have done.",
      sortValue: (r) => num(r.avgClusterRoiPct),
      render: (r) => fmtPct(r.avgClusterRoiPct),
    },
    {
      key: "sinceFilingRoiPct",
      label: "Since filing",
      group: "Trade performance",
      align: "right",
      pro: true,
      info: "Return from the date the purchase was actually disclosed — what a reader could realistically have captured, as opposed to what the member captured. Shown alongside the trade ROI on purpose: one flatters, the other is actionable.",
      sortValue: (r) => num(r.sinceFilingRoiPct),
      render: (r) => (
        <PremiumValue label="Since-filing ROI">{fmtPct(r.sinceFilingRoiPct)}</PremiumValue>
      ),
    },
    {
      key: "lastBuyDate",
      label: "Last buy",
      group: "Timing",
      align: "center",
      info: "Transaction date of the most recent qualifying purchase, and whether any filing on this stock missed the 45-day STOCK Act deadline. The late-filing flag is factual transparency — it is displayed, never scored.",
      sortValue: (r) => r.lastBuyDate || "",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="text-[11.5px] tabular" style={{ color: "var(--text)" }}>
            {shortDate(r.lastBuyDate)}
          </span>
          {r.hasLateFiling && (
            <Clock
              className="h-3.5 w-3.5"
              style={{ color: "var(--text-mute)" }}
              aria-label="Filed after the 45-day STOCK Act deadline"
            />
          )}
        </span>
      ),
    },
    {
      key: "marketCap",
      label: "Market cap",
      group: "Stock",
      align: "right",
      filterable: true,
      filterType: "marketCapPreset",
      sortValue: (r) => num(r.marketCap) ?? 0,
      render: (r) => (
        <span className="tabular text-[13px] text-mute">{fmtBig(r.marketCap)}</span>
      ),
    },
    {
      key: "sector",
      label: "Sector",
      group: "Stock",
      filterable: true,
      filterType: "select",
      sortValue: (r) => r.sector || "",
      filterLabel: (r) => r.sector || "Unclassified",
      render: (r) => (
        <span className="text-[11.5px] text-mute truncate block max-w-[170px]">
          {r.sector || "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Landmark className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Congress Quality Score
          </span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          The CQS Index
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          One score per stock for how strong the congressional buying signal on it is right
          now, built only from{" "}
          <Link href="/congressional-trades" className="text-accent hover:underline">
            Periodic Transaction Reports
          </Link>{" "}
          filed under the STOCK Act. A stock enters the index when a single member discloses a
          purchase of $100,001 or more, when two or more members buy it inside 90 days, or when
          a buyer sits on a committee with jurisdiction over an agency that awards the company
          work. Everything here is public disclosure. Informational, not investment advice.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="cqs-index" />

      <div
        className="card p-4"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <label className="block text-[11px] uppercase tracking-wider font-bold text-mute mb-1">
          Search
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ticker, company, member or sector…"
          className="w-full sm:max-w-xs px-3 py-2 rounded-md text-[13px]"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
        {data?.asOfDate && (
          <p className="text-[11.5px] text-mute mt-3">
            Scored{" "}
            {new Date(`${data.asOfDate}T00:00:00Z`).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}{" "}
            over a trailing 90-day window. Sector, market cap, party and score filters are in
            the Filters panel below.
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-10">Loading the congressional buying index…</div>
        ) : (
          <DataTable<CqsRow>
            rows={rows}
            rowKey={(r) => r.ticker}
            initialSort={{ key: "cqs", dir: "desc" }}
            empty="No stock currently clears the qualification rules. The index only lists stocks members are actively buying."
            columns={columns}
            gate={{
              label: "Congress Quality Score",
              bullets: [
                "The 0–100 score behind every grade on this board",
                "Committee jurisdiction and federal contract alignment per stock",
                "Since-filing returns: what a reader could actually have captured",
                "The buyers, their Performance Grades and their conviction",
              ],
            }}
          />
        )}
      </div>

      <p className="text-[12px] text-mute leading-relaxed">
        {data?.frame ||
          "Congress Quality Score measures the strength of a disclosed, lawful trading signal from Periodic Transaction Reports filed under the STOCK Act. Dollar figures are estimates: PTRs report ranges, not amounts. Nothing here implies impropriety."}{" "}
        Grade bands match the Insider Score so the two read as one system: 90+ A+, 80–89 A,
        70–79 B+, 60–69 B, below 60 C. Weights are the Brief v9 starting values and are
        provisional until the decile calibration is run and published.
      </p>
    </div>
  );
}

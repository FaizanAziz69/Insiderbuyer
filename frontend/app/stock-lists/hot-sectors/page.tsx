"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Flame, TrendingDown, TrendingUp, X } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, Column } from "@/components/DataTable";
import { rankColumn } from "@/components/tableColumns";
import { usePremium } from "@/components/premium/PremiumContext";
import { MaskedCell } from "@/components/premium/MaskedCell";
import { PremiumRowWall } from "@/components/premium/PremiumRowWall";

interface HotSectorRow {
  rank: number;
  key: string;
  label: string;
  companies: number;
  members: number;
  gainers10: number;
  gainerRatio: number;
  insiderBuys: number;
  insiderSells: number;
  netInsider: number;
  insiderBuyValue: number;
  insiderSellValue: number;
  netInsiderValue: number;
  avgAnalystUpside: number | null;
  analystCovered: number;
  mtd: number | null;
  ytd: number | null;
  vsSp500: number | null;
  hotScore: number;
}
interface HotSectorsResponse {
  asOfDate: string;
  monthLabel: string;
  sp500Ytd: number | null;
  sectors: HotSectorRow[];
  /** Share of basket members priced this request, 0–1. */
  coverage?: number;
  /** The backend served its last good snapshot because this computation could
   *  not price enough members to rank the baskets. */
  stale?: boolean;
  computedAt?: string;
}
interface HotSectorMember {
  symbol: string;
  name: string;
  price: number | null;
  marketCap: number | null;
  mtd: number | null;
  ytd: number | null;
  priceTarget: number | null;
  analystCount: number | null;
  analystUpside: number | null;
  insiderBuys: number;
  insiderSells: number;
  insiderBuyValue: number;
  insiderSellValue: number;
  netInsiderValue: number;
  curated: boolean;
}
interface MembersResponse {
  key: string;
  label: string;
  asOfDate: string | null;
  members: HotSectorMember[];
}

function pct(v: number | null, withSign = false, dp = 2): string {
  if (v == null) return "—";
  const s = withSign && v > 0 ? "+" : "";
  return `${s}${v.toFixed(dp)}%`;
}

function hotColor(score: number): string {
  if (score >= 60) return "var(--good)";
  if (score >= 35) return "var(--gold)";
  return "var(--text-mute)";
}

const signColor = (v: number | null): string =>
  v == null ? "var(--text-mute)" : v >= 0 ? "var(--good)" : "var(--bad)";

/** Signed compact dollars: +$1.20M / −$340.00K / — */
function signedMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (v === 0) return "$0";
  return `${v > 0 ? "+" : "−"}${formatCurrency(Math.abs(v))}`;
}

/**
 * Client 2026-09-08: "paygate the sectors. Keep the data on everything, just
 * blur out the sector names." Every metric column stays visible; the Sector
 * column shows blurred DECOY names for visitors and the member drill-down is
 * closed (the stock list would name the sector). Same strict rule as every
 * other paygate: the real label is never in the DOM while locked.
 */
const DECOY_SECTORS = [
  "Space & Defense",
  "Semiconductors",
  "Cybersecurity",
  "Robotics & Automation",
  "Fintech Platforms",
  "Water Infrastructure",
  "Autonomous Vehicles",
  "Consumer Wellness",
  "Specialty Chemicals",
  "Digital Media",
  "Grid Storage",
  "Precision Medicine",
];
const decoySector = (i: number) => DECOY_SECTORS[((i % DECOY_SECTORS.length) + DECOY_SECTORS.length) % DECOY_SECTORS.length];

export default function HotSectorsPage() {
  const { unlocked } = usePremium();
  const locked = !unlocked;
  const { data, isLoading } = useSWR<HotSectorsResponse>(
    `${API_BASE}/stock-lists/hot-sectors`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const sectors = data?.sectors ?? [];
  const sp = data?.sp500Ytd ?? null;

  // Drill-down: which basket's member stocks are open under the ranking.
  const [openKeyState, setOpenKey] = useState<string | null>(null);
  // A lapsed entitlement closes the drill-down too — the member list would
  // otherwise keep naming a sector whose label is masked above it.
  const openKey = locked ? null : openKeyState;
  const { data: membersRes, isLoading: membersLoading } = useSWR<MembersResponse>(
    openKey ? `${API_BASE}/stock-lists/hot-sectors/${encodeURIComponent(openKey)}/members` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  // Scroll the panel into view when it opens, so a click low on a long
  // ranking is not answered by a table that rendered off-screen.
  useEffect(() => {
    if (!openKey) return;
    const el = document.getElementById("hot-sector-members");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openKey]);

  const columns: Column<HotSectorRow>[] = [
    rankColumn<HotSectorRow>(),
    {
      key: "label",
      label: "Sector",
      pro: true,
      // Sorting a masked column would reveal the alphabetical order of the
      // hidden names, so the header is inert while locked.
      sortable: !locked,
      sortValue: (s) => s.label,
      render: (s, i) => {
        if (locked) {
          return (
            <div>
              <MaskedCell label="sector names" lock>
                <span className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
                  {decoySector((s.rank ?? i + 1) - 1)}
                </span>
              </MaskedCell>
              <span className="block text-[11px] text-mute">
                {(s.members ?? s.companies).toLocaleString()} stocks over $50M
              </span>
            </div>
          );
        }
        const open = s.key === openKey;
        return (
          <button
            type="button"
            onClick={() => setOpenKey(open ? null : s.key)}
            className="text-left group"
            aria-expanded={open}
            aria-controls="hot-sector-members"
          >
            <span
              className="text-[15px] font-bold inline-flex items-center gap-1 group-hover:text-accent transition"
              style={{ color: open ? "var(--accent)" : "var(--text)" }}
            >
              {s.label}
              <ChevronRight
                className="h-3.5 w-3.5 transition-transform"
                style={{ transform: open ? "rotate(90deg)" : undefined, opacity: 0.7 }}
              />
            </span>
            <span className="block text-[11px] text-mute">
              {(s.members ?? s.companies).toLocaleString()} stocks over $50M ·{" "}
              <span className="underline decoration-dotted">{open ? "hide" : "view stocks"}</span>
            </span>
          </button>
        );
      },
    },
    {
      key: "hotScore",
      label: "Heat Score",
      info: "0–100 blend of breadth (60%), momentum (25%) and insider buy/sell pressure (15%) — see the methodology note under the table.",
      sortValue: (s) => s.hotScore,
      render: (s) => (
        <div className="flex items-center gap-2 min-w-[130px]">
          <div
            className="h-1.5 rounded-full flex-1 overflow-hidden"
            style={{ background: "var(--bg-3)", maxWidth: 90 }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${s.hotScore}%`, background: hotColor(s.hotScore) }}
            />
          </div>
          <span
            className="text-[14px] font-bold tabular w-7 text-right"
            style={{ color: hotColor(s.hotScore) }}
          >
            {s.hotScore}
          </span>
        </div>
      ),
    },
    {
      key: "gainers10",
      label: "10%+ Gainers",
      align: "right",
      sortValue: (s) => s.gainerRatio,
      render: (s) => (
        <>
          <span className="text-[14px] font-bold tabular" style={{ color: "var(--good)" }}>
            {s.gainers10}
          </span>
          <span className="text-[12px] text-mute tabular"> / {s.companies}</span>
          <span className="block text-[11px] text-mute tabular">
            {Math.round(s.gainerRatio * 100)}% of sector
          </span>
        </>
      ),
    },
    {
      key: "netInsiderValue",
      label: "Insider $ Flow",
      info: "Open-market insider buying minus selling this month, in dollars, summed across the sector's stocks (SEC Form 4 and BaFin filings). The sub-line shows the two sides.",
      align: "right",
      sortValue: (s) => s.netInsiderValue ?? s.netInsider,
      render: (s) => (
        <>
          <span
            className="text-[14px] font-bold tabular"
            style={{ color: signColor(s.netInsiderValue) }}
          >
            {signedMoney(s.netInsiderValue)}
          </span>
          <span className="block text-[11px] text-mute tabular whitespace-nowrap">
            <span style={{ color: "var(--good)" }}>{formatCurrency(s.insiderBuyValue ?? 0)}</span>
            {" in"} · <span style={{ color: "var(--bad)" }}>{formatCurrency(s.insiderSellValue ?? 0)}</span>
            {" out"}
          </span>
          <span className="block text-[11px] text-faint tabular">
            {s.insiderBuys} buys / {s.insiderSells} sells
          </span>
        </>
      ),
    },
    {
      key: "avgAnalystUpside",
      label: "Analyst Upside",
      info: "Median distance from the current price to the sell-side consensus price target across the sector's stocks that have one. Positive = analysts see upside.",
      align: "right",
      sortValue: (s) => s.avgAnalystUpside,
      render: (s) =>
        s.avgAnalystUpside == null ? (
          <span className="text-faint text-[13px]">—</span>
        ) : (
          <>
            <span
              className="text-[14px] font-bold tabular"
              style={{ color: signColor(s.avgAnalystUpside) }}
            >
              {pct(s.avgAnalystUpside, true, 1)}
            </span>
            <span className="block text-[11px] text-mute tabular">
              {s.analystCovered} stocks covered
            </span>
          </>
        ),
    },
    {
      key: "mtd",
      label: "MTD",
      align: "right",
      sortValue: (s) => s.mtd,
      render: (s) => (
        <span className="text-[14px] font-bold tabular" style={{ color: signColor(s.mtd) }}>
          {pct(s.mtd, true)}
        </span>
      ),
    },
    {
      key: "ytd",
      label: "YTD",
      align: "right",
      sortValue: (s) => s.ytd,
      render: (s) => (
        <span className="text-[14px] font-bold tabular" style={{ color: signColor(s.ytd) }}>
          {pct(s.ytd, true)}
        </span>
      ),
    },
    {
      key: "vsSp500",
      label: "YTD vs S&P 500",
      align: "right",
      sortValue: (s) => s.vsSp500,
      render: (s) => {
        const vs = s.vsSp500;
        return vs == null ? (
          <span className="text-faint text-[13px]">—</span>
        ) : (
          <span
            className="text-[14px] font-bold tabular inline-flex items-center gap-1 justify-end"
            style={{ color: vs >= 0 ? "var(--good)" : "var(--bad)" }}
          >
            {vs >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {vs >= 0 ? "+" : ""}
            {vs.toFixed(2)} pp
          </span>
        );
      },
    },
  ];

  const memberColumns: Column<HotSectorMember>[] = [
    {
      key: "symbol",
      label: "Company",
      sortValue: (m) => m.symbol,
      render: (m) => (
        <Link href={`/companies/${m.symbol}`} className="flex items-center gap-2 group">
          <CompanyLogo ticker={m.symbol} name={m.name} size={22} />
          <span className="min-w-0">
            <span className="block font-bold text-[13px] group-hover:text-accent">{m.symbol}</span>
            <span className="block text-[11.5px] text-mute truncate max-w-[200px]">{m.name}</span>
          </span>
        </Link>
      ),
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      sortValue: (m) => m.price,
      render: (m) => (
        <span className="tabular text-[13px]">{m.price == null ? "—" : `$${m.price.toFixed(2)}`}</span>
      ),
    },
    {
      key: "marketCap",
      label: "Market Cap",
      align: "right",
      sortValue: (m) => m.marketCap,
      render: (m) => <span className="tabular text-[13px] text-mute">{formatCurrency(m.marketCap)}</span>,
    },
    {
      key: "mtd",
      label: "MTD",
      align: "right",
      sortValue: (m) => m.mtd,
      render: (m) => (
        <span className="tabular text-[13px] font-bold" style={{ color: signColor(m.mtd) }}>
          {pct(m.mtd, true)}
        </span>
      ),
    },
    {
      key: "priceTarget",
      label: "Analyst Price Target",
      info: "Sell-side consensus (average) 12-month price target. The sub-line is how many analysts stand behind it.",
      align: "right",
      sortValue: (m) => m.priceTarget,
      render: (m) =>
        m.priceTarget == null ? (
          <span className="text-faint text-[13px]">—</span>
        ) : (
          <>
            <span className="tabular text-[13px] font-bold">${m.priceTarget.toFixed(2)}</span>
            {m.analystCount != null && m.analystCount > 0 && (
              <span className="block text-[11px] text-mute tabular">
                {m.analystCount} analyst{m.analystCount === 1 ? "" : "s"}
              </span>
            )}
          </>
        ),
    },
    {
      key: "analystUpside",
      label: "Upside / Downside",
      info: "Consensus price target vs. the current price: positive means analysts see room to rise, negative means the stock already trades above their target.",
      align: "right",
      sortValue: (m) => m.analystUpside,
      render: (m) =>
        m.analystUpside == null ? (
          <span className="text-faint text-[13px]">—</span>
        ) : (
          <span
            className="tabular text-[13px] font-bold inline-flex items-center gap-1 justify-end"
            style={{ color: signColor(m.analystUpside) }}
          >
            {m.analystUpside >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {pct(m.analystUpside, true, 1)}
          </span>
        ),
    },
    {
      key: "netInsiderValue",
      label: "Net Insider Buying vs Selling ($)",
      info: "This month's open-market insider purchases minus sales, in dollars, from the company's Form 4 filings. The sub-line shows the two sides.",
      align: "right",
      sortValue: (m) => m.netInsiderValue,
      render: (m) =>
        m.insiderBuys + m.insiderSells === 0 ? (
          <span className="text-faint text-[13px]">No filings this month</span>
        ) : (
          <>
            <span className="tabular text-[13px] font-bold" style={{ color: signColor(m.netInsiderValue) }}>
              {signedMoney(m.netInsiderValue)}
            </span>
            <span className="block text-[11px] text-mute tabular whitespace-nowrap">
              <span style={{ color: "var(--good)" }}>{formatCurrency(m.insiderBuyValue)}</span> bought ·{" "}
              <span style={{ color: "var(--bad)" }}>{formatCurrency(m.insiderSellValue)}</span> sold
            </span>
          </>
        ),
    },
  ];

  const openSector = sectors.find((s) => s.key === openKey) ?? null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link
        href="/stock-lists"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All stock lists
      </Link>

      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Flame className="h-4 w-4" style={{ color: "var(--warn)" }} />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Hot Sectors {data?.monthLabel ? `· ${data.monthLabel}` : ""}
          </span>
          <span className="live-dot live-dot-good ml-1 text-faint">live</span>
        </div>
        <h1
          className="text-[28px] sm:text-[38px] font-bold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Hot Sectors
        </h1>
        <p className="text-mute text-[14px] mt-2 max-w-3xl leading-relaxed">
          Thematic sectors — every listed stock over{" "}
          <strong className="text-[var(--text)]">$50M market cap</strong> in each — ranked by how
          many of their stocks are up{" "}
          <strong className="text-[var(--text)]">10%+ this month</strong>, by momentum, and by{" "}
          <strong className="text-[var(--text)]">insider buying</strong>, with the dollars insiders
          are putting in or taking out. Each sector&rsquo;s year-to-date return is compared to the
          S&amp;P 500
          {sp != null && (
            <>
              , currently{" "}
              <strong style={{ color: sp >= 0 ? "var(--good)" : "var(--bad)" }}>
                {pct(sp, true)} YTD
              </strong>
            </>
          )}
          .{" "}
          {locked
            ? "Sector names and each sector's stock list are part of Insider Access; every metric below is open."
            : "Click a sector to see its stocks with analyst price targets and insider flows."}
        </p>
      </header>

      {/* 2026-08-21: every sector ROW shows for all visitors (no row cap).
          2026-09-08: the sector NAMES are the paygate — see DECOY_SECTORS. */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-12">Loading sectors…</div>
        ) : (
          <DataTable<HotSectorRow>
            rows={sectors}
            rowKey={(s) => s.key}
            initialSort={{ key: "hotScore", dir: "desc" }}
            empty="No sector data available."
            columns={columns}
          />
        )}
        {!isLoading && sectors.length > 0 && (
          <PremiumRowWall
            label="Hot Sectors"
            total={sectors.length}
            bullets={[
              "See which sectors are heating up — every name unmasked",
              "Drill into each sector's stocks with analyst targets and insider flows",
              "Insider Scores, Top Insider Buys and every other Insider Access signal",
            ]}
          />
        )}
      </div>

      {data?.stale && (
        <p className="text-[12px] text-mute">
          Showing the last complete ranking while today&rsquo;s prices finish loading.
        </p>
      )}

      {/* Member drill-down */}
      {openKey && (
        <section id="hot-sector-members" className="space-y-3 scroll-mt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-mute text-[11px] font-mono uppercase tracking-wider">
                Stocks in this sector
              </div>
              <h2 className="text-[22px] font-bold tracking-tight">
                {openSector?.label ?? membersRes?.label ?? ""}
                {membersRes?.members?.length ? (
                  <span className="text-mute text-[14px] font-semibold">
                    {" "}
                    · {membersRes.members.length.toLocaleString()} stocks over $50M
                  </span>
                ) : null}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpenKey(null)}
              className="inline-flex items-center gap-1 text-[12.5px] text-mute hover:text-accent transition"
            >
              <X className="h-3.5 w-3.5" /> Close
            </button>
          </div>
          <div className="card overflow-hidden">
            {membersLoading && !membersRes ? (
              <div className="text-center text-mute py-12">Loading stocks…</div>
            ) : (
              <DataTable<HotSectorMember>
                rows={membersRes?.members ?? []}
                rowKey={(m) => m.symbol}
                initialSort={{ key: "marketCap", dir: "desc" }}
                pageSize={50}
                empty="This sector's stock list is still being built — check back in a few minutes."
                columns={memberColumns}
              />
            )}
          </div>
          <p className="text-[12px] text-mute leading-relaxed">
            Analyst price targets are the sell-side consensus where one is published; a stock
            without coverage shows a dash. Insider dollars are this calendar month&rsquo;s open-market
            purchases and sales from SEC Form 4 filings. Informational only — not investment advice.
          </p>
        </section>
      )}

      {/* Methodology note */}
      <div
        className="rounded-lg p-4 text-[12.5px] text-mute leading-relaxed"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <span className="font-bold text-[var(--text)]">How the ranking works:</span>{" "}
        Each sector holds <strong>every NASDAQ- and NYSE-listed operating company over $50M
        market cap</strong> in its industry, plus the theme&rsquo;s defining names
        {locked
          ? " (a few thematic baskets are business narratives rather than industry codes, so they are curated)"
          : " (AI, Quantum and Crypto are business narratives rather than industry codes, so those baskets are curated)"}
        .
        The <strong>Heat Score</strong> (0–100) is a weighted blend of three things measured on
        absolute scales, not against whichever peer happens to lead: <strong>breadth</strong>{" "}
        (60%) — the share of members up more than 10% month-to-date; <strong>momentum</strong>{" "}
        (25%) — the equal-weighted average member return this month; and{" "}
        <strong>insider pressure</strong> (15%) — the open-market buy/sell skew across the basket,
        scaled by how many filings stand behind it so one or two lone purchases cannot max out the
        component. <strong>Insider $ Flow</strong> is the same month&rsquo;s purchases minus sales in
        dollars, so a sector where a few executives wrote large cheques reads differently from one
        with many small routine sales. <strong>Analyst Upside</strong> is the median gap between
        price and consensus target across the covered members. MTD and YTD are equal-weighted
        averages of member stocks; YTD is also shown against the S&amp;P 500 in percentage points
        (pp). <strong>Insider figures cover SEC Form 4 and German BaFin filings only</strong> — a
        basket weighted toward Canadian-listed names ({locked ? "miners" : "gold and rare-earth miners"} especially, which
        file with SEDI) will show less buying than its insiders actually did, so read that column
        alongside breadth and momentum rather than on its own. Rankings refresh every 20 minutes.
        Informational only — not investment advice.
      </div>

      <AdSlot slot="leaderboard" seed="hot-sectors-bottom" />
    </div>
  );
}

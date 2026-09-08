"use client";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Flame, Lock, TrendingDown, TrendingUp, X } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatNumber } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, Column } from "@/components/DataTable";
import { rankColumn } from "@/components/tableColumns";
import { usePremium } from "@/components/premium/PremiumContext";
import { MaskedCell } from "@/components/premium/MaskedCell";
import { PremiumRowWall } from "@/components/premium/PremiumRowWall";
import { HotSectorsTreemap } from "@/components/lists/HotSectorsTreemap";
import { TopPerformersPanel, TopPerformer } from "@/components/lists/TopPerformersPanel";

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
  // Volume flow (client 2026-09-08). Optional: a snapshot computed before the
  // deploy has none of these until the 20-minute rebuild lands.
  volumePriced?: number;
  dollarVolume?: number;
  baselineDollarVolume?: number;
  volumeVsAvgPct?: number | null;
  upDollarVolume?: number;
  downDollarVolume?: number;
  netVolumeFlow?: number;
  netFlowPct?: number | null;
  flowIntensity?: number;
  dayChange?: number | null;
  topPerformers?: TopPerformer[];
}
interface HotSectorsResponse {
  asOfDate: string;
  monthLabel: string;
  sp500Ytd: number | null;
  sectors: HotSectorRow[];
  coverage?: number;
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
  dayChangePct?: number | null;
  volume?: number | null;
  dollarVolume?: number | null;
  volumeVsAvgPct?: number | null;
}
interface MembersResponse {
  key: string;
  label: string;
  asOfDate: string | null;
  members: HotSectorMember[];
}

function pct(v: number | null | undefined, withSign = false, dp = 2): string {
  if (v == null) return "—";
  const s = withSign && v > 0 ? "+" : "";
  return `${s}${v.toFixed(dp)}%`;
}

const signColor = (v: number | null | undefined): string =>
  v == null ? "var(--text-mute)" : v >= 0 ? "var(--good)" : "var(--bad)";

/** Signed compact dollars: +$1.20M / −$340.00K / — */
function signedMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (v === 0) return "$0";
  return `${v > 0 ? "+" : "−"}${formatCurrency(Math.abs(v))}`;
}

/**
 * Client 2026-09-08 (morning): "paygate the sectors. Keep the data on
 * everything, just blur out the sector names." Every metric stays visible; the
 * Sector column and the heat-map tiles show blurred DECOY names for visitors,
 * the member drill-down is closed (the stock list would name the sector), and
 * the Top Performers panel is gated separately (bottom 3 of 10 open). Same
 * strict rule as every other paygate: the real label never enters the DOM
 * while locked.
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
  "Travel & Leisure",
];
const decoySector = (i: number) =>
  DECOY_SECTORS[((i % DECOY_SECTORS.length) + DECOY_SECTORS.length) % DECOY_SECTORS.length];

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
  const hasFlow = sectors.some((s) => (s.dollarVolume ?? 0) > 0);
  const computedAt = data?.computedAt
    ? new Date(data.computedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;

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
  useEffect(() => {
    if (!openKey) return;
    const el = document.getElementById("hot-sector-members");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openKey]);

  // Top Performers drawer.
  const [perfKey, setPerfKey] = useState<string | null>(null);
  const perfSector = sectors.find((s) => s.key === perfKey) ?? null;
  const closePerf = useCallback(() => setPerfKey(null), []);

  const sectorName = (s: HotSectorRow) => (locked ? `Sector #${s.rank}` : s.label);

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
      key: "netVolumeFlow",
      label: "Net Volume Flow",
      info: "Session dollar volume in the sector's stocks that are trading UP minus dollar volume in those trading DOWN. Positive = money flowing in. The sub-line shows the two sides and the net as a share of all volume.",
      align: "right",
      sortValue: (s) => s.netVolumeFlow ?? null,
      render: (s) =>
        s.netVolumeFlow == null ? (
          <span className="text-faint text-[13px]">—</span>
        ) : (
          <>
            <span className="text-[14px] font-bold tabular" style={{ color: signColor(s.netVolumeFlow) }}>
              {signedMoney(s.netVolumeFlow)}
            </span>
            <span className="block text-[11px] text-mute tabular whitespace-nowrap">
              <span style={{ color: "var(--good)" }}>{formatCurrency(s.upDollarVolume ?? 0)}</span> in ·{" "}
              <span style={{ color: "var(--bad)" }}>{formatCurrency(s.downDollarVolume ?? 0)}</span> out
            </span>
            {s.netFlowPct != null && (
              <span className="block text-[11px] text-faint tabular">{pct(s.netFlowPct, true, 0)} of volume</span>
            )}
          </>
        ),
    },
    {
      key: "dollarVolume",
      label: "$ Volume vs Avg",
      info: "Total session dollar volume across the sector (price × shares traded), and how far it runs above or below the same stocks' trailing 3-month average daily dollar volume.",
      align: "right",
      sortValue: (s) => s.volumeVsAvgPct ?? null,
      render: (s) =>
        s.dollarVolume == null ? (
          <span className="text-faint text-[13px]">—</span>
        ) : (
          <>
            <span className="text-[14px] font-bold tabular">{formatCurrency(s.dollarVolume)}</span>
            <span className="block text-[11px] tabular font-semibold" style={{ color: signColor(s.volumeVsAvgPct) }}>
              {s.volumeVsAvgPct == null ? "—" : `${pct(s.volumeVsAvgPct, true, 0)} vs avg`}
            </span>
          </>
        ),
    },
    {
      key: "topPerformers",
      label: "Top Performers",
      pro: true,
      sortable: false,
      align: "center",
      info: "The sector's 10 biggest session gainers with volume. Ranks 8–10 are open to everyone; the top 7 are part of Insider Access.",
      render: (s) => {
        const n = s.topPerformers?.length ?? 0;
        const lead = s.topPerformers?.[0];
        return (
          <button
            type="button"
            onClick={() => setPerfKey(s.key)}
            disabled={n === 0}
            className="inline-flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition hover:brightness-110 disabled:opacity-40"
            style={{ background: "var(--bg-3)", color: "var(--text)" }}
            title={n ? `Open the ${n} top performers` : "No session gainers with volume yet"}
          >
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--good)" }} />
              Top {n || 10}
              {locked && <Lock className="h-3 w-3" style={{ color: "var(--premium)" }} />}
            </span>
            {lead && (
              <span className="text-[11px] tabular font-semibold" style={{ color: "var(--good)" }}>
                best +{lead.changePct.toFixed(1)}%
              </span>
            )}
          </button>
        );
      },
    },
    {
      key: "netInsiderValue",
      label: "Insider $ Flow",
      info: "Open-market insider buying minus selling this month, in dollars, summed across the sector's stocks (SEC Form 4 and BaFin filings). The sub-line shows the two sides. Our differentiator — kept as a secondary signal.",
      align: "right",
      sortValue: (s) => s.netInsiderValue ?? s.netInsider,
      render: (s) => (
        <>
          <span className="text-[14px] font-bold tabular" style={{ color: signColor(s.netInsiderValue) }}>
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
            <span className="text-[14px] font-bold tabular" style={{ color: signColor(s.avgAnalystUpside) }}>
              {pct(s.avgAnalystUpside, true, 1)}
            </span>
            <span className="block text-[11px] text-mute tabular">{s.analystCovered} stocks covered</span>
          </>
        ),
    },
    {
      key: "dayChange",
      label: "Today",
      info: "Equal-weighted average session change across the sector's stocks.",
      align: "right",
      sortValue: (s) => s.dayChange ?? null,
      render: (s) => (
        <span className="text-[14px] font-bold tabular" style={{ color: signColor(s.dayChange) }}>
          {pct(s.dayChange, true)}
        </span>
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
            {vs >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
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
      key: "dayChangePct",
      label: "Today",
      align: "right",
      sortValue: (m) => m.dayChangePct ?? null,
      render: (m) => (
        <span className="tabular text-[13px] font-bold" style={{ color: signColor(m.dayChangePct) }}>
          {pct(m.dayChangePct, true)}
        </span>
      ),
    },
    {
      key: "dollarVolume",
      label: "$ Volume",
      info: "Session dollar volume (price × shares), and how it compares with the stock's 3-month average daily volume.",
      align: "right",
      sortValue: (m) => m.dollarVolume ?? null,
      render: (m) =>
        m.dollarVolume == null ? (
          <span className="text-faint text-[13px]">—</span>
        ) : (
          <>
            <span className="tabular text-[13px] font-bold">{formatCurrency(m.dollarVolume)}</span>
            <span className="block text-[11px] text-mute tabular whitespace-nowrap">
              {formatNumber(m.volume)} sh
              {m.volumeVsAvgPct != null && (
                <>
                  {" · "}
                  <span style={{ color: signColor(m.volumeVsAvgPct) }}>{pct(m.volumeVsAvgPct, true, 0)} vs avg</span>
                </>
              )}
            </span>
          </>
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
            {m.analystUpside >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
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
          {computedAt && <span className="text-faint text-[11px]">· updated {computedAt}</span>}
        </div>
        <h1
          className="text-[28px] sm:text-[38px] font-bold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Hot Sectors
        </h1>
        <p className="text-mute text-[14px] mt-2 max-w-3xl leading-relaxed">
          Where the money is trading today. All{" "}
          <strong className="text-[var(--text)]">11 GICS sectors plus Biotech and Crypto</strong> — every
          listed stock over <strong className="text-[var(--text)]">$50M market cap</strong> in each — sized by
          session dollar volume and coloured by{" "}
          <strong className="text-[var(--text)]">net volume flow</strong>: green when the volume is in stocks
          trading up, red when it is in stocks trading down, brighter when the sector trades well above its
          trailing average. Each sector&rsquo;s year-to-date return is compared to the S&amp;P 500
          {sp != null && (
            <>
              , currently{" "}
              <strong style={{ color: sp >= 0 ? "var(--good)" : "var(--bad)" }}>{pct(sp, true)} YTD</strong>
            </>
          )}
          .{" "}
          {locked
            ? "Sector names, each sector's stock list and the top 7 of its 10 top performers are part of Insider Access; every metric below is open."
            : "Click a tile or a sector to see its stocks; Top Performers opens the day's biggest gainers."}
        </p>
      </header>

      {/* THE MAP — the page (client 2026-09-08). */}
      {isLoading ? (
        <div className="card text-center text-mute py-16">Loading sectors…</div>
      ) : hasFlow ? (
        <HotSectorsTreemap
          sectors={sectors.map((s) => ({
            key: s.key,
            label: s.label,
            rank: s.rank,
            dollarVolume: s.dollarVolume ?? 0,
            netVolumeFlow: s.netVolumeFlow ?? 0,
            netFlowPct: s.netFlowPct ?? null,
            volumeVsAvgPct: s.volumeVsAvgPct ?? null,
            flowIntensity: s.flowIntensity ?? 0,
          }))}
          locked={locked}
          decoyLabel={decoySector}
          activeKey={openKey}
          onSelect={(key) => setOpenKey(openKey === key ? null : key)}
        />
      ) : (
        <div className="card text-center text-mute py-12 text-[13px]">
          Today&rsquo;s volume flow is still being computed — the map fills in within a few minutes of the
          market opening.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-mute">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: "color-mix(in srgb, var(--good) 70%, var(--bg-2))" }} />
          Net inflow
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: "color-mix(in srgb, var(--bad) 70%, var(--bg-2))" }} />
          Net outflow
        </span>
        <span>Tile size = session dollar volume · brighter = further above average volume · refreshes every 20 minutes</span>
      </div>

      {/* DETAIL TABLE */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-12">Loading sectors…</div>
        ) : (
          <DataTable<HotSectorRow>
            rows={sectors}
            rowKey={(s) => s.key}
            initialSort={{ key: "netVolumeFlow", dir: "desc" }}
            empty="No sector data available."
            columns={columns}
          />
        )}
        {!isLoading && sectors.length > 0 && (
          <PremiumRowWall
            label="Hot Sectors"
            total={sectors.length}
            bullets={[
              "See which sectors the money is flowing into — every name unmasked",
              "All 10 top performers per sector, plus each sector's full stock list",
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
              <div className="text-mute text-[11px] font-mono uppercase tracking-wider">Stocks in this sector</div>
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
                initialSort={{ key: "dollarVolume", dir: "desc" }}
                pageSize={50}
                empty="This sector's stock list is still being built — check back in a few minutes."
                columns={memberColumns}
              />
            )}
          </div>
          <p className="text-[12px] text-mute leading-relaxed">
            Volume is the current session. Analyst price targets are the sell-side consensus where one is
            published; a stock without coverage shows a dash. Insider dollars are this calendar
            month&rsquo;s open-market purchases and sales from SEC Form 4 filings. Informational only — not
            investment advice.
          </p>
        </section>
      )}

      {/* Methodology note */}
      <div
        className="rounded-lg p-4 text-[12.5px] text-mute leading-relaxed"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <span className="font-bold text-[var(--text)]">How the ranking works:</span> Each sector holds{" "}
        <strong>every NASDAQ- and NYSE-listed operating company over $50M market cap</strong> in its GICS
        sector (mapped from the FMP classification), Biotech holds every biotechnology company, and Crypto
        holds the companies that carry crypto on their balance sheet — treasuries, miners that keep their
        coins, and the ETH / SOL treasury companies. Sectors are ranked by{" "}
        <strong>net trading-volume flow</strong>: the session&rsquo;s dollar volume (price × shares traded)
        in members trading up, minus the dollar volume in members trading down. Tile size on the map is total
        dollar volume; colour is the direction of the net flow, and its brightness rises as the sector trades
        further above its members&rsquo; trailing 3-month average daily volume — unusual volume with a
        direction is the signal, routine volume is not. <strong>Insider $ Flow</strong> is the month&rsquo;s
        open-market purchases minus sales in dollars, kept as a secondary column; <strong>Analyst Upside</strong>{" "}
        is the median gap between price and consensus target across covered members. MTD and YTD are
        equal-weighted averages of member stocks; YTD is also shown against the S&amp;P 500 in percentage
        points (pp). <strong>Insider figures cover SEC Form 4 and German BaFin filings only</strong> — a
        basket weighted toward Canadian-listed names (which file with SEDI) will show less buying than its
        insiders actually did. Rankings refresh every 20 minutes during the session. Informational only — not
        investment advice.
      </div>

      <AdSlot slot="leaderboard" seed="hot-sectors-bottom" />

      <TopPerformersPanel
        open={perfKey != null}
        onClose={closePerf}
        sectorLabel={perfSector ? sectorName(perfSector) : ""}
        rows={perfSector?.topPerformers ?? []}
        locked={locked}
        asOf={computedAt}
      />
    </div>
  );
}

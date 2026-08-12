"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, Flame, TrendingDown, TrendingUp } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { DataTable, Column } from "@/components/DataTable";
import { rankColumn } from "@/components/tableColumns";

interface HotSectorRow {
  rank: number;
  key: string;
  label: string;
  companies: number;
  gainers10: number;
  gainerRatio: number;
  insiderBuys: number;
  insiderSells: number;
  netInsider: number;
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
}

function pct(v: number | null, withSign = false): string {
  if (v == null) return "—";
  const s = withSign && v > 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}

function hotColor(score: number): string {
  if (score >= 60) return "var(--good)";
  if (score >= 35) return "var(--gold)";
  return "var(--text-mute)";
}

export default function HotSectorsPage() {
  const { data, isLoading } = useSWR<HotSectorsResponse>(
    `${API_BASE}/stock-lists/hot-sectors`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const sectors = data?.sectors ?? [];
  const sp = data?.sp500Ytd ?? null;

  // Same eight columns the hand-rolled table showed, cell for cell — moved onto
  // DataTable so the page can use the standard row wall (and so the ranking is
  // sortable like every other list).
  const columns: Column<HotSectorRow>[] = [
    rankColumn<HotSectorRow>(),
    {
      key: "label",
      label: "Sector",
      sortValue: (s) => s.label,
      render: (s) => (
        <>
          <span className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
            {s.label}
          </span>
          <span className="block text-[11px] text-mute">{s.companies} stocks tracked</span>
        </>
      ),
    },
    {
      key: "hotScore",
      label: "Heat Score",
      info: "0–100 blend of breadth (40%), momentum (30%) and insider buy/sell pressure (30%) — see the methodology note under the table.",
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
      key: "netInsider",
      label: "Insider Buys / Sells",
      align: "right",
      sortValue: (s) => s.netInsider,
      render: (s) => (
        <span className="tabular text-[13px]">
          <span style={{ color: "var(--good)" }} className="font-bold">
            {s.insiderBuys}
          </span>
          <span className="text-mute"> / </span>
          <span style={{ color: "var(--bad)" }} className="font-bold">
            {s.insiderSells}
          </span>
        </span>
      ),
    },
    {
      key: "mtd",
      label: "MTD",
      align: "right",
      sortValue: (s) => s.mtd,
      render: (s) => (
        <span
          className="text-[14px] font-bold tabular"
          style={{
            color:
              s.mtd == null ? "var(--text-mute)" : s.mtd >= 0 ? "var(--good)" : "var(--bad)",
          }}
        >
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
        <span
          className="text-[14px] font-bold tabular"
          style={{
            color:
              s.ytd == null ? "var(--text-mute)" : s.ytd >= 0 ? "var(--good)" : "var(--bad)",
          }}
        >
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
          Thematic sectors ranked by how many of their stocks are up{" "}
          <strong className="text-[var(--text)]">10%+ this month</strong>{" "}
          (relative to sector size) and by{" "}
          <strong className="text-[var(--text)]">insider buying</strong>. Each
          sector&rsquo;s year-to-date return is compared to the S&amp;P 500
          {sp != null && (
            <>
              , currently{" "}
              <strong style={{ color: sp >= 0 ? "var(--good)" : "var(--bad)" }}>
                {pct(sp, true)} YTD
              </strong>
            </>
          )}
          .
        </p>
      </header>

      {/* Paid product (client spec): Hot Sectors is one of the paywalled
          products, so it uses the site-standard row wall — the same
          `gate={{ label, bullets }}` every other gated leaderboard passes to
          DataTable. It replaces a PaywallOverlay that blurred the whole table
          with CSS: that kept every sector's real numbers in the DOM, where
          view-source reads them. The wall renders only the free rows. */}
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
            gate={{
              label: "Hot Sectors",
              // The site default is FREE_ROWS (6), but this table is only ~8
              // rows long — six free would give the whole ranking away. Three
              // names the hottest themes and still sells the rest.
              freeRows: 3,
              bullets: [
                "Every sector ranked by live heat score",
                "10%+ gainer breadth and momentum per theme",
                "Insider buy/sell pressure across each basket",
                "YTD performance vs the S&P 500",
              ],
            }}
          />
        )}
      </div>

      {/* Methodology note */}
      <div
        className="rounded-lg p-4 text-[12.5px] text-mute leading-relaxed"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <span className="font-bold text-[var(--text)]">How the ranking works:</span>{" "}
        Each sector&rsquo;s <strong>Heat Score</strong> (0–100) is a weighted
        blend of three things measured on absolute scales, not against whichever
        peer happens to lead: <strong>breadth</strong> (40%) — the share of
        members up more than 10% month-to-date; <strong>momentum</strong> (30%)
        — the equal-weighted average member return this month; and{" "}
        <strong>insider pressure</strong> (30%) — the open-market buy/sell skew
        across the basket, scaled by how many buys stand behind it so one or two
        lone purchases cannot max out the component. MTD and YTD are
        equal-weighted averages of member stocks; YTD is also shown against the
        S&amp;P 500 in percentage points (pp). Informational only — not
        investment advice.
      </div>

      <AdSlot slot="leaderboard" seed="hot-sectors-bottom" />
    </div>
  );
}

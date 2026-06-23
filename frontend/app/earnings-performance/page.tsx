"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { CalendarClock, Target, TrendingUp, TrendingDown } from "lucide-react";
import { API_BASE, fetcher, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
import { DataTable } from "@/components/DataTable";

interface Track {
  ies: number;
  hitRate: number;
  avgReturn: number;
  sample: number;
}
interface UpcomingRow {
  symbol: string;
  name: string;
  date: string;
  time: string | null;
  estimate: string | null;
  marketCap: string | number | null;
  track: Track | null;
}
interface UpcomingResp {
  windowDays: number;
  minSample: number;
  rows: UpcomingRow[];
}
interface LbCompany {
  ticker: string;
  name: string;
  ies: number;
  hitRate: number;
  avgReturn: number;
  sample: number;
}
interface LbInsider {
  name: string;
  tickers: string[];
  ies: number;
  hitRate: number;
  avgReturn: number;
  sample: number;
}

function iesColor(ies: number): string {
  if (ies >= 60) return "var(--good)";
  if (ies >= 40) return "var(--gold)";
  return "var(--bad)";
}

function IesBadge({ ies }: { ies: number }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[12px] font-bold tabular"
      style={{
        background: `color-mix(in srgb, ${iesColor(ies)} 16%, transparent)`,
        color: iesColor(ies),
      }}
    >
      {ies.toFixed(0)}
    </span>
  );
}

export default function EarningsPerformancePage() {
  const [lbType, setLbType] = useState<"company" | "insider">("company");

  const { data: up } = useSWR<UpcomingResp>(
    `${API_BASE}/earnings-performance/upcoming?days=7`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const { data: lb } = useSWR<{ rows: (LbCompany | LbInsider)[] }>(
    `${API_BASE}/earnings-performance/leaderboard?type=${lbType}&limit=20`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );

  const rows = up?.rows || [];
  const withRecord = rows.filter((r) => r.track).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Target className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Insider Earnings Score
          </span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Insider Track Record Into Earnings
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          When insiders buy shares in the weeks before an earnings release, were
          they right? We measure each stock&rsquo;s post-earnings move — up means
          the insider&rsquo;s pre-earnings buy paid off, down means it didn&rsquo;t
          — and build a historical <strong>Insider Earnings Score (IES, 0–100)</strong>.
          Below: who reports next, and how insider buying has played out for them
          historically. Informational only, not a prediction.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="earnings-perf-top" />

      {/* Reporting next + track record */}
      <section className="card overflow-hidden">
        <div
          className="px-4 py-3 border-b flex items-center gap-2"
          style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
        >
          <CalendarClock className="h-4 w-4 text-accent" />
          <h2 className="text-[14px] font-bold uppercase tracking-wider">
            Reporting Next 7 Days
          </h2>
          <span className="text-[11px] text-mute ml-auto">
            {withRecord} of {rows.length} have insider history
          </span>
        </div>
        <DataTable<UpcomingRow>
          rows={rows}
          rowKey={(r, i) => `${r.symbol}-${r.date}-${i}`}
          empty={
            <>
              Loading earnings calendar… if this stays empty, run{" "}
              <code className="text-accent">POST /earnings-performance/rebuild</code>.
            </>
          }
          columns={[
            {
              key: "company",
              label: "Company",
              filterable: true,
              sortValue: (r) => r.symbol,
              render: (r) => (
                <Link
                  href={`/companies/${encodeURIComponent(r.symbol)}`}
                  className="flex items-center gap-2.5 min-w-[200px]"
                >
                  <CompanyLogo ticker={r.symbol} name={r.name} size={26} />
                  <div className="min-w-0">
                    <div className="font-mono text-[15px] font-bold text-accent">
                      {r.symbol}
                    </div>
                    <div className="text-[12px] text-mute truncate max-w-[200px]">
                      {r.name}
                    </div>
                  </div>
                </Link>
              ),
            },
            {
              key: "date",
              label: "Report Date",
              filterable: true,
              sortValue: (r) => (r.date ? new Date(r.date).getTime() : null),
              render: (r) => (
                <span className="text-[14px] font-bold tabular text-soft whitespace-nowrap">
                  {formatDate(r.date)}
                </span>
              ),
            },
            {
              key: "time",
              label: "Time",
              filterable: true,
              sortValue: (r) => r.time ?? "",
              render: (r) => (
                <span className="text-[11px] uppercase text-mute">{r.time || "—"}</span>
              ),
            },
            {
              key: "estimate",
              label: "EPS Est.",
              filterable: true,
              filterType: "range",
              align: "right",
              sortValue: (r) => (r.estimate ? parseFloat(r.estimate) : null),
              render: (r) => (
                <span className="tabular text-mute text-[14px] font-bold">{r.estimate || "—"}</span>
              ),
            },
            {
              key: "ies",
              label: "Insider IES",
              filterable: true,
              filterType: "range",
              align: "right",
              sortValue: (r) => r.track?.ies ?? null,
              render: (r) =>
                r.track ? (
                  <IesBadge ies={r.track.ies} />
                ) : (
                  <span className="text-faint">—</span>
                ),
            },
            {
              key: "hitRate",
              label: "Hit Rate",
              filterable: true,
              filterType: "range",
              align: "right",
              sortValue: (r) => r.track?.hitRate ?? null,
              render: (r) => (
                <span className="tabular text-[14px] font-bold">
                  {r.track ? `${r.track.hitRate}%` : "—"}
                </span>
              ),
            },
            {
              key: "avgMove",
              label: "Avg Move",
              filterable: true,
              filterType: "range",
              align: "right",
              sortValue: (r) => r.track?.avgReturn ?? null,
              render: (r) =>
                r.track ? (
                  <span
                    className="inline-flex items-center gap-0.5 font-bold tabular text-[14px]"
                    style={{
                      color: r.track.avgReturn >= 0 ? "var(--good)" : "var(--bad)",
                    }}
                  >
                    {r.track.avgReturn >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {r.track.avgReturn >= 0 ? "+" : ""}
                    {r.track.avgReturn}%
                  </span>
                ) : (
                  <span className="tabular text-[14px] font-bold">—</span>
                ),
            },
            {
              key: "sample",
              label: "Sample",
              filterable: true,
              filterType: "range",
              align: "right",
              sortValue: (r) => r.track?.sample ?? null,
              render: (r) => (
                <span className="tabular text-mute text-[14px] font-bold">
                  {r.track ? r.track.sample : "—"}
                </span>
              ),
            },
          ]}
        />
        <p className="text-[11px] text-faint px-4 py-2">
          IES = confidence-adjusted hit rate of insider buys made within ~60 days
          before earnings (needs ≥{up?.minSample ?? 3} past events to show a score).
          &ldquo;Avg Move&rdquo; is the mean next-session price change after those
          reports.
        </p>
      </section>

      {/* Leaderboard */}
      <section className="card overflow-hidden">
        <div
          className="px-4 py-3 border-b flex items-center gap-3"
          style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
        >
          <h2 className="text-[14px] font-bold uppercase tracking-wider">
            Best Track Records Into Earnings
          </h2>
          <div className="flex gap-1.5 ml-auto">
            {(["company", "insider"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setLbType(t)}
                className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition"
                style={{
                  background: lbType === t ? "var(--accent)" : "var(--bg-2)",
                  color: lbType === t ? "#fff" : "var(--text-soft)",
                  border: "1px solid var(--border-strong)",
                }}
              >
                {t === "company" ? "By Stock" : "By Insider"}
              </button>
            ))}
          </div>
        </div>
        <DataTable<LbCompany | LbInsider>
          rows={lb?.rows ?? []}
          rowKey={(r, i) => `${i}`}
          empty="No scored track records yet — run a rebuild to backtest insider buys against past earnings."
          columns={[
            {
              key: "rank",
              label: "#",
              sortable: false,
              className: "text-faint tabular text-[11px]",
              render: (_r, i) => i + 1,
            },
            {
              key: "entity",
              label: lbType === "company" ? "Company" : "Insider",
              filterable: true,
              filterLabelText: "Name",
              sortValue: (r) =>
                "ticker" in r ? (r as LbCompany).ticker : (r as LbInsider).name,
              render: (r) =>
                "ticker" in r ? (
                  <Link
                    href={`/companies/${encodeURIComponent((r as LbCompany).ticker)}`}
                    className="flex items-center gap-2.5"
                  >
                    <CompanyLogo
                      ticker={(r as LbCompany).ticker}
                      name={(r as LbCompany).name}
                      size={24}
                    />
                    <span className="font-mono text-[15px] font-bold text-accent">
                      {(r as LbCompany).ticker}
                    </span>
                    <span className="text-[12px] text-mute truncate max-w-[160px]">
                      {(r as LbCompany).name}
                    </span>
                  </Link>
                ) : (
                  <div>
                    <div className="text-[15px] font-bold">
                      {(r as LbInsider).name}
                    </div>
                    <div className="text-[10px] text-mute font-mono">
                      {(r as LbInsider).tickers.join(", ")}
                    </div>
                  </div>
                ),
            },
            {
              key: "ies",
              label: "IES",
              filterable: true,
              filterType: "range",
              align: "right",
              sortValue: (r) => r.ies,
              render: (r) => <IesBadge ies={r.ies} />,
            },
            {
              key: "hitRate",
              label: "Hit Rate",
              filterable: true,
              filterType: "range",
              align: "right",
              sortValue: (r) => r.hitRate,
              render: (r) => <span className="tabular text-[14px] font-bold">{r.hitRate}%</span>,
            },
            {
              key: "avgMove",
              label: "Avg Move",
              filterable: true,
              filterType: "range",
              align: "right",
              sortValue: (r) => r.avgReturn,
              render: (r) => (
                <span
                  className="tabular font-bold text-[14px]"
                  style={{ color: r.avgReturn >= 0 ? "var(--good)" : "var(--bad)" }}
                >
                  {r.avgReturn >= 0 ? "+" : ""}
                  {r.avgReturn}%
                </span>
              ),
            },
            {
              key: "sample",
              label: "Sample",
              filterable: true,
              filterType: "range",
              align: "right",
              sortValue: (r) => r.sample,
              render: (r) => <span className="tabular text-mute text-[14px] font-bold">{r.sample}</span>,
            },
          ]}
        />
      </section>

      <p className="text-[11px] text-faint">
        Source: SEC Form 4 open-market purchases scored against historical
        post-earnings price moves. Past performance does not guarantee future
        results — this is informational, not financial advice.
      </p>
    </div>
  );
}

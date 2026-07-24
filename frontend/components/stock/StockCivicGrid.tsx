"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Landmark, FileText, Scale, TrendingUp, Scale3d } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";

/** QuiverQuant-style grid of equal-sized data cards on the stock page. Each
 *  card is self-contained (its own fetch) and shows a distinct dataset, all
 *  from real free sources. Cards with no data show an honest empty state. */
interface InsiderTx {
  insiderName: string;
  role?: string | null;
  rawTitle?: string | null;
  transactionCode: string;
  sharesBought: number;
  pricePerShare: number;
  totalValue: number;
  previousHoldings?: number | null;
  postHoldings?: number | null;
  transactionDate: string;
  filingUrl?: string | null;
}

export function StockCivicGrid({
  ticker,
  companyName,
  sector,
  insiderScore,
  transactions = [],
}: {
  ticker: string;
  companyName: string;
  sector?: string | null;
  insiderScore?: number | null;
  transactions?: InsiderTx[];
}) {
  return (
    <section>
      <h2 className="large-section-h mb-3"><span>Signals & Government Data</span></h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <InsiderTradingTableCard ticker={ticker} transactions={transactions} />
        <CongressTradingCard ticker={ticker} />
        <GovContractsCard companyName={companyName} ticker={ticker} />
        <LobbyingCard companyName={companyName} ticker={ticker} />
        <BullBearCard ticker={ticker} companyName={companyName} sector={sector} insiderScore={insiderScore} />
      </div>
    </section>
  );
}

/** Insider Trading — scrollable Form 4 filings table (our SEC data). */
function InsiderTradingTableCard({ ticker, transactions }: { ticker: string; transactions: InsiderTx[] }) {
  const rows = [...transactions].sort(
    (a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime(),
  );
  const shares = (n: number) => Math.round(n).toLocaleString();
  return (
    <Card icon={<TrendingUp className="h-4 w-4" />} title="Insider Trading" subtitle={`Form 4 filings by ${ticker} executives, directors & 10% owners`}>
      {rows.length === 0 ? (
        <Empty text={`No Form 4 filings for ${ticker} in our data.`} />
      ) : (
        <div className="overflow-auto scrollbar-visible" style={{ maxHeight: 300 }}>
          <table className="w-full text-[12px]" style={{ minWidth: 640 }}>
            <thead className="sticky top-0 z-10" style={{ background: "var(--bg-2)" }}>
              <tr className="text-[10px] uppercase tracking-wider text-mute text-left">
                <th className="font-bold px-2.5 py-2">Insider</th>
                <th className="font-bold px-2.5 py-2 text-center">Action</th>
                <th className="font-bold px-2.5 py-2 text-right">Shares</th>
                <th className="font-bold px-2.5 py-2 text-right">Avg Cost</th>
                <th className="font-bold px-2.5 py-2 text-right">Total</th>
                <th className="font-bold px-2.5 py-2 text-right">Held After</th>
                <th className="font-bold px-2.5 py-2 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const buy = t.transactionCode === "P";
                return (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-2.5 py-2">
                      <span className="font-semibold block truncate max-w-[150px]">{t.insiderName}</span>
                      {(t.rawTitle || t.role) && (
                        <span className="block text-[10px] text-mute truncate max-w-[150px]">{t.rawTitle || t.role}</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-center">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                        style={{ background: buy ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)", color: buy ? "#10B981" : "#EF4444" }}>
                        {buy ? "Buy" : "Sell"}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right tabular">{shares(t.sharesBought)}</td>
                    <td className="px-2.5 py-2 text-right tabular">${Number(t.pricePerShare).toFixed(2)}</td>
                    <td className="px-2.5 py-2 text-right tabular font-semibold">{formatCurrency(t.totalValue)}</td>
                    <td className="px-2.5 py-2 text-right tabular text-mute">{t.postHoldings != null ? shares(t.postHoldings) : "—"}</td>
                    <td className="px-2.5 py-2 text-right text-mute whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-faint mt-2">Source: SEC EDGAR (Form 4)</p>
    </Card>
  );
}

/** AI Bull Case vs Bear Case — our own, generated from the ticker's data. */
function BullBearCard({ ticker, companyName, sector, insiderScore }: { ticker: string; companyName: string; sector?: string | null; insiderScore?: number | null }) {
  const params = new URLSearchParams({ name: companyName });
  if (sector) params.set("sector", sector);
  if (insiderScore != null) params.set("score", String(Math.round(insiderScore)));
  const { data, isLoading } = useSWR<{ bullBear: { bull: string[]; bear: string[] } | null }>(
    `${API_BASE}/content/bull-bear/${ticker}?${params.toString()}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 },
  );
  const bb = data?.bullBear;
  return (
    <div className="card p-5 flex flex-col h-full min-h-[320px] lg:col-span-2">
      <div className="flex items-center gap-2">
        <span className="text-accent"><Scale3d className="h-4 w-4" /></span>
        <h3 className="text-[16px] font-bold">Bull Case vs Bear Case</h3>
      </div>
      <p className="text-[12px] text-mute mt-0.5 mb-3">AI-generated from {ticker}&rsquo;s recent data — informational, not investment advice</p>
      {isLoading ? (
        <div className="h-full flex items-center justify-center text-[12.5px] text-mute py-8">Generating analysis…</div>
      ) : !bb || (!bb.bull.length && !bb.bear.length) ? (
        <div className="h-full flex items-center justify-center text-center text-[12.5px] text-mute py-8 px-4">AI analysis unavailable right now.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 flex-1">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: "#10B981" }}>▲ Bull Case</div>
            <ul className="space-y-2">
              {bb.bull.map((p, i) => (
                <li key={i} className="text-[13px] leading-relaxed flex gap-2">
                  <span style={{ color: "#10B981" }} className="flex-shrink-0">+</span><span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: "#EF4444" }}>▼ Bear Case</div>
            <ul className="space-y-2">
              {bb.bear.map((p, i) => (
                <li key={i} className="text-[13px] leading-relaxed flex gap-2">
                  <span style={{ color: "#EF4444" }} className="flex-shrink-0">−</span><span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 flex flex-col h-full min-h-[320px]">
      <div className="flex items-center gap-2">
        <span className="text-accent">{icon}</span>
        <h3 className="text-[16px] font-bold">{title}</h3>
      </div>
      <p className="text-[12px] text-mute mt-0.5 mb-3">{subtitle}</p>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center text-center text-[12.5px] text-mute px-4 py-8">{text}</div>;
}

/** Congress Trading — recent trades of this ticker by members of Congress. */
function CongressTradingCard({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ rows: any[] }>(`${API_BASE}/congressional-trades?ticker=${ticker}&limit=8`, fetcher, { revalidateOnFocus: false });
  const rows = data?.rows || [];
  return (
    <Card icon={<Landmark className="h-4 w-4" />} title="Congress Trading" subtitle={`Recent trades of ${ticker} by members of U.S. Congress`}>
      {rows.length === 0 ? (
        <Empty text={`No recent congressional trades of ${ticker} in our data.`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-mute" style={{ background: "var(--bg-2)" }}>
                <th className="text-left font-bold px-2.5 py-1.5">Politician</th>
                <th className="text-left font-bold px-2.5 py-1.5">Type</th>
                <th className="text-right font-bold px-2.5 py-1.5">Traded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-2.5 py-2">
                    <Link href={`/politicians/${encodeURIComponent(r.politicianName)}`} className="font-semibold hover:text-accent transition">{r.politicianName}</Link>
                    <span className="block text-[10px] text-mute">{r.chamber}{r.party ? ` / ${r.party}` : ""}</span>
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="font-semibold" style={{ color: r.action === "Buy" ? "#10B981" : "#EF4444" }}>{r.action === "Buy" ? "Purchase" : "Sale"}</span>
                    <span className="block text-[10px] text-mute">{r.amountMin != null ? formatCurrency(r.amountMin) : ""}{r.amountMax != null && r.amountMax !== r.amountMin ? ` – ${formatCurrency(r.amountMax)}` : ""}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right text-mute whitespace-nowrap">{r.transactionDate ? formatDate(r.transactionDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Government Contracts — quarterly federal contract $ awarded (USAspending). */
function GovContractsCard({ companyName, ticker }: { companyName: string; ticker: string }) {
  const { data } = useSWR<{ quarters: { label: string; amount: number }[] }>(
    `${API_BASE}/company-civic/contracts?name=${encodeURIComponent(companyName)}`, fetcher, { revalidateOnFocus: false });
  const q = (data?.quarters || []).slice(-12);
  return (
    <Card icon={<FileText className="h-4 w-4" />} title="Government Contracts" subtitle={`Quarterly federal contracts awarded to ${ticker}`}>
      {q.length === 0 ? <Empty text={`No recent federal contracts for ${ticker}.`} /> : <CivicBars data={q} color="#6366F1" />}
      <p className="text-[10px] text-faint mt-2">Source: USAspending.gov</p>
    </Card>
  );
}

/** Corporate Lobbying — quarterly lobbying spend (Senate LDA; needs key). */
function LobbyingCard({ companyName, ticker }: { companyName: string; ticker: string }) {
  const { data } = useSWR<{ quarters: { label: string; amount: number }[]; enabled: boolean }>(
    `${API_BASE}/company-civic/lobbying?name=${encodeURIComponent(companyName)}`, fetcher, { revalidateOnFocus: false });
  const q = (data?.quarters || []).slice(-12);
  return (
    <Card icon={<Scale className="h-4 w-4" />} title="Corporate Lobbying" subtitle={`Estimated quarterly lobbying spend by ${ticker}`}>
      {q.length === 0 ? (
        <Empty text={data && !data.enabled ? "Lobbying data activates once an LDA_API_KEY (free, Senate LDA) is set." : `No lobbying filings found for ${ticker}.`} />
      ) : <CivicBars data={q} color="#8B5CF6" />}
      <p className="text-[10px] text-faint mt-2">Source: U.S. Senate LDA</p>
    </Card>
  );
}

function axisMoney(n: number): string {
  const a = Math.abs(n);
  return a >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${Math.round(n / 1e6)}M` : a >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
}

/** Bar chart with a Y-axis (nice ticks + gridlines), angled X labels, and an
 *  interactive hover tooltip. `signed` = green(+)/red(−) around a zero line. */
function CivicBars({ data, color = "#6366F1", signed = false }: { data: { label: string; amount: number }[]; color?: string; signed?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 210, mL = 52, mR = 8, mT = 10, mB = 42;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const rawMax = Math.max(1, ...data.map((d) => Math.abs(d.amount)));
  const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / pow) * pow;
  const groupW = plotW / data.length;
  const barW = Math.min(20, groupW * 0.6);
  const zeroY = signed ? mT + plotH / 2 : mT + plotH;
  const scale = signed ? plotH / 2 / max : plotH / max;
  const ticks = signed ? [max, max / 2, 0, -max / 2, -max] : [max, max * 0.75, max * 0.5, max * 0.25, 0];
  const tickY = (t: number) => (signed ? zeroY - t * scale : zeroY - t * scale);

  return (
    <div className="relative">
      {hover != null && data[hover] && (
        <div className="absolute z-10 text-[11px] rounded px-2 py-1 pointer-events-none whitespace-nowrap"
          style={{ left: `${(mL + groupW * (hover + 0.5)) / W * 100}%`, top: 0, transform: "translateX(-50%)", background: "var(--text)", color: "var(--bg-1)" }}>
          {data[hover].label}: {formatCurrency(data[hover].amount)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", fontFamily: "var(--font-mono, monospace)" }}>
        {/* Y gridlines + tick labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={mL} x2={W - mR} y1={tickY(t)} y2={tickY(t)} stroke="var(--border)" strokeWidth="1" opacity="0.5" />
            <text x={mL - 8} y={tickY(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-mute)">{axisMoney(t)}</text>
          </g>
        ))}
        {/* Axis lines */}
        <line x1={mL} x2={mL} y1={mT} y2={mT + plotH} stroke="var(--border-strong)" strokeWidth="1.5" />
        <line x1={mL} x2={W - mR} y1={zeroY} y2={zeroY} stroke="var(--border-strong)" strokeWidth="1.5" />
        {data.map((d, i) => {
          const cx = mL + groupW * (i + 0.5);
          const h = Math.abs(d.amount) * scale;
          const up = d.amount >= 0;
          const y = signed ? (up ? zeroY - h : zeroY) : zeroY - h;
          const fill = signed ? (up ? "#10B981" : "#EF4444") : color;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              {/* wide invisible hit area so hover is easy */}
              <rect x={mL + groupW * i} y={mT} width={groupW} height={plotH} fill="transparent" />
              <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(1, h)} rx="2" fill={fill} opacity={hover == null || hover === i ? 1 : 0.55} />
              <text x={cx} y={H - mB + 14} textAnchor="end" fontSize="9.5" fill="var(--text-mute)" transform={`rotate(-40 ${cx} ${H - mB + 14})`}>{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

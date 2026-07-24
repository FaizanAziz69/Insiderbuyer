"use client";
import useSWR from "swr";
import Link from "next/link";
import { Landmark, FileText, Scale, TrendingUp, Scale3d } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";

/** QuiverQuant-style grid of equal-sized data cards on the stock page. Each
 *  card is self-contained (its own fetch) and shows a distinct dataset, all
 *  from real free sources. Cards with no data show an honest empty state. */
export function StockCivicGrid({
  ticker,
  companyName,
  sector,
  insiderScore,
}: {
  ticker: string;
  companyName: string;
  sector?: string | null;
  insiderScore?: number | null;
}) {
  return (
    <section>
      <h2 className="large-section-h mb-3"><span>Signals & Government Data</span></h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <CongressTradingCard ticker={ticker} />
        <GovContractsCard companyName={companyName} ticker={ticker} />
        <InsiderQuarterlyCard ticker={ticker} />
        <LobbyingCard companyName={companyName} ticker={ticker} />
        <BullBearCard ticker={ticker} companyName={companyName} sector={sector} insiderScore={insiderScore} />
      </div>
    </section>
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

/** Insider Trading — quarterly net insider shares (our SEC Form 4 feed). */
function InsiderQuarterlyCard({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ rows: any[] }>(`${API_BASE}/trades?q=${ticker}&side=all&limit=500`, fetcher, { revalidateOnFocus: false });
  const rows = (data?.rows || []).filter((r) => (r.ticker || "").toUpperCase() === ticker.toUpperCase());
  // Net purchase value by quarter (buys +, sells −).
  const byQ = new Map<string, { label: string; sort: number; amount: number }>();
  for (const r of rows) {
    if (!r.transactionDate) continue;
    const d = new Date(r.transactionDate);
    if (isNaN(d.getTime())) continue;
    const qi = Math.floor(d.getUTCMonth() / 3);
    const key = `${d.getUTCFullYear()}-${qi}`;
    const e = byQ.get(key) || { label: `FY${String(d.getUTCFullYear()).slice(2)} Q${qi + 1}`, sort: d.getUTCFullYear() * 4 + qi, amount: 0 };
    e.amount += (r.type === "SELL" ? -1 : 1) * (Number(r.totalValue) || 0);
    byQ.set(key, e);
  }
  const q = Array.from(byQ.values()).sort((a, b) => a.sort - b.sort).slice(-10);
  return (
    <Card icon={<TrendingUp className="h-4 w-4" />} title="Insider Trading" subtitle={`Quarterly net insider buying/selling of ${ticker} (SEC Form 4)`}>
      {q.length === 0 ? <Empty text={`No SEC Form 4 insider trades of ${ticker} in our data.`} /> : <CivicBars data={q} signed />}
      <p className="text-[10px] text-faint mt-2">Source: SEC EDGAR (Form 4)</p>
    </Card>
  );
}

/** Compact quarterly bar chart. `signed` = green(+)/red(−) around a baseline. */
function CivicBars({ data, color = "#6366F1", signed = false }: { data: { label: string; amount: number }[]; color?: string; signed?: boolean }) {
  const W = 520, H = 190, mL = 46, mR = 6, mT = 8, mB = 40;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const vals = data.map((d) => d.amount);
  const maxAbs = Math.max(1, ...vals.map((v) => Math.abs(v)));
  const groupW = plotW / data.length;
  const barW = Math.min(18, groupW * 0.6);
  const zeroY = signed ? mT + plotH / 2 : mT + plotH;
  const scale = signed ? (plotH / 2) / maxAbs : plotH / maxAbs;
  const money = (n: number) => (Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `${Math.round(n / 1e6)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}K` : `${Math.round(n)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", fontFamily: "var(--font-mono, monospace)" }}>
      <line x1={mL} x2={W - mR} y1={zeroY} y2={zeroY} stroke="var(--border-strong)" strokeWidth="1" />
      <text x={mL - 8} y={mT + 4} textAnchor="end" fontSize="10" fill="var(--text-mute)">{money(signed ? maxAbs : maxAbs)}</text>
      {signed && <text x={mL - 8} y={mT + plotH} textAnchor="end" fontSize="10" fill="var(--text-mute)">-{money(maxAbs)}</text>}
      {data.map((d, i) => {
        const cx = mL + groupW * (i + 0.5);
        const h = Math.abs(d.amount) * scale;
        const up = d.amount >= 0;
        const y = signed ? (up ? zeroY - h : zeroY) : zeroY - h;
        const fill = signed ? (up ? "#10B981" : "#EF4444") : color;
        return (
          <g key={d.label}>
            <rect x={cx - barW / 2} y={y} width={barW} height={Math.max(1, h)} rx="2" fill={fill}>
              <title>{`${d.label}: ${formatCurrency(d.amount)}`}</title>
            </rect>
            <text x={cx} y={H - mB + 14} textAnchor="end" fontSize="9.5" fill="var(--text-mute)" transform={`rotate(-40 ${cx} ${H - mB + 14})`}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

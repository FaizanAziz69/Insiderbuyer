"use client";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, Landmark, Layers } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";

interface Holding {
  institution: string;
  shares: number;
  value: number;
  change: number | null;
  pctChange: number | null;
  isNew: boolean;
  reported: string;
}
interface Derivative {
  institution: string;
  type: "PUT" | "CALL";
  shares: number;
  value: number;
  reported: string;
}

/** QuiverQuant-style institutional-ownership page for one stock, built from
 *  recent SEC 13F filings (free). Linked from the Whale Activity card. */
export default function InstitutionsPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const sym = decodeURIComponent(ticker).toUpperCase();

  const { data: companyData } = useSWR<{ company: { name: string } | null }>(
    `${API_BASE}/companies/${encodeURIComponent(sym)}`, fetcher, { revalidateOnFocus: false });
  const name = companyData?.company?.name;

  const { data, isLoading } = useSWR<{ holdings: Holding[]; derivatives: Derivative[] }>(
    name ? `${API_BASE}/company-civic/institutions?ticker=${encodeURIComponent(sym)}&name=${encodeURIComponent(name)}` : null,
    fetcher, { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 });

  const holdings = data?.holdings || [];
  const derivatives = data?.derivatives || [];
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalShares = holdings.reduce((s, h) => s + h.shares, 0);
  const buyers = holdings.filter((h) => (h.change ?? 0) > 0 || h.isNew).length;
  const sellers = holdings.filter((h) => h.change != null && h.change < 0).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href={`/companies/${encodeURIComponent(sym)}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-mute hover:text-accent transition mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to {sym}
      </Link>

      <h1 className="text-[26px] font-extrabold tracking-tight">Institutional Ownership of {sym}</h1>
      <p className="text-[13.5px] text-mute mt-2 max-w-3xl leading-relaxed">
        Institutional investors managing over $100M must disclose their holdings to the SEC each quarter through
        Form 13F filings. Below are the most recently reported {sym} positions{name ? ` in ${name}` : ""}, with each
        institution&rsquo;s change versus its previous quarterly filing.
      </p>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        {[
          { label: "Institutions (recent filings)", val: holdings.length ? String(holdings.length) : "—" },
          { label: "Reported Shares", val: totalShares ? totalShares.toLocaleString() : "—" },
          { label: "Reported Value", val: totalValue ? formatCurrency(totalValue) : "—" },
          { label: "Adding vs Reducing", val: holdings.length ? `${buyers} ▲ / ${sellers} ▼` : "—" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="text-[10px] uppercase tracking-wider text-mute font-bold">{s.label}</div>
            <div className="text-[18px] font-extrabold mt-1 tabular">{s.val}</div>
          </div>
        ))}
      </div>

      {/* Stock owners */}
      <section className="mt-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-accent"><Landmark className="h-4 w-4" /></span>
          <h2 className="text-[18px] font-bold">{sym} Stock Institutional Owners</h2>
        </div>
        <p className="text-[12px] text-mute mb-3">Common-share positions from the latest 13F filings, newest first</p>
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 640 }}>
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-mute text-left" style={{ background: "var(--bg-2)" }}>
                <th className="font-bold px-3.5 py-2.5">Investor</th>
                <th className="font-bold px-3.5 py-2.5 text-right">Shares</th>
                <th className="font-bold px-3.5 py-2.5 text-right">Change in Shares</th>
                <th className="font-bold px-3.5 py-2.5 text-right">Market Value</th>
                <th className="font-bold px-3.5 py-2.5 text-right">Date Reported</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !name ? (
                <tr><td colSpan={5} className="px-3.5 py-10 text-center text-[13px] text-mute">Scanning latest 13F filings on SEC EDGAR…</td></tr>
              ) : holdings.length === 0 ? (
                <tr><td colSpan={5} className="px-3.5 py-10 text-center text-[13px] text-mute">No recent 13F filings reporting {sym} positions found.</td></tr>
              ) : (
                holdings.map((h, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3.5 py-2.5 font-semibold">{h.institution}</td>
                    <td className="px-3.5 py-2.5 text-right tabular">{h.shares.toLocaleString()}</td>
                    <td className="px-3.5 py-2.5 text-right tabular font-semibold whitespace-nowrap">
                      {h.isNew ? (
                        <span style={{ color: "#10B981" }}>NEW</span>
                      ) : h.change == null ? (
                        <span className="text-mute">—</span>
                      ) : (
                        <span style={{ color: h.change >= 0 ? "#10B981" : "#EF4444" }}>
                          {h.change >= 0 ? "+" : ""}{h.change.toLocaleString()}
                          {h.pctChange != null ? ` (${h.pctChange >= 0 ? "+" : ""}${h.pctChange}%)` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular whitespace-nowrap">{formatCurrency(h.value)}</td>
                    <td className="px-3.5 py-2.5 text-right text-mute whitespace-nowrap">{formatDate(h.reported)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Derivative owners */}
      <section className="mt-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-accent"><Layers className="h-4 w-4" /></span>
          <h2 className="text-[18px] font-bold">{sym} Derivatives Institutional Owners</h2>
        </div>
        <p className="text-[12px] text-mute mb-3">PUT / CALL option positions on {sym} reported in the same filings</p>
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 560 }}>
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-mute text-left" style={{ background: "var(--bg-2)" }}>
                <th className="font-bold px-3.5 py-2.5">Investor</th>
                <th className="font-bold px-3.5 py-2.5 text-center">Type</th>
                <th className="font-bold px-3.5 py-2.5 text-right">Underlying Shares</th>
                <th className="font-bold px-3.5 py-2.5 text-right">Market Value</th>
                <th className="font-bold px-3.5 py-2.5 text-right">Date Reported</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !name ? (
                <tr><td colSpan={5} className="px-3.5 py-8 text-center text-[13px] text-mute">Loading…</td></tr>
              ) : derivatives.length === 0 ? (
                <tr><td colSpan={5} className="px-3.5 py-8 text-center text-[13px] text-mute">No derivative positions on {sym} in these filings.</td></tr>
              ) : (
                derivatives.map((d, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3.5 py-2.5 font-semibold">{d.institution}</td>
                    <td className="px-3.5 py-2.5 text-center">
                      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: d.type === "CALL" ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)", color: d.type === "CALL" ? "#10B981" : "#EF4444" }}>
                        {d.type}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular">{d.shares.toLocaleString()}</td>
                    <td className="px-3.5 py-2.5 text-right tabular whitespace-nowrap">{formatCurrency(d.value)}</td>
                    <td className="px-3.5 py-2.5 text-right text-mute whitespace-nowrap">{formatDate(d.reported)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-faint mt-6">
        Source: SEC EDGAR Form 13F filings. Only institutions that filed within the last ~4 months appear here;
        positions reflect each filer&rsquo;s most recent quarterly disclosure.
      </p>
    </main>
  );
}

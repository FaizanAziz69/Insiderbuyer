"use client";
/**
 * /thank-you-report — post-purchase page for the $3 downsell (Round-2 brief,
 * Section 2, Step 5): "Report delivered to your inbox. Want the real-time
 * version? Get Premium at $199/year."
 *
 * It also fulfils the order. The Stripe webhook is not configured on this
 * account yet, so delivery cannot depend on it: this page posts the checkout
 * session id back to /top-picks-report/fulfil, which verifies the payment with
 * Stripe, tags the buyer, emails the PDF, and returns the rows so the buyer
 * sees the report immediately instead of waiting on an inbox.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { track } from "@/lib/analytics";
import { getFunnelEntry } from "@/lib/funnel";

interface Pick {
  ticker: string;
  name: string;
  price: number;
  insiderAvgPrice: number;
  discountPct: number;
  iqs: number;
  buyers: number;
  filings: number;
  totalValue: number;
  lastBuy: string;
  topInsider: string;
  topRole: string;
}

interface Fulfilment {
  paid: boolean;
  email: string | null;
  emailed: boolean;
  picks: Pick[];
}

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;

export default function ThankYouReportPage() {
  const [state, setState] = useState<"loading" | "ok" | "unpaid" | "error">("loading");
  const [data, setData] = useState<Fulfilment | null>(null);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      setState("unpaid");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/top-picks-report/fulfil`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const json = (await res.json()) as Fulfilment;
        if (cancelled) return;
        setData(json);
        setState(json.paid ? "ok" : "unpaid");
        track(json.paid ? "web_purchase" : "web_report_unverified", {
          product: "top-picks-report",
          price: 3,
          emailed: json.emailed,
          picks: json.picks?.length ?? 0,
          entry: getFunnelEntry(),
        });
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="ty">
      <main className="ty-box">
        <p className="ty-brand">InsiderBuying.com</p>

        {state === "loading" && <p className="ty-sub">Confirming your payment…</p>}

        {state === "unpaid" && (
          <>
            <h1 className="ty-h1">We couldn&apos;t confirm that purchase.</h1>
            <p className="ty-sub">
              If you were charged, email us and we&apos;ll send the report straight away —
              otherwise the report is still available below.
            </p>
            <Link href="/top-picks-report" className="ty-btn ty-btn-ghost">
              Back to the report
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="ty-h1">Payment received — delivery is running behind.</h1>
            <p className="ty-sub">
              Refresh this page in a minute. If the report still hasn&apos;t arrived, reply to
              your Stripe receipt and we&apos;ll send it by hand.
            </p>
          </>
        )}

        {state === "ok" && data && (
          <>
            <h1 className="ty-h1">
              {data.emailed ? "Report delivered to your inbox." : "Payment confirmed — here's your report."}
            </h1>
            <p className="ty-sub">
              {data.emailed ? (
                <>
                  The PDF is on its way to <b>{data.email}</b>. Want the real-time version?{" "}
                  <Link href="/premium" className="ty-link">
                    Get Premium at $199/year
                  </Link>
                  .
                </>
              ) : (
                <>
                  Your copy is below. Want the real-time version?{" "}
                  <Link href="/premium" className="ty-link">
                    Get Premium at $199/year
                  </Link>
                  .
                </>
              )}
            </p>

            {data.picks.length > 0 && (
              <div className="ty-report">
                <p className="ty-report-title">Stocks You Can Buy Cheaper Than the Insiders Did</p>
                <div className="ty-scroll">
                  <table className="ty-table">
                    <thead>
                      <tr>
                        <th>Stock</th>
                        <th className="r">Price now</th>
                        <th className="r">Insiders paid</th>
                        <th className="r">Discount</th>
                        <th className="r">IQS</th>
                        <th className="r">Buyers</th>
                        <th className="r">Bought</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.picks.map((p) => (
                        <tr key={p.ticker}>
                          <td>
                            <Link href={`/companies/${p.ticker}`} className="ty-link">
                              {p.ticker}
                            </Link>
                            <span className="ty-name">{p.name}</span>
                          </td>
                          <td className="r">${p.price.toFixed(2)}</td>
                          <td className="r">${p.insiderAvgPrice.toFixed(2)}</td>
                          <td className="r ty-disc">{p.discountPct.toFixed(1)}%</td>
                          <td className="r">{p.iqs}</td>
                          <td className="r">{p.buyers}</td>
                          <td className="r">{money(p.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="ty-legal">
                  &quot;Insiders paid&quot; is the share-weighted average price across their
                  open-market purchases in the last 180 days, from public SEC Form 4 filings.
                  Not investment advice.
                </p>
              </div>
            )}

            <Link href="/premium" className="ty-btn">
              Get Premium — $199/year →
            </Link>
            <p className="ty-fine">30-day money-back guarantee on the report. Reply to your receipt.</p>
          </>
        )}
      </main>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.ty { min-height: 100vh; min-height: 100dvh; background: #0D1F35; display: flex;
  align-items: center; justify-content: center; padding: 40px 20px;
  font-family: var(--font-sans), system-ui, sans-serif; }
.ty-box { width: 100%; max-width: 900px; text-align: center; color: #e7edf5; }
.ty-brand { font-family: var(--font-heading), var(--font-sans), sans-serif; font-weight: 800;
  letter-spacing: 1.4px; font-size: 12.5px; text-transform: uppercase; color: #C8A24A; margin: 0 0 22px; }
.ty-h1 { font-family: var(--font-heading), var(--font-sans), sans-serif; color: #fff;
  font-size: 32px; line-height: 1.16; font-weight: 800; letter-spacing: -0.4px; margin: 0 0 12px; }
.ty-sub { font-size: 15.5px; line-height: 1.65; color: #cbd5e1; margin: 0 0 24px; }
.ty-link { color: #C8A24A; font-weight: 700; text-decoration: none; }
.ty-link:hover { text-decoration: underline; }
.ty-report { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px; padding: 18px; margin: 0 0 26px; text-align: left; }
.ty-report-title { font-family: var(--font-heading), var(--font-sans), sans-serif;
  font-size: 16px; font-weight: 800; color: #fff; margin: 0 0 14px; }
.ty-scroll { overflow-x: auto; }
.ty-table { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 640px; }
.ty-table th { text-align: left; font-size: 10.5px; letter-spacing: 0.6px; text-transform: uppercase;
  color: #94a3b8; padding: 0 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.14); white-space: nowrap; }
.ty-table td { padding: 11px 10px; border-bottom: 1px solid rgba(255,255,255,0.07); color: #dbe4ef; white-space: nowrap; }
.ty-table .r { text-align: right; }
.ty-name { display: block; font-size: 11.5px; color: #8fa0b6; margin-top: 2px; max-width: 220px;
  overflow: hidden; text-overflow: ellipsis; }
.ty-disc { color: #6ee7a2; font-weight: 700; }
.ty-legal { font-size: 11.5px; color: #64748b; line-height: 1.6; margin: 14px 0 0; }
.ty-btn { display: inline-flex; align-items: center; justify-content: center; height: 54px;
  padding: 0 26px; border-radius: 10px; text-decoration: none;
  background: linear-gradient(135deg, #D8B45C 0%, #B98F35 100%); color: #10203A;
  font-size: 16px; font-weight: 800; }
.ty-btn:hover { filter: brightness(1.06); }
.ty-btn-ghost { background: transparent; border: 1px solid rgba(255,255,255,0.3); color: #e7edf5; }
.ty-fine { font-size: 12px; color: #7f8ea3; margin: 14px 0 0; }
@media (max-width: 620px) { .ty-h1 { font-size: 25px; } }
`;

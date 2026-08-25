"use client";
/**
 * /top-picks-report — Downsell 2, the funnel's final safety net (Round-2
 * brief, Section 2, Step 5).
 *
 * Isolated landing page (no nav, no footer — BARE_ROUTES in AppShell), the
 * brief's copy verbatim, and a $3 one-time Stripe charge. Stripe Checkout
 * collects the email itself, so the page keeps the brief's single-button
 * layout; the report is then emailed as a PDF and also rendered on
 * /thank-you-report straight after payment.
 */
import { useEffect, useState } from "react";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";

interface Preview {
  count: number;
  updated: string;
  maxDiscountPct: number;
  topIqs: number;
  totalInsiderValue: number;
}

const INSIDE = [
  "The stocks insiders bought at a higher price than today's market",
  "Each insider's role, dollar amount, and date of purchase",
  "The IQS score for each transaction",
  "Why 'buying cheaper than the CEO' is one of the best setups in the market",
];

export default function TopPicksReportPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const { data: preview } = useSWR<Preview>(
    `${API_BASE}/top-picks-report/preview`,
    fetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase") === "cancelled") setCancelled(true);
  }, []);

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/top-picks-report/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !data.url) throw new Error(data.message || "checkout failed");
      window.location.href = data.url;
    } catch {
      setError("Checkout could not open. Please try again in a moment.");
      setBusy(false);
    }
  };

  return (
    <div className="tp">
      <main className="tp-box">
        <p className="tp-brand">InsiderBuying.com</p>

        <h1 className="tp-h1">One Last Thing Before You Go.</h1>
        <h2 className="tp-h2">Stocks You Can Buy Cheaper Than the Insiders Did.</h2>

        <p className="tp-body">
          Our team identified a handful of stocks where insiders recently
          <br />
          paid MORE than the current market price.
          <br />
          That means you can buy in at a discount to where the smart money entered.
        </p>
        <p className="tp-body tp-body-strong">We put them in a single report. It&apos;s $3.</p>

        {preview && preview.count > 0 && (
          <div className="tp-stats">
            <div>
              <b>{preview.count}</b>
              <span>stocks in this month&apos;s report</span>
            </div>
            <div>
              <b>{preview.maxDiscountPct.toFixed(0)}%</b>
              <span>biggest discount to the insiders&apos; price</span>
            </div>
            <div>
              <b>{preview.topIqs}</b>
              <span>highest Insider Score in the set</span>
            </div>
          </div>
        )}

        <div className="tp-inside">
          <p className="tp-inside-title">What&apos;s inside:</p>
          <ul>
            {INSIDE.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <button type="button" className="tp-cta" onClick={buy} disabled={busy}>
          {busy ? "Opening secure checkout…" : "Get the Report — $3"}
        </button>

        {error && (
          <p className="tp-error" role="alert">
            {error}
          </p>
        )}
        {cancelled && !error && (
          <p className="tp-note">Checkout was cancelled — the report is still here when you want it.</p>
        )}

        <p className="tp-fine">
          Instant PDF delivery. No subscription required.
          <br />
          30-day money-back guarantee.
        </p>

        <p className="tp-legal">
          Payment is processed by Stripe; your email is collected at checkout and the PDF is
          sent there. Figures are compiled from public SEC Form 4 filings and are not
          investment advice.
        </p>
      </main>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.tp {
  min-height: 100vh; min-height: 100dvh; background: #0D1F35;
  display: flex; align-items: center; justify-content: center;
  padding: 40px 20px; font-family: var(--font-sans), system-ui, sans-serif;
}
.tp-box { width: 100%; max-width: 640px; text-align: center; color: #e7edf5; }
.tp-brand { font-family: var(--font-heading), var(--font-sans), sans-serif; font-weight: 800;
  letter-spacing: 1.4px; font-size: 12.5px; text-transform: uppercase; color: #C8A24A; margin: 0 0 22px; }
.tp-h1 { font-family: var(--font-heading), var(--font-sans), sans-serif; color: #fff;
  font-size: 34px; line-height: 1.15; font-weight: 800; letter-spacing: -0.4px; margin: 0 0 10px; }
.tp-h2 { font-family: var(--font-heading), var(--font-sans), sans-serif; color: #C8A24A;
  font-size: 21px; line-height: 1.25; font-weight: 700; margin: 0 0 22px; }
.tp-body { font-size: 15.5px; line-height: 1.65; color: #cbd5e1; margin: 0 0 14px; }
.tp-body-strong { color: #fff; font-weight: 700; }
.tp-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0 6px; }
.tp-stats > div { background: rgba(255,255,255,0.05); border: 1px solid rgba(200,162,74,0.22);
  border-radius: 10px; padding: 14px 10px; }
.tp-stats b { display: block; font-family: var(--font-heading), var(--font-sans), sans-serif;
  font-size: 24px; color: #fff; line-height: 1.1; }
.tp-stats span { display: block; font-size: 11.5px; color: #94a3b8; margin-top: 6px; line-height: 1.35; }
.tp-inside { text-align: left; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 20px 22px; margin: 26px 0 24px; }
.tp-inside-title { font-weight: 800; color: #fff; font-size: 15px; margin: 0 0 12px; }
.tp-inside ul { list-style: none; margin: 0; padding: 0; }
.tp-inside li { position: relative; padding-left: 24px; font-size: 14.5px; line-height: 1.55;
  color: #cbd5e1; margin-bottom: 10px; }
.tp-inside li:last-child { margin-bottom: 0; }
.tp-inside li::before { content: "✓"; position: absolute; left: 0; top: 0; color: #C8A24A; font-weight: 800; }
.tp-cta { height: 56px; width: 100%; max-width: 380px; border: 0; border-radius: 10px; cursor: pointer;
  background: linear-gradient(135deg, #D8B45C 0%, #B98F35 100%); color: #10203A;
  font-size: 17px; font-weight: 800; }
.tp-cta:hover { filter: brightness(1.06); }
.tp-cta:disabled { opacity: 0.7; cursor: default; }
.tp-fine { font-size: 12.5px; color: #94a3b8; line-height: 1.6; margin: 16px 0 0; }
.tp-note { font-size: 13px; color: #C8A24A; margin: 12px 0 0; }
.tp-error { font-size: 13px; color: #fca5a5; margin: 12px 0 0; }
.tp-legal { font-size: 11.5px; color: #64748b; line-height: 1.6; margin: 26px 0 0; }
@media (max-width: 620px) {
  .tp-h1 { font-size: 27px; }
  .tp-h2 { font-size: 18px; }
  .tp-stats { grid-template-columns: 1fr; }
}
`;

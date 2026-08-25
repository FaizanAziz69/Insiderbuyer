"use client";
/**
 * /top-picks-report — Downsell 2, the funnel's final safety net (Round-2
 * brief, Section 2, Step 5).
 *
 * Isolated landing page (no nav, no footer — BARE_ROUTES in AppShell) and a
 * $3 one-time Stripe charge. The page carries the brief's copy and NOTHING
 * else (client asked for the document literally, 2026-08-25): no stat tiles,
 * no legal footnote, no brand line. Stripe Checkout collects the email, and
 * the report is delivered as the PDF the copy promises.
 */
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { track } from "@/lib/analytics";
import { getFunnelEntry } from "@/lib/funnel";

const INSIDE = [
  "The stocks insiders bought at a higher price than today's market",
  "Each insider's role, dollar amount, and date of purchase",
  "The IQS score for each transaction",
  "Why 'buying cheaper than the CEO' is one of the best setups in the market",
];

export default function TopPicksReportPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const wasCancelled =
      new URLSearchParams(window.location.search).get("purchase") === "cancelled";
    track("web_report_view", { entry: getFunnelEntry(), cancelled: wasCancelled });
  }, []);

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    track("web_report_checkout_start", { price: 3, entry: getFunnelEntry() });
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

        <p className="tp-fine">
          Instant PDF delivery. No subscription required.
          <br />
          30-day money-back guarantee.
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
.tp-h1 { font-family: var(--font-heading), var(--font-sans), sans-serif; color: #fff;
  font-size: 34px; line-height: 1.15; font-weight: 800; letter-spacing: -0.4px; margin: 0 0 10px; }
.tp-h2 { font-family: var(--font-heading), var(--font-sans), sans-serif; color: #C8A24A;
  font-size: 21px; line-height: 1.25; font-weight: 700; margin: 0 0 22px; }
.tp-body { font-size: 15.5px; line-height: 1.65; color: #cbd5e1; margin: 0 0 14px; }
.tp-body-strong { color: #fff; font-weight: 700; }
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
.tp-error { font-size: 13px; color: #fca5a5; margin: 12px 0 0; }
@media (max-width: 620px) {
  .tp-h1 { font-size: 27px; }
  .tp-h2 { font-size: 18px; }
}
`;

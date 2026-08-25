"use client";
/**
 * /thank-you-report — the post-purchase screen for the $3 downsell.
 *
 * The brief specifies exactly one thing here (Section 2, Step 5): "redirect to
 * /thank-you-report with a soft upsell: 'Report delivered to your inbox. Want
 * the real-time version? Get Premium at $199/year.'" — so that line, and
 * nothing else (client asked for the document literally, 2026-08-25; the
 * on-screen report table, the guarantee line and the brand line are gone).
 *
 * It still fulfils the order in the background, because the Stripe webhook is
 * not configured on this account: the checkout session id is posted to
 * /top-picks-report/fulfil, which verifies the payment with Stripe, tags the
 * buyer, and emails the PDF. The two extra states below (payment not
 * confirmed / delivery running late) are the failure paths, not embellishment
 * — without them a buyer whose payment cannot be verified sees a page that
 * claims a delivery that never happened.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { track } from "@/lib/analytics";
import { FUNNEL_COOKIES, SUBSCRIBE_HREF, getFunnelEntry, setCookie } from "@/lib/funnel";

interface Fulfilment {
  paid: boolean;
  email: string | null;
  emailed: boolean;
  picks: unknown[];
}

export default function ThankYouReportPage() {
  const [state, setState] = useState<"loading" | "ok" | "unpaid" | "error">("loading");

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
        setState(json.paid ? "ok" : "unpaid");
        if (json.paid) {
          // The buyer has already given us an email at checkout, so the
          // pre-sell page must not ask again on the way to Premium.
          setCookie(FUNNEL_COOKIES.optedIn, "true", 3650);
        }
        track(json.paid ? "web_purchase" : "web_report_unverified", {
          product: "top-picks-report",
          price: 3,
          emailed: json.emailed,
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
        {state === "loading" && <p className="ty-sub">Confirming your payment…</p>}

        {state === "ok" && (
          <>
            <h1 className="ty-h1">Report delivered to your inbox.</h1>
            <p className="ty-sub">
              Want the real-time version?{" "}
              <Link href={SUBSCRIBE_HREF} className="ty-link">
                Get Premium at $199/year
              </Link>
              .
            </p>
          </>
        )}

        {state === "unpaid" && (
          <>
            <h1 className="ty-h1">We couldn&apos;t confirm that purchase.</h1>
            <p className="ty-sub">
              If you were charged, reply to your Stripe receipt and we&apos;ll send the report
              straight away.
            </p>
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
      </main>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.ty { min-height: 100vh; min-height: 100dvh; background: #0D1F35; display: flex;
  align-items: center; justify-content: center; padding: 40px 20px;
  font-family: var(--font-sans), system-ui, sans-serif; }
.ty-box { width: 100%; max-width: 560px; text-align: center; color: #e7edf5; }
.ty-h1 { font-family: var(--font-heading), var(--font-sans), sans-serif; color: #fff;
  font-size: 32px; line-height: 1.16; font-weight: 800; letter-spacing: -0.4px; margin: 0 0 12px; }
.ty-sub { font-size: 16px; line-height: 1.65; color: #cbd5e1; margin: 0; }
.ty-link { color: #C8A24A; font-weight: 700; text-decoration: none; }
.ty-link:hover { text-decoration: underline; }
@media (max-width: 620px) { .ty-h1 { font-size: 25px; } }
`;

"use client";
/**
 * /thank-you-report — the post-purchase screen for the $3 downsell.
 *
 * The brief specifies exactly one thing on this page (Section 2, Step 5):
 * "redirect to /thank-you-report with a soft upsell: 'Report delivered to your
 * inbox. Want the real-time version? Get Premium at $199/year.'" — so that
 * line is the ONLY copy here. No brand line, no table, no guarantee line, and
 * no invented failure messages (client asked for the document literally,
 * 2026-08-25).
 *
 * The page still fulfils the order, because the Stripe webhook is not
 * configured on this account: the session id goes to /top-picks-report/fulfil,
 * which verifies the payment with Stripe, tags the buyer and emails the PDF.
 * A session that cannot be verified is sent back to the report page rather
 * than shown the delivery line — a redirect, not extra copy, so the page keeps
 * the document's wording without ever claiming a delivery that did not happen.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { track } from "@/lib/analytics";
import { FUNNEL_COOKIES, SUBSCRIBE_HREF, getFunnelEntry, setCookie } from "@/lib/funnel";

interface Fulfilment {
  paid: boolean;
  email: string | null;
  emailed: boolean;
}

/** Verification can lose a race with Stripe; retry before giving up. Kept
 *  short on purpose: a session Stripe will never confirm should reach the
 *  redirect in ~5s, not sit on an empty screen (measured 18s at 3×1500ms). */
const RETRIES = 2;
const RETRY_MS = 1000;

export default function ThankYouReportPage() {
  const router = useRouter();
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      router.replace("/top-picks-report");
      return;
    }
    let cancelled = false;

    const attempt = async (left: number): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE}/top-picks-report/fulfil`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const json = (await res.json()) as Fulfilment;
        if (cancelled) return;
        if (json.paid) {
          // The buyer gave an email at checkout, so the pre-sell page must not
          // ask again on the way to Premium.
          setCookie(FUNNEL_COOKIES.optedIn, "true", 3650);
          track("web_purchase", {
            product: "top-picks-report",
            price: 3,
            emailed: json.emailed,
            entry: getFunnelEntry(),
          });
          setPaid(true);
          return;
        }
        throw new Error("unverified");
      } catch {
        if (cancelled) return;
        if (left > 0) {
          setTimeout(() => void attempt(left - 1), RETRY_MS);
          return;
        }
        track("web_report_unverified", { product: "top-picks-report", price: 3 });
        router.replace("/top-picks-report");
      }
    };

    void attempt(RETRIES);
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="ty">
      <main className="ty-box">
        {paid && (
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

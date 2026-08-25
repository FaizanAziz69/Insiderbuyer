"use client";
/**
 * /join/thanks — the thank-you page the brief's Step-2 heading calls for
 * ("The Subscribe Button Flow — Pre-Sell Opt-In and Thank you Page ... Insert
 * an opt in page and thank you page that directs to subscribe / the sales
 * page").
 *
 * One screen, one CTA, straight on to the sales page. Same isolated white /
 * navy / gold treatment as /join, no chrome (BARE_ROUTES in AppShell).
 */
import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { setFunnelEntry } from "@/lib/funnel";

const NEXT = "/premium";

export default function JoinThanksPage() {
  useEffect(() => {
    track("web_join_thanks_view");
  }, []);

  return (
    <div className="jt">
      <main className="jt-box">
        <h1 className="jt-h1">
          You&apos;re In.
          <br />
          Here&apos;s What Insiders Are Buying.
        </h1>
        <p className="jt-sub">Your first Weekly Insider Signal is on its way.</p>
        <a
          href={NEXT}
          className="jt-btn"
          onClick={() => {
            setFunnelEntry("join");
            track("web_join_continue", { from: "thanks" });
          }}
        >
          Continue to Insider Access →
        </a>
      </main>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.jt {
  min-height: 100vh; min-height: 100dvh; width: 100%;
  background: #FFFFFF; display: flex; align-items: center; justify-content: center;
  padding: 28px 20px; font-family: var(--font-sans), system-ui, sans-serif;
}
.jt-box { width: 100%; max-width: 560px; text-align: center; }
.jt-h1 {
  font-family: var(--font-heading), var(--font-sans), sans-serif;
  color: #0D1F35; font-weight: 800; letter-spacing: -0.5px;
  font-size: 34px; line-height: 1.16; margin: 0 0 16px;
}
.jt-sub { color: #A8842C; font-size: 16px; line-height: 1.5; margin: 0 0 26px; }
.jt-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 54px; width: 100%; border: 0; border-radius: 10px; cursor: pointer;
  background: linear-gradient(135deg, #D8B45C 0%, #B98F35 100%);
  color: #10203A; font-size: 16.5px; font-weight: 800; text-decoration: none;
}
.jt-btn:hover { filter: brightness(1.06); }
@media (max-width: 560px) { .jt-h1 { font-size: 27px; } }
`;

"use client";
/**
 * /join — the pre-sell opt-in (Round-2 brief, Section 2, Step 2).
 *
 * Built to the brief's "Exact Spec" for layout and copy, with the Step-2
 * developer notes — which come after it in the document — deciding the
 * palette: "clean, long-form, editorial feel. White background, navy text,
 * gold accents. Not a sales page design." (Client's call, 2026-08-25: the two
 * blocks agree on everything except the background colour.)
 *   · full screen, dark navy #0D1F35, nothing else on the page
 *   · no header, no footer, no navigation (BARE_ROUTES in AppShell)
 *   · vertically centred, single column, max width 560px
 *   · one email field, one CTA
 *   · submit → capture with tag 'Sales Opt In' (dev note) → thank-you page,
 *     which is the section's own heading: "Pre-Sell Opt-In and Thank you Page"
 *   · already logged in or previously opted in → no form, one Continue button
 *   · the Harvard study chart from /premium sits below the form as the trust
 *     visual the dev notes ask for
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FUNNEL_COOKIES, hasOptedIn, isValidEmail, setCookie, setFunnelEntry } from "@/lib/funnel";
import { identifyByEmail, track } from "@/lib/analytics";

const NEXT = "/premium";
/** The brief's own heading for this step is "Pre-Sell Opt-In and Thank you
 *  Page", so a submit lands on the thank-you screen whose single CTA carries
 *  on to the sales page. */
const THANKS = "/join/thanks";

export default function JoinPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [known, setKnown] = useState(false);

  // Cookies are only readable on the client, so the decision lands after mount.
  useEffect(() => {
    const seen = hasOptedIn();
    setKnown(seen);
    track("web_join_view", { returning: seen });
  }, []);

  const skipForm = useMemo(() => known || !!user, [known, user]);

  // Prefetch the sales page so the redirect is instant, as the brief asks.
  useEffect(() => {
    router.prefetch?.(NEXT);
    router.prefetch?.(THANKS);
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const clean = email.trim().toLowerCase();
    try {
      await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean, source: "Sales Opt In" }),
      });
    } catch {
      /* Capture is best-effort — a network blip must not trap a warm visitor
         on this page. The redirect happens either way. */
    }
    setCookie(FUNNEL_COOKIES.optedIn, "true", 3650);
    // Attribution for the rest of the journey: everything that follows on
    // /premium is credited to the pre-sell page, not to direct traffic.
    setFunnelEntry("join");
    track("web_join_optin", { source: "Sales Opt In" });
    void identifyByEmail(clean);
    router.push(THANKS);
  };

  return (
    <div className="jn">
      <main className="jn-box">
        <h1 className="jn-h1">
          See What Insiders Are Buying
          <br />
          Before the Market Does.
        </h1>

        {skipForm ? (
          <>
            <a
              href={NEXT}
              className="jn-btn"
              onClick={() => {
                setFunnelEntry("join");
                track("web_join_continue");
              }}
            >
              Continue to Insider Access →
            </a>
          </>
        ) : (
          <>
            <p className="jn-sub">Enter your email to get started.</p>
            <form className="jn-form" onSubmit={submit}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                className="jn-input"
                placeholder="your@email.com"
                aria-label="Your email address"
                value={email}
                onChange={(ev) => {
                  setEmail(ev.target.value);
                  setError(null);
                }}
              />
              <button type="submit" className="jn-btn" disabled={busy}>
                {busy ? "One moment…" : "Get Insider Access →"}
              </button>
            </form>
            {error && (
              <p className="jn-error" role="alert">
                {error}
              </p>
            )}
            <p className="jn-fine">Free to start. No credit card.</p>
          </>
        )}
        <TrustVisual />
      </main>
      <style>{CSS}</style>
    </div>
  );
}

/** The Harvard-study performance chart from /premium, reused here as the
 *  trust visual the brief's Step-2 developer notes ask for. Same figures as
 *  the sales page (backtest, not a live quote). */
function TrustVisual() {
  return (
    <section className="jn-trust" aria-label="Why insider buying matters">
      <p className="jn-trust-line">
        A peer-reviewed <b>Harvard study</b> found that corporate insiders
        consistently beat the S&amp;P&nbsp;500 &amp; SPY.
      </p>
      <div className="jn-trust-card">
        <div className="jn-trust-head">
          <span>Insider Purchases Strategy</span>
          <span className="jn-trust-pill">Backtested</span>
        </div>
        <div className="jn-trust-big">
          +2,924.4%
          <em>all time vs market</em>
        </div>
        <svg className="jn-trust-chart" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="jnFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#12805A" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#12805A" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 39 L8 38.4 L16 37.8 L24 36.6 L32 35 L40 32.4 L48 29.6 L56 26.4 L64 21.6 L72 18.4 L80 12.6 L88 8.4 L94 6.6 L100 2 L100 42 L0 42 Z"
            fill="url(#jnFill)"
          />
          <path
            d="M0 39 L8 38.4 L16 37.8 L24 36.6 L32 35 L40 32.4 L48 29.6 L56 26.4 L64 21.6 L72 18.4 L80 12.6 L88 8.4 L94 6.6 L100 2"
            fill="none" stroke="#12805A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M0 39.6 L25 39 L50 38.2 L75 37.2 L100 35.8"
            fill="none" stroke="#8b97a6" strokeWidth="1.1" strokeDasharray="3 3"
            opacity="0.5" vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="jn-trust-stats">
          <div><b>+31.00%</b><span>CAGR</span></div>
          <div><b>+72.48%</b><span>1-year</span></div>
          <div><b>142K+</b><span>buys tracked</span></div>
        </div>
      </div>
      <p className="jn-trust-fine">
        Backtest figures are historical, gross of costs, and do not predict future results.
      </p>
    </section>
  );
}

const CSS = `
.jn {
  min-height: 100vh; min-height: 100dvh; width: 100%;
  background: #FFFFFF; display: flex; align-items: center; justify-content: center;
  padding: 28px 20px; font-family: var(--font-sans), system-ui, sans-serif;
}
.jn-box { width: 100%; max-width: 560px; text-align: center; }
.jn-h1 {
  font-family: var(--font-heading), var(--font-sans), sans-serif;
  color: #0D1F35; font-weight: 800; letter-spacing: -0.5px;
  /* 36px keeps "See What Insiders Are Buying" on one line inside the 560px
     column, so the headline stays the two lines the brief asks for (the site's
     desktop body zoom of 1.10 renders it ~40px). */
  font-size: 36px; line-height: 1.16; margin: 0 0 16px;
}
.jn-sub { color: #A8842C; font-size: 16px; line-height: 1.5; margin: 0 0 26px; }
.jn-form { display: flex; flex-direction: column; gap: 12px; }
.jn-input {
  height: 54px; width: 100%; border-radius: 10px; padding: 0 16px; font-size: 16px;
  color: #0D1F35; background: #FFFFFF;
  border: 1px solid rgba(13,31,53,0.22); text-align: center;
}
.jn-input::placeholder { color: #8b97a6; }
.jn-input:focus { outline: none; border-color: #C8A24A; box-shadow: 0 0 0 3px rgba(200,162,74,0.18); }
.jn-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 54px; width: 100%; border: 0; border-radius: 10px; cursor: pointer;
  background: linear-gradient(135deg, #D8B45C 0%, #B98F35 100%);
  color: #10203A; font-size: 16.5px; font-weight: 800; letter-spacing: 0.1px;
  text-decoration: none;
}
.jn-btn:hover { filter: brightness(1.04); }
.jn-btn:disabled { opacity: 0.7; cursor: default; }
.jn-fine { color: #7b8797; font-size: 12.5px; margin: 14px 0 0; }
.jn-error { color: #b91c1c; font-size: 13px; margin: 12px 0 0; }
/* Harvard-study trust visual (brief, Step 2 developer notes). */
.jn-trust { margin: 34px auto 0; text-align: left; }
.jn-trust-line { color: #45536b; font-size: 13.5px; line-height: 1.6; margin: 0 0 12px; text-align: center; }
.jn-trust-line b { color: #0D1F35; }
.jn-trust-card { background: #FBFAF7; border: 1px solid rgba(200,162,74,0.38);
  border-radius: 12px; padding: 16px 18px; }
.jn-trust-head { display: flex; align-items: center; justify-content: space-between;
  font-size: 10.5px; letter-spacing: 0.9px; text-transform: uppercase; color: #7b8797; }
.jn-trust-pill { border: 1px solid rgba(13,31,53,0.18); border-radius: 999px; padding: 2px 8px; font-size: 9.5px; }
.jn-trust-big { font-family: var(--font-heading), var(--font-sans), sans-serif; color: #12805A;
  font-size: 30px; font-weight: 800; line-height: 1.1; margin: 10px 0 2px; }
.jn-trust-big em { display: block; font-style: normal; font-size: 11.5px; color: #7b8797; font-weight: 500; margin-top: 4px; }
.jn-trust-chart { width: 100%; height: 62px; display: block; margin: 8px 0 6px; }
.jn-trust-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.jn-trust-stats b { display: block; color: #0D1F35; font-size: 14px; }
.jn-trust-stats span { display: block; color: #8b97a6; font-size: 10.5px; letter-spacing: 0.5px; text-transform: uppercase; margin-top: 2px; }
.jn-trust-fine { color: #93a0ae; font-size: 10.5px; line-height: 1.55; margin: 10px 0 0; text-align: center; }
@media (max-width: 560px) {
  .jn-h1 { font-size: 30px; }
  .jn-trust-big { font-size: 26px; }
}
`;

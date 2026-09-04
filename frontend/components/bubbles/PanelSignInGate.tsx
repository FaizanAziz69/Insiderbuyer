"use client";
/**
 * Sign-in gate for the bubbles click panels.
 *
 * George (2026-09-04): "we want the user to experience the bubbles page in a
 * limited way — each time they click on a bubble they need to opt in ... to get
 * the full details. And then the 1D and 1W filters are paygated." Faizan
 * (2026-09-05) tightened the opt-in to a real account: "iss sab ke liye sign
 * in karwao phir dikhao, aur jo paygated hain wo subscribe per".
 *
 * So the map itself stays public, the panel header (who the bubble is) is the
 * limited view, and everything below it renders only for a signed-in user —
 * a free account, not a subscription. Guests get a sign-in / create-account
 * prompt that opens the site's LoginModal; the moment the session exists the
 * details render in place. Paygated items (Insider Score, the 1D/1W windows)
 * keep their own locks and route to /premium — this gate never touches them.
 *
 * The modal is portalled to <body>: the panel slides in with a CSS transform,
 * and a position:fixed dialog inside a transformed ancestor would be clipped
 * to the panel instead of covering the viewport.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LoginModal } from "@/components/LoginModal";
import { usePremium } from "@/components/premium/PremiumContext";
import { useAuth } from "@/lib/auth";

export function PanelSignInGate({
  summary,
  children,
}: {
  /** One line of what the visitor is unlocking, in the page's own words. */
  summary: string;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const { unlocked } = usePremium();
  const [loginOpen, setLoginOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (user || unlocked) return <>{children}</>;
  // Session still hydrating from the stored token: show nothing rather than
  // flash the gate at someone who is signed in.
  if (loading) return null;

  return (
    <div className="bm-gate" role="region" aria-label="Sign in to see the full profile">
      <div className="bm-gate-eyebrow">Free account required</div>
      <div className="bm-gate-title">Sign in to see the full profile</div>
      <p className="bm-gate-body">{summary}</p>
      <button type="button" className="bm-gate-cta" onClick={() => setLoginOpen(true)}>
        Sign in
      </button>
      <button type="button" className="bm-gate-alt" onClick={() => setLoginOpen(true)}>
        New here? Create a free account
      </button>
      <p className="bm-gate-fine">Free. No card needed. Insider Scores and same-day windows are part of Insider Access.</p>
      {mounted &&
        createPortal(<LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />, document.body)}
      <style>{CSS}</style>
    </div>
  );
}

/* Lives inside .bm-root, so the --bm-* tokens resolve. Gold CTA like the
   site-wide funnel popups; the box itself is the panel's own navy. */
const CSS = `
.bm-gate {
  margin: 18px 0 8px; padding: 18px 16px 14px; border-radius: 12px;
  background: rgba(157,176,199,0.06); border: 1px solid rgba(232,181,77,0.35);
}
.bm-gate-eyebrow {
  font-family: var(--bm-mono), monospace; font-size: 10.5px; letter-spacing: 1.2px;
  text-transform: uppercase; color: var(--bm-gold); margin-bottom: 6px;
}
.bm-gate-title {
  font-family: var(--bm-head), sans-serif; font-weight: 800; font-size: 18px;
  line-height: 1.2; color: var(--bm-ink); margin-bottom: 6px;
}
.bm-gate-body { font-size: 13px; line-height: 1.5; color: var(--bm-ink-dim); margin: 0 0 12px; }
.bm-gate-cta {
  width: 100%; padding: 12px; border: 0; border-radius: 8px; cursor: pointer;
  font-family: var(--bm-head), sans-serif; font-weight: 800; font-size: 13px;
  letter-spacing: 0.6px; text-transform: uppercase; color: #1a1300; background: var(--bm-gold);
}
.bm-gate-cta:hover { filter: brightness(1.06); }
.bm-gate-alt {
  display: block; width: 100%; margin-top: 8px; padding: 8px; border: 0; background: transparent;
  cursor: pointer; font-size: 12.5px; font-weight: 600; color: var(--bm-ink-dim); text-decoration: underline;
  text-underline-offset: 3px;
}
.bm-gate-alt:hover { color: var(--bm-ink); }
.bm-gate-fine { margin: 8px 0 0; font-size: 11px; line-height: 1.45; color: var(--bm-ink-faint); text-align: center; }
`;

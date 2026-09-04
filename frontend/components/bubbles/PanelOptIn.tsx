"use client";
/**
 * Free email opt-in gate for the bubbles click panels (George, 2026-09-04:
 * "subscribe gate not pay gate — we want the user to experience the bubbles
 * page in a limited way; each time they click on a bubble they need to opt in
 * via free email to get the full details").
 *
 * The map itself stays public. A visitor who has not given us an email sees
 * the panel header (who the bubble is) plus this form in place of the details;
 * on submit the email goes to POST /subscribers, the visitor is marked opted-in
 * for good (the same `ib_opted_in` cookie the site-wide popups honour, so the
 * 30s / exit popups stop asking too), and the full panel renders in place.
 * Signed-in users and subscribers are never asked. This is NOT the paywall —
 * the 1D/1W windows on /bubbles remain Insider Access.
 */
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { identifyByEmail, track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { usePremium } from "@/components/premium/PremiumContext";
import { hasOptedIn, isValidEmail, markOptedIn } from "@/lib/funnel";

/** True once the visitor may see full bubble details. Starts false and flips
 *  on mount from the cookie / session, so SSR and first paint agree. */
export function useEmailOptIn(): { optedIn: boolean; complete: () => void } {
  const { user } = useAuth();
  const { unlocked } = usePremium();
  const [cookieOptIn, setCookieOptIn] = useState(false);
  useEffect(() => {
    setCookieOptIn(hasOptedIn());
  }, []);
  return {
    optedIn: cookieOptIn || !!user || unlocked,
    complete: () => {
      markOptedIn();
      setCookieOptIn(true);
    },
  };
}

export function PanelOptIn({
  source,
  summary,
  children,
}: {
  /** Attribution written to the subscriber row, e.g. "bubbles-panel". */
  source: string;
  /** One line of what the visitor is unlocking, in the page's own words. */
  summary: string;
  children: React.ReactNode;
}) {
  const { optedIn, complete } = useEmailOptIn();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (optedIn) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean, source }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      track("web_bubbles_optin", { source });
      void identifyByEmail(clean);
      complete();
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bm-optin" role="region" aria-label="Unlock the full profile">
      <div className="bm-optin-eyebrow">Free · email required</div>
      <div className="bm-optin-title">Unlock the full profile</div>
      <p className="bm-optin-body">{summary}</p>
      <form onSubmit={submit} className="bm-optin-form" noValidate>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          className="bm-optin-input"
          placeholder="Your email address"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          aria-label="Your email address"
        />
        <button type="submit" className="bm-optin-cta" disabled={busy}>
          {busy ? "Sending…" : "Show me the details"}
        </button>
      </form>
      {error && (
        <p className="bm-optin-error" role="alert">
          {error}
        </p>
      )}
      <p className="bm-optin-fine">Free. We send the Weekly Insider Signal; unsubscribe anytime.</p>
      <style>{CSS}</style>
    </div>
  );
}

/* Lives inside .bm-root, so the --bm-* tokens resolve. Gold CTA like the
   site-wide funnel popups; the box itself is the panel's own navy. */
const CSS = `
.bm-optin {
  margin: 18px 0 8px; padding: 18px 16px 14px; border-radius: 12px;
  background: rgba(157,176,199,0.06); border: 1px solid rgba(232,181,77,0.35);
}
.bm-optin-eyebrow {
  font-family: var(--bm-mono), monospace; font-size: 10.5px; letter-spacing: 1.2px;
  text-transform: uppercase; color: var(--bm-gold); margin-bottom: 6px;
}
.bm-optin-title {
  font-family: var(--bm-head), sans-serif; font-weight: 800; font-size: 18px;
  line-height: 1.2; color: var(--bm-ink); margin-bottom: 6px;
}
.bm-optin-body { font-size: 13px; line-height: 1.5; color: var(--bm-ink-dim); margin: 0 0 12px; }
.bm-optin-form { display: flex; flex-direction: column; gap: 8px; }
.bm-optin-input {
  width: 100%; padding: 11px 12px; border-radius: 8px; font-size: 14px;
  color: var(--bm-ink); background: rgba(8,21,37,0.9); border: 1px solid var(--bm-line);
  font-family: var(--bm-sans), system-ui, sans-serif;
}
.bm-optin-input::placeholder { color: var(--bm-ink-faint); }
.bm-optin-input:focus { outline: 2px solid var(--bm-gold); outline-offset: 1px; border-color: transparent; }
.bm-optin-cta {
  width: 100%; padding: 12px; border: 0; border-radius: 8px; cursor: pointer;
  font-family: var(--bm-head), sans-serif; font-weight: 800; font-size: 13px;
  letter-spacing: 0.6px; text-transform: uppercase; color: #1a1300; background: var(--bm-gold);
}
.bm-optin-cta:hover { filter: brightness(1.06); }
.bm-optin-cta:disabled { opacity: 0.6; cursor: default; }
.bm-optin-error { margin: 8px 0 0; font-size: 12px; color: var(--bm-red); }
.bm-optin-fine { margin: 10px 0 0; font-size: 11px; color: var(--bm-ink-faint); text-align: center; }
`;

"use client";
/**
 * Section 2 of the Round-2 brief — the site-wide popup pair.
 *
 *   Popup 1 — free email opt-in, 30 seconds after load, any page.
 *   Popup 2 — exit intent (desktop: cursor leaves the top of the viewport;
 *             mobile: back gesture), and ONLY if Popup 1 has not shown this
 *             session.
 *
 * Copy is verbatim from the brief. Two popups maximum per session, never both,
 * never the same one twice, 7-day suppression on dismissal, forever on submit,
 * and nothing at all for a signed-in subscriber. The shared rules live in
 * lib/funnel.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { identifyByEmail, track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { usePremium } from "@/components/premium/PremiumContext";
import {
  FUNNEL_COOKIES,
  getCookie,
  hasOptedIn,
  isValidEmail,
  markPopupCompleted,
  markPopupShown,
  setFunnelEntry,
  popupShownThisSession,
  popupsAllowedOn,
  popupsShownThisSession,
} from "@/lib/funnel";

type PopupId = "popup1" | "popup2";

const COPY: Record<
  PopupId,
  {
    headline: string;
    lines: string[];
    lead?: string;
    cta: string;
    below?: string;
    dismiss: string;
    source: string;
    shownCookie: string;
    completedCookie: string;
  }
> = {
  popup1: {
    headline: "Would You Want to Know If a CEO Just Bet $2 Million on Their Own Stock?",
    lead: "Get the Weekly Insider Signal — free.",
    lines: [
      "Every Monday: the top insider buys of the week,",
      "scored and ranked by our proprietary IQS model.",
      "The moves the market hasn't priced in yet.",
    ],
    cta: "Send Me This Week's Top Insider Buys →",
    below: "Free. No credit card. Unsubscribe anytime.",
    dismiss: "No thanks — I'll find my own stock ideas",
    source: "popup-30s",
    shownCookie: FUNNEL_COOKIES.popup1Shown,
    completedCookie: FUNNEL_COOKIES.popup1Completed,
  },
  popup2: {
    headline: "Before You Go — See What Insiders Did This Week.",
    lines: [
      "InsiderBuying.com tracks every open-market",
      "stock purchase by CEOs and CFOs.",
      "This week's top buys — scored and ranked — free.",
    ],
    cta: "Show Me This Week's Top Insider Buys",
    dismiss: "No thanks",
    source: "popup-exit",
    shownCookie: FUNNEL_COOKIES.popup2Shown,
    completedCookie: FUNNEL_COOKIES.popup2Completed,
  },
};

const POPUP1_DELAY_MS = 30_000;

export function FunnelPopups() {
  const pathname = usePathname() || "/";
  const { user } = useAuth();
  const { premium } = usePremium();
  const [active, setActive] = useState<PopupId | null>(null);
  const armed = useRef(false);
  const completed = useRef(false);

  /** Everything the brief says must suppress a popup. */
  const eligible = useCallback(
    (id: PopupId): boolean => {
      if (!popupsAllowedOn(pathname)) return false;
      if (premium) return false; // already a subscriber
      if (hasOptedIn()) return false; // already on the list
      if (popupsShownThisSession() >= 2) return false; // hard cap
      if (popupShownThisSession(id)) return false; // never twice
      // "Never show both in the same session."
      const other: PopupId = id === "popup1" ? "popup2" : "popup1";
      if (popupShownThisSession(other)) return false;
      // Dismissed within the last 7 days (cookie lifetime is the window).
      if (getCookie(COPY[id].shownCookie) === "true") return false;
      return true;
    },
    [pathname, premium],
  );

  // ── Popup 1: 30 seconds after load ───────────────────────────────────
  useEffect(() => {
    if (active) return;
    if (!eligible("popup1")) return;
    const t = setTimeout(() => {
      if (!eligible("popup1")) return;
      markPopupShown("popup1", COPY.popup1.shownCookie);
      track("web_popup_shown", { popup: "popup1", trigger: "timer-30s", path: pathname });
      setActive("popup1");
    }, POPUP1_DELAY_MS);
    return () => clearTimeout(t);
    // Re-armed on route change so a visitor who lands mid-session still gets
    // their 30 seconds; the eligibility check keeps it to one appearance.
  }, [pathname, eligible, active]);

  // ── Popup 2: exit intent, only if popup 1 never showed ───────────────
  useEffect(() => {
    if (active) return;
    if (!eligible("popup2")) return;

    const fire = () => {
      if (!eligible("popup2")) return;
      markPopupShown("popup2", COPY.popup2.shownCookie);
      track("web_popup_shown", { popup: "popup2", trigger: "exit-intent", path: pathname });
      setActive("popup2");
    };

    // Desktop: the cursor leaves through the top of the window.
    const onMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) fire();
    };
    document.addEventListener("mouseout", onMouseOut);

    // Mobile: the back gesture. One extra history entry is pushed, so the
    // first back press lands here instead of leaving the site; the listener
    // then detaches so a second press navigates normally.
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    let onPop: (() => void) | null = null;
    if (coarse && !armed.current) {
      armed.current = true;
      try {
        history.pushState({ ibExitGuard: true }, "");
      } catch {
        /* history blocked — desktop path still applies */
      }
      onPop = () => {
        if (onPop) window.removeEventListener("popstate", onPop);
        fire();
      };
      window.addEventListener("popstate", onPop);
    }

    return () => {
      document.removeEventListener("mouseout", onMouseOut);
      if (onPop) window.removeEventListener("popstate", onPop);
    };
  }, [pathname, eligible, active]);

  if (!active) return null;
  const copy = COPY[active];
  return (
    <FunnelModal
      copy={copy}
      known={user?.email || null}
      onClose={() => {
        if (!completed.current) {
          track("web_popup_dismissed", { popup: active, source: copy.source });
        }
        setActive(null);
      }}
      onCompleted={(email) => {
        completed.current = true;
        markPopupCompleted(copy.completedCookie);
        setFunnelEntry("popup");
        track("web_popup_optin", { popup: active, source: copy.source });
        void identifyByEmail(email);
      }}
    />
  );
}

/* --------------------------------------------------------------- modal ui */

function FunnelModal({
  copy,
  known,
  onClose,
  onCompleted,
}: {
  copy: (typeof COPY)[PopupId];
  known: string | null;
  onClose: () => void;
  onCompleted: (email: string) => void;
}) {
  const [email, setEmail] = useState(known || "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), source: copy.source }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onCompleted(email.trim().toLowerCase());
      // Brief: confirm INSIDE the popup. No redirect.
      setDone(true);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fp-wrap" role="dialog" aria-modal="true" aria-label={copy.headline}>
      <button type="button" className="fp-scrim" aria-label="Close" onClick={onClose} />
      <div className="fp-card">
        <button type="button" className="fp-x" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </button>

        {done ? (
          <div className="fp-done">
            <div className="fp-done-title">Check your inbox!</div>
            <p className="fp-done-body">
              Your first Weekly Insider Signal is on its way. Add us to your contacts so it
              never lands in spam.
            </p>
            <button type="button" className="fp-cta" onClick={onClose}>
              Back to the site
            </button>
          </div>
        ) : (
          <>
            <h2 className="fp-head">{copy.headline}</h2>
            {copy.lead && <p className="fp-lead">{copy.lead}</p>}
            <p className="fp-sub">
              {copy.lines.map((l) => (
                <span key={l}>
                  {l}
                  <br />
                </span>
              ))}
            </p>
            <form onSubmit={submit} className="fp-form">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                className="fp-input"
                placeholder="Your email address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                aria-label="Your email address"
              />
              <button type="submit" className="fp-cta" disabled={busy}>
                {busy ? "Sending…" : copy.cta}
              </button>
            </form>
            {error && (
              <p className="fp-error" role="alert">
                {error}
              </p>
            )}
            {copy.below && <p className="fp-fine">{copy.below}</p>}
            <button type="button" className="fp-dismiss" onClick={onClose}>
              {copy.dismiss}
            </button>
          </>
        )}
      </div>
      <style>{CSS}</style>
    </div>
  );
}

/* Dark navy panel, gold CTA, white text (brief). Mobile: full-screen bottom
   sheet. Fixed palette on purpose — this is the same in both site themes. */
const CSS = `
.fp-wrap { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 20px; }
.fp-scrim { position: absolute; inset: 0; background: rgba(4,10,20,0.72); backdrop-filter: blur(2px); border: 0; }
.fp-card {
  position: relative; width: 100%; max-width: 520px; background: #0D1F35;
  color: #fff; border: 1px solid rgba(200,162,74,0.34); border-radius: 14px;
  padding: 30px 28px 24px; box-shadow: 0 30px 80px rgba(0,0,0,0.55);
  font-family: var(--font-sans), system-ui, sans-serif; text-align: center;
}
.fp-x { position: absolute; top: 10px; right: 10px; height: 30px; width: 30px; display: grid; place-items: center;
  border-radius: 999px; background: rgba(255,255,255,0.08); color: #cbd5e1; border: 0; cursor: pointer; }
.fp-x:hover { background: rgba(255,255,255,0.16); color: #fff; }
.fp-head { font-family: var(--font-heading), var(--font-sans), sans-serif; font-size: 25px; line-height: 1.2;
  font-weight: 800; letter-spacing: -0.2px; margin: 4px 0 12px; color: #fff; }
.fp-lead { font-size: 16px; font-weight: 700; color: #C8A24A; margin: 0 0 6px; }
.fp-sub { font-size: 14.5px; line-height: 1.6; color: #cbd5e1; margin: 0 0 18px; }
.fp-form { display: flex; flex-direction: column; gap: 10px; }
.fp-input { height: 46px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.06); color: #fff; padding: 0 14px; font-size: 15px; width: 100%; }
.fp-input::placeholder { color: #94a3b8; }
.fp-input:focus { outline: none; border-color: #C8A24A; background: rgba(255,255,255,0.1); }
.fp-cta { height: 48px; border-radius: 9px; border: 0; cursor: pointer; width: 100%;
  background: linear-gradient(135deg, #D8B45C 0%, #B98F35 100%); color: #10203A;
  font-size: 15px; font-weight: 800; letter-spacing: 0.1px; }
.fp-cta:hover { filter: brightness(1.06); }
.fp-cta:disabled { opacity: 0.7; cursor: default; }
.fp-fine { font-size: 12px; color: #94a3b8; margin: 12px 0 0; }
.fp-error { font-size: 13px; color: #fca5a5; margin: 10px 0 0; }
.fp-dismiss { display: block; margin: 14px auto 0; background: none; border: 0; cursor: pointer;
  font-size: 12.5px; color: #7f8ea3; text-decoration: underline; }
.fp-dismiss:hover { color: #cbd5e1; }
.fp-done-title { font-family: var(--font-heading), var(--font-sans), sans-serif; font-size: 24px; font-weight: 800; margin: 8px 0 10px; }
.fp-done-body { font-size: 14.5px; line-height: 1.6; color: #cbd5e1; margin: 0 0 18px; }
@media (max-width: 640px) {
  .fp-wrap { padding: 0; align-items: flex-end; }
  .fp-card { max-width: none; border-radius: 16px 16px 0 0; border-left: 0; border-right: 0; border-bottom: 0;
    padding: 26px 20px 22px; min-height: 62vh; display: flex; flex-direction: column; justify-content: center; }
  .fp-head { font-size: 22px; }
}
`;

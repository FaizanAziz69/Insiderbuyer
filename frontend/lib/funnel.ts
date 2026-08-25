/**
 * Funnel plumbing for the Round-2 brief, Section 2.
 *
 * The brief's rules, in one place so no popup can break them:
 *   · at most TWO popups per session, and never both of the pair in one
 *     session — Popup 1 (30s opt-in) and Popup 2 (exit intent) are mutually
 *     exclusive, and the /premium downsell is the second and final one there;
 *   · a popup never shows twice;
 *   · a dismissal suppresses that popup for 7 days;
 *   · a completed opt-in suppresses it forever.
 *
 * Session state lives in sessionStorage (cleared with the tab, which is what
 * "per session" means); the 7-day and forever rules live in cookies so they
 * survive it. Every accessor is defensive: private mode and storage-blocked
 * browsers must degrade to "don't show", never to a crash.
 */

export const FUNNEL_COOKIES = {
  popup1Shown: "popup1_shown",
  popup1Completed: "popup1_completed",
  popup2Shown: "popup2_shown",
  popup2Completed: "popup2_completed",
  /** Any email captured anywhere in the funnel — /join skips its form on it. */
  optedIn: "ib_opted_in",
} as const;

const SESSION_KEY = "ib_funnel_session";

interface SessionState {
  /** How many popups have opened this session (hard cap: 2). */
  shown: number;
  /** Which ones, so the same popup never repeats. */
  ids: string[];
}

function readSession(): SessionState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { shown: 0, ids: [] };
    const parsed = JSON.parse(raw) as SessionState;
    return {
      shown: Number(parsed?.shown) || 0,
      ids: Array.isArray(parsed?.ids) ? parsed.ids : [],
    };
  } catch {
    return { shown: 0, ids: [] };
  }
}

function writeSession(state: SessionState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — the caller's eligibility check already failed safe */
  }
}

/** True when a popup has already opened in this session. */
export function popupShownThisSession(id?: string): boolean {
  const s = readSession();
  return id ? s.ids.includes(id) : s.shown > 0;
}

/** Session popups used so far, against the brief's cap of two. */
export function popupsShownThisSession(): number {
  return readSession().shown;
}

/** Record an opened popup: bumps the session count and sets its 7-day cookie. */
export function markPopupShown(id: string, cookie?: string): void {
  const s = readSession();
  if (!s.ids.includes(id)) {
    s.ids.push(id);
    s.shown += 1;
    writeSession(s);
  }
  if (cookie) setCookie(cookie, "true", 7);
}

/** Record a completed opt-in: suppresses that popup for good. */
export function markPopupCompleted(cookie: string): void {
  setCookie(cookie, "true", 3650);
  setCookie(FUNNEL_COOKIES.optedIn, "true", 3650);
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCookie(name: string, value: string, days: number): void {
  if (typeof document === "undefined") return;
  const maxAge = Math.round(days * 24 * 60 * 60);
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Has this visitor already given us an email anywhere in the funnel? */
export function hasOptedIn(): boolean {
  return (
    getCookie(FUNNEL_COOKIES.optedIn) === "true" ||
    getCookie(FUNNEL_COOKIES.popup1Completed) === "true" ||
    getCookie(FUNNEL_COOKIES.popup2Completed) === "true"
  );
}

/** Routes that must never carry a site-wide popup: the funnel's own pages,
 *  auth, and the sales page (which brings its own downsell). */
const POPUP_FREE_PREFIXES = [
  "/join",
  "/premium",
  "/top-picks-report",
  "/thank-you-report",
  "/login",
  "/insider-report",
  "/score-explainer",
];

export function popupsAllowedOn(pathname: string): boolean {
  return !POPUP_FREE_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Where a Subscribe / Upgrade button goes: through the pre-sell opt-in.
 *  Section 2, Step 1 — the sales page is Step 3, never the entry point. */
export const SUBSCRIBE_HREF = "/join";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

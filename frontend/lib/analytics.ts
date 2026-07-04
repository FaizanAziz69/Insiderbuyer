// PostHog analytics for insiderbuying.com — implements the shared-project spec:
//  §1a source:"website" super-property · §2 init options · §3 PII scrubbing ·
//  §4 attribution super-properties · §5 hashed-email identify · §8 web_ prefix.
import posthog from "posthog-js";

const POSTHOG_KEY = "phc_pxPZ4xdWGfoVR6vtMSELdkNxbVK9RiqWWzVYBwv4QXEh";
const POSTHOG_HOST = "https://us.i.posthog.com";

/* ── §3 PII scrubbing helpers (reproduced verbatim from the funnels) ─────── */
const EMAIL_RE = /@|%40/i;
const PHONE_RE = /(?:\+?\d[\s\-().]*){7,}/;
const PII_KEY_RE = /(email|e-?mail|phone|tel|mobile|sms|fax)/i;

function looksLikePII(key: string, value: string): boolean {
  if (PII_KEY_RE.test(key)) return true;
  if (EMAIL_RE.test(value)) return true;
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 7 && PHONE_RE.test(value)) return true;
  return false;
}

function sanitizeUrlString(url: string): string {
  try {
    const u = new URL(url);
    const safe = new URLSearchParams();
    for (const [k, v] of u.searchParams.entries()) {
      if (looksLikePII(k, v)) continue;
      safe.append(k, v);
    }
    u.search = safe.toString();
    return u.toString();
  } catch {
    return url;
  }
}

/* ── §4 attribution super-properties (no-allowlist, PII-stripped) ────────── */
const ATTR_LS_KEY = "ib_attribution_initial";

function buildAttribution(): Record<string, string> {
  const out: Record<string, string> = {
    source: "website", // §1a
    landing_path: window.location.pathname,
  };
  const params = new URLSearchParams(window.location.search);
  const current: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    if (!looksLikePII(k, v)) current[k] = v;
  }
  out.raw_query_string = sanitizeUrlString(window.location.href).split("?")[1] || "";
  Object.assign(out, current);

  // First-touch values persist across the whole visit.
  let initial: Record<string, string> | null = null;
  try {
    initial = JSON.parse(localStorage.getItem(ATTR_LS_KEY) || "null");
  } catch {
    initial = null;
  }
  if (!initial) {
    initial = { initial_landing_path: window.location.pathname };
    for (const [k, v] of Object.entries(current)) initial[`initial_${k}`] = v;
    try {
      localStorage.setItem(ATTR_LS_KEY, JSON.stringify(initial));
    } catch {
      /* storage may be unavailable */
    }
  }
  Object.assign(out, initial);
  return out;
}

/* ── §2 initialization ──────────────────────────────────────────────────── */
let started = false;

export function initPostHog(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: true,
    capture_pageview: true,
    persistence: "localStorage+cookie",
    session_recording: { maskAllInputs: true },
    before_send: (event) => {
      if (event?.properties) {
        for (const key of [
          "$current_url",
          "$referrer",
          "$initial_current_url",
          "$initial_referrer",
        ]) {
          const value = event.properties[key];
          if (typeof value === "string") event.properties[key] = sanitizeUrlString(value);
        }
      }
      return event;
    },
  });
  // §1a + §4 — registered once on init.
  posthog.register(buildAttribution());
}

/* ── §6/§8 event capture — enforces the web_ prefix ─────────────────────── */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !started) return;
  const name = event.startsWith("web_") ? event : `web_${event}`;
  posthog.capture(name, properties);
}

/* ── §5 identity — hashed email only, never raw PII ─────────────────────── */
export async function identifyByEmail(email: string): Promise<void> {
  if (typeof window === "undefined" || !started) return;
  try {
    const normalized = email.trim().toLowerCase();
    const data = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hashed = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    posthog.identify(hashed, { has_email: true });
  } catch {
    /* subtle crypto unavailable — skip rather than risk leaking raw email */
  }
}

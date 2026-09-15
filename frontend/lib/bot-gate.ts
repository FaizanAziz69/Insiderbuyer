/**
 * Turnstile bot gate — shared between middleware.ts (edge runtime) and
 * app/api/verify/route.ts (node). Web Crypto only, no node imports.
 *
 * The cookie `ib_verified` is `<exp>.<sig>` where exp is a unix-seconds
 * expiry and sig = base64url(HMAC-SHA256(BOT_GATE_SECRET, String(exp))).
 * Anything that fails to parse, fails the HMAC, or is past exp is treated as
 * missing. See docs/bot-gate.md.
 */

export const COOKIE_NAME = "ib_verified";
export const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days

export const VERIFY_PATH = "/verify";
export const VERIFY_API_PATH = "/api/verify";

/** Everything the gate needs; any gap ⇒ fail open (pass every request). */
export function gateConfig(): {
  enabled: boolean;
  mode: "all" | "datacenter";
  secret: string;
  turnstileSecret: string;
  siteKey: string;
} {
  const secret = process.env.BOT_GATE_SECRET || "";
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY || "";
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const enabled =
    process.env.BOT_GATE_ENABLED === "1" && !!secret && !!turnstileSecret && !!siteKey;
  const mode = process.env.BOT_GATE_MODE === "datacenter" ? "datacenter" : "all";
  return { enabled, mode, secret, turnstileSecret, siteKey };
}

/* ── exemptions ─────────────────────────────────────────────────────────── */

/** Paths that are never challenged (prefix match). */
const EXEMPT_PREFIXES = [
  "/_next/",
  VERIFY_PATH,
  VERIFY_API_PATH,
  "/robots.txt",
  "/sitemap",
  "/rss",
  "/feed",
  "/offline.html",
  "/sw.js",
  "/manifest",
  "/.well-known/",
  "/api/backend/billing/webhook", // Stripe
];

/** "Has a file extension" — static assets served from /public or by nginx. */
const STATIC_EXT_RE =
  /\.(js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|xml|txt|json|webmanifest|mp3|mp4|webm|pdf)$/i;

export function isExemptPath(pathname: string): boolean {
  if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (STATIC_EXT_RE.test(pathname)) return true;
  return false;
}

/* ── good bots ──────────────────────────────────────────────────────────── */

/**
 * Search, link-preview and AI crawlers that bypass the gate on UA alone.
 * TODO(v2): verify Googlebot/Bingbot by reverse DNS or the published IP
 * ranges (https://developers.google.com/static/search/apis/ipranges/googlebot.json).
 * Embedding a partial prefix list risks challenging real Googlebot from a
 * range we forgot, which is worse for SEO than a spoofed UA getting through.
 */
export const GOOD_BOT_RE =
  /Googlebot|Google-InspectionTool|Storebot-Google|bingbot|Applebot|DuckDuckBot|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|Pinterest|SkypeUriPreview|iMessage|redditbot|Embedly|GPTBot|ClaudeBot|anthropic-ai|PerplexityBot|OAI-SearchBot|ChatGPT-User|meta-externalagent/i;

export function isGoodBot(ua: string | null): boolean {
  return !!ua && GOOD_BOT_RE.test(ua);
}

/* ── suspects (BOT_GATE_MODE=datacenter) ────────────────────────────────── */

const SUSPECT_UA_RE =
  /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|python-requests|python-urllib|aiohttp|httpx|Go-http-client|okhttp|Java\/|libwww|curl\/|Wget|Scrapy|node-fetch|undici|axios|^$/i;

export function isSuspect(ua: string | null, suspectHeader: string | null): boolean {
  if (suspectHeader && suspectHeader !== "0") return true;
  return SUSPECT_UA_RE.test(ua || "");
}

/* ── cookie signing ─────────────────────────────────────────────────────── */

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64url(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mint a cookie value valid for COOKIE_MAX_AGE_S seconds. */
export async function signVerifiedCookie(secret: string, nowMs = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + COOKIE_MAX_AGE_S;
  return `${exp}.${await hmac(secret, String(exp))}`;
}

/** True only for a well-formed, correctly signed, unexpired value. */
export async function verifyCookie(
  secret: string,
  value: string | undefined | null,
  nowMs = Date.now(),
): Promise<boolean> {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expStr = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^\d{1,12}$/.test(expStr) || !sig) return false;
  const exp = Number(expStr);
  if (exp * 1000 <= nowMs) return false;
  const expected = await hmac(secret, expStr);
  return timingSafeEqual(expected, sig);
}

/* ── misc ───────────────────────────────────────────────────────────────── */

/** Client IP as nginx hands it to us (first x-forwarded-for hop, or x-real-ip). */
export function clientIp(headers: Headers): string | undefined {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") || undefined;
}

/** Only same-origin absolute paths may be used as a post-verify return URL. */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\r\n]/.test(raw)) return "/";
  if (raw.startsWith(VERIFY_PATH)) return "/";
  return raw;
}

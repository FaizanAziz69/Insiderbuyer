import manifest from "./manifest.json";

/**
 * Server-side prefetch for the SWR keys a route requests on first render.
 *
 * `manifest.json` maps a route pattern ("companies/[ticker]") to the SWR keys
 * its client tree asks for on a logged-out first render, recorded by loading
 * every route in a headless browser (scratchpad/record.sh, 2026-09-09) and
 * templating the sample param back out as `{ticker}`, `{slug}`, `{name}`…
 * At request time the template is filled from the route params, each key is
 * fetched from the backend directly (BACKEND_URL, the same host the
 * /api/backend proxy forwards to) and the JSON is returned keyed EXACTLY as
 * the client hook will ask for it, so <SwrFallback> can hand it over.
 *
 * Rules:
 *  • No auth is ever sent — the server renders the logged-out view, which is
 *    what a crawler must see and what the paygates already assume.
 *  • A failed or oversized response is simply skipped: the hook then fetches
 *    on the client as it always did. Prefetching is an optimisation for
 *    crawlers and first paint, never a hard dependency.
 *  • Params are decoded then re-encoded so a key matches whether the client
 *    built it with encodeURIComponent or not for plain values.
 */

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";
/** Budget per key for what gets inlined into the HTML as hydration props.
 *  Bigger list responses are SHRUNK (their largest array sliced) rather than
 *  dropped — a crawler gets the first rows, and the hook revalidates on mount
 *  so the browser still receives the full list moments later.
 *
 *  2026-09-11: cut 150 KB → 25 KB. At 150 KB the seeded JSON dominated every
 *  RSC payload (/insiders/hot 252 KB raw, /alerts 195 KB), and that payload is
 *  downloaded before a click can change the URL. A crawler needs the first
 *  rows, not five hundred of them. */
const MAX_BYTES = 25_000;
const DEFAULT_REVALIDATE = 120;
/** Hard per-key budget (2026-09-14). Prefetching is an optimisation, never a
 *  hard dependency — but every key was awaited to completion, so ONE slow
 *  upstream held the whole page's HTML. /scores/:ticker was computing a news
 *  sentiment score (Yahoo headlines + a Claude call) inside the request on a
 *  cold ticker: /companies/AAON measured 8.1s cold against 1.3s warm. That
 *  call is non-blocking now, and this is the backstop for the next one. A key
 *  that overruns is simply skipped and the hook fetches it on the client, the
 *  same path a failed key already took. */
const KEY_TIMEOUT_MS = 2_000;
/** Never prefetch: canvas-only data (no text value) and megabyte payloads. */
const SKIP = [
  /\/market-stats\/heatmap/,
  /\/market-stats\/spark\?/,
  // 2026-09-11: the big list keys. Seeding these inlined 200–290 KB of JSON
  // into the flight payload of every route that lists trades, which a
  // client-side navigation has to download BEFORE the URL changes — /alerts
  // measured 4,024 ms on a cold click against 130 ms on a warm one, and its
  // payload carried 298 seeded rows. The hooks revalidate on mount, so the
  // rows still arrive; they just no longer sit in the critical path.
  /\/trades\?[^"]*limit=(?:2\d\d|[3-9]\d\d|\d{4,})/,
  /\/rankings\?[^"]*limit=(?:2\d\d|[3-9]\d\d|\d{4,})/,
  // 2026-09-14: PAID identities. Both the homepage module and
  // /insiders/top-buys render blurred decoys to a logged-out visitor, but the
  // seeded JSON put the real ticker, company and insider name straight into
  // the HTML where view-source reads them — which is exactly the leak the
  // decoy pattern exists to prevent. The hooks fetch it on mount, so a
  // subscriber still gets the rows.
  /\/iqs2\/top-buys/,
  // 2026-09-16: Top IR Promoters is a paid dataset — firm names must never
  // reach view-source through the seed.
  /\/promoter\/top-promoters/,
  // 2026-09-16: Promoter Score is paygated the same way — issuer tickers and
  // names must not reach view-source through the seed.
  /\/promoter\/ranking/,
];

/** Per-route override for the seed budget. A visualizer page IS its dataset
 *  — one canvas fed by one list — so a sliced seed paints a partial field and
 *  visibly reflows when the hook revalidates. These payloads gzip to 5–18 KB,
 *  which is cheaper than the round trip they replace. */
export const ARENA_MAX_BYTES = 420_000;

/** Slice the dominant array of a list response until it fits the budget.
 *  Works on a bare array or on the largest array-valued field of an object
 *  (`items`, `rows`, `trades`, `data`…); anything else is left alone. */
function shrink(json: unknown, text: string, budget = MAX_BYTES): unknown | null {
  if (text.length <= budget) return json;
  const ratio = budget / text.length;
  if (Array.isArray(json)) {
    return json.slice(0, Math.max(1, Math.floor(json.length * ratio)));
  }
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    let best: string | null = null;
    let bestLen = 0;
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v) && v.length > bestLen) {
        best = k;
        bestLen = v.length;
      }
    }
    if (!best || bestLen < 2) return null;
    const arr = obj[best] as unknown[];
    const keep = Math.max(1, Math.floor(arr.length * ratio));
    const out = { ...obj, [best]: arr.slice(0, keep) };
    return JSON.stringify(out).length <= budget * 1.25 ? out : null;
  }
  return null;
}

type Manifest = Record<string, string[]>;
type Params = Record<string, string | string[] | undefined>;

function fill(template: string, params: Params): string | null {
  let unresolved = false;
  const key = template.replace(/\{(\w+)\}/g, (_, p: string) => {
    const raw = params[p];
    const v = Array.isArray(raw) ? raw.join("/") : raw;
    if (v == null || v === "") {
      unresolved = true;
      return "";
    }
    let decoded = v;
    try {
      decoded = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    return encodeURIComponent(decoded);
  });
  return unresolved ? null : key;
}

export async function ssrFallback(
  route: string,
  params: Params = {},
  opts: { revalidate?: number; maxBytes?: number } = {},
): Promise<Record<string, unknown>> {
  const templates = (manifest as Manifest)[route] || [];
  const out: Record<string, unknown> = {};
  await Promise.all(
    templates.map(async (tpl) => {
      const key = fill(tpl, params);
      if (!key || !key.startsWith("/api/backend/")) return;
      if (SKIP.some((re) => re.test(key))) return;
      const path = key.replace(/^\/api\/backend/, "/api");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), KEY_TIMEOUT_MS);
      try {
        const res = await fetch(`${BACKEND}${path}`, {
          next: { revalidate: opts.revalidate ?? DEFAULT_REVALIDATE },
          headers: { accept: "application/json" },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const text = await res.text();
        const value = shrink(JSON.parse(text), text, opts.maxBytes ?? MAX_BYTES);
        if (value !== null) out[key] = value;
      } catch {
        /* timed out or failed — client fetches as before */
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return out;
}

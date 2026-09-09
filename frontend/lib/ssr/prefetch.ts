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
 *  so the browser still receives the full list moments later. */
const MAX_BYTES = 150_000;
const DEFAULT_REVALIDATE = 120;
/** Never prefetch: canvas-only data (no text value) and megabyte payloads. */
const SKIP = [/\/market-stats\/heatmap/, /\/market-stats\/spark\?/];

/** Slice the dominant array of a list response until it fits the budget.
 *  Works on a bare array or on the largest array-valued field of an object
 *  (`items`, `rows`, `trades`, `data`…); anything else is left alone. */
function shrink(json: unknown, text: string): unknown | null {
  if (text.length <= MAX_BYTES) return json;
  const ratio = MAX_BYTES / text.length;
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
    return JSON.stringify(out).length <= MAX_BYTES * 1.25 ? out : null;
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
  opts: { revalidate?: number } = {},
): Promise<Record<string, unknown>> {
  const templates = (manifest as Manifest)[route] || [];
  const out: Record<string, unknown> = {};
  await Promise.all(
    templates.map(async (tpl) => {
      const key = fill(tpl, params);
      if (!key || !key.startsWith("/api/backend/")) return;
      if (SKIP.some((re) => re.test(key))) return;
      const path = key.replace(/^\/api\/backend/, "/api");
      try {
        const res = await fetch(`${BACKEND}${path}`, {
          next: { revalidate: opts.revalidate ?? DEFAULT_REVALIDATE },
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const text = await res.text();
        const value = shrink(JSON.parse(text), text);
        if (value !== null) out[key] = value;
      } catch {
        /* skipped — client fetches as before */
      }
    }),
  );
  return out;
}

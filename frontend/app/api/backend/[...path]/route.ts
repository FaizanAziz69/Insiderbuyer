import type { NextRequest } from "next/server";

/** Runtime proxy for /api/backend/* → ${BACKEND_URL}/api/*.
 *
 *  This replaces the old next.config.js rewrite. Two reasons it has to be a
 *  route handler and not a rewrite:
 *
 *  1. rewrites() is evaluated at *build* time, so BACKEND_URL got baked into
 *     the deployment — changing it in Vercel did nothing until a rebuild.
 *     Here it is read per request.
 *  2. A rewrite to an unreachable upstream hangs until the platform gives up
 *     and returns FUNCTION_INVOCATION_FAILED — an opaque 500 with no JSON for
 *     the client to render. Here we time out fast and return a real status.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Fail before the platform does, so the client gets JSON instead of a 500. */
const TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS || 9000);

/** Hop-by-hop headers, plus ones fetch must set itself. */
const STRIP_REQUEST = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "content-length",
  "accept-encoding",
]);

/** fetch already decoded the body, so the upstream framing headers would lie. */
const STRIP_RESPONSE = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

function backendBase(): string | null {
  const raw = process.env.BACKEND_URL?.trim();
  // Only fall back to a local backend in local dev — in production a missing
  // BACKEND_URL must surface as an error, not as a silent broken deployment.
  if (!raw) return process.env.NODE_ENV === "production" ? null : "http://localhost:4000";
  return raw.replace(/\/+$/, "");
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const base = backendBase();
  if (!base) {
    return json(
      {
        error: "backend_not_configured",
        message:
          "BACKEND_URL is not set for this environment. Set it in Vercel " +
          "(Settings → Environment Variables) to a publicly reachable API URL.",
      },
      503,
    );
  }

  const { path } = await ctx.params;
  const target = `${base}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIP_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as Error)?.name;
    const timedOut = name === "TimeoutError" || name === "AbortError";
    // Log the host, never the full URL — query strings can carry identifiers.
    console.error(
      `[api/backend] ${req.method} /${path.join("/")} → ${new URL(base).host} failed: ${
        timedOut ? `timeout after ${TIMEOUT_MS}ms` : (err as Error)?.message
      }`,
    );
    return json(
      {
        error: timedOut ? "backend_timeout" : "backend_unreachable",
        message: timedOut
          ? `The API did not respond within ${TIMEOUT_MS}ms.`
          : "The API could not be reached from this deployment.",
        backendHost: new URL(base).host,
      },
      timedOut ? 504 : 502,
    );
  }

  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE.has(key.toLowerCase())) resHeaders.set(key, value);
  });
  if (!resHeaders.has("cache-control")) resHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;

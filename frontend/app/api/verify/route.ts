import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_MAX_AGE_S,
  COOKIE_NAME,
  clientIp,
  gateConfig,
  signVerifiedCookie,
} from "@/lib/bot-gate";

/**
 * POST { token } — the Turnstile response from /verify. Confirms it with
 * Cloudflare (siteverify, bound to the caller's IP) and, if it passes, sets
 * the signed 30-day `ib_verified` cookie the middleware trusts.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const gate = gateConfig();
  // Gate off ⇒ nothing to verify; tell the page to carry on.
  if (!gate.enabled) return json({ ok: true, disabled: true }, 200);

  let token = "";
  try {
    const body = (await req.json()) as { token?: unknown };
    token = typeof body?.token === "string" ? body.token : "";
  } catch {
    /* fall through */
  }
  if (!token || token.length > 2048) return json({ ok: false, error: "missing_token" }, 400);

  const form = new URLSearchParams();
  form.set("secret", gate.turnstileSecret);
  form.set("response", token);
  const ip = clientIp(req.headers);
  if (ip) form.set("remoteip", ip);

  let outcome: { success?: boolean; "error-codes"?: string[] };
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    outcome = (await res.json()) as typeof outcome;
  } catch (err) {
    console.error("[bot-gate] siteverify unreachable:", (err as Error)?.message);
    return json({ ok: false, error: "siteverify_unreachable" }, 502);
  }

  if (!outcome.success) {
    console.warn("[bot-gate] turnstile failed", ip, outcome["error-codes"]);
    return json({ ok: false, error: "turnstile_failed", codes: outcome["error-codes"] }, 403);
  }

  const value = await signVerifiedCookie(gate.secret);
  const res = json({ ok: true }, 200);
  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S,
  });
  return res;
}

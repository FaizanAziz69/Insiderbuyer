import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_NAME,
  VERIFY_PATH,
  gateConfig,
  isExemptPath,
  isGoodBot,
  isSuspect,
  verifyCookie,
} from "@/lib/bot-gate";

/**
 * Turnstile bot gate. A headless-Chrome scraper on thousands of rotating
 * datacenter IPs has been crawling /companies/<TICKER> and calling
 * /api/backend/* from the browser (2026-09-15). Every uncookied visitor
 * solves one Cloudflare Turnstile challenge on /verify, gets a signed 30-day
 * `ib_verified` cookie, and is never asked again.
 *
 * FAIL-OPEN: if BOT_GATE_ENABLED !== "1" or any of the three keys is
 * missing, every request passes untouched. A build without the keys must
 * never lock the site out. Full write-up in docs/bot-gate.md.
 *
 * Server-side fetches (lib/ssr/prefetch.ts) go straight to BACKEND_URL and
 * never pass through here, so nothing server-side needs an exemption.
 */

export const config = {
  // Skip Next's own asset pipeline at the matcher level; every other
  // exemption is decided in code so the list lives in one place (lib/bot-gate.ts).
  matcher: ["/((?!_next/).*)"],
};

export async function middleware(req: NextRequest) {
  const gate = gateConfig();
  if (!gate.enabled) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (isExemptPath(pathname)) return NextResponse.next();

  // Signed-in API traffic carries a bearer token; the scraper does not.
  if (req.headers.get("authorization")) return NextResponse.next();

  const ua = req.headers.get("user-agent");
  if (isGoodBot(ua)) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (await verifyCookie(gate.secret, cookie)) return NextResponse.next();

  // datacenter mode: only challenge when nginx (x-bot-suspect) or the UA
  // says this looks automated. Default mode challenges every uncookied visitor once.
  if (gate.mode === "datacenter" && !isSuspect(ua, req.headers.get("x-bot-suspect"))) {
    return NextResponse.next();
  }

  const isBackendApi = pathname.startsWith("/api/backend/");
  if (isBackendApi) {
    return NextResponse.json(
      {
        error: "bot_verification_required",
        message: "Complete the browser check at /verify and retry.",
        verify: VERIFY_PATH,
      },
      {
        status: 403,
        headers: {
          "cache-control": "private, no-store",
          "x-bot-gate": "challenge",
        },
      },
    );
  }

  // Other first-party route handlers (/api/og, /api/verify, …) are not
  // what the scraper is after and some are fetched by bots on purpose.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Page navigation → render the interstitial IN PLACE (rewrite, not redirect)
  // so the URL bar keeps the original address and the page can send the
  // visitor straight back once the challenge passes.
  const url = req.nextUrl.clone();
  url.pathname = VERIFY_PATH;
  url.search = "";
  url.searchParams.set("return", pathname + search);

  const res = NextResponse.rewrite(url, {
    headers: {
      // The challenge page must never be cached under the real page's URL —
      // nginx / CloudFront would then hand it to verified visitors too.
      "cache-control": "private, no-store",
      vary: "Cookie",
      "x-bot-gate": "challenge",
      "x-robots-tag": "noindex",
    },
  });
  return res;
}

/**
 * Is the visitor on the B2B surface (Round-2 brief, Section 4)?
 *
 * Two ways to be there: the subdomain, where nginx maps the host root onto
 * /press so the path is "/", and insiderbuying.com/press. Analytics has to
 * split on this — 4D asks for a separate GA4 data stream — so both cases have
 * to be recognised, and only the browser knows the hostname.
 */
export function isB2bSurface(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host.startsWith("press.") ||
    host.startsWith("ir.") ||
    window.location.pathname.startsWith("/press")
  );
}

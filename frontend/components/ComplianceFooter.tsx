/**
 * Standard compliance footer for every data page — Developer Project Brief
 * (Aug 24 2026), §2.4: "publisher not adviser, informational purposes only,
 * historical patterns do not predict future results."
 *
 * The brief also asked for a methodology note one click away. The client
 * removed that surface on 2026-09-15 — "hum kabhi bhi methodology user ko nai
 * dekhayein gay" — so the page is gone and the link with it. The `methodology`
 * prop is still accepted so callers need not all change at once, and ignored.
 */
export function ComplianceFooter({ extra }: { methodology?: string; extra?: React.ReactNode }) {
  return (
    <footer
      className="mt-8 rounded-xl px-4 py-3 text-[12px] leading-relaxed"
      style={{ border: "1px solid var(--border)", color: "var(--text-mute)", background: "var(--bg-2)" }}
    >
      Insider Buying is a publisher, not an investment adviser. Everything on this page is for
      informational purposes only and is drawn from public filings and licensed market data. All
      performance figures are historical and factual; historical patterns do not predict future
      results, and nothing here is a recommendation to buy or sell any security.{" "}
      {extra}
    </footer>
  );
}

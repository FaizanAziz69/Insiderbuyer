import Link from "next/link";

/**
 * Standard compliance footer for every data page — Developer Project Brief
 * (Aug 24 2026), §2.4: "publisher not adviser, informational purposes only,
 * historical patterns do not predict future results … the methodology note
 * must be one click away." Wording is fixed here so every page says the same
 * thing; pass `methodology` to deep-link the page's own section.
 */
export function ComplianceFooter({ methodology = "/methodology", extra }: { methodology?: string; extra?: React.ReactNode }) {
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
      <Link href={methodology} className="font-semibold text-accent">
        How these figures are calculated →
      </Link>
    </footer>
  );
}

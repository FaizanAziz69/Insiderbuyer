import Link from "next/link";

import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/about");

export default function AboutPage() {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 py-2">
      <header>
        <div className="text-mute text-sm mb-1 font-mono uppercase tracking-wider text-[11px]">
          About Us
        </div>
        <h1 className="text-[30px] sm:text-[38px] font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
          About Insider Buying
        </h1>
      </header>

      <div className="space-y-5 text-[15px] leading-relaxed text-soft">
        <p>
          <strong>Insider Buying</strong> helps everyday investors follow the smart money.
          When corporate executives and directors buy shares of their own companies on the
          open market, they file a Form 4 with the U.S. Securities and Exchange Commission
          (SEC). We collect those filings the moment they hit SEC EDGAR, structure them, and
          turn them into clear, actionable signals.
        </p>
        <p>
          At the heart of the platform is our proprietary{" "}
          <strong>Insider Score</strong> — a 0–99 measure that weighs
          purchase size, buying clusters, the role of the insider, and conviction, so you can
          instantly see where insiders are putting their own capital with the most confidence.
        </p>

        <h2 className="text-[20px] font-bold tracking-tight pt-2" style={{ color: "var(--text)" }}>
          What we do
        </h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Track every open-market insider buy and sell from SEC Form 4 filings.</li>
          <li>Score and rank companies by insider conviction with the Insider Score engine.</li>
          <li>Surface live market data — heatmaps, gainers, dividends, analyst ratings and more.</li>
          <li>Publish plain-English research and daily AI briefings on the biggest insider moves.</li>
        </ul>

        <h2 className="text-[20px] font-bold tracking-tight pt-2" style={{ color: "var(--text)" }}>
          Where our data comes from
        </h2>
        <p>
          Our insider data is sourced directly from{" "}
          <a href="https://www.sec.gov" target="_blank" rel="noopener noreferrer" className="text-accent font-semibold hover:underline">
            SEC EDGAR
          </a>
          . Market prices, market caps and volumes come from live market-data feeds, and we
          cross-reference macro data from the Federal Reserve, U.S. Treasury and other public
          sources. Everything is refreshed throughout the trading day.
        </p>

        <p className="text-mute text-[14px] pt-2">
          Have a question or partnership idea? Visit our{" "}
          <Link href="/contact" className="text-accent font-semibold hover:underline">
            Contact
          </Link>{" "}
          page. Insider Buying provides information for educational purposes only and is not
          investment advice — see our{" "}
          <Link href="/disclaimer" className="text-accent font-semibold hover:underline">
            Disclaimer
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

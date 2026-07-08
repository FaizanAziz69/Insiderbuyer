"use client";
import Link from "next/link";
import { Github, Mail, Twitter } from "lucide-react";
import { Logo } from "./Logo";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="mt-16"
      style={
        {
          background: "var(--brand-surface)",
          color: "#ffffff",
          // Scoped overrides so every Tailwind `text-soft`, `text-mute`,
          // border-utility inside the footer reads in the navy/white palette.
          "--text": "#ffffff",
          "--text-soft": "rgba(255,255,255,0.88)",
          "--text-mute": "rgba(255,255,255,0.7)",
          "--text-faint": "rgba(255,255,255,0.5)",
          "--border": "rgba(255,255,255,0.16)",
          "--border-strong": "rgba(255,255,255,0.28)",
          "--bg-3": "rgba(255,255,255,0.08)",
          // Accent is dark navy in light theme — invisible on this navy footer.
          // Scope it to a light sky-blue so hover:text-accent stays readable.
          "--accent": "#8fd3ff",
          "--accent-hover": "#bfe6ff",
        } as React.CSSProperties
      }
    >
      <div className="max-w-[1640px] mx-auto px-2 sm:px-3 lg:px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
          {/* Brand block */}
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-3" style={{ color: "#ffffff" }}>
              <Logo size="md" tone="light" />
            </Link>
            <p className="text-[13px] text-soft mt-4 max-w-md leading-relaxed">
              Daily insider intelligence sourced from SEC Form 4 filings, the Federal Reserve, U.S.
              Treasury, CFTC, Bank of Canada, and Statistics Canada — distilled into the Insider Score.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <a
                href="#"
                aria-label="Twitter"
                className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-[var(--bg-3)] transition"
                style={{ border: "1px solid var(--border)" }}
              >
                <Twitter className="h-4 w-4 text-soft" />
              </a>
              <a
                href="#"
                aria-label="GitHub"
                className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-[var(--bg-3)] transition"
                style={{ border: "1px solid var(--border)" }}
              >
                <Github className="h-4 w-4 text-soft" />
              </a>
              <a
                href="mailto:admin@insiderbuying.com"
                aria-label="Email"
                className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-[var(--bg-3)] transition"
                style={{ border: "1px solid var(--border)" }}
              >
                <Mail className="h-4 w-4 text-soft" />
              </a>
            </div>
          </div>

          {/* Market Data */}
          <div>
            <div className="label-mini mb-3">Market Data</div>
            <ul className="space-y-2 text-[13px]">
              <li><Link href="/insiders/hot" className="text-soft hover:text-accent transition">Top Insider Scores</Link></li>
              <li><Link href="/trades" className="text-soft hover:text-accent transition">Insider Trades</Link></li>
              <li><Link href="/market-data/top-gainers" className="text-soft hover:text-accent transition">Top Gainers</Link></li>
              <li><Link href="/congressional-trades" className="text-soft hover:text-accent transition">Congressional Trades</Link></li>
              <li><Link href="/heatmaps/market" className="text-soft hover:text-accent transition">Stock Heatmap</Link></li>
            </ul>
          </div>

          {/* Stock Lists */}
          <div>
            <div className="label-mini mb-3">Stock Lists</div>
            <ul className="space-y-2 text-[13px]">
              <li><Link href="/stock-lists/penny-stocks" className="text-soft hover:text-accent transition">Penny Stocks</Link></li>
              <li><Link href="/stock-lists/large-cap" className="text-soft hover:text-accent transition">Large Cap</Link></li>
              <li><Link href="/stock-lists/faang" className="text-soft hover:text-accent transition">FAANG</Link></li>
              <li><Link href="/stock-lists/warren-buffett" className="text-soft hover:text-accent transition">Warren Buffett</Link></li>
              <li><Link href="/companies" className="text-soft hover:text-accent transition">All Stocks</Link></li>
            </ul>
          </div>

          {/* Research & Company */}
          <div>
            <div className="label-mini mb-3">Research</div>
            <ul className="space-y-2 text-[13px]">
              <li><Link href="/learn/insider-buying" className="text-soft hover:text-accent transition">Intro to Insider Buying</Link></li>
              <li><Link href="/methodology" className="text-soft hover:text-accent transition">How the Insider Score Works</Link></li>
              <li><Link href="/reports" className="text-soft hover:text-accent transition">Reports &amp; Features</Link></li>
              <li><Link href="/premium" className="text-soft hover:text-accent transition">Premium</Link></li>
              <li><Link href="/business" className="text-soft hover:text-accent transition">For Business / API</Link></li>
              <li><Link href="/about" className="text-soft hover:text-accent transition">About Us</Link></li>
              <li><Link href="/contact" className="text-soft hover:text-accent transition">Contact Us</Link></li>
            </ul>
          </div>

          {/* Data sources */}
          <div>
            <div className="label-mini mb-3">Data sources</div>
            <ul className="space-y-2 text-[13px]">
              <li>
                <a
                  href="https://www.sec.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-soft hover:text-accent transition"
                >
                  SEC EDGAR
                </a>
              </li>
              <li>
                <a
                  href="https://www.federalreserve.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-soft hover:text-accent transition"
                >
                  Federal Reserve
                </a>
              </li>
              <li>
                <a
                  href="https://home.treasury.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-soft hover:text-accent transition"
                >
                  U.S. Treasury
                </a>
              </li>
              <li>
                <a
                  href="https://www.bankofcanada.ca"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-soft hover:text-accent transition"
                >
                  Bank of Canada
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="mt-10 pt-6 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="text-[12px] text-mute">
            © {year} insiderbuying. All rights reserved.
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
            <Link href="/terms" className="text-mute hover:text-accent transition">
              Terms &amp; Conditions
            </Link>
            <Link href="/privacy" className="text-mute hover:text-accent transition">
              Privacy Policy
            </Link>
            <Link href="/cookies" className="text-mute hover:text-accent transition">
              Cookie Settings
            </Link>
            <Link href="/disclosures" className="text-mute hover:text-accent transition">
              Disclosures
            </Link>
            <Link href="/disclaimer" className="text-mute hover:text-accent transition">
              Disclaimer
            </Link>
            <Link href="/corrections" className="text-mute hover:text-accent transition">
              Corrections
            </Link>
          </div>
        </div>

        <div
          className="mt-6 pt-5 border-t text-[11px] text-faint leading-relaxed max-w-4xl"
          style={{ borderColor: "var(--border)" }}
        >
          Not investment advice. The Insider Score summarises publicly
          available SEC Form 4 filings and is provided for informational purposes only. Always
          conduct your own research and consult a licensed financial professional before making any
          investment decision.
        </div>
      </div>
    </footer>
  );
}

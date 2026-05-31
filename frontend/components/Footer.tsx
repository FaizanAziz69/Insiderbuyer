"use client";
import Link from "next/link";
import { Github, Mail, TrendingUp, Twitter } from "lucide-react";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="mt-16 border-t"
      style={{
        background: "var(--bg-2)",
        borderColor: "var(--border)",
      }}
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand block */}
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
                }}
              >
                <TrendingUp className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="leading-tight">
                <div className="text-[15px] font-bold tracking-tight">insiderbuying</div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-mute font-mono">
                  SEC Form 4 · IQS
                </div>
              </div>
            </Link>
            <p className="text-[13px] text-soft mt-4 max-w-md leading-relaxed">
              Daily insider intelligence sourced from SEC Form 4 filings, the Federal Reserve, U.S.
              Treasury, CFTC, Bank of Canada, and Statistics Canada — distilled into the Insider
              Buying Quality Score.
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
                href="mailto:hello@example.com"
                aria-label="Email"
                className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-[var(--bg-3)] transition"
                style={{ border: "1px solid var(--border)" }}
              >
                <Mail className="h-4 w-4 text-soft" />
              </a>
            </div>
          </div>

          {/* Company */}
          <div>
            <div className="label-mini mb-3">Company</div>
            <ul className="space-y-2 text-[13px]">
              <li>
                <Link href="/about" className="text-soft hover:text-accent transition">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-soft hover:text-accent transition">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/help" className="text-soft hover:text-accent transition">
                  Help
                </Link>
              </li>
              <li>
                <Link href="/premium" className="text-soft hover:text-accent transition">
                  Premium
                </Link>
              </li>
            </ul>
          </div>

          {/* Product */}
          <div>
            <div className="label-mini mb-3">Product</div>
            <ul className="space-y-2 text-[13px]">
              <li>
                <Link href="/markets" className="text-soft hover:text-accent transition">
                  Markets
                </Link>
              </li>
              <li>
                <Link href="/companies" className="text-soft hover:text-accent transition">
                  Stocks
                </Link>
              </li>
              <li>
                <Link href="/funds" className="text-soft hover:text-accent transition">
                  Funds
                </Link>
              </li>
              <li>
                <Link href="/news" className="text-soft hover:text-accent transition">
                  News
                </Link>
              </li>
              <li>
                <Link href="/lists" className="text-soft hover:text-accent transition">
                  Ideas
                </Link>
              </li>
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
            <Link href="/corrections" className="text-mute hover:text-accent transition">
              Corrections
            </Link>
          </div>
        </div>

        <div
          className="mt-6 pt-5 border-t text-[11px] text-faint leading-relaxed max-w-4xl"
          style={{ borderColor: "var(--border)" }}
        >
          Not investment advice. The Insider Buying Quality Score (IQS) summarises publicly
          available SEC Form 4 filings and is provided for informational purposes only. Always
          conduct your own research and consult a licensed financial professional before making any
          investment decision.
        </div>
      </div>
    </footer>
  );
}

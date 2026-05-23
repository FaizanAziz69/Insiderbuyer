"use client";
import { TrendingUp, FileText, Database, Mail, Github, Twitter } from "lucide-react";
import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 sm:mt-20 border-t border-[var(--border)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10">
          <div className="col-span-2 md:col-span-2">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-2xl brand-gradient opacity-95" />
                <div
                  className="absolute inset-[1.5px] rounded-[14px] flex items-center justify-center"
                  style={{ background: "var(--logo-core)" }}
                >
                  <TrendingUp className="h-5 w-5 text-[var(--brand-1)]" strokeWidth={2.5} />
                </div>
              </div>
              <div className="leading-tight">
                <div className="text-base font-bold tracking-tight">Insider Buying</div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-mute font-mono">
                  IQS · Conviction signal
                </div>
              </div>
            </Link>
            <p className="mt-5 text-sm text-soft max-w-md leading-relaxed">
              We rank every U.S. public company by the conviction behind recent insider purchases —
              sourced daily, directly from SEC Form 4 filings.
            </p>
            <p className="mt-4 text-[11px] text-mute">
              Not investment advice. Insider Buying surfaces public-filing signals; do your own
              research before acting on any signal.
            </p>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-mute font-mono mb-4">
              Product
            </div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/" className="text-soft hover:text-[var(--brand-1)] transition">
                  Rankings
                </Link>
              </li>
              <li>
                <a
                  href="/api/backend/rankings.csv"
                  className="text-soft hover:text-[var(--brand-1)] transition inline-flex items-center gap-1.5"
                >
                  <Database className="h-3.5 w-3.5" />
                  CSV export
                </a>
              </li>
              <li>
                <a
                  href="https://www.sec.gov/edgar.shtml"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-soft hover:text-[var(--brand-1)] transition inline-flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  SEC EDGAR
                </a>
              </li>
            </ul>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-mute font-mono mb-4">
              Connect
            </div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a
                  href="mailto:hello@insiderbuying.app"
                  className="text-soft hover:text-[var(--brand-1)] transition inline-flex items-center gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Contact
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-soft hover:text-[var(--brand-1)] transition inline-flex items-center gap-1.5"
                >
                  <Twitter className="h-3.5 w-3.5" />
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="text-soft hover:text-[var(--brand-1)] transition inline-flex items-center gap-1.5"
                >
                  <Github className="h-3.5 w-3.5" />
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-mute">
          <div>
            © {year} <span className="text-soft font-medium">Insider Buying</span> · All rights
            reserved
          </div>
          <div className="font-mono text-[11px]">
            Data: SEC EDGAR · Form 4 · companyfacts XBRL
          </div>
        </div>
      </div>
    </footer>
  );
}

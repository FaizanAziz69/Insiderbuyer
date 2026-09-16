import type { Metadata } from "next";
import { FreeReportOptIn } from "@/components/FreeReportOptIn";

export const metadata: Metadata = {
  title: "Free Report: Get On The Inside — A Guide to Following Insider Buying | InsiderBuying.com",
  description:
    "A free investor report on how the insider buying signal works, why decades of research back it up, and three stocks where insiders are putting their own money to work right now.",
  alternates: { canonical: "https://insiderbuying.com/free-report" },
};

/**
 * Landing page for the free investor report (George's lead-magnet document,
 * September 2026 edition). The report itself is the PDF the backend renders
 * from free-report.content.ts; this page only says what is in it and takes
 * the email.
 */
export default function FreeReportPage() {
  return (
    <div className="max-w-[900px] mx-auto px-4 py-8">
      <div className="grid gap-6 md:grid-cols-[300px_1fr] md:items-start">
        {/* Cover */}
        <div
          className="rounded-lg p-6 flex flex-col justify-between"
          style={{ background: "#0D1F35", minHeight: 380, borderTop: "6px solid #C8A24A" }}
        >
          <div>
            <div className="text-[10px] font-bold tracking-[3px]" style={{ color: "#C8A24A" }}>
              FREE INVESTOR REPORT
            </div>
            <div className="text-[30px] font-extrabold leading-[1.05] mt-3 text-white">GET ON THE INSIDE</div>
            <div className="w-[60px] h-[3px] mt-3" style={{ background: "#C8A24A" }} />
            <div className="text-[15px] mt-3" style={{ color: "#E5E7EB" }}>
              A Guide to Following Insider Buying
            </div>
            <div className="text-[12.5px] italic mt-1.5" style={{ color: "#C8A24A" }}>
              — and 3 Stocks Insiders Are Buying Right Now —
            </div>
          </div>
          <div className="mt-8">
            <div className="text-[11px] font-bold text-white">Published by InsiderBuying.com</div>
            <div className="text-[10.5px]" style={{ color: "#9CA3AF" }}>
              September 2026 Edition
            </div>
          </div>
        </div>

        {/* Copy + form */}
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight" style={{ color: "var(--text)" }}>
            Get On The Inside
          </h1>
          <p className="text-[14px] leading-relaxed mt-2" style={{ color: "var(--text-soft)" }}>
            Every time a corporate insider buys or sells their own stock, federal law makes them tell you — in a public
            filing, within two business days. This report explains how to read that signal, why decades of research
            back it up, and walks through three stocks where insiders are putting their own money to work right now.
          </p>
          <ul className="mt-4 space-y-1.5 text-[13.5px]" style={{ color: "var(--text-soft)" }}>
            <li>
              <strong style={{ color: "var(--text)" }}>Part One:</strong> who counts as an insider, the Harvard case
              study, the Peter Lynch rule, cluster buying, information asymmetry, and how we score it all.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Part Two:</strong> three current situations — a $15 million
              C-suite buy into a drawdown, a founder-CEO buying his own stock all year, and a two-executive cluster buy at
              a 52-week low — each with the chart, the filings and the analyst picture.
            </li>
            <li>
              <strong style={{ color: "var(--text)" }}>Format:</strong> a PDF you can read in ten minutes and keep.
            </li>
          </ul>
          <div className="mt-5">
            <FreeReportOptIn source="free-report" />
          </div>
          <p className="text-[11.5px] mt-3" style={{ color: "var(--text-mute)" }}>
            For informational purposes only. Not financial advice. The full disclaimer is on the report’s final page.
          </p>
        </div>
      </div>
    </div>
  );
}

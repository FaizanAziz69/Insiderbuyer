import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/disclaimer");

const SECTIONS: { h: string; p: string }[] = [
  {
    h: "Not investment advice",
    p: "All content on Insider Buying — including the Insider Score, rankings, heatmaps, articles and AI-generated summaries — is provided for general informational and educational purposes only. It is not, and should not be construed as, investment, financial, legal or tax advice, nor a recommendation, offer or solicitation to buy or sell any security.",
  },
  {
    h: "Do your own research",
    p: "You are solely responsible for your own investment decisions. Always conduct your own research and consult a licensed financial professional before acting on any information found on this site. Past performance and historical insider activity are not indicative of future results.",
  },
  {
    h: "Data accuracy & third-party sources",
    p: "Our data is aggregated from third-party and public sources, including SEC EDGAR (Form 4 filings) and live market-data feeds. While we work to keep it accurate and timely, we cannot guarantee that all information is complete, correct or up to date, and figures may be delayed or restated. The Insider Score is a proprietary, opinion-based score derived from publicly available filings.",
  },
  {
    h: "No warranty",
    p: "The site and all information are provided “as is” and “as available,” without warranties of any kind, whether express or implied. Insider Buying disclaims all liability for any loss or damage arising from your use of, or reliance on, any content on this site.",
  },
  {
    h: "Forward-looking statements & risk",
    p: "Investing in securities involves substantial risk, including the possible loss of principal. Any forward-looking commentary reflects opinions as of the date published and is subject to change without notice.",
  },
  {
    h: "Advertising & affiliate disclosure",
    p: "Insider Buying may display advertising and may earn compensation through affiliate or partner arrangements. Such relationships do not influence the objectivity of our data or scores. Sponsored content, where present, is clearly labeled.",
  },
];

export default function DisclaimerPage() {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 py-2">
      <header>
        <div className="text-mute text-sm mb-1 font-mono uppercase tracking-wider text-[11px]">
          Disclaimer
        </div>
        <h1 className="text-[30px] sm:text-[38px] font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
          Disclaimer
        </h1>
        <p className="text-mute text-[14px] mt-2">
          Please read this disclaimer carefully before using Insider Buying.
        </p>
      </header>

      <div className="space-y-6">
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="text-[18px] font-bold tracking-tight mb-1.5" style={{ color: "var(--text)" }}>
              {s.h}
            </h2>
            <p className="text-[14.5px] leading-relaxed text-soft">{s.p}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

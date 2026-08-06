"use client";
/** Author bio pages — SEO guardrail #3: every byline maps to a detailed,
 *  honest profile page. Two official desks (no synthetic personas). */
import Link from "next/link";
import { useParams } from "next/navigation";
import { Database, Newspaper, ShieldCheck } from "lucide-react";

const PROFILES: Record<
  string,
  {
    name: string;
    beat: string;
    icon: "desk" | "editorial";
    intro: string;
    method: string[];
    covers: Array<{ label: string; href: string }>;
  }
> = {
  "iqs-financial-desk": {
    name: "IQS Financial Desk",
    beat: "Automated SEC Form 4 Analysis",
    icon: "desk",
    intro:
      "The IQS Financial Desk is Insider Buying's automated research operation. It monitors every open-market insider transaction filed with the SEC (Form 4), scores each company's insider buying with the Insider Quality Score model, and publishes structured, data-first coverage of the trades that matter. Every figure on a Desk page comes directly from a public filing or a market-data feed — never from a language model's imagination.",
    method: [
      "Source data: SEC Form 4 filings (open-market purchases and sales), congressional trading disclosures, and live market quotes.",
      "Every article is generated from a structured data snapshot and passes automated publish gates that reject numbers not present in the underlying filings.",
      "Articles are reviewed by the Insider Buying Data Team before template families are scaled, and the scoring model behind the coverage is documented publicly.",
      "Nothing published by the Desk is investment advice; pages summarize public filings so readers can do their own research.",
    ],
    covers: [
      { label: "Insider Score rankings", href: "/insiders/hot" },
      { label: "How the Insider Score is calculated", href: "/score-explainer" },
      { label: "Live insider trades", href: "/trades" },
    ],
  },
  "editorial-team": {
    name: "Insider Buying Editorial Team",
    beat: "Markets & Insider Activity",
    icon: "editorial",
    intro:
      "The Insider Buying Editorial Team writes the site's daily briefings, weekly reports and topic coverage — human-directed analysis of what insider buying and selling is signalling across the market. The team's work sits on top of the same SEC filing data that powers the IQS Financial Desk, with added market context and a clear “our take”.",
    method: [
      "Coverage is grounded in SEC Form 4 filings and the Insider Quality Score model — claims trace back to public data.",
      "Cautious, non-promissory language by policy: no price targets, no “buy” calls, no guarantees.",
      "Corrections: if a data error is found in any piece, the page is regenerated from the corrected source data.",
      "Nothing published is investment advice.",
    ],
    covers: [
      { label: "Daily market briefings", href: "/insights" },
      { label: "Editorial archive", href: "/editorial" },
      { label: "Congressional trading", href: "/congressional-trades" },
    ],
  },
};

export default function AuthorPage() {
  const params = useParams<{ slug: string }>();
  const profile = PROFILES[(params?.slug || "").toLowerCase()];

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center text-mute">
        Author profile not found.{" "}
        <Link href="/insights" className="text-accent font-semibold">
          Back to insights →
        </Link>
      </div>
    );
  }

  const Icon = profile.icon === "desk" ? Database : Newspaper;
  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16 pt-4">
      <header className="flex items-center gap-4">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-2xl flex-shrink-0"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Icon className="h-7 w-7" />
        </span>
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">{profile.name}</h1>
          <div className="text-[13px] text-mute font-semibold">{profile.beat}</div>
        </div>
      </header>

      <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-soft)" }}>
        {profile.intro}
      </p>

      <section className="card p-5" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
        <h2 className="flex items-center gap-2 text-[15px] font-bold mb-3">
          <ShieldCheck className="h-4 w-4 text-accent" /> How this desk works
        </h2>
        <ul className="space-y-2">
          {profile.method.map((m) => (
            <li key={m} className="text-[13.5px] leading-relaxed flex gap-2">
              <span className="text-accent">•</span>
              <span style={{ color: "var(--text-soft)" }}>{m}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-[13px] uppercase tracking-wider font-bold text-mute mb-2">Coverage</h2>
        <div className="flex flex-wrap gap-2">
          {profile.covers.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-accent"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
            >
              {c.label} →
            </Link>
          ))}
        </div>
      </section>

      <p className="text-[12px] text-mute">
        <em>Not investment advice. Summarized automatically from public SEC Form 4 data.</em>
      </p>
    </div>
  );
}

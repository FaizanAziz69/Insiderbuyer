import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { ProductUpdatesSignup } from "@/components/ProductUpdatesSignup";

export const metadata: Metadata = {
  title: "Product Updates by Email | InsiderBuying.com",
  description:
    "One short email every few days about one InsiderBuying.com feature: what it is, why it could be useful, and how to use it, with a screenshot and a direct link.",
  alternates: { canonical: "https://insiderbuying.com/product-updates" },
};

/**
 * The Product Updates list, explained (George 2026-09-16). The sequence
 * below mirrors backend/src/product-updates/product-updates.content.ts —
 * keep the two lists in step when a feature is added.
 */
const FEATURES: Array<{ name: string; href: string; blurb: string }> = [
  { name: "Insider Score", href: "/insiders/hot", blurb: "A 0–99 measure of how strong and meaningful a company’s insider buying is." },
  { name: "Analyst Rankings", href: "/analyst-ratings", blurb: "Wall Street analysts ranked by the measured success of their price targets." },
  { name: "Insider Bubbles", href: "/bubbles", blurb: "A live map where every bubble is one insider purchase of $250,000 or more." },
  { name: "Government Contracts", href: "/visualizers/government-contracts", blurb: "Federal awards by company, next to the insider buying that followed." },
  { name: "Promoter Score", href: "/promoter-score", blurb: "What Canadian venture issuers pay to be promoted, and what the stock did next." },
  { name: "Top IR Promoters", href: "/top-ir-promoters", blurb: "The promotion firms, ranked by their clients’ results after each engagement." },
  { name: "IPO Calendar", href: "/ipos", blurb: "Every listing from the last 90 days, marked to market, with an insider-buy flag." },
  { name: "Top Congress Trades", href: "/top-congress-trades", blurb: "Where a member’s stock trade, their committee and a federal award meet." },
  { name: "Prediction Markets", href: "/visualizers/prediction-markets", blurb: "Live event contracts as bubbles, sized by dollars traded." },
  { name: "Top Insiders", href: "/insiders", blurb: "The people doing the buying, ranked by recent purchases, with their track record." },
  { name: "Goldminer AI", href: "/visualizers/goldminer", blurb: "Every major gold project on the map, sized by its published economics." },
  { name: "Biotech Catalysts", href: "/visualizers/biotech", blurb: "Biotech companies on the map, pulsing when an FDA decision or readout is within 90 days." },
];

export default function ProductUpdatesPage() {
  return (
    <div className="max-w-[860px] mx-auto px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2.5 mb-2">
          <Mail size={20} style={{ color: "var(--accent)" }} />
          <h1 className="text-[26px] font-extrabold leading-none" style={{ color: "var(--text)" }}>
            Product Updates
          </h1>
        </div>
        <p className="text-[14px] leading-relaxed max-w-[720px]" style={{ color: "var(--text-soft)" }}>
          A short email every few days, each about one feature of InsiderBuying.com: what it is, what it does, why it
          could be useful to you, and how to use it, with a screenshot and a link that takes you straight to the page.
          When we ship something new, it goes here first.{" "}
          <span style={{ color: "var(--text-mute)" }}>No sales emails. Unsubscribe in one click.</span>
        </p>
      </header>

      <ProductUpdatesSignup source="product-updates-page" compact />

      <section className="mt-8">
        <h2 className="text-[16px] font-bold mb-3" style={{ color: "var(--text)" }}>
          What the emails cover
        </h2>
        <ol className="grid gap-2 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <li
              key={f.href}
              className="rounded-lg p-3.5 flex gap-3"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <span className="tabular text-[12px] font-bold pt-0.5 w-5 flex-shrink-0" style={{ color: "var(--text-mute)" }}>
                {i + 1}
              </span>
              <div className="min-w-0">
                <Link href={f.href} className="block text-[14px] font-bold hover:text-accent" style={{ color: "var(--text)" }}>
                  {f.name}
                </Link>
                <p className="m-0 text-[12.5px] leading-snug" style={{ color: "var(--text-soft)" }}>
                  {f.blurb}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

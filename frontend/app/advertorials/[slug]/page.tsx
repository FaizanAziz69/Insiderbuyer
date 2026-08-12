"use client";
import { use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { ADVERTORIALS } from "@/content/advertorials";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { RightRailStockLists } from "@/components/article/RightRailStockLists";
import { RightRailArticles } from "@/components/article/RightRailArticles";

/**
 * "Related reading" cards, derived from the advertorial catalogue itself.
 *
 * This replaced a hardcoded array of three titles that rendered identically on
 * all five advertorials — and whose text did not match the headlines of the
 * pages it linked to, so the same article appeared under two different
 * headlines across the site. On three of the five pages it also linked to the
 * page the reader was already on. Reading `ADVERTORIALS` fixes all three: real
 * headlines, and the current page excluded.
 */
function relatedReading(currentSlug: string) {
  return Object.values(ADVERTORIALS)
    .filter((a) => a.slug !== currentSlug)
    .slice(0, 3)
    .map((a) => ({ title: a.headline, eyebrow: a.eyebrow, href: `/advertorials/${a.slug}` }));
}

export default function AdvertorialPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const article = ADVERTORIALS[slug];
  if (!article) notFound();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:gap-10 w-full">
      <article className="min-w-0 max-w-3xl">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition mb-5"
        >
          ← All reports
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-accent mb-3">
            <Sparkles className="h-3 w-3" />
            {article.eyebrow}
          </div>
          <h1
            className="text-[32px] sm:text-[44px] font-semibold tracking-tight leading-[1.05]"
            style={{ letterSpacing: "-0.7px" }}
          >
            {article.headline}
          </h1>
          <p className="text-soft text-[15px] sm:text-[17px] mt-4 leading-relaxed">
            {article.kicker}
          </p>

          <div
            className="relative mt-6 rounded-lg overflow-hidden bg-[var(--bg-3)]"
            style={{ aspectRatio: "16 / 9" }}
          >
            <img
              src={article.image}
              alt=""
              loading="eager"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>

          <div className="article-body mt-6">
            {article.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}

            <h2>Key takeaways</h2>
            <ul>
              {article.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <aside
            className="my-10 rounded-xl p-6 sm:p-7"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 12%, var(--bg-2)) 100%)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 28%, var(--border-strong))",
            }}
          >
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-accent mb-3">
              <CheckCircle2 className="h-3 w-3" />
              Free report
            </div>
            <h3
              className="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-tight mb-3"
              style={{ letterSpacing: "-0.4px" }}
            >
              Get the names — free, today
            </h3>
            <p className="text-[14px] text-soft leading-relaxed mb-5">
              Enter your email to receive the full list of stocks behind this analysis,
              plus the daily Insider Score digest.
            </p>
            <Link
              href={`/reports/cta/${article.primaryTicker}`}
              className="btn-primary inline-flex items-center gap-1.5"
              style={{ padding: "11px 22px", fontSize: 13 }}
            >
              Get the free report
              <ArrowRight className="h-4 w-4" />
            </Link>
          </aside>

          <h3
            className="text-[18px] font-bold tracking-tight mb-3 mt-10"
            style={{ letterSpacing: "-0.2px" }}
          >
            Related reading
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {relatedReading(slug).map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="block rounded-lg p-4 hover:bg-[var(--accent-soft)] transition"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-1">
                  {c.eyebrow}
                </div>
                <div className="text-[13px] font-bold leading-snug">{c.title}</div>
                <div className="text-[11px] text-accent mt-1.5 inline-flex items-center gap-1">
                  Read more <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      </article>

      <aside className="space-y-5">
        <AdSlot slot="rail-top" seed={`adv-${slug}`} />
        <RightRailArticles tag={article.slug.includes("tech") ? "ai" : "insider-trades"} />
        <RightRailStockLists />
        <AdSlot slot="rail-bottom" seed={`adv-${slug}-bottom`} />
      </aside>
    </div>
  );
}

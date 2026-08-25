"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { BarChart3, Briefcase, Lightbulb } from "lucide-react";
import { SUBSCRIBE_HREF } from "@/lib/funnel";

/* Feature claims audited against the code (client free/paid audit) — nothing
   here may promise something the product cannot show today. Cut in that pass:
   "Insider Score movement alerts" (no score-movement alerting exists — /alerts
   is a live Form 4 feed plus email capture) and "Export results to CSV"
   (already free and public via /rankings.csv, so it sells nothing). */
const FEATURES = [
  {
    icon: Briefcase,
    title: "Best-in-class portfolio monitoring",
    bullets: [
      "Build a watchlist and see the Insider Score on every holding.",
      "Compare your portfolio against the Insider Score-leader basket.",
      "Track news, ratings, and SEC filings on your tickers.",
    ],
  },
  {
    icon: Lightbulb,
    title: "Stock ideas and recommendations",
    bullets: [
      "See daily ideas from our top Insider Score feed.",
      "Receive short-term trade callouts when clusters form.",
      "Spot trending tickers across our curated lists.",
    ],
  },
  {
    icon: BarChart3,
    title: "Advanced screeners and research tools",
    bullets: [
      "Filter the market by sector, market cap, and Insider Score tier.",
      "Stay informed with real-time Form 4 alerts.",
      "Rank every list down to #1 instead of the free six.",
    ],
  },
];

export function AllAccessCta() {
  return (
    <section
      className="rounded-2xl p-6 sm:p-8"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 6%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 8%, var(--bg-2)) 100%)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 lg:gap-10">
        <div>
          <h2
            className="text-[22px] sm:text-[28px] font-semibold tracking-tight leading-tight"
            style={{ letterSpacing: "-0.01em" }}
          >
            Get Insider Intel with{" "}
            <span className="text-accent">Insider Access</span>
          </h2>
          {/* No free trial exists in checkout — the guarantee is a 30-day
              money-back window (client free/paid accuracy audit). */}
          <p className="text-soft text-[14px] sm:text-[15px] mt-3 leading-relaxed">
            Open up the top-five Insider Score picks, the full congressional-trade table, and the
            daily SEC Form 4 alert stream. 30-day money-back guarantee — cancel anytime.
          </p>
          <Link
            href={SUBSCRIBE_HREF}
            className="btn-primary inline-flex items-center gap-1.5 mt-5"
            style={{ padding: "11px 22px", fontSize: 13 }}
          >
            Unlock Insider Access
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
                className="rounded-xl p-4"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center mb-2"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                  }}
                >
                  <Icon className="h-4 w-4 text-accent" />
                </div>
                <h3 className="text-[14px] font-bold leading-snug mb-2">{f.title}</h3>
                <ul className="space-y-1.5">
                  {f.bullets.map((b) => (
                    <li
                      key={b}
                      className="text-[12px] text-mute leading-snug flex items-start gap-1.5"
                    >
                      <span
                        className="h-1 w-1 rounded-full mt-1.5 flex-shrink-0"
                        style={{ background: "var(--accent)" }}
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

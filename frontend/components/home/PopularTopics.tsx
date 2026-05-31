"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Compass } from "lucide-react";

interface Topic {
  href: string;
  title: string;
  description: string;
}

const TOPICS: Topic[] = [
  {
    href: "/companies",
    title: "Top stocks by IQS",
    description:
      "Live ranking of U.S. public companies by the strength of recent insider purchases.",
  },
  {
    href: "/insiders",
    title: "Most active insiders",
    description:
      "Executives and directors buying the most company stock in the open market.",
  },
  {
    href: "/lists",
    title: "Cluster-buying alerts",
    description:
      "Companies where multiple insiders bought within days of each other — the strongest signal.",
  },
  {
    href: "/sectors",
    title: "Insider activity by sector",
    description:
      "Which sectors are seeing the biggest insider accumulation right now.",
  },
  {
    href: "/heatmaps/market",
    title: "Stock-market heatmap",
    description:
      "Every ranked U.S. company in one view, sized by market cap, coloured by IQS tier.",
  },
  {
    href: "/trades",
    title: "Today's biggest trades",
    description:
      "Newest open-market insider purchases, ranked by dollar value.",
  },
  {
    href: "/charts/volume",
    title: "Trading-volume trends",
    description:
      "Daily insider purchase volume over 7 / 30 / 90 / 180 / 365 days.",
  },
  {
    href: "/premium",
    title: "Premium AI analysis",
    description:
      "Anomaly detection, cluster scoring, and natural-language summaries for every IQS spike.",
  },
];

export function PopularTopics() {
  return (
    <aside>
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-mute font-mono mb-3 pb-2 border-b border-[var(--border)] inline-flex items-center gap-1.5">
        <Compass className="h-3 w-3 text-accent" />
        Popular Topics
      </div>
      <ul className="space-y-4">
        {TOPICS.map((t, i) => (
          <motion.li
            key={t.href}
            initial={{ opacity: 0, x: 6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.03 * i }}
          >
            <Link href={t.href} className="group block">
              <h4 className="text-[13px] font-bold leading-snug group-hover:text-accent transition">
                {t.title}
              </h4>
              <p className="text-[12px] text-mute mt-1 leading-relaxed line-clamp-3">
                {t.description}
              </p>
            </Link>
          </motion.li>
        ))}
      </ul>
    </aside>
  );
}

"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Flame } from "lucide-react";
import { NewsItem, formatRelative } from "@/lib/api";

interface Props {
  title?: string;
  items: NewsItem[];
}

export function TopStoriesStrip({ title = "Top Stories", items }: Props) {
  const cards = items.slice(0, 6);
  if (!cards.length) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4 pb-2 border-b border-[var(--border)]">
        <h2 className="inline-flex items-center gap-2 text-base font-bold tracking-tight">
          <Flame className="h-4 w-4 text-accent" />
          {title}
        </h2>
        <Link
          href="/news"
          className="text-[13px] font-semibold text-accent inline-flex items-center gap-0.5"
        >
          View all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-4">
        {cards.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.03 * i }}
            className={i > 0 ? "lg:border-l lg:border-[var(--border)] lg:pl-5" : ""}
          >
            <Link
              href={`/article?u=${encodeURIComponent(item.link)}&c=${encodeURIComponent(item.label)}`}
              className="group block"
            >
              <div
                className="text-[10px] uppercase tracking-wider font-bold mb-1.5"
                style={{ color: "var(--accent)" }}
              >
                {item.category}
              </div>
              <h3 className="text-[13px] font-bold leading-snug line-clamp-3 group-hover:text-accent transition">
                {item.title}
              </h3>
              <div className="text-[11px] text-mute mt-2 truncate">
                {item.source} · {formatRelative(item.pubDate)}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { NewsItem, formatRelative } from "@/lib/api";

interface Props {
  items: NewsItem[];
  title?: string;
  count?: number;
}

export function TrendingHeadlines({ items, title = "Top Headlines", count = 10 }: Props) {
  const list = items.slice(0, count);
  if (list.length === 0) {
    return (
      <aside>
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-mute font-mono mb-3 pb-2 border-b border-[var(--border)]">
          {title}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 shimmer rounded" />
          ))}
        </div>
      </aside>
    );
  }
  return (
    <aside>
      <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-mute font-mono mb-3 pb-2 border-b border-[var(--border)] inline-flex items-center gap-1.5">
        <Flame className="h-3 w-3 text-accent" />
        {title}
      </div>
      <ul className="space-y-3.5">
        {list.map((n, i) => (
          <motion.li
            key={n.id}
            initial={{ opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.03 * i }}
          >
            <Link
              href={`/article?u=${encodeURIComponent(n.link)}&c=${encodeURIComponent(n.label)}`}
              className="group block"
            >
              <h4 className="text-[13px] font-semibold leading-snug line-clamp-3 group-hover:text-accent transition">
                {n.title}
              </h4>
              <div className="text-[11px] text-faint mt-1.5">
                {n.source} · {formatRelative(n.pubDate)}
              </div>
            </Link>
          </motion.li>
        ))}
      </ul>
    </aside>
  );
}

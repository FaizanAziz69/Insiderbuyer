"use client";
import { motion } from "framer-motion";
import { ExternalLink, FileText, Megaphone } from "lucide-react";
import { NewsItem, formatRelative } from "@/lib/api";

const ICONS: Record<string, any> = {
  "Press release": Megaphone,
  "Speech & statement": FileText,
};

export function NewsCard({ item, index = 0 }: { item: NewsItem; index?: number }) {
  const Icon = ICONS[item.category] || FileText;
  return (
    <motion.a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.04 * index, ease: [0.22, 1, 0.36, 1] }}
      className="card card-lift p-5 block group"
    >
      <div className="flex items-center gap-2 text-[11px] text-mute mb-2.5">
        <span
          className="inline-flex h-5 w-5 rounded-md items-center justify-center"
          style={{
            background: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          <Icon className="h-3 w-3" />
        </span>
        <span className="font-semibold text-soft">{item.source}</span>
        <span className="text-faint">·</span>
        <span>{item.category}</span>
        <span className="ml-auto text-faint">{formatRelative(item.pubDate)}</span>
      </div>
      <h3 className="text-[15px] font-semibold leading-snug mb-1.5 group-hover:text-accent transition line-clamp-2">
        {item.title}
      </h3>
      {item.description && (
        <p className="text-[13px] text-mute leading-relaxed line-clamp-2">
          {item.description}
        </p>
      )}
      <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-faint group-hover:text-accent transition">
        <ExternalLink className="h-3 w-3" />
        Read on sec.gov
      </div>
    </motion.a>
  );
}

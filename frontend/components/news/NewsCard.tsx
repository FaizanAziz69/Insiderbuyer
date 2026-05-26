"use client";
import { motion } from "framer-motion";
import { ExternalLink, MapPin } from "lucide-react";
import { NewsItem, formatRelative } from "@/lib/api";
import { NewsImage } from "./NewsImage";

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function NewsCard({ item, index = 0 }: { item: NewsItem; index?: number }) {
  const seed = hashStr(item.id || item.title);

  return (
    <motion.a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.04 * index, ease: [0.22, 1, 0.36, 1] }}
      className="card card-lift block group overflow-hidden"
    >
      <div className="relative h-36 overflow-hidden">
        <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105">
          <NewsImage category={item.category} seed={seed} />
        </div>
        <div
          className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
        >
          {item.category}
        </div>
        <div
          className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
        >
          <MapPin className="h-2.5 w-2.5" />
          {item.region === "US" ? "🇺🇸 US" : "🇨🇦 CA"}
        </div>
        <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-white text-[11px] font-semibold drop-shadow-md">
          {item.source}
          <span className="text-white/70">· {item.label}</span>
        </div>
        <div
          className="absolute bottom-3 right-3 text-white text-[10px] font-mono px-2 py-0.5 rounded"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
        >
          {formatRelative(item.pubDate)}
        </div>
      </div>
      <div className="p-5">
        <h3 className="text-[15px] font-semibold leading-snug mb-1.5 group-hover:text-accent transition line-clamp-2">
          {item.title}
        </h3>
        {item.description && (
          <p className="text-[13px] text-mute leading-relaxed line-clamp-2">{item.description}</p>
        )}
        <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-faint group-hover:text-accent transition">
          <ExternalLink className="h-3 w-3" />
          Read on {item.source}
        </div>
      </div>
    </motion.a>
  );
}

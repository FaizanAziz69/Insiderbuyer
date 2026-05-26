"use client";
import { motion } from "framer-motion";
import { ExternalLink, FileText, Megaphone, TrendingUp } from "lucide-react";
import { NewsItem, formatRelative } from "@/lib/api";

const ICONS: Record<string, any> = {
  "Press release": Megaphone,
  "Speech & statement": FileText,
};

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function NewsCard({ item, index = 0 }: { item: NewsItem; index?: number }) {
  const Icon = ICONS[item.category] || FileText;
  const seed = hashStr(item.id || item.title);
  const hue = seed % 360;
  const hue2 = (hue + 50) % 360;
  const imgSeed = `${seed}`.slice(0, 8);
  const imgUrl = `https://picsum.photos/seed/${imgSeed}/640/360`;

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
      <div className="relative h-36 overflow-hidden bg-[var(--bg-3)]">
        <img
          src={imgUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, hsla(${hue}, 75%, 50%, 0.65) 0%, hsla(${hue2}, 80%, 55%, 0.55) 100%)`,
            mixBlendMode: "multiply",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, transparent 40%, rgba(0,0,0,0.45) 100%)",
          }}
        />
        <div
          className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
        >
          <Icon className="h-3 w-3" />
          {item.category}
        </div>
        <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-white text-[11px] font-semibold drop-shadow">
          <TrendingUp className="h-3 w-3" />
          {item.source}
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
          Read on sec.gov
        </div>
      </div>
    </motion.a>
  );
}

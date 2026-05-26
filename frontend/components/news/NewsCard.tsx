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

const PATTERNS = ["dots", "grid", "waves", "diagonal"];

export function NewsCard({ item, index = 0 }: { item: NewsItem; index?: number }) {
  const Icon = ICONS[item.category] || FileText;
  const seed = hashStr(item.id || item.title);
  const hue = seed % 360;
  const hue2 = (hue + 40 + (seed % 80)) % 360;
  const pattern = PATTERNS[seed % PATTERNS.length];

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
      <div
        className="relative h-32 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 70% 52%) 0%, hsl(${hue2} 75% 58%) 100%)`,
        }}
      >
        <NewsPattern variant={pattern} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, transparent 50%, rgba(0,0,0,0.25) 100%)",
          }}
        />
        <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
             style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)" }}>
          <Icon className="h-3 w-3" />
          {item.category}
        </div>
        <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-white text-[11px] font-semibold">
          <TrendingUp className="h-3 w-3" />
          {item.source}
        </div>
        <div className="absolute bottom-3 right-3 text-white/80 text-[10px] font-mono">
          {formatRelative(item.pubDate)}
        </div>
      </div>
      <div className="p-5">
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
      </div>
    </motion.a>
  );
}

function NewsPattern({ variant }: { variant: string }) {
  const id = `pat-${variant}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
      <defs>
        {variant === "dots" && (
          <pattern id={id} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="white" />
          </pattern>
        )}
        {variant === "grid" && (
          <pattern id={id} x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" stroke="white" strokeWidth="0.6" fill="none" />
          </pattern>
        )}
        {variant === "waves" && (
          <pattern id={id} x="0" y="0" width="40" height="20" patternUnits="userSpaceOnUse">
            <path d="M 0 10 Q 10 0, 20 10 T 40 10" stroke="white" strokeWidth="0.6" fill="none" />
          </pattern>
        )}
        {variant === "diagonal" && (
          <pattern id={id} x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M -2 14 L 14 -2 M 0 14 L 14 0" stroke="white" strokeWidth="0.5" />
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

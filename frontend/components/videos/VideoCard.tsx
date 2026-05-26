"use client";
import { motion } from "framer-motion";
import { Clock, Play } from "lucide-react";
import { VideoTopic } from "@/lib/api";

const CATEGORY_ACCENT: Record<string, string> = {
  Market: "rgba(0, 102, 255, 0.95)",
  Stocks: "rgba(0, 184, 107, 0.95)",
  Funds: "rgba(245, 158, 11, 0.95)",
  ETFs: "rgba(110, 59, 255, 0.95)",
  Education: "rgba(34, 211, 238, 0.95)",
  Earnings: "rgba(255, 59, 59, 0.95)",
};

export function VideoCard({ video, index = 0 }: { video: VideoTopic; index?: number }) {
  const href = `https://www.youtube.com/results?search_query=${encodeURIComponent(video.topic)}`;
  const hue = video.hue;
  const hue2 = (hue + 45) % 360;
  const accent = CATEGORY_ACCENT[video.category] || "rgba(0, 102, 255, 0.95)";

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.04 * index, ease: [0.22, 1, 0.36, 1] }}
      className="card card-lift block group overflow-hidden"
    >
      <div
        className="relative aspect-video overflow-hidden"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 70% 48%) 0%, hsl(${hue2} 78% 56%) 100%)`,
        }}
      >
        <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
          <defs>
            <pattern
              id={`vp-${video.id}`}
              x="0"
              y="0"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1" fill="white" />
              <circle cx="16" cy="16" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#vp-${video.id})`} />
        </svg>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, transparent 50%, rgba(0,0,0,0.3) 100%)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            whileHover={{ scale: 1.15 }}
            className="h-14 w-14 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.92)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              backdropFilter: "blur(8px)",
            }}
          >
            <Play className="h-5 w-5 ml-0.5" style={{ color: "#0a1628", fill: "#0a1628" }} />
          </motion.div>
        </div>
        <div
          className="absolute top-3 left-3 inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: accent, backdropFilter: "blur(8px)" }}
        >
          {video.category}
        </div>
        <div
          className="absolute bottom-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono text-white"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
        >
          <Clock className="h-3 w-3" />
          {video.duration}
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-[14px] font-semibold leading-snug mb-1 group-hover:text-accent transition line-clamp-2">
          {video.title}
        </h3>
        <div className="text-[12px] text-mute">{video.channel}</div>
      </div>
    </motion.a>
  );
}

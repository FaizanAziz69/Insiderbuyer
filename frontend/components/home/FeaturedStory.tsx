"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Mic } from "lucide-react";

export const MATERIAL_MATTERS = {
  href: "/featured/material-matters",
  category: "Regulatory",
  source: "SEC",
  eyebrow: "Material Matters",
  title: "Material Matters With SEC Chairman Paul Atkins",
  description:
    "The work at the U.S. Securities and Exchange Commission impacts everyday investors, business owners, and even entire economies. Yet for many, the SEC remains something of a mystery. In the SEC's new podcast, Material Matters, Chairman Paul Atkins hosts conversations with leading experts, breaking down the complexities of financial regulation and advancing a free-market agenda.",
  image:
    "https://www.sec.gov/files/styles/horizontal_card_/public/images/podcast-material-matters-cover.jpg?itok=DGYrbp--",
  imageFallback:
    "https://images.unsplash.com/photo-1554260570-9140fd3b7614?w=1200&h=675&fit=crop&q=80",
};

export function FeaturedStory() {
  const s = MATERIAL_MATTERS;
  const [src, setSrc] = useState(s.image);
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link href={s.href} className="block group">
        <div className="relative aspect-[16/9] rounded-md overflow-hidden bg-[var(--bg-3)] mb-3">
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              if (src !== s.imageFallback) setSrc(s.imageFallback);
            }}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.55) 100%)",
            }}
          />
          <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold text-white"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          >
            <Mic className="h-3 w-3" />
            Podcast · SEC
          </div>
          <div className="absolute bottom-3 left-3 right-3 text-white">
            <div className="text-[10px] uppercase tracking-wider font-bold opacity-90 mb-1">
              {s.eyebrow}
            </div>
            <h2 className="text-[20px] sm:text-[24px] font-bold tracking-tight leading-snug"
              style={{ letterSpacing: "-0.2px" }}
            >
              {s.title}
            </h2>
          </div>
        </div>
        <p className="text-[14px] text-soft leading-relaxed line-clamp-3">
          {s.description}
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-accent uppercase tracking-wider group-hover:underline">
          Continue reading
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    </motion.section>
  );
}

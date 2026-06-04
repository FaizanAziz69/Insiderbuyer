"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { NewsItem } from "@/lib/api";
import { FeaturedImagesGrid } from "./FeaturedImagesGrid";
import { getSampleNews } from "@/content/sample-news";

interface Props {
  items: NewsItem[];
  slides?: number;
  itemsPerSlide?: number;
  autoAdvanceMs?: number;
}

export function FeaturedCarousel({
  items,
  slides = 3,
  itemsPerSlide = 4,
  autoAdvanceMs = 7000,
}: Props) {
  const [active, setActive] = useState(0);

  // Merge real + sample so we always have enough for `slides * itemsPerSlide`.
  const needed = slides * itemsPerSlide;
  const sample = getSampleNews();
  const seenIds = new Set(items.map((n) => n.id));
  const filler = sample.filter((s) => !seenIds.has(s.id));
  const pool = [...items, ...filler].slice(0, Math.max(needed, items.length));

  const groups: NewsItem[][] = [];
  for (let i = 0; i < slides; i++) {
    const start = i * itemsPerSlide;
    const slice = pool.slice(start, start + itemsPerSlide);
    if (slice.length > 0) groups.push(slice);
  }
  if (groups.length === 0) return null;

  useEffect(() => {
    if (!autoAdvanceMs || groups.length <= 1) return;
    const t = setInterval(() => {
      setActive((a) => (a + 1) % groups.length);
    }, autoAdvanceMs);
    return () => clearInterval(t);
  }, [autoAdvanceMs, groups.length]);

  return (
    <div>
      <div className="relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <FeaturedImagesGrid items={groups[active]} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot navigation */}
      {groups.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {groups.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Slide ${i + 1}`}
              className="transition-all rounded-full"
              style={{
                width: i === active ? 22 : 8,
                height: 8,
                background:
                  i === active ? "var(--accent)" : "var(--border-strong)",
                cursor: "pointer",
                border: "none",
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

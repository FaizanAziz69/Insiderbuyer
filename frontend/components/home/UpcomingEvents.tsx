"use client";
import { Calendar } from "lucide-react";
import { motion } from "framer-motion";

interface EventItem {
  month: string;
  day: string;
  category: string;
  title: string;
  description: string;
}

const EVENTS: EventItem[] = [
  {
    month: "May",
    day: "29",
    category: "Public appearances by officials",
    title: "2026 Reagan National Economic Forum",
    description:
      "SEC Chairman Paul S. Atkins delivers the keynote address at the Reagan National Economic Forum.",
  },
  {
    month: "Jun",
    day: "04",
    category: "SEC meetings and other events",
    title: "Investor Advisory Committee",
    description:
      "The SEC's Investor Advisory Committee meets to discuss retail confusion around private market assets, passive index funds, shareholder voting, fund proxy voting, and quarterly vs. semi-annual reporting.",
  },
];

export function UpcomingEvents() {
  return (
    <aside>
      <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-[var(--border)] text-[10px] uppercase tracking-[0.18em] font-bold text-mute font-mono">
        <Calendar className="h-3 w-3 text-accent" />
        Upcoming events
      </div>
      <ul className="space-y-4">
        {EVENTS.map((e, i) => (
          <motion.li
            key={`${e.month}-${e.day}-${i}`}
            initial={{ opacity: 0, x: 6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: 0.04 * i }}
            className="grid grid-cols-[44px_1fr] gap-3 items-start"
          >
            <div
              className="rounded-md text-center py-1.5 flex-shrink-0"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid color-mix(in srgb, var(--accent) 22%, var(--border))",
              }}
            >
              <div
                className="text-[9px] uppercase font-bold tracking-wider"
                style={{ color: "var(--accent)" }}
              >
                {e.month}
              </div>
              <div className="text-[16px] font-bold leading-none">{e.day}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-mute font-semibold mb-0.5 truncate">
                {e.category}
              </div>
              <h4 className="text-[13px] font-bold leading-snug line-clamp-2">
                {e.title}
              </h4>
              <p className="text-[11px] text-mute mt-1 leading-relaxed line-clamp-3">
                {e.description}
              </p>
            </div>
          </motion.li>
        ))}
      </ul>
    </aside>
  );
}

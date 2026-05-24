"use client";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

interface Props {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  hint?: string;
  animatedTo?: number;
  format?: (n: number) => string;
  accent?: string;
  index?: number;
}

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.3, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

export function MetricCard({
  label,
  value,
  delta,
  hint,
  animatedTo,
  format,
  accent,
  index = 0,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.05 + index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="card card-lift p-5 relative overflow-hidden cursor-default"
    >
      {accent && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: accent }}
        />
      )}
      <div className="flex items-center justify-between">
        <div className="label-mini">{label}</div>
        <span className="live-dot live-dot-good text-faint">live</span>
      </div>
      <div className="mt-3 text-[30px] font-bold tracking-tight leading-none tabular">
        {animatedTo !== undefined && format ? (
          <AnimatedNumber value={animatedTo} format={format} />
        ) : (
          value
        )}
      </div>
      <div className="mt-2.5 text-xs text-mute flex items-center gap-1.5 min-h-[16px]">
        {delta && (
          <span
            className="inline-flex items-center gap-0.5 font-semibold"
            style={{ color: delta.positive ? "var(--good-strong)" : "var(--bad-strong)" }}
          >
            {delta.positive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta.value}
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </motion.div>
  );
}

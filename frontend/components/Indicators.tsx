"use client";
import { ArrowDown, ArrowUp, Calendar, Newspaper, TrendingUp } from "lucide-react";

export interface IndicatorFlags {
  insiderTrade?: "buy" | "sell" | null;
  earningsDueSoon?: boolean;
  analystUpgrade?: boolean;
  positiveNews?: boolean;
}

interface Props {
  flags: IndicatorFlags;
  size?: "sm" | "md";
}

const PILL_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  fontWeight: 700,
};

function Pill({
  bg,
  fg,
  Icon,
  title,
  size = "sm",
}: {
  bg: string;
  fg: string;
  Icon: any;
  title: string;
  size?: "sm" | "md";
}) {
  const dim = size === "md" ? 26 : 22;
  const ic = size === "md" ? 14 : 12;
  return (
    <span className="group/ind relative inline-flex" aria-label={title}>
      <span
        style={{
          ...PILL_BASE,
          width: dim,
          height: dim,
          background: bg,
          color: fg,
        }}
      >
        <Icon className="" style={{ width: ic, height: ic }} strokeWidth={2.5} />
      </span>
      {/* Instant, clearly-visible hover tooltip (the native title= is slow). */}
      <span
        className="pointer-events-none absolute left-1/2 bottom-full z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold opacity-0 shadow-lg transition-opacity duration-150 group-hover/ind:opacity-100"
        style={{ background: "var(--text)", color: "var(--bg-1)" }}
        role="tooltip"
      >
        {title}
      </span>
    </span>
  );
}

export function Indicators({ flags, size = "sm" }: Props) {
  const anything =
    flags.insiderTrade ||
    flags.earningsDueSoon ||
    flags.analystUpgrade ||
    flags.positiveNews;
  if (!anything) {
    return <span className="text-[11px] text-faint">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {flags.insiderTrade === "buy" && (
        <Pill
          bg="color-mix(in srgb, var(--good) 18%, transparent)"
          fg="var(--good)"
          Icon={ArrowUp}
          title="Insider Buy (last 5 days)"
          size={size}
        />
      )}
      {flags.insiderTrade === "sell" && (
        <Pill
          bg="color-mix(in srgb, var(--bad) 18%, transparent)"
          fg="var(--bad)"
          Icon={ArrowDown}
          title="Insider Sell (last 5 days)"
          size={size}
        />
      )}
      {flags.earningsDueSoon && (
        <Pill
          bg="color-mix(in srgb, var(--warn) 20%, transparent)"
          fg="var(--warn)"
          Icon={Calendar}
          title="Earnings Due Soon (within 7 days)"
          size={size}
        />
      )}
      {flags.analystUpgrade && (
        <Pill
          bg="color-mix(in srgb, var(--accent) 18%, transparent)"
          fg="var(--accent)"
          Icon={TrendingUp}
          title="Analyst Report Issued"
          size={size}
        />
      )}
      {flags.positiveNews && (
        <Pill
          bg="color-mix(in srgb, var(--accent-2) 18%, transparent)"
          fg="var(--accent-2)"
          Icon={Newspaper}
          title="Positive News"
          size={size}
        />
      )}
    </span>
  );
}

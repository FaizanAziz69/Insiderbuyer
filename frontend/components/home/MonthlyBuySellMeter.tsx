"use client";
import useSWR from "swr";
import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
import { API_BASE, BuySellMeter, fetcher, formatCurrency } from "@/lib/api";

/** When `linkable` (default), the whole card links to the full month's
 *  buy/sell breakdown. Pass linkable={false} on the breakdown page itself. */
export function MonthlyBuySellMeter({ linkable = true }: { linkable?: boolean }) {
  const { data } = useSWR<BuySellMeter>(`${API_BASE}/metrics/buy-sell`, fetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: false,
  });
  const ratio = data ? data.ratio : 0.5;
  const buyPct = Math.round(ratio * 100);
  const sellPct = 100 - buyPct;

  const Wrapper: any = linkable ? Link : "section";
  const wrapperProps = linkable
    ? { href: "/insiders/buy-sell", title: "View every insider buy & sell this month" }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`block rounded-lg p-5 transition ${linkable ? "group hover:border-[var(--accent)]" : ""}`}
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div className="inline-flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-accent" />
          <h3 className="text-[14px] font-bold uppercase tracking-wide group-hover:text-accent transition" style={{ fontFamily: "var(--font-heading), var(--font-sans)" }}>
            Insider buying vs selling — {data?.monthLabel || "This Month"}
          </h3>
        </div>
        {linkable ? (
          <span className="text-[10px] uppercase tracking-wider font-bold text-accent inline-flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider font-bold text-mute">
            General market · resets monthly
          </span>
        )}
      </div>

      {/* Bar gauge — colored fills below, labels pinned to the bar's outer
          edges so a narrow segment never clips its own label. */}
      <div
        className="relative h-9 rounded-md overflow-hidden flex"
        style={{ background: "var(--bg-3)" }}
      >
        <div
          className="h-full"
          style={{
            width: `${buyPct}%`,
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--good) 70%, transparent), var(--good))",
          }}
        />
        <div
          className="h-full"
          style={{
            width: `${sellPct}%`,
            background:
              "linear-gradient(90deg, var(--bad), color-mix(in srgb, var(--bad) 70%, transparent))",
          }}
        />
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-white whitespace-nowrap pointer-events-none"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
        >
          {buyPct}% buying
        </span>
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-white whitespace-nowrap pointer-events-none"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
        >
          {sellPct}% selling
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-3 text-[12px]">
        <div>
          <span className="text-mute">$ Bought: </span>
          <span className="font-bold tabular text-good">
            {data ? formatCurrency(data.buyVolume) : "—"}
          </span>
          <span className="text-mute ml-2">
            ({(data?.totalBuys || 0).toLocaleString()} txns)
          </span>
        </div>
        <div className="text-right">
          <span className="text-mute">$ Sold: </span>
          <span className="font-bold tabular text-bad">
            {data ? formatCurrency(data.sellVolume) : "—"}
          </span>
          <span className="text-mute ml-2">
            ({(data?.totalSells || 0).toLocaleString()} txns)
          </span>
        </div>
      </div>
    </Wrapper>
  );
}

"use client";

/**
 * The list-article module: the visual, then the breakdown.
 *
 * George, 2026-09-23: "The entire article is this visual plus a simple
 * breakdown via List style." Both halves read ONE payload from the article's
 * own chart endpoint, so the table and the cards can never disagree — and the
 * fetch is the same SWR key the bar-chart module uses, so an article that
 * shows both pays for one request.
 */

import useSWR from "swr";
import { API_BASE } from "@/lib/api";
import { ScreenTable } from "./ScreenTable";
import { StockBreakdownList } from "./StockBreakdownList";
import type { ChartPayload } from "./RankedBarChart";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ListArticleModule({
  slug,
  period,
  title,
  subtitle,
  onLoaded,
}: {
  slug: string;
  period: string;
  title: string;
  subtitle: string;
  onLoaded?: (p: ChartPayload) => void;
}) {
  const { data, isLoading, error } = useSWR<ChartPayload>(
    `${API_BASE}/data-articles/${slug}/chart?period=${period}`,
    fetcher,
    { revalidateOnFocus: false, onSuccess: (p) => onLoaded?.(p) },
  );

  if (isLoading) {
    return (
      <div className="rounded-xl h-[320px] animate-pulse" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }} aria-busy="true" />
    );
  }
  if (error || !data || !(data.variants?.all?.length || data.variants?.discretionary?.length)) {
    // An empty screen is a real state — no company met the threshold this week —
    // and it says so rather than rendering an empty frame.
    return (
      <div className="rounded-xl p-5 text-[14px]" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-mute)" }}>
        No company met this screen&rsquo;s threshold at the last refresh.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-[20px] sm:text-[22px] font-bold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
          {title}
        </h2>
        <p className="text-[13px] leading-snug" style={{ color: "var(--text-mute)" }}>
          {subtitle}
        </p>
      </div>
      <ScreenTable payload={data} />
      <StockBreakdownList payload={data} />
    </div>
  );
}

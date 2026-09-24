"use client";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";
import { CqsBreakdownCard, CqsScoreCard } from "../CqsBreakdownCard";

/**
 * The Congress Quality Score module on a stock page, next to the Insider Score
 * (Brief v9 §7).
 *
 * Renders nothing when the stock has no score — that is the common case and
 * the right one: CQS exists only where members of Congress are actually
 * buying, so an empty card on every other stock would be noise.
 */
export function CqsStockPanel({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ score: CqsScoreCard | null }>(
    ticker ? `${API_BASE}/cqs/ticker/${encodeURIComponent(ticker)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  if (!data?.score) return null;
  return (
    <div className="my-6">
      <CqsBreakdownCard score={data.score} />
    </div>
  );
}

"use client";
import useSWR from "swr";
import Link from "next/link";
import { API_BASE, fetcher } from "@/lib/api";

interface Pillar {
  key: string;
  label: string;
  value: number | null;
  effectiveWeight: number;
  live: boolean;
}
interface CompositeResponse {
  ticker: string;
  score: number | null;
  insiderScore: number | null;
  sentimentRationale: string | null;
  pillars: Pillar[];
  coverage: number;
}

function pillarColor(v: number) {
  if (v >= 55) return "var(--good)";
  if (v >= 40) return "var(--gold)";
  return "var(--bad)";
}

/**
 * Per-stock composite-score breakdown — the three weighted pillars (Insider
 * Activity, Analyst Ratings, News & Sentiment) behind the 0–100 score, with
 * the weight each one actually contributed for this ticker.
 */
export function ScorePillarsCard({ ticker }: { ticker: string }) {
  const sym = ticker.toUpperCase();
  const { data } = useSWR<CompositeResponse>(
    `${API_BASE}/scores/${encodeURIComponent(sym)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );

  if (!data || !data.pillars?.some((p) => p.value != null)) return null;

  return (
    <section
      className="rounded-lg p-4 sm:p-5"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-[16px] font-bold tracking-tight">
          What&rsquo;s Behind the Score
        </h2>
        <Link
          href="/methodology"
          className="text-[12px] font-semibold text-accent hover:underline whitespace-nowrap"
        >
          How the score works →
        </Link>
      </div>

      <div className="space-y-3">
        {data.pillars.map((p) => (
          <div key={p.key} className="flex items-center gap-3">
            <div className="w-[130px] sm:w-[150px] flex-shrink-0">
              <div className="text-[12.5px] font-semibold leading-tight">{p.label}</div>
              <div className="text-[10.5px] text-mute leading-tight">
                {p.value != null
                  ? `${Math.round(p.effectiveWeight * 100)}% of score`
                  : "No data yet"}
              </div>
            </div>
            <div
              className="flex-1 h-2 rounded-full overflow-hidden"
              style={{ background: "var(--bg-3)" }}
            >
              {p.value != null && (
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(3, Math.min(100, p.value))}%`,
                    background: pillarColor(p.value),
                  }}
                />
              )}
            </div>
            <div
              className="w-9 text-right text-[13px] font-bold tabular flex-shrink-0"
              style={{ color: p.value != null ? pillarColor(p.value) : "var(--text-faint)" }}
            >
              {p.value != null ? p.value : "—"}
            </div>
          </div>
        ))}
      </div>

      {data.sentimentRationale && (
        <p className="mt-3 text-[12px] text-mute leading-relaxed">
          <span className="font-semibold text-soft">News check:</span>{" "}
          {data.sentimentRationale}
        </p>
      )}
    </section>
  );
}

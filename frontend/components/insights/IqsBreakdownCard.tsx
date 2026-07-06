"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { API_BASE, CompanyDetail, fetcher } from "@/lib/api";

interface Props {
  ticker: string;
}

/** Right-rail card visualising the four Insider Score factors as horizontal bars —
 *  shows readers exactly WHY this stock scores what it scores. This is the
 *  Insider Score equivalent of MarketBeat's "MarketRank" breakdown widget. */
export function IqsBreakdownCard({ ticker }: Props) {
  const { data, isLoading } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000 },
  );

  if (isLoading && !data) {
    return <div className="shimmer rounded-lg" style={{ height: 220 }} />;
  }
  const s = data?.score;
  if (!s) return null;

  // The six Insider Score components — each 0–100, weighted into the composite:
  // Insider Score = Insider×.25 + Transaction×.25 + Conviction×.20 + History×.15
  //     + Cluster×.10 + Timing×.05
  const factors: Array<{ label: string; value: number; weight: string; hint: string }> = [
    {
      label: "Insider Weight",
      value: Number(s.insiderWeight),
      weight: "×0.25",
      hint: "Who bought — CEO/CFO buys score highest",
    },
    {
      label: "Transaction Weight",
      value: Number(s.transactionWeight),
      weight: "×0.25",
      hint: "Dollar size, absolute and vs market cap",
    },
    {
      label: "Conviction Weight",
      value: Number(s.convictionWeight),
      weight: "×0.20",
      hint: "Stake growth and repeat buying",
    },
    {
      label: "Historical Success",
      value: Number(s.historicalSuccessWeight),
      weight: "×0.15",
      hint: "Past insider buys currently in profit",
    },
    {
      label: "Cluster Weight",
      value: Number(s.clusterWeight),
      weight: "×0.10",
      hint: "Multiple insiders buying together",
    },
    {
      label: "Market Timing",
      value: Number(s.marketTimingWeight),
      weight: "×0.05",
      hint: "Buying near 52-week lows scores highest",
    },
  ];
  const max = 100; // components are already on a 0–100 scale

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        <h3 className="text-[12px] font-bold uppercase tracking-wider">
          Insider Score Breakdown
        </h3>
        <span
          className="tabular font-bold px-2 py-0.5 rounded text-[13px]"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {Number(s.iqs).toFixed(1)} / 100
        </span>
      </div>

      <div className="px-4 py-3.5 space-y-3.5">
        {factors.map((f, i) => {
          const pct = Math.max(4, Math.round((f.value / max) * 100));
          return (
            <div key={f.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[12px] font-semibold">
                  {f.label}{" "}
                  <span className="text-[10px] font-bold text-faint">{f.weight}</span>
                </span>
                <span className="text-[11px] tabular font-bold text-mute">
                  {f.value.toFixed(0)}
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--bg-3)" }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${pct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--accent), var(--accent-2))",
                  }}
                />
              </div>
              <div className="text-[10px] text-faint mt-0.5">{f.hint}</div>
            </div>
          );
        })}
      </div>

      <div
        className="px-4 py-2.5 border-t text-[11px] text-mute"
        style={{ borderColor: "var(--border)" }}
      >
        Four-factor 0–100 score computed from live SEC Form 4 filings.{" "}
        <Link href="/methodology" className="text-accent font-semibold hover:underline">
          Methodology →
        </Link>
      </div>
    </div>
  );
}

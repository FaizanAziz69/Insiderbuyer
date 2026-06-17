"use client";
import useSWR from "swr";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { API_BASE, PredictionToday, fetcher, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "../CompanyLogo";

export function PredictionOfTheDay() {
  const { data } = useSWR<PredictionToday>(
    `${API_BASE}/predictions/today`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  if (!data || !data.ticker) return null;
  return (
    <Link
      href={`/companies/${encodeURIComponent(data.ticker)}`}
      className="block rounded-xl p-5 group"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 14%, var(--bg-2)) 100%)",
        border:
          "1px solid color-mix(in srgb, var(--accent) 30%, var(--border-strong))",
      }}
    >
      <div className="flex items-start gap-4">
        <CompanyLogo ticker={data.ticker} name={data.name} size={48} />
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-accent mb-1">
            <Sparkles className="h-3 w-3" />
            Prediction of the Day
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-[15px] font-semibold text-accent">{data.ticker}</span>
            <span className="text-[14px] font-bold text-soft">{data.name}</span>
          </div>
          <p className="text-[13px] text-soft leading-relaxed mt-1.5">{data.why}</p>
          <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-mute">
            <span>
              IQS <span className="text-accent font-bold tabular">{data.iqs.toFixed(1)}</span>
            </span>
            <span>·</span>
            <span>
              Bought <span className="font-bold tabular text-good">{formatCurrency(data.bought)}</span>
            </span>
            <span>·</span>
            <span>{data.buyers} buyers</span>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-accent self-center group-hover:translate-x-0.5 transition" />
      </div>
    </Link>
  );
}

"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, Sparkles } from "lucide-react";
import {
  API_BASE,
  RankingsResponse,
  fetcher,
  formatCurrency,
} from "@/lib/api";

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function Sparkline({ seed, positive }: { seed: number; positive: boolean }) {
  const rand = (n: number) => {
    const x = Math.sin(seed * 9.3 + n * 1.7) * 10000;
    return x - Math.floor(x);
  };
  const pts: number[] = [];
  let y = 50;
  for (let i = 0; i < 14; i++) {
    y += (rand(i) - (positive ? 0.4 : 0.6)) * 11;
    y = Math.max(10, Math.min(90, y));
    pts.push(y);
  }
  const w = 80;
  const xStep = w / (pts.length - 1);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${i * xStep} ${p}`).join(" ");
  const area = `${path} L ${w} 100 L 0 100 Z`;
  return (
    <svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" className="w-full h-9">
      <path
        d={area}
        fill={positive ? "var(--good)" : "var(--bad)"}
        opacity="0.12"
      />
      <path
        d={path}
        fill="none"
        stroke={positive ? "var(--good)" : "var(--bad)"}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function MostActiveStocks() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=8`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const rows = data?.rows || [];

  return (
    <aside className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-[15px] font-bold tracking-tight">Most Active Stocks</h3>
          <Link href="/companies" className="text-[12px] font-semibold text-accent hover:underline">
            All
          </Link>
        </div>
        <div className="text-[11px] text-mute mb-3">Ranked by Insider Buying Quality Score</div>

        {isLoading ? (
          <ul className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="h-16 shimmer rounded" />
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((r, i) => {
              const positive = r.iqs >= 1;
              return (
                <motion.li
                  key={r.companyId}
                  initial={{ opacity: 0, x: 8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.04 * i }}
                >
                  <Link
                    href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
                    className="grid grid-cols-[64px_1fr] gap-3 items-center py-3 hover:bg-[var(--accent-soft)] rounded-md px-2 -mx-2 transition"
                  >
                    <div className="flex items-center justify-center h-10">
                      <Sparkline seed={hashStr(r.companyId)} positive={positive} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="font-bold text-[13px] truncate"
                          title={r.name}
                        >
                          {r.name.length > 18 ? r.name.slice(0, 18) + "…" : r.name}
                        </span>
                        <span className="text-[12px] font-bold tabular text-soft">
                          {formatCurrency(r.totalPurchaseValue)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span
                          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: "var(--bg-3)",
                            color: "var(--text-soft)",
                          }}
                        >
                          {r.ticker || "—"}
                        </span>
                        <span
                          className={`text-[11px] font-bold tabular`}
                          style={{ color: positive ? "var(--good)" : "var(--bad)" }}
                        >
                          {positive ? "+" : ""}IQS {r.iqs.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        )}
        <div className="text-[10px] text-mute mt-3 font-mono">
          {new Date().toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          {" · "}
          {new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Get insights box */}
      <div
        className="card p-5"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 6%, var(--bg-2)) 0%, var(--bg-2) 100%)",
          borderColor: "color-mix(in srgb, var(--accent) 18%, var(--border))",
        }}
      >
        <div
          className="inline-flex h-9 w-9 rounded-lg items-center justify-center mb-3"
          style={{
            background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
            boxShadow: "0 6px 18px rgba(0,102,255,0.25)",
          }}
        >
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <h3 className="text-[16px] font-bold tracking-tight">Get insights you can act on</h3>
        <p className="text-[12px] text-soft mt-1.5 leading-relaxed">
          Free account: full rankings, screener, watchlists, weekly digest.
        </p>
        <Link
          href="/premium"
          className="btn-primary mt-4 w-full"
          style={{ padding: "8px 14px", fontSize: 13 }}
        >
          Sign up
        </Link>
        <div className="text-[11px] text-mute mt-3 text-center">
          Already have an account?{" "}
          <a className="underline hover:text-accent">Sign in</a>
        </div>
      </div>

      {/* Newsletter box */}
      <div
        className="card p-5"
        style={{
          background: "var(--bg-3)",
        }}
      >
        <div className="flex items-start gap-3">
          <Mail className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-mute font-mono font-semibold">
              Email Newsletter
            </div>
            <h3 className="text-[15px] font-bold tracking-tight mt-0.5">
              Make sense of the markets
            </h3>
            <p className="text-[12px] text-soft mt-1.5 leading-relaxed">
              Weekly insights on insider buying opportunities, in your inbox.
            </p>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="mt-3 flex flex-col gap-2"
            >
              <input
                type="email"
                required
                placeholder="you@email.com"
                className="input-base"
                style={{ fontSize: 13 }}
              />
              <button
                type="submit"
                className="btn-primary"
                style={{ padding: "8px 14px", fontSize: 13 }}
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}

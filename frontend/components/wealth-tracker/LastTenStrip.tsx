"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Share2 } from "lucide-react";
import { API_BASE, fetcher, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";

/**
 * Last-10-Trades — Brief v7 Build 2. "A deliberately simple, reusable strip:
 * the person's ten most recent disclosed trades … date, ticker, BUY/SELL,
 * size (exact for Form 4; est. band for PTR), and return since the trade,
 * colored green or red. One glance answers 'have their recent calls worked?'"
 *
 * `variant="dots"` is the condensed ten-dot version for cards: green/red
 * for a buy that is up/down so far, grey for a sale (a sale's return needs
 * a counterfactual, so none is shown, per the brief), hollow for a buy we
 * could not price. Every dot links through to the profile.
 */

export type Last10Type = "congress" | "insider" | "investor";

export interface Last10Item {
  date: string;
  ticker: string | null;
  name: string;
  side: "BUY" | "SELL";
  sizeLabel: string;
  sizeValue: number | null;
  price: number | null;
  priceNow: number | null;
  returnPct: number | null;
  realized: boolean;
  url: string | null;
  who?: string;
  kind?: "insider" | "congress";
  href?: string;
}

export interface Last10Payload {
  type: Last10Type;
  key: string;
  subject: { name: string; slug: string; photoUrl: string | null; href: string } | null;
  precision: "exact" | "est" | "approx";
  precisionNote: string;
  items: Last10Item[];
  summary: { buys: number; up: number; down: number; avgReturnPct: number | null; line: string } | null;
}

const UP = "#10B981";
const DOWN = "#EF4444";

export function last10Key(type: Last10Type, key: string) {
  return `${API_BASE}/wealth-tracker/last10?type=${type}&key=${encodeURIComponent(key)}`;
}

/** Ten dots from a precomputed list (leaderboard rows carry one) — no fetch. */
export function TenDots({ dots, href, size = 9, title }: { dots: Array<{ side: "buy" | "sell" | "BUY" | "SELL"; ret: number | null }>; href?: string; size?: number; title?: string }) {
  if (!dots?.length) return null;
  const row = (
    <span className="inline-flex items-center gap-[3px]" title={title || "Last 10 trades, newest first: green = buy up so far, red = buy down, grey = sale"} aria-label="Last ten trades">
      {dots.slice(0, 10).map((d, i) => {
        const buy = String(d.side).toLowerCase() === "buy";
        const bg = !buy ? "var(--text-faint)" : d.ret == null ? "transparent" : d.ret > 0 ? UP : DOWN;
        return (
          <span
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: bg,
              border: buy && d.ret == null ? "1.5px solid var(--text-mute)" : "none",
              display: "inline-block",
            }}
          />
        );
      })}
    </span>
  );
  return href ? (
    <Link href={href} className="inline-flex">
      {row}
    </Link>
  ) : (
    row
  );
}

export function LastTenStrip({
  type,
  subjectKey,
  variant = "full",
  title = "Last 10 trades",
  showShare = true,
}: {
  type: Last10Type;
  subjectKey: string;
  variant?: "full" | "dots";
  title?: string;
  showShare?: boolean;
}) {
  const { data } = useSWR<Last10Payload>(subjectKey ? last10Key(type, subjectKey) : null, fetcher, { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 });
  if (!data || !data.items?.length) return null;
  if (variant === "dots") {
    return <TenDots dots={data.items.map((i) => ({ side: i.side, ret: i.returnPct }))} href={data.subject?.href} />;
  }
  const est = data.precision !== "exact";
  const shareHref = `/api/og/last10?type=${type}&key=${encodeURIComponent(subjectKey)}`;
  return (
    <section className="card p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[14px] font-bold leading-tight">{title}</h2>
          {data.summary ? (
            <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-soft)" }}>
              {data.summary.line}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <TenDots dots={data.items.map((i) => ({ side: i.side, ret: i.returnPct }))} size={8} />
          {showShare ? (
            <a
              href={shareHref}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold rounded-md px-2 py-1"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-soft)" }}
              title="Open a shareable image of this strip"
            >
              <Share2 className="h-3 w-3" /> Share
            </a>
          ) : null}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {data.items.map((it, i) => {
          const buy = it.side === "BUY";
          const r = it.returnPct;
          const tone = r == null ? "var(--text-mute)" : r >= 0 ? UP : DOWN;
          const chip = (
            <div
              key={i}
              className="flex-shrink-0 rounded-lg p-2.5 min-w-[122px]"
              style={{ background: "var(--bg-2)", border: `1px solid ${buy && r != null ? tone + "55" : "var(--border)"}` }}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: buy ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)", color: buy ? UP : DOWN }}>
                  {buy ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {buy ? "Buy" : "Sell"}
                </span>
                <span className="text-[10.5px] whitespace-nowrap" style={{ color: "var(--text-mute)" }}>
                  {formatDate(it.date)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                {it.ticker ? <CompanyLogo ticker={it.ticker} name={it.name} size={18} /> : null}
                <span className="font-mono font-bold text-[13px] truncate" title={it.name}>
                  {it.ticker || it.name.slice(0, 14)}
                </span>
              </div>
              <div className="text-[11px] mt-1 truncate" style={{ color: "var(--text-mute)" }} title={it.sizeLabel}>
                {it.sizeLabel}
                {est && it.sizeValue != null ? " est." : ""}
              </div>
              <div className="text-[13px] font-bold tabular mt-1" style={{ color: tone }}>
                {buy ? (r == null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(1)}%`) : <span className="text-[10.5px] font-semibold" style={{ color: "var(--text-faint)" }}>sale</span>}
                {buy && r != null ? (
                  <span className="block text-[10px] font-normal" style={{ color: "var(--text-mute)" }}>
                    {it.realized ? "realized" : "so far"}
                    {est ? " · est." : ""}
                  </span>
                ) : null}
              </div>
              {it.who ? (
                <div className="text-[10.5px] mt-1 truncate" style={{ color: "var(--text-soft)" }} title={it.who}>
                  {it.who}
                </div>
              ) : null}
            </div>
          );
          const href = it.href || (it.ticker ? `/companies/${it.ticker}` : null);
          return href ? (
            <Link key={i} href={href} className="flex-shrink-0">
              {chip}
            </Link>
          ) : (
            chip
          );
        })}
      </div>
      <p className="text-[10.5px] mt-2" style={{ color: "var(--text-faint)" }}>
        {data.precisionNote} Returns are shown for buys only; a sale&rsquo;s success would need a counterfactual.
      </p>
    </section>
  );
}

/** Stock-page variant: recent insider and congressional trades in one ticker. */
export function TickerLastTen({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ ticker: string; items: Last10Item[] }>(ticker ? `${API_BASE}/wealth-tracker/last10/ticker/${encodeURIComponent(ticker)}` : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });
  if (!data || !data.items?.length) return null;
  const buys = data.items.filter((i) => i.side === "BUY" && i.returnPct != null);
  const up = buys.filter((i) => (i.returnPct as number) > 0).length;
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[14px] font-bold leading-tight">Recent insider trades in {data.ticker}</h2>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-soft)" }}>
            Form 4 filers and members of Congress together, newest first
            {buys.length ? ` · ${up} of ${buys.length} recent buys are up` : ""}.
          </p>
        </div>
        <TenDots dots={data.items.map((i) => ({ side: i.side, ret: i.returnPct }))} size={8} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {data.items.map((it, i) => {
          const buy = it.side === "BUY";
          const r = it.returnPct;
          const tone = r == null ? "var(--text-mute)" : r >= 0 ? UP : DOWN;
          return (
            <Link key={i} href={it.href || "#"} className="flex-shrink-0 rounded-lg p-2.5 min-w-[150px]" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase rounded px-1.5 py-0.5" style={{ background: buy ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)", color: buy ? UP : DOWN }}>
                  {buy ? "Buy" : "Sell"}
                </span>
                <span className="text-[10.5px]" style={{ color: "var(--text-mute)" }}>
                  {formatDate(it.date)}
                </span>
              </div>
              <div className="text-[12.5px] font-semibold truncate" title={it.who}>
                {it.who}
              </div>
              <div className="text-[10.5px] truncate" style={{ color: "var(--text-mute)" }}>
                {it.kind === "congress" ? "Congress · " : "Form 4 · "}
                {it.sizeLabel}
              </div>
              <div className="text-[12.5px] font-bold tabular mt-1" style={{ color: tone }}>
                {buy ? (r == null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(1)}%`) : <span className="text-[10.5px] font-semibold" style={{ color: "var(--text-faint)" }}>sale</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

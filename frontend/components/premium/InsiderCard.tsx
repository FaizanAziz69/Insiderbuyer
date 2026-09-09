"use client";

/**
 * INSIDER PERFORMANCE CARD — Developer Project Brief (Aug 24 2026), §6.1.
 *
 * "Convert each famous-insider photo into a designed card using the same
 *  performance treatment as the Top Insiders page: photo, name, title &
 *  company, and a headline performance stat (e.g. return on their disclosed
 *  purchases over the trailing period, from our Insider ROI Leaderboard data).
 *  Card design direction: navy card, gold accent frame around the photo, mono
 *  stat line — a collectible, trading-card feel … These cards become a
 *  reusable component (they will also appear in social creative)."
 *
 * The stat is LIVE (acceptance §10 D: "cards render from live leaderboard
 * data"): /insiders/profile → stats.avgBuyReturnPct, the average return of
 * the insider's disclosed open-market buys (Form 4 code P) against the live
 * price — the same figure the insider profile page prints as "Avg Return".
 * Nothing on the card is hardcoded except the identity line; a card whose
 * insider has no measurable buys says so instead of inventing a number
 * (§2.4: figures are historical and factual).
 *
 * §2.4 also wants the methodology one click away: the whole card links to the
 * insider's profile page, where the stat's definition and every underlying
 * trade are listed, and the stat line carries a "how it's measured" title.
 *
 * Brand tokens per §1 of the brief: navy #0A1E3C, gold #C9A227, green #0E9F6E.
 */

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";

export interface InsiderCardProps {
  /** Exact stored Form 4 filer name — the /insiders/profile lookup key. */
  filerName: string;
  /** Display name for the card face (the filer name is often "LAST FIRST M"). */
  name: string;
  /** "Title · Company" line under the name. */
  title: string;
  company: string;
  /** Portrait path. Optional — a missing/404 photo falls back to initials
   *  rather than a broken image, so a card can ship before its portrait. */
  photo?: string | null;
  /** Wider card for the marquee vs. a compact one for social/other slots. */
  size?: "marquee" | "compact";
}

interface ProfileStats {
  profile: {
    name: string;
    stats: {
      buyCount: number;
      scoredBuys: number;
      winRate: number | null;
      avgBuyReturnPct: number | null;
    };
    statsCoverage?: { returnsNote: string | null };
    trades: ProfileTrade[];
  } | null;
}
interface ProfileTrade {
  side: "BUY" | "SELL";
  returnPct: number | null;
  transactionDate: string;
}

/** Brief §6.1: "return on their disclosed purchases over the TRAILING period".
 *  The period is the trailing 12 months; when an insider has no priced buy
 *  inside it the card falls back to all disclosed buys and says so. */
const TRAILING_MONTHS = 12;

const METHOD_NOTE =
  "Average return of this insider's disclosed open-market purchases (SEC Form 4, code P) over the trailing 12 months, measured against the live share price. Historical, not a projection. Full method and every underlying trade on the profile page.";

/** Average return over the priced buys filed in the trailing window — or, if
 *  there are none, over every priced buy on record (`window: "all"`). */
function trailingReturn(
  trades: ProfileTrade[],
): { ret: number; n: number; wins: number; window: "trailing" | "all" } | null {
  const priced = trades.filter((t) => t.side === "BUY" && t.returnPct != null);
  if (!priced.length) return null;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - TRAILING_MONTHS);
  const recent = priced.filter((t) => new Date(t.transactionDate) >= cutoff);
  const set = recent.length ? recent : priced;
  const ret = set.reduce((a, t) => a + (t.returnPct as number), 0) / set.length;
  return {
    ret: +ret.toFixed(2),
    n: set.length,
    wins: set.filter((t) => (t.returnPct as number) > 0).length,
    window: recent.length ? "trailing" : "all",
  };
}

function initials(name: string): string {
  const words = name.replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export function InsiderCard({
  filerName,
  name,
  title,
  company,
  photo,
  size = "marquee",
  variant = "full",
}: InsiderCardProps & {
  /** "photo": portrait + name only — no role line, no performance stat, no
   *  method tooltip, and no profile fetch (Faizan, 2026-09-10: the subscribe
   *  marquee should be pictures, not data). "full" is the original card. */
  variant?: "full" | "photo";
}) {
  const photoOnly = variant === "photo";
  const [photoBroken, setPhotoBroken] = useState(false);
  // No hand-placed photo → ask the portrait service (Wikipedia, verified
  // against the filer's companies) so a card never has to show initials
  // when a public photo exists.
  const { data: portrait } = useSWR<{ portrait: { url: string } | null }>(
    photo ? null : `${API_BASE}/content/insider-portrait?name=${encodeURIComponent(filerName)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 },
  );
  const photoSrc = photo || portrait?.portrait?.url || null;
  const { data, error } = useSWR<ProfileStats>(
    photoOnly ? null : `${API_BASE}/insiders/profile?name=${encodeURIComponent(filerName)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );

  const perf = data?.profile ? trailingReturn(data.profile.trades ?? []) : null;
  const ret = perf?.ret ?? null;
  const loading = !data && !error;
  const showPhoto = !!photoSrc && !photoBroken;

  // Stat line states: loading / API unreachable → dash (never a claim we can't
  // back), live figure, or the honest "not measurable" when the profile
  // exists but has no priced open-market buy.
  let statText: string;
  let statTone: "up" | "down" | "flat" = "flat";
  if (loading || error || !data?.profile) statText = "—";
  else if (ret == null) statText = "No measurable open-market buys";
  else {
    statTone = ret > 0 ? "up" : ret < 0 ? "down" : "flat";
    statText = `${ret > 0 ? "+" : ""}${ret.toFixed(2)}%`;
  }

  return (
    <Link
      href={`/insiders/${encodeURIComponent(filerName)}`}
      className={`ibc ibc-${size} ibc-${photoOnly ? "flat ibc-photo" : statTone}`}
      title={photoOnly ? undefined : METHOD_NOTE}
      aria-label={photoOnly ? `${name}, ${title}, ${company}` : `${name}, ${title}, ${company}. Return on disclosed buys: ${statText}.`}
    >
      <div className="ibc-frame">
        {showPhoto ? (
          <img
            src={photoSrc as string}
            alt={name}
            loading="lazy"
            onError={() => setPhotoBroken(true)}
          />
        ) : (
          <span className="ibc-initials" aria-hidden="true">
            {initials(name)}
          </span>
        )}
      </div>
      <div className="ibc-body">
        <b className="ibc-name">{name}</b>
        {!photoOnly && (
          <span className="ibc-role">
            {title} · {company}
          </span>
        )}
        {!photoOnly && (
        <div className="ibc-stat" aria-live="polite">
          <span className="ibc-stat-label">
            Return on disclosed buys · {perf?.window === "all" ? "all time" : `last ${TRAILING_MONTHS} mo`}
          </span>
          <span className={`ibc-stat-value ${ret == null && !loading ? "ibc-stat-none" : ""}`}>
            {statText}
          </span>
          {perf && (
            <span className="ibc-stat-sub">
              {perf.n} {perf.n === 1 ? "buy" : "buys"} · {perf.wins}/{perf.n} in profit · vs. live price
            </span>
          )}
        </div>
        )}
      </div>
      <span className="ibc-mark" aria-hidden="true">
        IB
      </span>
    </Link>
  );
}

/** Styles are exported so the host page can inline them alongside its own
 *  scoped CSS (the subscribe page ships one <style> block). Tokens follow the
 *  brief's palette rather than the page theme on purpose: a trading card
 *  keeps its navy in light mode too — that IS the design. */
export const INSIDER_CARD_CSS = `
.ibc {
  --ibc-navy: #0A1E3C; --ibc-navy-2: #0E2A52; --ibc-gold: #C9A227; --ibc-green: #0E9F6E;
  --ibc-red: #D9534F; --ibc-ink: #F5F7FA; --ibc-dim: rgba(245,247,250,0.66);
  position: relative; display: flex; flex-direction: column; gap: 14px;
  background:
    radial-gradient(180px 140px at 100% 0%, rgba(201,162,39,0.16), transparent 70%),
    linear-gradient(165deg, var(--ibc-navy-2), var(--ibc-navy));
  border: 1px solid rgba(201,162,39,0.38); border-radius: 16px; padding: 16px;
  color: var(--ibc-ink); text-decoration: none; flex: 0 0 auto;
  box-shadow: 0 18px 40px rgba(3,10,22,0.35), inset 0 0 0 1px rgba(255,255,255,0.03);
  transition: transform .15s, border-color .15s;
}
.ibc:hover, .ibc:focus-visible { transform: translateY(-3px); border-color: var(--ibc-gold); outline: none; }
.ibc:focus-visible { box-shadow: 0 0 0 3px rgba(201,162,39,0.55), 0 18px 40px rgba(3,10,22,0.35); }
.ibc-marquee { width: 260px; }
.ibc-compact { width: 220px; }
/* Gold accent frame around the portrait (brief §6.1). */
/* The frame keeps the house portrait ratio (500x620), so a house-cropped
   photo shows in full — no face cut off (client 2026-08-28: "sari image
   aise rakho full aye"). */
.ibc-frame {
  position: relative; border-radius: 12px; overflow: hidden; flex: 0 0 auto; aspect-ratio: 500 / 620;
  border: 2px solid var(--ibc-gold); box-shadow: 0 0 0 1px rgba(201,162,39,0.35), inset 0 0 0 1px rgba(10,30,60,0.6);
  background: linear-gradient(180deg, #16345f, #0A1E3C); display: grid; place-items: center;
}
.ibc-compact .ibc-frame { aspect-ratio: 1 / 1; flex: 0 0 auto; }
.ibc-frame img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.ibc-initials {
  font-family: var(--font-heading), sans-serif; font-weight: 900; font-size: 52px;
  letter-spacing: 0.04em; color: var(--ibc-gold); opacity: 0.9;
}
.ibc-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ibc-name { font-size: 17px; font-weight: 800; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ibc-role { font-size: 12px; color: var(--ibc-dim); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Mono stat line (brief §6.1). */
.ibc-stat { margin-top: 8px; padding-top: 9px; border-top: 1px solid rgba(201,162,39,0.28); font-family: var(--font-mono); }
.ibc-stat-label { display: block; font-size: 9.5px; letter-spacing: 1.6px; text-transform: uppercase; color: var(--ibc-gold); }
.ibc-stat-value { display: block; font-size: 24px; font-weight: 700; line-height: 1.1; margin-top: 2px; color: var(--ibc-ink); letter-spacing: -0.01em; }
.ibc-up .ibc-stat-value { color: #3FD68F; }
.ibc-down .ibc-stat-value { color: #FF7B73; }
.ibc-stat-none { font-size: 12px; font-weight: 500; color: var(--ibc-dim); line-height: 1.35; white-space: normal; }
.ibc-stat-sub { display: block; font-size: 10.5px; color: var(--ibc-dim); margin-top: 3px; letter-spacing: 0.2px; }
.ibc-mark {
  position: absolute; top: 10px; right: 12px; font-family: var(--font-heading), sans-serif;
  font-weight: 900; font-size: 11px; letter-spacing: 1.5px; color: rgba(201,162,39,0.55);
}
/* Light theme (client 2026-08-28: "light mode pe white hona chahiye") — the
   card goes white with navy type; the gold frame and mono stat stay. */
:root[data-theme="light"] .ibc {
  --ibc-navy: #FFFFFF; --ibc-navy-2: #F7F9FC; --ibc-ink: #0E1F35; --ibc-dim: rgba(14,31,53,0.62);
  border-color: rgba(201,162,39,0.55);
  box-shadow: 0 18px 40px rgba(14,31,53,0.12), inset 0 0 0 1px rgba(255,255,255,0.6);
}
:root[data-theme="light"] .ibc-frame { background: linear-gradient(180deg, #EEF2F7, #DDE4EE); box-shadow: 0 0 0 1px rgba(201,162,39,0.3); }
:root[data-theme="light"] .ibc-initials { color: #0A1E3C; opacity: 0.85; }
:root[data-theme="light"] .ibc-stat { border-top-color: rgba(201,162,39,0.4); }
:root[data-theme="light"] .ibc-stat-label { color: #9C7B12; }
:root[data-theme="light"] .ibc-up .ibc-stat-value { color: #0E9F6E; }
:root[data-theme="light"] .ibc-down .ibc-stat-value { color: #C8423A; }
:root[data-theme="light"] .ibc-mark { color: rgba(156,123,18,0.6); }
@media (prefers-reduced-motion: reduce) { .ibc { transition: none; } .ibc:hover { transform: none; } }
@media (max-width: 640px) {
  .ibc-marquee { width: 205px; padding: 12px; }
  .ibc-name { font-size: 15px; }
  .ibc-stat-value { font-size: 20px; }
  .ibc-initials { font-size: 40px; }
}
`;

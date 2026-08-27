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
  } | null;
}

const METHOD_NOTE =
  "Average return of this insider's disclosed open-market purchases (SEC Form 4, code P) measured against the live share price. Historical, not a projection. Full method and every underlying trade on the profile page.";

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
}: InsiderCardProps) {
  const [photoBroken, setPhotoBroken] = useState(false);
  const { data, error } = useSWR<ProfileStats>(
    `${API_BASE}/insiders/profile?name=${encodeURIComponent(filerName)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );

  const stats = data?.profile?.stats;
  const ret = stats?.avgBuyReturnPct ?? null;
  const loading = !data && !error;
  const showPhoto = !!photo && !photoBroken;

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
      className={`ibc ibc-${size} ibc-${statTone}`}
      title={METHOD_NOTE}
      aria-label={`${name}, ${title}, ${company}. Return on disclosed buys: ${statText}.`}
    >
      <div className="ibc-frame">
        {showPhoto ? (
          <img
            src={photo as string}
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
        <span className="ibc-role">
          {title} · {company}
        </span>
        <div className="ibc-stat" aria-live="polite">
          <span className="ibc-stat-label">Return on disclosed buys</span>
          <span className={`ibc-stat-value ${ret == null && !loading ? "ibc-stat-none" : ""}`}>
            {statText}
          </span>
          {stats && ret != null && (
            <span className="ibc-stat-sub">
              {stats.scoredBuys} {stats.scoredBuys === 1 ? "buy" : "buys"}
              {stats.winRate != null ? ` · ${stats.winRate}% in profit` : ""} · vs. live price
            </span>
          )}
        </div>
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
.ibc-marquee { width: 260px; height: 320px; }
.ibc-compact { width: 220px; }
/* Gold accent frame around the portrait (brief §6.1). */
.ibc-frame {
  position: relative; border-radius: 12px; overflow: hidden; flex: 1 1 auto; min-height: 0;
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
@media (prefers-reduced-motion: reduce) { .ibc { transition: none; } .ibc:hover { transform: none; } }
@media (max-width: 640px) {
  .ibc-marquee { width: 205px; height: 268px; padding: 12px; }
  .ibc-name { font-size: 15px; }
  .ibc-stat-value { font-size: 20px; }
  .ibc-initials { font-size: 40px; }
}
`;

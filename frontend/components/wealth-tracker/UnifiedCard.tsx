"use client";
import Link from "next/link";
import { useState } from "react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { BadgeChips, GradeChip } from "./Badges";
import { TenDots } from "./LastTenStrip";
import type { BadgeKey, Grade } from "./types";

/**
 * One card anatomy for every insider type (Brief v7 §4.1): photo/name/role ·
 * Performance Grade + badges · headline return stat (type-appropriate,
 * labelled) · last-10 dot strip · top 3 current holdings with logos ·
 * '+N more' into the full profile. A and above carries the gold ring.
 */
export interface UnifiedCardData {
  type: "corporate" | "congress" | "investor";
  key: string;
  href: string;
  name: string;
  subtitle: string;
  photoUrl: string | null;
  grade: Grade | null;
  gradePct: number | null;
  building: boolean;
  sampleNote: string;
  headline: { label: string; pct: number | null; est: boolean; sub: string | null };
  last10: Array<{ side: "buy" | "sell"; ret: number | null }>;
  topHoldings: Array<{ ticker: string; name: string }>;
  moreHoldings: number;
  activity12m: number;
  badges: BadgeKey[];
  categories: string[];
}

export const TYPE_LABEL: Record<UnifiedCardData["type"], string> = {
  corporate: "Corporate insider",
  congress: "Congress",
  investor: "Fund / investor",
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("");
}

export function UnifiedCard({ c }: { c: UnifiedCardData }) {
  const [imgFailed, setImgFailed] = useState(false);
  const gold = c.grade === "A+" || c.grade === "A";
  const pct = c.headline.pct;
  const tone = pct == null ? "var(--text-mute)" : pct >= 0 ? "#10B981" : "#EF4444";
  return (
    <article
      className="card p-4 flex flex-col gap-3 relative"
      style={{ minHeight: 256, border: gold ? "1px solid rgba(201,162,39,0.55)" : undefined, boxShadow: gold ? "0 0 0 1px rgba(201,162,39,0.25)" : undefined }}
    >
      <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        {TYPE_LABEL[c.type]}
      </span>
      <header className="flex items-center gap-3 pr-20">
        <Link href={c.href} className="flex-shrink-0">
          {c.photoUrl && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.photoUrl}
              alt={c.name}
              width={48}
              height={48}
              onError={() => setImgFailed(true)}
              className="rounded-full object-cover"
              style={{ width: 48, height: 48, border: `2px solid ${gold ? "#C9A227" : "var(--accent)"}`, background: "var(--bg-3)" }}
            />
          ) : (
            <span
              className="inline-flex items-center justify-center rounded-full font-bold"
              style={{ width: 48, height: 48, background: "var(--accent-soft)", color: "var(--accent)", border: `2px solid ${gold ? "#C9A227" : "transparent"}` }}
            >
              {initials(c.name)}
            </span>
          )}
        </Link>
        <div className="min-w-0">
          <Link href={c.href} className="block font-bold text-[14.5px] leading-tight truncate hover:text-accent transition" title={c.name}>
            {c.name}
          </Link>
          <div className="text-[11.5px] leading-tight mt-0.5 truncate" style={{ color: "var(--text-mute)" }} title={c.subtitle}>
            {c.subtitle}
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <GradeChip grade={c.grade} size={30} building={c.building} />
        {c.grade ? (
          <span className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-mute)" }} title={c.sampleNote}>
            Performance Grade
          </span>
        ) : (
          <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
            {c.sampleNote}
          </span>
        )}
        {c.badges.length ? <BadgeChips badges={c.badges} max={2} /> : null}
      </div>

      <div>
        <div className="text-[10.5px] uppercase tracking-wider font-bold" style={{ color: "var(--text-mute)" }}>
          {c.headline.label}
          {c.headline.est ? " · est." : ""}
        </div>
        <div className="text-[20px] font-bold tabular leading-tight" style={{ color: tone }}>
          {pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
        </div>
        {c.headline.sub ? (
          <div className="text-[11px] truncate" style={{ color: "var(--text-mute)" }} title={c.headline.sub}>
            {c.headline.sub}
          </div>
        ) : null}
      </div>

      {c.last10.length ? (
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-mute)" }}>
          <TenDots dots={c.last10} href={c.href} size={8} />
          <span>last 10</span>
        </div>
      ) : null}

      <div className="flex items-center gap-2 mt-auto min-h-[26px]">
        {c.topHoldings.map((h) => (
          <Link key={h.ticker} href={`/companies/${encodeURIComponent(h.ticker)}`} title={h.name} className="flex items-center gap-1">
            <CompanyLogo ticker={h.ticker} name={h.name} size={24} />
            <span className="font-mono text-[11px] font-semibold">{h.ticker}</span>
          </Link>
        ))}
        {c.moreHoldings > 0 ? (
          <Link href={c.href} className="ml-auto text-[11.5px] font-semibold text-accent whitespace-nowrap">
            +{c.moreHoldings} more
          </Link>
        ) : null}
      </div>
    </article>
  );
}

"use client";
import Link from "next/link";
import { CqsGradeBadge, gradeOf } from "./CqsScoreCell";
import { PremiumValue, UnlockCta } from "./premium/PremiumValue";

/**
 * The Congress Quality Score decomposed — Brief v9 §9 P2's acceptance test is
 * "every score decomposes to its evidence", so this is the page that has to
 * hold up. Each of the eight components shows what it scored, what it is worth
 * in the total, and what it was reading.
 *
 * The multipliers are shown in three states, not two: applied, checked and not
 * triggered, and NOT CHECKED. A multiplier we cannot compute yet (the
 * legislative calendar, average daily volume) must not render as a grey pill
 * that reads "we looked and it did not fire".
 */

export interface CqsScoreCard {
  cqs: number | string | null;
  grade: string;
  isGoldRing: boolean;
  c1ClusterBreadth: number | string | null;
  c2PositionSize: number | string | null;
  c3CommitteeInfluence: number | string | null;
  c4ContractAlignment: number | string | null;
  c5BuyerTrackRecord: number | string | null;
  c6RelativeConviction: number | string | null;
  c7Freshness: number | string | null;
  c8NetDirection: number | string | null;
  multiplierInsiderOverlap?: number | string | null;
  multiplierLegislativeCatalyst?: number | string | null;
  multiplierContrarianEntry?: number | string | null;
  multiplierLiquidityNorm?: number | string | null;
  multiplierFilingLag?: number | string | null;
  multipliersUnavailable?: string[] | null;
  distinctMembers?: number;
  isBipartisan?: boolean;
  totalEstBuyValue?: number | string | null;
  largestSingleBand?: string | null;
  committees?: string[] | null;
  highestRole?: string | null;
  buyers?: Array<{
    name: string;
    party: string | null;
    grade: string | null;
    estValue: number;
  }> | null;
  lastBuyDate?: string | null;
  hasLateFiling?: boolean;
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const fmtBig = (v: number): string =>
  v >= 1e9
    ? `$${(v / 1e9).toFixed(2)}B`
    : v >= 1e6
      ? `$${(v / 1e6).toFixed(1)}M`
      : v >= 1e3
        ? `$${(v / 1e3).toFixed(0)}K`
        : `$${Math.round(v)}`;

export function CqsBreakdownCard({ score }: { score: CqsScoreCard }) {
  const cqs = n(score.cqs);
  const unavailable = new Set(score.multipliersUnavailable || []);

  const components = [
    {
      label: "Cluster breadth",
      val: n(score.c1ClusterBreadth),
      weight: 20,
      desc: `${score.distinctMembers ?? 0} distinct ${
        (score.distinctMembers ?? 0) === 1 ? "member" : "members"
      }${score.isBipartisan ? ", bipartisan" : ""}`,
    },
    {
      label: "Position size",
      val: n(score.c2PositionSize),
      weight: 15,
      desc: score.largestSingleBand
        ? `Largest band ${score.largestSingleBand}`
        : "Disclosure band floors, per member",
    },
    {
      label: "Committee influence",
      val: n(score.c3CommitteeInfluence),
      weight: 15,
      desc: score.committees?.length
        ? `${score.committees[0]}${score.highestRole ? ` · ${score.highestRole}` : ""}`
        : "No buyer sits on a committee with jurisdiction here",
    },
    {
      label: "Contract alignment",
      val: n(score.c4ContractAlignment),
      weight: 15,
      desc: "Federal awards from agencies the buyers oversee",
    },
    {
      label: "Buyer track record",
      val: n(score.c5BuyerTrackRecord),
      weight: 12,
      desc: "Performance Grades of the buyers, weighted by dollars",
    },
    {
      label: "Relative conviction",
      val: n(score.c6RelativeConviction),
      weight: 8,
      desc: "This buy against the member's own median trade",
    },
    {
      label: "Freshness",
      val: n(score.c7Freshness),
      weight: 10,
      desc: "Decay from the transaction date",
    },
    {
      label: "Net direction",
      val: n(score.c8NetDirection),
      weight: 5,
      desc: "Member buying against member selling in the window",
    },
  ];

  /**
   * The API withholds the score and its components from a reader without a
   * subscription (George 2026-09-24), so an absent `cqs` means "not entitled",
   * not "zero". Rendering the bars anyway would draw eight components at 0 and
   * five adjustments reading "checked, did not apply" — a page of confident,
   * fabricated findings. The grade is free and stays; everything derived from
   * the withheld numbers is replaced by the unlock.
   */
  const withheld = score.cqs == null;

  const multipliers = [
    { key: "insiderOverlap", label: "Insider overlap", value: n(score.multiplierInsiderOverlap ?? 1), up: true },
    { key: "legislativeCatalyst", label: "Legislative catalyst", value: n(score.multiplierLegislativeCatalyst ?? 1), up: true },
    { key: "contrarianEntry", label: "Contrarian entry", value: n(score.multiplierContrarianEntry ?? 1), up: true },
    { key: "liquidityNorm", label: "Liquidity normalisation", value: n(score.multiplierLiquidityNorm ?? 1), up: false },
    { key: "filingLag", label: "Filing-lag dampener", value: n(score.multiplierFilingLag ?? 1), up: false },
  ];

  return (
    <div
      className="card p-5"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex items-start justify-between gap-4 pb-4 mb-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <h3 className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
            Congress Quality Score
          </h3>
          <p className="text-[12px] text-mute mt-0.5">
            How strong the congressional buying signal on this stock is, over the last 90 days.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <PremiumValue label="Congress Quality Score">
            <span className="tabular text-[26px] font-bold leading-none" style={{ color: "var(--accent)" }}>
              {Math.round(cqs)}
            </span>
          </PremiumValue>
          <CqsGradeBadge grade={score.grade || gradeOf(cqs)} isGoldRing={score.isGoldRing} size="md" />
        </div>
      </div>

      {withheld ? (
        <div
          className="rounded-lg px-4 py-5 text-center"
          style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            The grade is free. The score behind it is part of Insider Access.
          </p>
          <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: "var(--text-mute)" }}>
            Eight weighted components — cluster breadth, position size, committee
            jurisdiction, federal contract alignment, the buyers&rsquo; own track
            records — and the adjustments applied on top of them.
          </p>
          <UnlockCta label="the Congress Quality Score" className="mt-3" />
        </div>
      ) : (
      <div className="space-y-2.5">
        {components.map((c) => (
          <div key={c.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>
                {c.label}
                <span className="text-mute font-normal"> · {c.weight}%</span>
              </span>
              <span className="tabular text-[12px] text-mute">{Math.round(c.val)}</span>
            </div>
            <div
              className="h-1.5 rounded-full mt-1 overflow-hidden"
              style={{ background: "var(--bg-3)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, c.val))}%`,
                  background: c.val > 0 ? "var(--accent)" : "var(--border-strong)",
                }}
              />
            </div>
            <p className="text-[11px] text-mute mt-1 leading-snug">{c.desc}</p>
          </div>
        ))}
      </div>
      )}

      <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)", display: withheld ? "none" : undefined }}>
        <p className="text-[11px] uppercase tracking-wider font-bold text-mute mb-2">
          Signal adjustments
        </p>
        <div className="flex flex-wrap gap-1.5">
          {multipliers.map((m) => {
            const notChecked = unavailable.has(m.key);
            const applied = !notChecked && m.value !== 1;
            const color = notChecked
              ? "var(--text-faint)"
              : applied
                ? m.up
                  ? "var(--good)"
                  : "var(--bad)"
                : "var(--text-mute)";
            return (
              <span
                key={m.key}
                className="inline-flex items-center gap-1 px-2 h-[22px] rounded-full text-[10.5px] font-semibold"
                style={{ color, border: `1px solid ${color}`, opacity: notChecked ? 0.6 : 1 }}
                title={
                  notChecked
                    ? `${m.label}: we do not have the input for this stock yet, so it was not applied either way.`
                    : applied
                      ? `${m.label} applied: ×${m.value.toFixed(2)}.`
                      : `${m.label}: checked, did not apply.`
                }
              >
                {m.label}
                <span className="tabular">
                  {notChecked ? "n/a" : applied ? `×${m.value.toFixed(2)}` : "—"}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {score.buyers?.length ? (
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-[11px] uppercase tracking-wider font-bold text-mute mb-2">
            Who bought{" "}
            {n(score.totalEstBuyValue) > 0 && (
              <span className="normal-case tracking-normal font-normal">
                · {fmtBig(n(score.totalEstBuyValue))} est.
              </span>
            )}
          </p>
          <ul className="space-y-1.5">
            {score.buyers.slice(0, 6).map((b) => (
              <li key={b.name} className="flex items-center justify-between gap-3 text-[12px]">
                <Link
                  href={`/insiders/${encodeURIComponent(b.name)}`}
                  className="font-semibold hover:text-accent truncate"
                  style={{ color: "var(--text)" }}
                >
                  {b.name}
                  {b.party ? <span className="text-mute font-normal"> ({b.party.charAt(0)})</span> : null}
                </Link>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {b.grade && (
                    <PremiumValue label="Buyer grades">
                      <span className="text-[10.5px] font-bold text-mute">Grade {b.grade}</span>
                    </PremiumValue>
                  )}
                  <span className="tabular text-mute">{fmtBig(b.estValue)} est.</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[11px] text-mute leading-relaxed mt-4">
        Built from Periodic Transaction Reports filed under the STOCK Act. Dollar figures are
        estimates: PTRs report ranges, not amounts. Nothing here implies impropriety.
        {score.hasLateFiling
          ? " One or more of these filings arrived after the 45-day statutory deadline; that is shown, never scored."
          : ""}
      </p>
    </div>
  );
}

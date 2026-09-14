"use client";
import useSWR from "swr";
import { useState } from "react";
import { Landmark } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { CtsScoreCell } from "./CtsScoreCell";
import { EvidenceChain } from "./EvidenceChain";

/**
 * Brief v5 §4 — "Per-politician module: On existing congress profile pages:
 * 'Contract proximity' section listing that member's flags with evidence
 * links."
 *
 * Renders nothing when the member has no verified rows, which is the case for
 * the overwhelming majority of members. An empty "Contract proximity" heading
 * on a named politician's page would read as an absence of something expected
 * rather than the ordinary state it is.
 *
 * The API serves only rows the Stage 5 agent has verified, so there is no
 * client-side filtering here to get that wrong.
 */

interface Row {
  id: number;
  member: string;
  ticker: string;
  company: string | null;
  agency: string;
  awardValue: number;
  awardDate: string | null;
  tradeDate: string | null;
  tradeAction: string | null;
  committee: string;
  role: string;
  score: number | null;
  components: Record<string, number | null>;
  headline: string;
  evidence: any;
}

function money(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
  return `$${Math.round(v).toLocaleString()}`;
}

/** §5: "Every date shown distinguishes transaction date vs. disclosure date." */
function day(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? String(v).slice(0, 10)
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function CongressProximityPanel({ name }: { name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const { data } = useSWR<{ rows: Row[]; frame: string; amountNote: string }>(
    name ? `${API_BASE}/congress-trades/member/${encodeURIComponent(name)}` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (!data?.rows?.length) return null;

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-bold m-0 mb-1">
        <Landmark size={16} style={{ color: "var(--accent)" }} />
        Contract proximity
      </h2>
      <p className="text-[12.5px] leading-relaxed m-0 mb-3" style={{ color: "var(--text-soft)" }}>
        Where a disclosed trade by this member sits alongside a federal contract awarded by an agency their committee
        has jurisdiction over. Open any row for the filing, the committee record and the award.
      </p>

      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        {data.rows.map((r) => (
          <li key={r.id}>
            <div
              className="rounded-lg p-3 flex flex-wrap items-center gap-x-4 gap-y-1.5"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
            >
              <CtsScoreCell score={r.score} components={r.components} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold" style={{ color: "var(--text)" }}>
                  {r.ticker}
                  {r.company ? <span className="ml-1.5 font-normal text-mute">{r.company}</span> : null}
                </span>
                <span className="block text-[11.5px]" style={{ color: "var(--text-mute)" }}>
                  {r.agency} · {money(r.awardValue)} on {day(r.awardDate)}
                </span>
              </span>
              <span className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-soft)" }}>
                {r.tradeAction || "Holding"} {r.tradeDate ? day(r.tradeDate) : ""}
              </span>
              <button
                onClick={() => setOpen(open === r.id ? null : r.id)}
                className="text-[12px] font-semibold text-accent hover:underline whitespace-nowrap"
              >
                {open === r.id ? "Hide" : "Evidence"}
              </button>
            </div>
            {open === r.id ? <EvidenceChain row={r} onClose={() => setOpen(null)} /> : null}
          </li>
        ))}
      </ul>

      {/* §5: the standing frame travels with the rows, not just with the
          leaderboard, because this module names a single politician. */}
      <p className="text-[11px] leading-relaxed mt-3 m-0" style={{ color: "var(--text-mute)" }}>
        {data.frame}
      </p>
    </section>
  );
}

"use client";

/**
 * §3.4 "Insider Intelligence: ownership %, IQS badge, recent notable buys and
 * sells, link to full profile. (The funnel — always prominent for listed
 * companies.)"
 *
 * One component, four products. It is the only place in the suite that knows
 * how insider data is shaped, so a change to the moat's presentation lands in
 * Goldminer, Biotech, Gov Contracts and Prediction Markets at once.
 *
 * Gating follows §12 Q4's recommendation — the visual and the basic panel are
 * free, the full insider read is Premium: ownership and 90-day net flow show
 * for everyone, the IQ Score and the named transactions are behind the wall.
 */

import Link from "next/link";
import useSWR from "swr";
import { Lock } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { SUBSCRIBE_HREF } from "@/lib/funnel";
import { usePremium } from "@/components/premium/PremiumContext";
import { fmtUsd, fmtDate } from "@/lib/visualizers/format";
import { Cell, Row, Section } from "./DetailPanel";

interface Snapshot {
  ticker: string;
  name: string | null;
  marketCap: number | null;
  price: number | null;
  insiderOwnershipPct: number | null;
  netBuys90d: number | null;
  netSells90d: number | null;
  iqsScore: number | null;
  notable: { who: string; role: string | null; date: string; value: number; side: "buy" | "sell" }[];
  covered: boolean;
}

export function InsiderIntelligence({ ticker }: { ticker: string | null }) {
  const { unlocked } = usePremium();
  const { data } = useSWR<Snapshot>(
    ticker ? `${API_BASE}/visualizers/insider/${encodeURIComponent(ticker)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );

  if (!ticker) return null;

  if (data && !data.covered) {
    return (
      <Section title="Insider Intelligence">
        <p className="viz-about">
          {ticker} is not in our Form 4 coverage universe yet, so there is no insider record to
          show. Coverage follows SEC filers; foreign private issuers and non-US listings file
          elsewhere.
        </p>
      </Section>
    );
  }

  const net = (data?.netBuys90d ?? 0) - (data?.netSells90d ?? 0);
  const iqs = data?.iqsScore;

  return (
    <Section title="Insider Intelligence">
      <div className="viz-grid" data-cols="3">
        <Cell
          label="Insider own."
          value={
            data?.insiderOwnershipPct != null ? `${data.insiderOwnershipPct.toFixed(1)}%` : "—"
          }
        />
        <Cell
          label="Net 90d"
          value={data ? fmtUsd(net) : "—"}
          color={net > 0 ? "var(--viz-good)" : net < 0 ? "var(--viz-bad)" : undefined}
        />
        <div className="viz-cell">
          <div className="viz-lbl">Insider Score</div>
          {unlocked ? (
            <div
              className="viz-val"
              style={{ color: (iqs ?? 0) >= 80 ? "var(--viz-good)" : undefined }}
            >
              {iqs != null ? Math.round(iqs) : "—"}
              {iqs != null && <span className="viz-val-sub">/100</span>}
            </div>
          ) : (
            <Link
              href={SUBSCRIBE_HREF}
              className="viz-val"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--viz-accent)" }}
              aria-label="Unlock the Insider Score"
            >
              <span style={{ filter: "blur(4px)" }}>88</span>
              <Lock size={12} strokeWidth={2.5} />
            </Link>
          )}
        </div>
      </div>

      <div style={{ height: 12 }} />

      {unlocked ? (
        data?.notable?.length ? (
          <div className="viz-rows">
            {data.notable.slice(0, 4).map((n, i) => (
              <Row
                key={`${n.who}-${n.date}-${i}`}
                k={
                  <>
                    {n.who}
                    {n.role ? <span style={{ opacity: 0.6 }}> · {n.role}</span> : null}
                  </>
                }
                v={
                  <span style={{ color: n.side === "buy" ? "var(--viz-good)" : "var(--viz-bad)" }}>
                    {n.side === "buy" ? "+" : "−"}
                    {fmtUsd(n.value)} · {fmtDate(n.date)}
                  </span>
                }
              />
            ))}
          </div>
        ) : (
          <p className="viz-about">No open-market Form 4 activity in the last 90 days.</p>
        )
      ) : (
        <Link
          href={SUBSCRIBE_HREF}
          style={{
            display: "block",
            padding: "11px 12px",
            borderRadius: 9,
            border: "1px dashed var(--viz-line)",
            fontSize: 12.3,
            color: "var(--viz-soft)",
            textDecoration: "none",
          }}
        >
          <b style={{ color: "var(--viz-accent)" }}>Unlock the named filings</b> — who bought, what
          role, how much, and when, straight from the Form 4s.
        </Link>
      )}

      <div className="viz-cta">
        <Link href={`/companies/${encodeURIComponent(ticker)}`} data-primary="1">
          {ticker} insider profile
        </Link>
        <Link href={SUBSCRIBE_HREF}>Premium</Link>
      </div>
    </Section>
  );
}

"use client";
import useSWR from "swr";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";

interface PolRow {
  name: string;
  party: string | null;
  chamber: string | null;
  state: string | null;
  committees: string[];
  photoUrl: string | null;
  portfolioValue: number;
  buys: number;
  sells: number;
  trades: number;
  lastTraded: string | null;
  profitableBuys: number;
  scoredBuys: number;
  winRate: number | null;
  avgReturn: number | null;
  topHoldings: { ticker: string; company: string }[];
}

function partyMeta(p: string | null) {
  const c = (p || "").charAt(0).toUpperCase();
  if (c === "D") return { label: "Democrat", color: "#1e40af", soft: "rgba(30,64,175,0.12)" };
  if (c === "R") return { label: "Republican", color: "#b91c1c", soft: "rgba(185,28,28,0.12)" };
  if (c === "I") return { label: "Independent", color: "#7c3aed", soft: "rgba(124,58,237,0.12)" };
  return { label: "—", color: "var(--text-mute)", soft: "var(--bg-3)" };
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * QuiverQuant-style congressional leaderboard: every member who has disclosed
 * a trade, with party colour, title, committees, disclosed-portfolio value,
 * win rate / average return on their buys, profitable-buy count, top holdings
 * and a headshot set over an American-flag backdrop.
 */
export function PoliticiansLeaderboard() {
  const { data, isLoading } = useSWR<{ rows: PolRow[] }>(
    `${API_BASE}/congressional-trades/top-politicians?limit=100`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30 * 60_000 },
  );
  const rows = data?.rows || [];

  return (
    <div className="w-full">
      {/* Flag backdrop CSS — subtle red/white stripes + a blue star canton. */}
      <style>{`
        .flag-frame { position: relative; border-radius: 14px; overflow: hidden; background:
          repeating-linear-gradient(180deg, #b22234 0 8px, #ffffff 8px 16px); }
        .flag-frame::before { content:""; position:absolute; inset:0; background:
          linear-gradient(135deg, rgba(10,35,102,0.92) 0 46%, rgba(10,35,102,0) 46%); }
        .flag-frame::after { content:""; position:absolute; inset:0; background:
          radial-gradient(circle at 18% 22%, rgba(255,255,255,0.9) 0 1px, transparent 1.5px) 0 0/13px 13px; opacity:.5; mix-blend-mode:screen; }
      `}</style>

      <header className="mb-5">
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Landmark className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Congress Trading</span>
        </div>
        <h1 className="text-[28px] sm:text-[38px] font-semibold tracking-tight" style={{ letterSpacing: "-0.6px" }}>
          Politician Trading Performance
        </h1>
        <p className="text-mute text-[14px] mt-2 max-w-3xl leading-relaxed">
          U.S. House and Senate members — plus the President and his family — ranked by their
          disclosed equity trading under the STOCK Act. Party, committee seats, disclosed-portfolio
          value, win rate and top holdings, from public filings.
        </p>
      </header>

      {isLoading && rows.length === 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card h-40 shimmer rounded-2xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center text-mute">No disclosures on file yet.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((r, i) => {
            const pm = partyMeta(r.party);
            const title = [r.chamber, r.state].filter(Boolean).join(" · ");
            return (
              <Link
                key={r.name + i}
                href={`/politicians/${encodeURIComponent(r.name)}`}
                className="card p-4 sm:p-5 flex gap-4 hover:border-[var(--accent)] transition"
              >
                {/* Headshot over the flag */}
                <div className="flag-frame flex-shrink-0" style={{ width: 84, height: 84 }}>
                  <div className="absolute inset-0 flex items-end justify-center">
                    <PoliticianAvatar name={r.name} photoUrl={r.photoUrl} party={r.party} size={78} />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[16px] font-bold truncate">{r.name}</span>
                    <span className="text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                      style={{ background: pm.soft, color: pm.color }}>
                      {pm.label}
                    </span>
                  </div>
                  <div className="text-[12.5px] text-mute mt-0.5">{title || "U.S. Congress"}</div>
                  {r.committees.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {r.committees.map((c) => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded truncate max-w-[180px]"
                          style={{ background: "var(--bg-3)", color: "var(--text-soft)" }} title={c}>
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <Stat label="Disclosed portfolio" value={r.portfolioValue > 0 ? formatCurrency(r.portfolioValue) : "—"} />
                    <Stat
                      label="Win rate"
                      value={r.winRate == null ? "—" : `${r.winRate}%`}
                      tone={r.winRate == null ? undefined : r.winRate >= 50 ? "var(--good)" : "var(--bad)"}
                    />
                    <Stat
                      label="Avg return"
                      value={r.avgReturn == null ? "—" : `${r.avgReturn >= 0 ? "+" : ""}${r.avgReturn}%`}
                      tone={r.avgReturn == null ? undefined : r.avgReturn >= 0 ? "var(--good)" : "var(--bad)"}
                    />
                    <Stat label="Profitable buys" value={r.scoredBuys ? `${r.profitableBuys} / ${r.scoredBuys}` : "—"} />
                    <Stat label="Trades" value={`${r.trades}`} />
                    <Stat label="Last traded" value={fmtDate(r.lastTraded)} small />
                  </div>

                  {r.topHoldings.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                      <span className="text-[10.5px] text-mute uppercase tracking-wide">Top holdings</span>
                      {r.topHoldings.map((h) => (
                        <span key={h.ticker} className="font-mono text-[11.5px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                          {h.ticker}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-[11.5px] text-faint mt-5 leading-relaxed max-w-3xl">
        &ldquo;Disclosed portfolio&rdquo; is the midpoint of the STOCK Act dollar ranges the member has
        reported — a floor, not full net worth (annual asset disclosures aren&rsquo;t ingested). Win rate
        and average return score each disclosed buy against the stock&rsquo;s price since the trade date.
        Committee seats and party from the public @unitedstates legislator roster. Informational only.
      </p>
    </div>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: string; small?: boolean }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wide text-mute font-bold">{label}</div>
      <div className={`${small ? "text-[12px]" : "text-[15px]"} font-bold tabular mt-0.5`} style={{ color: tone ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

"use client";
import useSWR from "swr";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Landmark, Lock } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";
import { DataTable, Column } from "@/components/DataTable";
import { CompanyLogo } from "@/components/CompanyLogo";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { usePremium } from "@/components/premium/PremiumContext";
import { SUBSCRIBE_HREF } from "@/lib/funnel";
import { BadgeChips, GradeChip } from "@/components/wealth-tracker/Badges";
import { VIEWS, partyMeta, pct, signedMoney } from "@/components/wealth-tracker/types";
import type { WtLeaderboard, WtLeaderboardRow } from "@/components/wealth-tracker/types";

/**
 * The Wealth Tracker — Brief v7 Build 1, the politician leaderboard.
 *
 * Five ranking views (§2.2), combinable filters (§2.3). Party and chamber
 * are free; the rest are Insider Access (§5). The leaderboard itself is
 * free — the wall sits on holdings depth and exports, not on the ranking.
 * The metric is 'Disclosed Portfolio Growth (est.)', never net worth.
 */

const FREE_FILTERS = new Set(["party", "chamber"]);

function Select({
  id,
  value,
  onChange,
  options,
  label,
  locked,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
  label: string;
  locked?: boolean;
}) {
  if (locked) {
    return (
      <Link
        href={SUBSCRIBE_HREF}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-md px-2.5 py-1.5"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-mute)" }}
        title={`${label} filters are part of Insider Access`}
      >
        <Lock className="h-3 w-3" /> {label}
      </Link>
    );
  }
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[12.5px] font-semibold rounded-md px-2.5 py-1.5"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
      aria-label={label}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export default function WealthTrackerPage() {
  const { unlocked } = usePremium();
  const [view, setView] = useState("growth90d");
  const [f, setF] = useState<Record<string, string>>({ party: "", chamber: "", age: "", activity: "", recency: "", returnBand: "", hitBand: "" });
  const [former, setFormer] = useState(false);
  const [q, setQ] = useState("");

  // Deep links: ?view=alltime&party=D
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get("view");
    if (v && VIEWS.some((x) => x.key === v)) setView(v);
    const next: Record<string, string> = {};
    for (const k of Object.keys(f)) if (sp.get(k)) next[k] = sp.get(k) as string;
    if (Object.keys(next).length) setF((prev) => ({ ...prev, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const sp = new URLSearchParams();
    if (view !== "growth90d") sp.set("view", view);
    for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v);
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [view, f]);

  const key = useMemo(() => {
    const sp = new URLSearchParams({ view, limit: "600" });
    for (const [k, v] of Object.entries(f)) if (v && (unlocked || FREE_FILTERS.has(k))) sp.set(k, v);
    if (former) sp.set("includeFormer", "1");
    return `${API_BASE}/wealth-tracker/leaderboard?${sp.toString()}`;
  }, [view, f, former, unlocked]);
  const { data, isLoading } = useSWR<WtLeaderboard>(key, fetcher, { revalidateOnFocus: false });

  const rows = useMemo(() => {
    const all = data?.rows || [];
    if (!q) return all;
    const s = q.toLowerCase();
    return all.filter((r) => r.member.name.toLowerCase().includes(s) || (r.member.state || "").toLowerCase() === s || r.stats.topHoldings.some((h) => h.ticker.toLowerCase() === s));
  }, [data, q]);

  const viewMeta = VIEWS.find((v) => v.key === view) || VIEWS[0];
  const metricCell = (r: WtLeaderboardRow) => {
    const v = r.metric;
    if (v == null) return <span className="text-faint">—</span>;
    if (viewMeta.kind === "count") return <span className="tabular font-bold">{Math.round(v).toLocaleString()}</span>;
    if (viewMeta.kind === "money") {
      const w = r.stats.wowChange;
      return (
        <span className="tabular font-bold" style={{ color: (w ?? 0) >= 0 ? "#10B981" : "#EF4444" }}>
          {signedMoney(w)}
        </span>
      );
    }
    if (view === "hitrate")
      return (
        <span className="tabular font-bold">
          {v.toFixed(0)}%
          <span className="block text-[10px] font-normal" style={{ color: "var(--text-mute)" }}>
            {r.stats.hitSample} buys
          </span>
        </span>
      );
    const bench = view === "growth90d" ? r.stats.bench90d : view === "ytd" ? r.stats.benchYtd : r.stats.benchAll;
    return (
      <span className="tabular font-bold" style={{ color: v >= 0 ? "#10B981" : "#EF4444" }}>
        {pct(v)}
        {bench != null ? (
          <span className="block text-[10px] font-normal" style={{ color: "var(--text-mute)" }}>
            SPY {pct(bench)}
          </span>
        ) : null}
      </span>
    );
  };

  const columns: Column<WtLeaderboardRow>[] = [
    {
      key: "rank",
      label: "#",
      align: "center",
      sortValue: (r) => r.rank,
      className: "w-10",
      render: (r) => <span className="tabular font-bold text-[12.5px]" style={{ color: "var(--text-mute)" }}>{r.rank}</span>,
    },
    {
      key: "member",
      label: "Member",
      sortValue: (r) => r.member.name,
      render: (r) => {
        const pm = partyMeta(r.member.party);
        return (
          <Link href={`/politicians/${r.member.slug}`} className="flex items-center gap-2.5 group min-w-0">
            <PoliticianAvatar name={r.member.name} photoUrl={r.member.photoUrl} party={r.member.party} size={38} />
            <span className="min-w-0">
              <span className="block font-bold text-[13.5px] leading-tight group-hover:text-accent transition truncate" style={{ color: "var(--text)" }}>
                {r.member.name}
                {!r.member.current ? (
                  <span className="ml-1.5 text-[10px] font-semibold uppercase" style={{ color: "var(--text-mute)" }}>
                    former
                  </span>
                ) : null}
              </span>
              <span className="block text-[11px] leading-tight mt-0.5" style={{ color: "var(--text-mute)" }}>
                <span style={{ color: pm.color, fontWeight: 700 }}>{pm.label.charAt(0)}</span>
                {" · "}
                {r.member.chamber}
                {r.member.state ? ` · ${r.member.state}` : ""}
                {r.member.age != null ? ` · ${r.member.age}` : ""}
              </span>
              {r.stats.badges.length ? (
                <span className="block mt-1">
                  <BadgeChips badges={r.stats.badges} meta={data?.badgeMeta} max={3} />
                </span>
              ) : null}
            </span>
          </Link>
        );
      },
    },
    {
      key: "grade",
      label: "Grade",
      align: "center",
      info: "Performance Grade, A+ to C, percentile-ranked against other members of Congress on estimated portfolio return, hit rate, activity and disclosure speed. A grade needs 20 priced trades.",
      sortValue: (r) => (r.stats.grade ? ["C", "C+", "B", "B+", "A", "A+"].indexOf(r.stats.grade) : -1),
      render: (r) => <GradeChip grade={r.stats.grade} size={28} building={!r.stats.qualifies} />,
    },
    {
      key: "metric",
      label: viewMeta.metricLabel,
      align: "right",
      info: "Estimated. Disclosed ranges are priced at their midpoint; returns are time-weighted so a new purchase does not read as a gain.",
      sortValue: (r) => r.metric ?? null,
      render: metricCell,
    },
    {
      key: "value",
      label: "Est. portfolio",
      align: "right",
      info: "Estimated value today of the stock positions reconstructed from disclosures. Not net worth.",
      sortValue: (r) => r.stats.value,
      render: (r) => <span className="tabular">{r.stats.value > 0 ? formatCurrency(r.stats.value) : "—"}</span>,
    },
    ...(view !== "growth90d"
      ? [
          {
            key: "ret90d",
            label: "90d",
            align: "right",
            sortValue: (r: WtLeaderboardRow) => r.stats.ret90d ?? null,
            render: (r: WtLeaderboardRow) => <Pct v={r.stats.ret90d} />,
          } as Column<WtLeaderboardRow>,
        ]
      : []),
    ...(view !== "alltime"
      ? [
          {
            key: "retAll",
            label: "Since tracked",
            align: "right",
            info: "Estimated time-weighted return since the member's first disclosed trade in our record. Ranked only with 20 or more priced trades.",
            sortValue: (r: WtLeaderboardRow) => r.stats.retAll ?? null,
            render: (r: WtLeaderboardRow) => <Pct v={r.stats.retAll} muted={!r.stats.qualifies} />,
          } as Column<WtLeaderboardRow>,
        ]
      : []),
    ...(view !== "hitrate"
      ? [
          {
            key: "hit",
            label: "Hit rate",
            align: "right",
            info: "Share of disclosed buys that are profitable so far, realized or on paper.",
            sortValue: (r: WtLeaderboardRow) => r.stats.hitRate ?? null,
            render: (r: WtLeaderboardRow) =>
              r.stats.hitRate == null ? <span className="text-faint">—</span> : <span className="tabular">{r.stats.hitRate.toFixed(0)}%</span>,
          } as Column<WtLeaderboardRow>,
        ]
      : []),
    ...(view !== "active"
      ? [
          {
            key: "trades12m",
            label: "Trades 12m",
            align: "right",
            sortValue: (r: WtLeaderboardRow) => r.stats.trades12m,
            render: (r: WtLeaderboardRow) => <span className="tabular">{r.stats.trades12m}</span>,
          } as Column<WtLeaderboardRow>,
        ]
      : []),
    {
      key: "lastTrade",
      label: "Last trade",
      align: "right",
      sortValue: (r) => r.stats.lastTrade || "",
      render: (r) => <span className="whitespace-nowrap text-[12px]">{r.stats.lastTrade ? formatDate(r.stats.lastTrade) : "—"}</span>,
    },
    {
      key: "holdings",
      label: "Top holdings",
      sortable: false,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {r.stats.topHoldings.slice(0, 3).map((h) => (
            <Link key={h.ticker} href={`/companies/${h.ticker}`} title={`${h.ticker} · ${h.name} · ${formatCurrency(h.value)} est.`} className="inline-flex">
              <CompanyLogo ticker={h.ticker} name={h.name} size={22} />
            </Link>
          ))}
          {r.stats.holdings > 3 ? (
            <Link href={`/politicians/${r.member.slug}`} className="text-[11px] font-semibold text-accent whitespace-nowrap">
              +{r.stats.holdings - 3}
            </Link>
          ) : null}
        </span>
      ),
    },
  ];

  const set = (k: string) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="w-full">
      <header className="mb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Landmark className="h-5 w-5" style={{ color: "var(--accent)" }} />
          <span className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: "var(--text-mute)" }}>
            Congress · Wealth Tracker
          </span>
        </div>
        <h1 className="text-[26px] font-extrabold leading-none" style={{ color: "var(--text)" }}>
          Disclosed Portfolio Growth (est.)
        </h1>
        <p className="text-[13.5px] leading-relaxed max-w-[820px] mt-2" style={{ color: "var(--text-soft)" }}>
          Every member&rsquo;s disclosed stock portfolio, rebuilt trade by trade from their STOCK Act filings and marked to market daily.
          Who is growing fastest right now, who has the best record over time, what they hold and what they paid for it.
        </p>
      </header>

      <section className="rounded-lg p-3.5 mb-4 text-[12.5px] leading-relaxed" style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}>
        {data?.frame || "Members of Congress may lawfully own and trade stocks, and these trades are disclosed under the STOCK Act. This page reports public records and draws no conclusion of wrongdoing."}
        <span className="block mt-1" style={{ color: "var(--text-mute)" }}>
          {data?.estimateNote || "Every figure is an estimate from disclosed ranges (midpoints); disclosures can lag a trade by up to 45 days. This is the disclosed stock portfolio, not net worth."}
        </span>
      </section>

      <nav className="flex gap-1 overflow-x-auto pb-1 mb-3" role="tablist" aria-label="Ranking view">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className="px-3.5 py-2 text-[13px] font-semibold rounded-lg whitespace-nowrap"
            style={{
              background: view === v.key ? "var(--accent)" : "var(--bg-2)",
              color: view === v.key ? "#fff" : "var(--text)",
              border: `1px solid ${view === v.key ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Select id="party" label="Party" value={f.party} onChange={set("party")} options={[["", "All parties"], ["D", "Democrat"], ["R", "Republican"], ["I", "Independent"]]} />
        <Select id="chamber" label="Chamber" value={f.chamber} onChange={set("chamber")} options={[["", "Both chambers"], ["House", "House"], ["Senate", "Senate"]]} />
        <Select id="age" label="Age" locked={!unlocked} value={f.age} onChange={set("age")} options={[["", "Any age"], ["lt50", "Under 50"], ["50-64", "50 – 64"], ["65-74", "65 – 74"], ["75plus", "75 and over"]]} />
        <Select id="activity" label="Activity" locked={!unlocked} value={f.activity} onChange={set("activity")} options={[["", "Any activity"], ["low", "1 – 9 trades (12m)"], ["mid", "10 – 49 trades"], ["high", "50+ trades"], ["none", "No trades in 12m"]]} />
        <Select id="recency" label="Last trade" locked={!unlocked} value={f.recency} onChange={set("recency")} options={[["", "Any recency"], ["7d", "Traded in 7 days"], ["30d", "Traded in 30 days"], ["90d", "Traded in 90 days"]]} />
        <Select id="returnBand" label="Return" locked={!unlocked} value={f.returnBand} onChange={set("returnBand")} options={[["", "Any return"], ["strong", "Over +50% since tracked"], ["up", "+10% to +50%"], ["flat", "0% to +10%"], ["neg", "Negative"]]} />
        <Select id="hitBand" label="Hit rate" locked={!unlocked} value={f.hitBand} onChange={set("hitBand")} options={[["", "Any hit rate"], ["gte70", "70% and up"], ["60-70", "60% – 70%"], ["40-60", "40% – 60%"], ["lt40", "Under 40%"]]} />
        <label className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--text-soft)" }}>
          <input type="checkbox" checked={former} onChange={(e) => setFormer(e.target.checked)} /> Include former members
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search member, state or ticker"
          className="text-[12.5px] rounded-md px-2.5 py-1.5 flex-1 min-w-[180px]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </div>

      <div className="card overflow-hidden">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.member.bioguide}
          initialSort={{ key: "rank", dir: "asc" }}
          empty={isLoading ? "Building the leaderboard…" : data?.membersTracked === 0 ? "The tracker has not run yet." : "No members match these filters."}
        />
      </div>

      <p className="text-[11.5px] mt-3" style={{ color: "var(--text-mute)" }}>
        {viewMeta.key === "alltime" || viewMeta.key === "hitrate" ? `Ranked members have ${data?.minTrades ?? 20} or more priced trades. ` : ""}
        {data?.membersTracked ? `${data.membersTracked} members with disclosed trades. ` : ""}
        {data?.computedAt ? `Recomputed ${formatDate(data.computedAt)}. ` : ""}
        Ages from public congressional biographies. Portraits are the official congressional set.
      </p>
    </div>
  );
}

function Pct({ v, muted }: { v: number | null; muted?: boolean }) {
  if (v == null) return <span className="text-faint">—</span>;
  return (
    <span className="tabular" style={{ color: muted ? "var(--text-mute)" : v >= 0 ? "#10B981" : "#EF4444" }} title={muted ? "Fewer than 20 priced trades; shown, not ranked" : undefined}>
      {pct(v)}
    </span>
  );
}

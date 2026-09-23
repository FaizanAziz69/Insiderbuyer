"use client";

/**
 * §8 research dashboard — "current rankings with full factor breakdowns,
 * portfolio vs. target, upcoming tranche/rebalance orders, exclusion list,
 * and parameter config (every default in this brief lives here, versioned)".
 *
 * It lives inside the Editorial Desk so it shares the one admin token; every
 * route it calls is behind AdminTokenGuard, and the two that can move capital
 * — approving an order and the kill switch — are deliberately separated from
 * everything else and confirm before firing.
 */

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { API_BASE, formatDate } from "@/lib/api";

const pct = (v: number | null | undefined, digits = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`;
const money = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

type Tab = "rankings" | "portfolio" | "orders" | "exclusions" | "config" | "audit";

const TABS: Array<[Tab, string]> = [
  ["rankings", "Rankings"],
  ["portfolio", "Portfolio vs target"],
  ["orders", "Order queue"],
  ["exclusions", "Exclusions"],
  ["config", "Parameters"],
  ["audit", "Audit log"],
];

export function QuantDeskAdmin({ token }: { token: string }) {
  const [tab, setTab] = useState<Tab>("rankings");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const headers = useMemo(
    () => (token ? { "x-admin-token": token, "Content-Type": "application/json" } : { "Content-Type": "application/json" }),
    [token],
  );
  const get = useCallback(
    ([url]: [string]) => fetch(url, { headers: token ? { "x-admin-token": token } : {} }).then((r) => r.json()),
    [token],
  );

  const { data: status, mutate: refreshStatus } = useSWR<any>(token ? [`${API_BASE}/quant/status`] : null, get, { revalidateOnFocus: false });
  const { data: rankings, mutate: refreshRankings } = useSWR<any>(token && tab === "rankings" ? [`${API_BASE}/quant/rankings?limit=60`] : null, get, { revalidateOnFocus: false });
  const { data: books, mutate: refreshBooks } = useSWR<any>(token && tab === "portfolio" ? [`${API_BASE}/quant/books`] : null, get, { revalidateOnFocus: false });
  const { data: orders, mutate: refreshOrders } = useSWR<any>(token && tab === "orders" ? [`${API_BASE}/quant/orders?status=pending_approval&limit=100`] : null, get, { revalidateOnFocus: false });
  const { data: exclusions, mutate: refreshExclusions } = useSWR<any>(token && tab === "exclusions" ? [`${API_BASE}/quant/exclusions`] : null, get, { revalidateOnFocus: false });
  const { data: config } = useSWR<any>(token && tab === "config" ? [`${API_BASE}/quant/config`] : null, get, { revalidateOnFocus: false });
  const { data: audit } = useSWR<any>(token && tab === "audit" ? [`${API_BASE}/quant/audit?limit=120`] : null, get, { revalidateOnFocus: false });

  const post = async (path: string, body?: any, label = "") => {
    setBusy(label || path);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: body ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => ({}));
      setMsg(res.ok ? `${label || path}: ${JSON.stringify(json).slice(0, 260)}` : `Failed: ${JSON.stringify(json).slice(0, 260)}`);
      return json;
    } catch (e: any) {
      setMsg(`Failed: ${e?.message || e}`);
      return null;
    } finally {
      setBusy("");
    }
  };

  if (!token) {
    return (
      <div className="card p-6 text-[14px]" style={{ color: "var(--text-mute)" }}>
        The quant desk needs the admin token above. Every route it reads can move capital or change a ranking parameter.
      </div>
    );
  }

  const killOn = !!status?.pit && config?.execution?.killSwitch;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Universe" value={status?.pit?.securities ? `${status.pit.securities.active} live` : "—"} sub={status?.pit?.securities ? `${status.pit.securities.delisted} delisted kept` : undefined} />
        <Stat label="Point-in-time facts" value={status?.pit?.fundamentals?.rows?.toLocaleString() || "—"} sub={status?.pit?.fundamentals?.symbols ? `${status.pit.fundamentals.symbols} symbols` : undefined} />
        <Stat label="Last ranking" value={status?.lastSnapshot ? formatDate(status.lastSnapshot.asOf) : "never"} sub={status?.lastSnapshot ? `${status.lastSnapshot.passed} of ${status.lastSnapshot.universe} eligible` : undefined} />
        <Stat label="Orders awaiting approval" value={String(status?.orders?.pending ?? 0)} sub={`${status?.exclusions ?? 0} exclusions active`} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => post("/quant/admin/refresh-universe", undefined, "universe").then(() => refreshStatus())} disabled={!!busy}
          className="px-3 py-1.5 text-[12.5px] font-semibold rounded" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          Refresh universe
        </button>
        <button onClick={() => post("/quant/admin/ingest-fundamentals?limit=120&activeOnly=1", undefined, "fundamentals").then(() => refreshStatus())} disabled={!!busy}
          className="px-3 py-1.5 text-[12.5px] font-semibold rounded" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          Ingest fundamentals
        </button>
        <button onClick={() => post("/quant/admin/ingest-prices?limit=120&activeOnly=1", undefined, "prices").then(() => refreshStatus())} disabled={!!busy}
          className="px-3 py-1.5 text-[12.5px] font-semibold rounded" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          Ingest prices
        </button>
        <button onClick={() => post("/quant/admin/run-ranking", undefined, "ranking").then(() => { refreshStatus(); refreshRankings(); })} disabled={!!busy}
          className="px-3 py-1.5 text-[12.5px] font-semibold rounded" style={{ background: "var(--accent)", color: "#fff" }}>
          Run ranking
        </button>
        <button onClick={() => post("/quant/admin/rebuild-index", {}, "index")} disabled={!!busy}
          className="px-3 py-1.5 text-[12.5px] font-semibold rounded" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          Rebuild IBCX
        </button>
        <button
          onClick={() => {
            if (!window.confirm(killOn ? "Release the kill switch and allow orders again?" : "Engage the kill switch? No order will be accepted until it is released.")) return;
            post("/quant/admin/kill-switch", { on: !killOn }, "kill switch");
          }}
          disabled={!!busy}
          className="px-3 py-1.5 text-[12.5px] font-bold rounded"
          style={{ background: killOn ? "#EF4444" : "var(--bg-2)", color: killOn ? "#fff" : "var(--text)", border: "1px solid var(--border)" }}
        >
          {killOn ? "Kill switch ENGAGED — release" : "Engage kill switch"}
        </button>
      </div>
      {busy ? <p className="text-[12px]" style={{ color: "var(--text-mute)" }}>Working: {busy}…</p> : null}
      {msg ? <pre className="text-[11.5px] p-2.5 rounded overflow-x-auto" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-soft)" }}>{msg}</pre> : null}

      <nav className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className="px-3 py-1.5 text-[12.5px] font-semibold rounded-md whitespace-nowrap"
            style={{ background: tab === k ? "var(--accent)" : "var(--bg-2)", color: tab === k ? "#fff" : "var(--text)", border: "1px solid var(--border)" }}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "rankings" && (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider" style={{ background: "var(--bg-2)", color: "var(--text-mute)" }}>
                  <th className="text-left font-bold px-3 py-2">Symbol</th>
                  <th className="text-left font-bold px-3 py-2">Sector</th>
                  <th className="text-center font-bold px-3 py-2">Gate 1</th>
                  <th className="text-right font-bold px-3 py-2">Quality</th>
                  <th className="text-right font-bold px-3 py-2">Conviction</th>
                  <th className="text-right font-bold px-3 py-2">Fund rank</th>
                  <th className="text-left font-bold px-3 py-2">Why</th>
                </tr>
              </thead>
              <tbody>
                {(rankings?.rows || []).map((r: any) => (
                  <tr key={r.symbol} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3 py-2 font-mono font-bold">{r.symbol}</td>
                    <td className="px-3 py-2 text-[12px]" style={{ color: "var(--text-soft)" }}>{r.sector || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5"
                        style={{ background: r.gate1_pass ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.12)", color: r.gate1_pass ? "#10B981" : "#EF4444" }}>
                        {r.gate1_pass ? "PASS" : "FAIL"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular">{Number(r.quality_score).toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular">{Number(r.conviction_score).toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular font-bold">{Number(r.fund_rank).toFixed(1)}</td>
                    <td className="px-3 py-2 text-[11.5px]" style={{ color: "var(--text-mute)" }}>
                      {r.gate1_pass
                        ? (r.attribution?.drivers || []).join(", ") || "no conviction drivers"
                        : (r.gate1_failed || []).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rankings?.rows?.length ? <div className="p-6 text-[13px]" style={{ color: "var(--text-mute)" }}>No ranking snapshot yet. Run the ranking above.</div> : null}
        </section>
      )}

      {tab === "portfolio" && (
        <section className="space-y-3">
          {(books?.books || []).map((b: any) => (
            <div key={b.id} className="card p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h3 className="text-[14px] font-bold">Book {b.id} — {b.name} · {money(b.capital)}</h3>
                <span className="text-[11.5px] px-2 py-0.5 rounded font-semibold"
                  style={{ background: b.drawdown?.state === "normal" ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)", color: b.drawdown?.state === "normal" ? "#10B981" : "#EF4444" }}>
                  Drawdown {pct(b.drawdown?.drawdown)} · {b.drawdown?.state}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]" style={{ color: "var(--text-soft)" }}>
                <div>Cash: <strong>{money(b.cash)}</strong></div>
                <div>Equity: <strong>{money(b.equity)}</strong></div>
                <div>Positions: <strong>{b.positions?.length || 0}</strong></div>
                <div>Cash cap: <strong>{pct(b.drawdown?.cashBufferCap)}</strong></div>
              </div>
              {b.drawdown?.state !== "normal" ? (
                <p className="text-[11.5px] mt-2" style={{ color: "var(--text-mute)" }}>
                  New entrants {b.drawdown.allowNewEntrants ? "allowed" : "paused"}; contrarian adds {b.drawdown.allowContrarianAdds ? "continue" : "paused"}.
                </p>
              ) : null}
            </div>
          ))}
          {rankings?.target ? (
            <div className="card p-4">
              <h3 className="text-[14px] font-bold mb-2">Target portfolio</h3>
              <p className="text-[12px] mb-2" style={{ color: "var(--text-soft)" }}>
                Cash {pct(rankings.target.cashWeight)} · core {pct(rankings.target.sleeveWeights?.core)} · contrarian {pct(rankings.target.sleeveWeights?.contrarian)} · small cap {pct(rankings.target.sleeveWeights?.smallcap)}
              </p>
              {(rankings.target.notes || []).map((n: string, i: number) => (
                <p key={i} className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>· {n}</p>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {tab === "orders" && (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider" style={{ background: "var(--bg-2)", color: "var(--text-mute)" }}>
                  <th className="text-left font-bold px-3 py-2">Order</th>
                  <th className="text-left font-bold px-3 py-2">Book</th>
                  <th className="text-left font-bold px-3 py-2">Side</th>
                  <th className="text-right font-bold px-3 py-2">Shares</th>
                  <th className="text-left font-bold px-3 py-2">Why</th>
                  <th className="text-right font-bold px-3 py-2">Approve</th>
                </tr>
              </thead>
              <tbody>
                {(orders || []).map((o: any) => (
                  <tr key={o.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3 py-2 font-mono text-[11.5px]">{o.symbol}</td>
                    <td className="px-3 py-2">{o.book_id}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: o.side === "buy" ? "#10B981" : "#EF4444" }}>{o.side}</td>
                    <td className="px-3 py-2 text-right tabular">{Number(o.target_shares).toLocaleString()}</td>
                    <td className="px-3 py-2 text-[11.5px]" style={{ color: "var(--text-mute)" }}>{o.reason}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => {
                          if (!window.confirm(`Approve ${o.side} ${o.target_shares} ${o.symbol} on book ${o.book_id}?`)) return;
                          post("/quant/orders/approve", { orderId: o.id }, "approve").then(() => refreshOrders());
                        }}
                        className="px-2.5 py-1 text-[11.5px] font-semibold rounded"
                        style={{ background: "var(--accent)", color: "#fff" }}
                      >
                        Approve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!orders?.length ? <div className="p-6 text-[13px]" style={{ color: "var(--text-mute)" }}>Nothing awaiting approval.</div> : null}
        </section>
      )}

      {tab === "exclusions" && <ExclusionsTab symbols={exclusions?.symbols || []} onAdd={(s, r, e) => post("/quant/exclusions", { symbol: s, reason: r, engagementEndedOn: e }, "exclude").then(() => refreshExclusions())} onRemove={(s) => post("/quant/exclusions/remove", { symbol: s }, "un-exclude").then(() => refreshExclusions())} />}

      {tab === "config" && (
        <section className="card p-4">
          <h3 className="text-[14px] font-bold mb-1">Parameters</h3>
          <p className="text-[12px] mb-3" style={{ color: "var(--text-mute)" }}>
            Every default from the brief, versioned. These are starting points until George approves them after the backtests.
          </p>
          <pre className="text-[11px] p-3 rounded overflow-x-auto" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
            {JSON.stringify(config, null, 2)}
          </pre>
        </section>
      )}

      {tab === "audit" && (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider" style={{ background: "var(--bg-2)", color: "var(--text-mute)" }}>
                  <th className="text-left font-bold px-3 py-2">When</th>
                  <th className="text-left font-bold px-3 py-2">Actor</th>
                  <th className="text-left font-bold px-3 py-2">Event</th>
                  <th className="text-left font-bold px-3 py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {(audit || []).map((a: any) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3 py-2 text-[11.5px] whitespace-nowrap">{new Date(a.at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-[11.5px]">{a.actor}</td>
                    <td className="px-3 py-2 text-[11.5px] font-semibold">{a.event}</td>
                    <td className="px-3 py-2 text-[11px]" style={{ color: "var(--text-mute)" }}>
                      {a.symbol ? `${a.symbol} · ` : ""}{JSON.stringify(a.payload).slice(0, 120)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!audit?.length ? <div className="p-6 text-[13px]" style={{ color: "var(--text-mute)" }}>No audit entries yet.</div> : null}
        </section>
      )}
    </div>
  );
}

function ExclusionsTab({ symbols, onAdd, onRemove }: { symbols: string[]; onAdd: (s: string, r: string, e: string | null) => void; onRemove: (s: string) => void }) {
  const [symbol, setSymbol] = useState("");
  const [reason, setReason] = useState("agency/IR client");
  const [ended, setEnded] = useState("");
  return (
    <section className="card p-4">
      <h3 className="text-[14px] font-bold mb-1">Client-conflict exclusions</h3>
      <p className="text-[12px] mb-3" style={{ color: "var(--text-mute)" }}>
        Current agency and IR clients are hard-excluded from the index and the portfolio, and for six months after an
        engagement ends. Entering an end date sets that six-month tail automatically.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="TICKER"
          className="px-2.5 py-1.5 text-[12.5px] rounded font-mono w-28" style={{ background: "var(--bg-1)", border: "1px solid var(--border)", color: "var(--text)" }} />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason"
          className="px-2.5 py-1.5 text-[12.5px] rounded flex-1 min-w-[180px]" style={{ background: "var(--bg-1)", border: "1px solid var(--border)", color: "var(--text)" }} />
        <input value={ended} onChange={(e) => setEnded(e.target.value)} placeholder="engagement ended (YYYY-MM-DD, optional)"
          className="px-2.5 py-1.5 text-[12.5px] rounded min-w-[200px]" style={{ background: "var(--bg-1)", border: "1px solid var(--border)", color: "var(--text)" }} />
        <button onClick={() => symbol && onAdd(symbol, reason, ended || null)}
          className="px-3 py-1.5 text-[12.5px] font-semibold rounded" style={{ background: "var(--accent)", color: "#fff" }}>
          Exclude
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {symbols.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-[12px] font-mono font-semibold rounded px-2 py-1"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
            {s}
            <button onClick={() => onRemove(s)} style={{ color: "var(--text-mute)" }} title="Remove">×</button>
          </span>
        ))}
        {!symbols.length ? <span className="text-[12.5px]" style={{ color: "var(--text-mute)" }}>No exclusions recorded.</span> : null}
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
      <div className="text-[10.5px] uppercase tracking-wider font-bold" style={{ color: "var(--text-mute)" }}>{label}</div>
      <div className="text-[18px] font-bold tabular mt-0.5">{value}</div>
      {sub ? <div className="text-[11px]" style={{ color: "var(--text-mute)" }}>{sub}</div> : null}
    </div>
  );
}

"use client";

/**
 * Investors roster admin — Developer Project Brief (Aug 24 2026), §4.1 and
 * Appendix A: "Category assignments per investor are an editorial input —
 * build them as a taggable field in the admin, not hardcoded" and "the admin
 * must support adding/removing investors without a deploy."
 *
 * Lives inside the Editorial Desk (same x-admin-token). Every change is one
 * PUT to /investors/admin/roster/:slug; the public tabs read the tags live.
 */

import { useState } from "react";
import useSWR from "swr";
import { API_BASE } from "@/lib/api";

const CATS: Array<[string, string]> = [
  ["growth", "Growth"],
  ["value", "Value"],
  ["short", "Short seller"],
  ["longterm", "Long-term"],
];

interface Row {
  slug: string;
  person: string;
  firm: string;
  cik: string | null;
  categories: string[];
  active: boolean;
  note: string | null;
  photo: string | null;
  sort: number;
  asOf: string | null;
  portfolioValue: number | null;
  positions: number | null;
  performance: number | null;
  perfNote: string | null;
}

export function InvestorsAdmin({ token }: { token: string }) {
  const headers = token ? { "x-admin-token": token, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  const { data, error, mutate, isLoading } = useSWR<{ rows: Row[] }>(
    token ? `${API_BASE}/investors/admin/roster` : null,
    (url: string) =>
      fetch(url, { headers }).then(async (r) => {
        if (!r.ok) throw new Error(r.status === 503 ? "ADMIN_API_TOKEN is not set on the server" : r.status === 401 || r.status === 403 ? "Token rejected" : `HTTP ${r.status}`);
        return r.json();
      }),
    { revalidateOnFocus: false },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState({ slug: "", person: "", firm: "", cik: "" });
  const [filter, setFilter] = useState("");

  const save = async (slug: string, patch: Record<string, unknown>) => {
    setBusy(slug);
    setMsg(null);
    try {
      const r = await fetch(`${API_BASE}/investors/admin/roster/${encodeURIComponent(slug)}`, { method: "PUT", headers, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await mutate();
      setMsg(`Saved ${slug}.`);
    } catch (e) {
      setMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };
  const remove = async (slug: string) => {
    if (!window.confirm(`Remove ${slug} from the roster? Holdings and performance rows are deleted too.`)) return;
    setBusy(slug);
    try {
      const r = await fetch(`${API_BASE}/investors/admin/roster/${encodeURIComponent(slug)}`, { method: "DELETE", headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await mutate();
      setMsg(`Removed ${slug}.`);
    } catch (e) {
      setMsg(`Remove failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };
  const refresh = async (slug?: string) => {
    setBusy(slug ?? "*");
    setMsg(slug ? `Refreshing ${slug}…` : "Refreshing every filer — this pulls 13Fs and can take a few minutes…");
    try {
      const r = await fetch(`${API_BASE}/investors/admin/refresh${slug ? `?slug=${encodeURIComponent(slug)}` : ""}`, { method: "POST", headers });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await mutate();
      setMsg(`Refresh done: ${JSON.stringify(j)}`);
    } catch (e) {
      setMsg(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  if (!token) return <p className="text-[13px] text-soft">Paste the admin token above to edit the roster.</p>;
  if (error) return <p className="text-[13px]" style={{ color: "#EF4444" }}>{String(error.message || error)}</p>;
  if (isLoading || !data) return <p className="text-[13px] text-soft">Loading roster…</p>;

  const rows = data.rows.filter((r) => !filter || `${r.person} ${r.firm} ${r.slug}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter roster…" className="rounded-lg px-3 py-1.5 text-[13px]" style={{ border: "1px solid var(--border)", background: "var(--bg)" }} />
        <span className="text-[12px] text-soft">{data.rows.length} investors · {data.rows.filter((r) => r.active).length} active</span>
        <button onClick={() => refresh()} disabled={busy !== null} className="ml-auto rounded-lg px-3 py-1.5 text-[12.5px] font-semibold" style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
          Pull 13Fs + recompute all
        </button>
      </div>
      {msg && <p className="text-[12.5px]" style={{ color: "var(--text-mute)" }}>{msg}</p>}

      <div className="card p-4">
        <h3 className="text-[14px] font-bold mb-2">Add an investor</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {(["slug", "person", "firm", "cik"] as const).map((k) => (
            <input key={k} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} placeholder={k === "cik" ? "CIK (10 digits, from EDGAR)" : k} className="rounded-lg px-3 py-1.5 text-[13px]" style={{ border: "1px solid var(--border)", background: "var(--bg)" }} />
          ))}
          <button
            disabled={!draft.slug || !draft.person || !draft.firm || busy !== null}
            onClick={() => save(draft.slug, { person: draft.person, firm: draft.firm, cik: draft.cik || null, categories: [], active: true }).then(() => setDraft({ slug: "", person: "", firm: "", cik: "" }))}
            className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            Add
          </button>
        </div>
        <p className="text-[11.5px] text-soft mt-2">The CIK is the SEC filer number of the 13F filer (the fund or trust, not the person). Its holdings are pulled as soon as you save.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "var(--text-mute)" }}>
              <th className="py-2 pr-3">Investor</th>
              <th className="py-2 pr-3">CIK</th>
              <th className="py-2 pr-3">Tags (tabs)</th>
              <th className="py-2 pr-3">Active</th>
              <th className="py-2 pr-3">13F · value · perf</th>
              <th className="py-2 pr-3">Note</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} style={{ borderTop: "1px solid var(--border)", opacity: busy === r.slug ? 0.5 : 1 }}>
                <td className="py-2 pr-3 align-top">
                  <div className="font-semibold">{r.person}</div>
                  <div className="text-soft">{r.firm}</div>
                  <div className="font-mono text-[10.5px] text-soft">{r.slug}</div>
                </td>
                <td className="py-2 pr-3 align-top">
                  <input
                    defaultValue={r.cik ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (r.cik ?? "")) save(r.slug, { cik: v || null });
                    }}
                    className="font-mono rounded px-2 py-1 w-[120px]"
                    style={{ border: "1px solid var(--border)", background: "var(--bg)" }}
                  />
                </td>
                <td className="py-2 pr-3 align-top">
                  <div className="flex flex-wrap gap-1">
                    {CATS.map(([k, l]) => {
                      const on = r.categories.includes(k);
                      return (
                        <button
                          key={k}
                          onClick={() => save(r.slug, { categories: on ? r.categories.filter((c) => c !== k) : [...r.categories, k] })}
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: on ? "var(--accent)" : "var(--bg-2)", color: on ? "#fff" : "var(--text)", border: "1px solid var(--border)" }}
                          aria-pressed={on}
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="py-2 pr-3 align-top">
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={r.active} onChange={(e) => save(r.slug, { active: e.target.checked })} /> {r.active ? "yes" : "no"}
                  </label>
                </td>
                <td className="py-2 pr-3 align-top whitespace-nowrap">
                  <div>{r.asOf ?? "—"}</div>
                  <div className="text-soft">
                    {r.portfolioValue != null ? `$${(r.portfolioValue / 1e9).toFixed(2)}B · ${r.positions ?? "?"} pos` : "no filings"}
                  </div>
                  <div className="font-semibold" style={{ color: r.performance == null ? "var(--text-mute)" : r.performance >= 0 ? "#10B981" : "#EF4444" }} title={r.perfNote ?? undefined}>
                    {r.performance != null ? `${r.performance > 0 ? "+" : ""}${r.performance.toFixed(2)}%` : r.perfNote ? "suppressed" : "—"}
                  </div>
                </td>
                <td className="py-2 pr-3 align-top">
                  <input
                    defaultValue={r.note ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (r.note ?? "")) save(r.slug, { note: v || null });
                    }}
                    placeholder="shown on the card when inactive"
                    className="rounded px-2 py-1 w-[220px]"
                    style={{ border: "1px solid var(--border)", background: "var(--bg)" }}
                  />
                </td>
                <td className="py-2 align-top whitespace-nowrap">
                  <button onClick={() => refresh(r.slug)} className="text-[11.5px] font-semibold text-accent mr-2">refresh</button>
                  <button onClick={() => remove(r.slug)} className="text-[11.5px] font-semibold" style={{ color: "#EF4444" }}>remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

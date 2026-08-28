"use client";

/**
 * Data articles CMS — Developer Project Brief (Aug 24 2026), §3.3:
 * "Body copy is written by the editorial side; the CMS needs editable text
 *  sections around a locked chart module. Headlines and URLs are permanent."
 *
 * Lives inside the Editorial Desk (same x-admin-token). Every text section is
 * editable here; the slug and the chart binding are read-only. Copy may use
 * {{placeholders}} (top1.ticker, top1.value, total, companies, clusters,
 * top10Share, asOf …) which are filled from the live payload on every read.
 */

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { API_BASE } from "@/lib/api";

interface Sections {
  takeaways: string[];
  body: Array<{ heading: string; html: string }>;
  pullQuote: { text: string; attribution: string };
  whatItMeans: Array<{ audience: string; text: string }>;
  cta: { headline: string; body: string };
}
interface Row {
  slug: string;
  headline: string;
  dek: string;
  category: string;
  refresh: string;
  chart: string;
  periods: string[];
  sections: Sections;
  published: boolean;
  refreshed_at: string | null;
  updated_at: string;
}

const PLACEHOLDERS = ["total", "companies", "insiders", "trades", "clusters", "top10Share", "asOf", "refreshed", "period", "top1.ticker", "top1.name", "top1.value", "top1.insiders", "top1.avgPrice", "top1.pctSince", "top1.largest", "top1.iqs", "top1.avgReturn", "top1.ratings", "top1.positions", "top1.aum", "analysts", "ratings", "avgReturnTop10", "tracked", "withPerformance", "latestQuarter"];

export function DataArticlesAdmin({ token }: { token: string }) {
  const headers = token ? { "x-admin-token": token, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  const { data, error, mutate } = useSWR<Row[]>(
    token ? `${API_BASE}/data-articles/admin/list` : null,
    (url: string) =>
      fetch(url, { headers }).then(async (r) => {
        if (!r.ok) throw new Error(r.status === 503 ? "ADMIN_API_TOKEN is not set on the server" : r.status === 401 || r.status === 403 ? "Token rejected" : `HTTP ${r.status}`);
        return r.json();
      }),
    { revalidateOnFocus: false },
  );
  const [slug, setSlug] = useState<string>("");
  const [draft, setDraft] = useState<Row | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => data ?? [], [data]);
  useEffect(() => {
    if (!slug && rows.length) setSlug(rows[0].slug);
  }, [rows, slug]);
  useEffect(() => {
    const r = rows.find((x) => x.slug === slug);
    setDraft(r ? JSON.parse(JSON.stringify(r)) : null);
    setMsg(null);
  }, [slug, rows]);

  if (!token) return <p className="text-[13px]" style={{ color: "var(--text-mute)" }}>Enter the admin token above to edit data articles.</p>;
  if (error) return <p className="text-[13px]" style={{ color: "var(--bad)" }}>{String(error.message || error)}</p>;
  if (!draft) return <p className="text-[13px]" style={{ color: "var(--text-mute)" }}>Loading…</p>;

  const set = (patch: Partial<Row>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setSections = (patch: Partial<Sections>) => setDraft((d) => (d ? { ...d, sections: { ...d.sections, ...patch } } : d));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_BASE}/data-articles/admin/${draft.slug}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ headline: draft.headline, dek: draft.dek, category: draft.category, sections: draft.sections, published: draft.published }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await mutate();
      setMsg("Saved. Live within 5 minutes (page cache).");
    } catch (e: any) {
      setMsg(`Save failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };
  const rebuild = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_BASE}/data-articles/admin/refresh?kind=${draft.refresh}`, { method: "POST", headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      await mutate();
      setMsg(`Rebuilt: ${(j.rebuilt || []).join(", ")}`);
    } catch (e: any) {
      setMsg(`Rebuild failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-md px-2.5 py-1.5 text-[13px]";
  const inputStyle = { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" } as const;
  const label = "block text-[11px] font-semibold uppercase tracking-wide mb-1";
  const labelStyle = { color: "var(--text-mute)" } as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className={input} style={{ ...inputStyle, maxWidth: 420 }}>
          {rows.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.headline} {r.published ? "" : "(unpublished)"}
            </option>
          ))}
        </select>
        <a href={`/data/${draft.slug}`} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold underline" style={{ color: "var(--accent)" }}>
          Open page ↗
        </a>
        <span className="text-[12px] font-mono" style={{ color: "var(--text-mute)" }}>
          /data/{draft.slug} · chart: {draft.chart} · {draft.refresh} · data {draft.refreshed_at ? new Date(draft.refreshed_at).toLocaleString() : "not built yet"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div>
          <label className={label} style={labelStyle}>
            Headline (permanent — change only with SEO sign-off)
          </label>
          <input className={input} style={inputStyle} value={draft.headline} onChange={(e) => set({ headline: e.target.value })} />
        </div>
        <div>
          <label className={label} style={labelStyle}>
            Category
          </label>
          <input className={input} style={inputStyle} value={draft.category} onChange={(e) => set({ category: e.target.value })} />
        </div>
      </div>
      <div>
        <label className={label} style={labelStyle}>
          Dek
        </label>
        <textarea className={input} style={inputStyle} rows={2} value={draft.dek} onChange={(e) => set({ dek: e.target.value })} />
      </div>

      <fieldset className="space-y-2">
        <legend className={label} style={labelStyle}>
          The numbers that matter (takeaways)
        </legend>
        {draft.sections.takeaways.map((t, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={input}
              style={inputStyle}
              value={t}
              onChange={(e) => setSections({ takeaways: draft.sections.takeaways.map((x, j) => (j === i ? e.target.value : x)) })}
            />
            <button className="text-[12px] px-2" style={{ color: "var(--bad)" }} onClick={() => setSections({ takeaways: draft.sections.takeaways.filter((_, j) => j !== i) })} aria-label="Remove takeaway">
              ✕
            </button>
          </div>
        ))}
        <button className="text-[12.5px] font-semibold" style={{ color: "var(--accent)" }} onClick={() => setSections({ takeaways: [...draft.sections.takeaways, ""] })}>
          + Add takeaway
        </button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className={label} style={labelStyle}>
          Body sections ({draft.sections.body.length}; brief asks for 6–10) — HTML allowed
        </legend>
        {draft.sections.body.map((b, i) => (
          <div key={i} className="rounded-lg p-3 space-y-2" style={{ border: "1px solid var(--border)", background: "var(--bg-2)" }}>
            <div className="flex gap-2">
              <input
                className={input}
                style={inputStyle}
                value={b.heading}
                placeholder="Section heading"
                onChange={(e) => setSections({ body: draft.sections.body.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) })}
              />
              <button className="text-[12px] px-2" style={{ color: "var(--bad)" }} onClick={() => setSections({ body: draft.sections.body.filter((_, j) => j !== i) })} aria-label="Remove section">
                ✕
              </button>
            </div>
            <textarea
              className={`${input} font-mono text-[12px]`}
              style={inputStyle}
              rows={4}
              value={b.html}
              onChange={(e) => setSections({ body: draft.sections.body.map((x, j) => (j === i ? { ...x, html: e.target.value } : x)) })}
            />
          </div>
        ))}
        <button className="text-[12.5px] font-semibold" style={{ color: "var(--accent)" }} onClick={() => setSections({ body: [...draft.sections.body, { heading: "", html: "<p></p>" }] })}>
          + Add section
        </button>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
        <div>
          <label className={label} style={labelStyle}>
            Pull quote
          </label>
          <textarea className={input} style={inputStyle} rows={2} value={draft.sections.pullQuote.text} onChange={(e) => setSections({ pullQuote: { ...draft.sections.pullQuote, text: e.target.value } })} />
        </div>
        <div>
          <label className={label} style={labelStyle}>
            Attribution
          </label>
          <input className={input} style={inputStyle} value={draft.sections.pullQuote.attribution} onChange={(e) => setSections({ pullQuote: { ...draft.sections.pullQuote, attribution: e.target.value } })} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className={label} style={labelStyle}>
          What it means for you (by reader type)
        </legend>
        {draft.sections.whatItMeans.map((w, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
            <input className={input} style={inputStyle} value={w.audience} onChange={(e) => setSections({ whatItMeans: draft.sections.whatItMeans.map((x, j) => (j === i ? { ...x, audience: e.target.value } : x)) })} />
            <input className={input} style={inputStyle} value={w.text} onChange={(e) => setSections({ whatItMeans: draft.sections.whatItMeans.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            <button className="text-[12px] px-2" style={{ color: "var(--bad)" }} onClick={() => setSections({ whatItMeans: draft.sections.whatItMeans.filter((_, j) => j !== i) })} aria-label="Remove audience">
              ✕
            </button>
          </div>
        ))}
        <button className="text-[12.5px] font-semibold" style={{ color: "var(--accent)" }} onClick={() => setSections({ whatItMeans: [...draft.sections.whatItMeans, { audience: "", text: "" }] })}>
          + Add reader type
        </button>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} style={labelStyle}>
            Premium CTA headline
          </label>
          <input className={input} style={inputStyle} value={draft.sections.cta.headline} onChange={(e) => setSections({ cta: { ...draft.sections.cta, headline: e.target.value } })} />
        </div>
        <div>
          <label className={label} style={labelStyle}>
            Premium CTA body
          </label>
          <input className={input} style={inputStyle} value={draft.sections.cta.body} onChange={(e) => setSections({ cta: { ...draft.sections.cta, body: e.target.value } })} />
        </div>
      </div>

      <details className="text-[12px]" style={{ color: "var(--text-mute)" }}>
        <summary className="cursor-pointer font-semibold">Placeholders you can use in any text field</summary>
        <p className="mt-1 font-mono leading-relaxed">{PLACEHOLDERS.map((p) => `{{${p}}}`).join("  ")}</p>
      </details>

      <div className="flex flex-wrap items-center gap-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <label className="inline-flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={draft.published} onChange={(e) => set({ published: e.target.checked })} /> Published
        </label>
        <button disabled={busy} onClick={save} className="rounded-md px-4 py-2 text-[13px] font-bold" style={{ background: "var(--brand-surface)", color: "var(--on-accent)", opacity: busy ? 0.6 : 1 }}>
          Save text
        </button>
        <button disabled={busy} onClick={rebuild} className="rounded-md px-4 py-2 text-[13px] font-semibold" style={{ border: "1px solid var(--border)", opacity: busy ? 0.6 : 1 }}>
          Rebuild {draft.refresh} charts now
        </button>
        {msg && <span className="text-[12.5px]" style={{ color: msg.startsWith("Save failed") || msg.startsWith("Rebuild failed") ? "var(--bad)" : "var(--good)" }}>{msg}</span>}
      </div>
    </div>
  );
}

"use client";

/**
 * Workstream F §2.5 — "Admin: manual-review queue for low-confidence parses;
 * ability to correct fields with an audit trail, since IR firms will dispute
 * numbers."
 *
 * The queue is everything the parser was not confident about. Each card shows
 * the headline, a link to the source release, WHY confidence was docked, and
 * which fields were read by a pattern, derived by arithmetic, or read by a
 * model — so the reviewer knows where to look before opening the release.
 * Saving writes the old row to `ir_audit` and rescores.
 */

import { useState } from "react";
import useSWR from "swr";
import { API_BASE } from "@/lib/api";

interface Row {
  id: number;
  ticker: string | null;
  issuerName: string | null;
  providerName: string | null;
  headline: string;
  sourceUrl: string;
  publishedAt: string | null;
  confidence: number;
  notes: string[];
  provenance: Record<string, string>;
  fields: {
    startDate: string | null;
    endDate: string | null;
    termMonths: number | null;
    monthlyFee: number | null;
    totalValue: number | null;
    currency: string | null;
    optionsGranted: number | null;
    optionStrike: number | null;
    armsLength: boolean | null;
  };
}

const FIELDS: Array<[keyof Row["fields"], string, "text" | "number"]> = [
  ["startDate", "Start (yyyy-mm-dd)", "text"],
  ["endDate", "End (yyyy-mm-dd)", "text"],
  ["termMonths", "Term (months)", "number"],
  ["monthlyFee", "Monthly fee", "number"],
  ["totalValue", "Total value", "number"],
  ["currency", "Currency", "text"],
  ["optionsGranted", "Options to provider", "number"],
  ["optionStrike", "Option strike", "number"],
];

export function PromoterReviewAdmin({ token }: { token: string }) {
  const { data, mutate, isLoading } = useSWR<Row[]>(
    token ? [`${API_BASE}/promoter/admin/review?limit=60`, token] : null,
    ([url, t]: [string, string]) => fetch(url, { headers: { "x-admin-token": t } }).then((r) => r.json()),
    { revalidateOnFocus: false },
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");

  if (!token) return <p className="text-[13px] text-mute">Enter the admin token above.</p>;
  if (isLoading) return <p className="text-[13px] text-mute">Loading the review queue…</p>;
  if (!Array.isArray(data)) return <p className="text-[13px] text-mute">{(data as any)?.message || "Could not load the queue."}</p>;
  if (!data.length) return <p className="text-[13px] text-mute">Nothing waiting for review.</p>;

  async function save(row: Row, patch: Record<string, any>) {
    setBusy(row.id);
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/promoter/admin/review/${row.id}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ ...patch, actor: "editorial-desk", reason: "manual review" }),
      });
      const out = await res.json();
      setMsg(out?.ok ? `Saved #${row.id}.` : out?.reason || out?.message || "Save failed.");
      await mutate();
    } catch (e: any) {
      setMsg(e?.message || "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] m-0" style={{ color: "var(--text-mute)" }}>
        {data.length} agreement{data.length === 1 ? "" : "s"} waiting. Saving a row marks it reviewed, records the
        change in the audit log and re-runs the scores.
      </p>
      {msg ? <p className="text-[12.5px] font-semibold" style={{ color: "var(--accent)" }}>{msg}</p> : null}

      {data.map((row) => (
        <ReviewCard key={row.id} row={row} busy={busy === row.id} onSave={(patch) => save(row, patch)} />
      ))}
    </div>
  );
}

function ReviewCard({ row, busy, onSave }: { row: Row; busy: boolean; onSave: (patch: Record<string, any>) => void }) {
  // Date columns arrive as timestamps after JSON, and an editor should not be
  // asked to retype "2026-06-08T00:00:00.000Z" as a date.
  const asDay = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : v);
  const [draft, setDraft] = useState<Record<string, any>>({
    providerName: row.providerName ?? "",
    ...row.fields,
    startDate: asDay(row.fields.startDate),
    endDate: asDay(row.fields.endDate),
  });

  const set = (k: string, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <article className="rounded-lg p-3.5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="text-[13.5px] font-bold m-0" style={{ color: "var(--text)" }}>
          {row.ticker || "no ticker"} · {row.issuerName || "unknown issuer"}
        </h3>
        <span className="text-[11px] font-bold tabular" style={{ color: "var(--text-mute)" }}>
          confidence {row.confidence.toFixed(2)}
        </span>
      </div>
      <a
        href={row.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[12.5px] text-accent font-semibold hover:underline block mb-1"
      >
        {row.headline}
      </a>
      {row.notes?.length ? (
        <ul className="list-disc pl-4 m-0 mb-2">
          {row.notes.map((n, i) => (
            <li key={i} className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>
              {n}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>
            Provider{row.provenance?.providerName ? ` · ${row.provenance.providerName}` : ""}
          </span>
          <input
            value={draft.providerName ?? ""}
            onChange={(e) => set("providerName", e.target.value)}
            className="text-[12.5px] rounded px-2 py-1"
            style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </label>
        {FIELDS.map(([k, label, type]) => (
          <label key={k} className="flex flex-col gap-0.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>
              {label}
              {row.provenance?.[k] ? <span className="ml-1 font-semibold normal-case" style={{ color: "var(--accent)" }}>{row.provenance[k]}</span> : null}
            </span>
            <input
              type={type}
              value={draft[k] ?? ""}
              onChange={(e) => set(k, e.target.value === "" ? null : type === "number" ? Number(e.target.value) : e.target.value)}
              className="text-[12.5px] rounded px-2 py-1 tabular"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-2.5">
        <button
          disabled={busy}
          onClick={() => onSave(draft)}
          className="text-[12.5px] font-bold px-3 py-1.5 rounded"
          style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Saving…" : "Save & mark reviewed"}
        </button>
        <button
          disabled={busy}
          onClick={() => onSave({ status: "rejected" })}
          className="text-[12.5px] font-semibold px-3 py-1.5 rounded"
          style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}
          title="Not an IR agreement — exclude it from every surface and every total."
        >
          Not an agreement
        </button>
      </div>
    </article>
  );
}

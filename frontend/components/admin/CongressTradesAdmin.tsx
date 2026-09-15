"use client";

/**
 * Top Ranking Congress Trades — the editorial controls, Brief v5.
 *
 * Three queues sit here because §8 assigns all three to people rather than to
 * the pipeline: the jurisdiction table is "Faizan builds the admin tool;
 * editorial populates", the vendor tail is the "manual resolution queue"
 * §2 Stage 3 designs for, and §2 Stage 5 class (c) — anything that moves a
 * named person's ranking or adds a claim — is explicitly the one class the
 * verification agent "never self-publishes".
 *
 * They are pills rather than three stacked lists because each is a working
 * session of its own: an editor populating jurisdiction is not the same person,
 * in the same half hour, as one clearing corrections.
 */

import { useState } from "react";
import useSWR from "swr";
import { API_BASE } from "@/lib/api";

type Section = "jurisdiction" | "vendors" | "corrections";

const SECTIONS: Array<[Section, string]> = [
  ["jurisdiction", "Jurisdiction table"],
  ["vendors", "Vendor resolution"],
  ["corrections", "Corrections"],
];

const authed = ([url, t]: [string, string]) =>
  fetch(url, { headers: { "x-admin-token": t } }).then((r) => r.json());

function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

export function CongressTradesAdmin({ token }: { token: string }) {
  const [section, setSection] = useState<Section>("jurisdiction");

  if (!token) return <p className="text-[13px] text-mute">Enter the admin token above.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        {SECTIONS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className="px-3.5 py-1.5 rounded-full text-[13px] font-bold"
            style={
              section === key
                ? { background: "var(--accent)", color: "var(--on-accent)" }
                : { background: "var(--bg-2)", color: "var(--text-mute)", border: "1px solid var(--border)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {section === "jurisdiction" && <JurisdictionTable token={token} />}
      {section === "vendors" && <VendorQueue token={token} />}
      {section === "corrections" && <CorrectionsQueue token={token} />}
    </div>
  );
}

// ── §2 Stage 1 / §8: the committee → agency map ─────────────────────────

interface Rule {
  committee: string;
  agencies: string[];
  kind: "oversight" | "appropriations";
  source: string;
  version: number;
}

function JurisdictionTable({ token }: { token: string }) {
  const { data, mutate, isLoading } = useSWR<{ version: number; rules: Rule[] }>(
    [`${API_BASE}/congress-trades/admin/jurisdiction`, token],
    authed,
    { revalidateOnFocus: false },
  );
  const [draft, setDraft] = useState({ committee: "", agency: "", kind: "oversight", source: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  async function publish(changes: any[]) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/congress-trades/admin/jurisdiction`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ actor: "editorial-desk", changes }),
      });
      const out = await res.json();
      setMsg(out?.version ? `Published version ${out.version} with ${out.rows} mappings.` : out?.message || "Save failed.");
      await mutate();
    } catch (e: any) {
      setMsg(e?.message || "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <p className="text-[13px] text-mute">Loading the jurisdiction table…</p>;
  if (!data?.rules) return <p className="text-[13px] text-mute">{(data as any)?.message || "Could not load the table."}</p>;

  const rules = data.rules.filter(
    (r) =>
      !q ||
      r.committee.toLowerCase().includes(q.toLowerCase()) ||
      r.agencies.some((a) => a.toLowerCase().includes(q.toLowerCase())),
  );
  const mappings = data.rules.reduce((n, r) => n + r.agencies.length, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg p-3.5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[14px] font-bold m-0" style={{ color: "var(--text)" }}>
            Version {data.version} · {mappings} mappings
          </h3>
          <span className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>
            live version
          </span>
        </div>
        {/* §2 Stage 3 records the table version on every flag, so an edit that
            silently rewrote history would change what a published row claims
            it was judged against. */}
        <p className="text-[12.5px] leading-relaxed m-0 mt-1" style={{ color: "var(--text-soft)" }}>
          Saving publishes a <strong>new version</strong>. Rows already published keep the version that judged them, so
          an edit today never changes what yesterday&rsquo;s page says.
        </p>
      </div>

      <div className="rounded-lg p-3.5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
        <h4 className="text-[12.5px] font-bold m-0 mb-2" style={{ color: "var(--text)" }}>
          Add a mapping
        </h4>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <Field label="Committee or subcommittee">
            <input
              value={draft.committee}
              onChange={(e) => setDraft({ ...draft, committee: e.target.value })}
              placeholder="House Committee on Armed Services"
              className="text-[12.5px] rounded px-2 py-1 w-full"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </Field>
          <Field label="Awarding agency">
            <input
              value={draft.agency}
              onChange={(e) => setDraft({ ...draft, agency: e.target.value })}
              placeholder="Department of Defense"
              className="text-[12.5px] rounded px-2 py-1 w-full"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </Field>
          <Field label="Kind">
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              className="text-[12.5px] rounded px-2 py-1 w-full"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="oversight">Oversight</option>
              <option value="appropriations">Appropriations</option>
            </select>
          </Field>
          <Field label="Source">
            <input
              value={draft.source}
              onChange={(e) => setDraft({ ...draft, source: e.target.value })}
              placeholder="House Rule X"
              className="text-[12.5px] rounded px-2 py-1 w-full"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </Field>
        </div>
        <button
          disabled={busy || !draft.committee.trim() || !draft.agency.trim()}
          onClick={() => {
            publish([{ ...draft, committee: draft.committee.trim(), agency: draft.agency.trim() }]);
            setDraft({ committee: "", agency: "", kind: "oversight", source: "" });
          }}
          className="text-[12.5px] font-bold px-3 py-1.5 rounded mt-2.5"
          style={{
            background: "var(--accent)",
            color: "var(--on-accent)",
            opacity: busy || !draft.committee.trim() || !draft.agency.trim() ? 0.6 : 1,
          }}
        >
          {busy ? "Publishing…" : "Add and publish new version"}
        </button>
        {msg ? (
          <p className="text-[12.5px] font-semibold mt-2 m-0" style={{ color: "var(--accent)" }}>
            {msg}
          </p>
        ) : null}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by committee or agency"
        className="text-[12.5px] rounded-md px-2.5 py-1.5"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
      />

      {rules.map((r) => (
        <article
          key={`${r.committee}|${r.kind}`}
          className="rounded-lg p-3"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[13px] font-bold m-0" style={{ color: "var(--text)" }}>
              {r.committee}
            </h4>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>
              {r.kind}
            </span>
          </div>
          {r.source ? (
            <p className="text-[11.5px] m-0 mt-0.5" style={{ color: "var(--text-mute)" }}>
              {r.source}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {r.agencies.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11.5px]"
                style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}
              >
                {a}
                <button
                  disabled={busy}
                  onClick={() => publish([{ committee: r.committee, agency: a, remove: true }])}
                  title="Remove this mapping in a new version"
                  style={{ color: "var(--bad)" }}
                  className="font-bold"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

// ── §2 Stage 3: the manual resolution queue for the tail ────────────────

interface VendorRow {
  vendor_key: string;
  uei: string | null;
  vendor_name: string;
  evidence: string[];
  awards: number;
  award_value: number | null;
}

/**
 * §7 P1's acceptance number, on the screen rather than in a comment.
 *
 * It is shown as two figures on purpose. "Resolved" counts a decision — a
 * ticker, or a durable "not publicly listed" read off the recipient's own SAM
 * registration — and that is the figure the acceptance test is written
 * against. "With a ticker" is the smaller, separate answer to the different
 * question of how many of these a reader can actually trade, and it is smaller
 * because most federal contractors are not listed companies at all. Publishing
 * only the first would flatter the resolver; publishing only the second would
 * fail it for the shape of the federal contracting market.
 */
function ResolutionCoverage() {
  const { data } = useSWR<any>(`${API_BASE}/congress-trades/status`, (u: string) =>
    fetch(u).then((r) => r.json()),
  );
  const v = data?.vendorResolution;
  if (!v) return null;
  const a = v.awards || {};
  const target = 90;

  const Figure = ({ label, pct, sub }: { label: string; pct: number; sub: string }) => (
    <div className="flex-1 min-w-[150px]">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>
        {label}
      </div>
      <div className="text-[22px] font-bold leading-tight" style={{ color: "var(--text)" }}>
        {Number.isFinite(pct) ? `${pct}%` : "—"}
      </div>
      <div className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        {sub}
      </div>
    </div>
  );

  return (
    <section
      className="rounded-xl p-3.5 flex flex-col gap-2.5"
      style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
    >
      <div className="flex flex-wrap gap-4">
        <Figure
          label="Awards resolved"
          pct={a.decidedPct}
          sub={`${a.decided ?? 0} of ${a.awards ?? 0} awards · target ${target}%`}
        />
        <Figure
          label="Awards with a ticker"
          pct={a.tickerPct}
          sub={`${a.withTicker ?? 0} map to a listed company`}
        />
        <Figure
          label="Vendors resolved"
          pct={v.decidedPct}
          sub={`${v.unresolved ?? 0} of ${v.vendors ?? 0} still queued`}
        />
      </div>
      <p className="text-[11.5px] leading-relaxed m-0" style={{ color: "var(--text-mute)" }}>
        Resolved means a decision was reached automatically — a ticker, or a durable &ldquo;not publicly
        listed&rdquo; backed by the recipient&rsquo;s own SAM registration. The denominator is every vendor
        attempted; nothing is dropped for being hard. The ticker figure is always the smaller of the two,
        because most federal contractors are private firms, joint ventures, universities and public bodies.
      </p>
    </section>
  );
}

function VendorQueue({ token }: { token: string }) {
  const { data, mutate, isLoading } = useSWR<VendorRow[]>(
    [`${API_BASE}/congress-trades/admin/vendor-queue?limit=100`, token],
    authed,
    { revalidateOnFocus: false },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function decide(key: string, body: Record<string, any>) {
    setBusy(key);
    setMsg("");
    try {
      const res = await fetch(
        `${API_BASE}/congress-trades/admin/vendor-queue/${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-admin-token": token },
          body: JSON.stringify({ ...body, actor: "editorial-desk" }),
        },
      );
      const out = await res.json();
      setMsg(out?.ok ? "Saved." : out?.message || "Save failed.");
      await mutate();
    } catch (e: any) {
      setMsg(e?.message || "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  const shell = (body: React.ReactNode) => (
    <div className="flex flex-col gap-3">
      <ResolutionCoverage />
      {body}
    </div>
  );

  if (isLoading) return shell(<p className="text-[13px] text-mute">Loading the vendor queue…</p>);
  if (!Array.isArray(data))
    return shell(<p className="text-[13px] text-mute">{(data as any)?.message || "Could not load the queue."}</p>);
  if (!data.length)
    return shell(<p className="text-[13px] text-mute">No vendors waiting. Everything resolved automatically.</p>);

  return (
    <div className="flex flex-col gap-3">
      <ResolutionCoverage />
      {/* Ordering is by award dollars, and that is the point: the tail is long,
          so the hour spent here should go to the vendors carrying the money. */}
      <p className="text-[12.5px] m-0" style={{ color: "var(--text-mute)" }}>
        {data.length} vendor{data.length === 1 ? "" : "s"} the pipeline could not decide, largest award value first —
        work down from the top and the money is covered before the long tail.
      </p>
      {msg ? (
        <p className="text-[12.5px] font-semibold m-0" style={{ color: "var(--accent)" }}>
          {msg}
        </p>
      ) : null}

      {data.map((row) => (
        <article
          key={row.vendor_key}
          className="rounded-lg p-3.5"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[13.5px] font-bold m-0" style={{ color: "var(--text)" }}>
              {row.vendor_name}
            </h4>
            <span className="text-[11.5px] tabular" style={{ color: "var(--text-mute)" }}>
              {row.awards} award{row.awards === 1 ? "" : "s"} · {money(row.award_value)}
            </span>
          </div>
          {row.uei ? (
            <p className="text-[11px] m-0 mt-0.5 tabular" style={{ color: "var(--text-mute)" }}>
              UEI {row.uei}
            </p>
          ) : null}

          {row.evidence?.length ? (
            <ol className="list-decimal pl-4 m-0 mt-2">
              {row.evidence.map((line, i) => (
                <li key={i} className="text-[11.5px] py-[1px]" style={{ color: "var(--text-soft)" }}>
                  {line}
                </li>
              ))}
            </ol>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <input
              value={drafts[row.vendor_key] ?? ""}
              onChange={(e) => setDrafts({ ...drafts, [row.vendor_key]: e.target.value.toUpperCase() })}
              placeholder="Ticker"
              className="text-[12.5px] rounded px-2 py-1 tabular"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text)", width: 110 }}
            />
            <button
              disabled={busy === row.vendor_key || !(drafts[row.vendor_key] || "").trim()}
              onClick={() => decide(row.vendor_key, { ticker: (drafts[row.vendor_key] || "").trim(), status: "ticker" })}
              className="text-[12.5px] font-bold px-3 py-1.5 rounded"
              style={{
                background: "var(--accent)",
                color: "var(--on-accent)",
                opacity: busy === row.vendor_key || !(drafts[row.vendor_key] || "").trim() ? 0.6 : 1,
              }}
            >
              Save ticker
            </button>
            <button
              disabled={busy === row.vendor_key}
              onClick={() => decide(row.vendor_key, { status: "not_public" })}
              className="text-[12.5px] font-semibold px-3 py-1.5 rounded"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}
              title="No listed security — a private firm, joint venture, university or public body."
            >
              Not publicly listed
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

// ── §2 Stage 5 class (c): the corrections the agent never self-publishes ─

interface QueueRow {
  id: number;
  flag_id: number | null;
  reason: string;
  proposal: any;
  evidence: string | null;
  source: string;
  member: string | null;
  ticker: string | null;
  agency: string | null;
  headline: string | null;
  score: number | null;
}

function CorrectionsQueue({ token }: { token: string }) {
  const { data, mutate, isLoading } = useSWR<QueueRow[]>(
    [`${API_BASE}/congress-trades/admin/review-queue`, token],
    authed,
    { revalidateOnFocus: false },
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});

  async function resolve(id: number, decision: "publish" | "retire" | "dismiss") {
    setBusy(id);
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/congress-trades/admin/review-queue/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ decision, actor: "editorial-desk", note: notes[id] || undefined }),
      });
      const out = await res.json();
      setMsg(out?.ok ? `Closed #${id} as ${decision}.` : out?.message || "Save failed.");
      await mutate();
    } catch (e: any) {
      setMsg(e?.message || "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <p className="text-[13px] text-mute">Loading corrections…</p>;
  if (!Array.isArray(data)) return <p className="text-[13px] text-mute">{(data as any)?.message || "Could not load the queue."}</p>;
  if (!data.length) return <p className="text-[13px] text-mute">Nothing waiting. The agent has handled everything itself.</p>;

  return (
    <div className="flex flex-col gap-3">
      {/* Every row here is held OFF the public page until a person decides —
          §2 Stage 5 reserves this class for a human precisely because it moves
          a named person's ranking or adds a claim. */}
      <p className="text-[12.5px] m-0" style={{ color: "var(--text-mute)" }}>
        {data.length} item{data.length === 1 ? "" : "s"} the agent would not decide alone. None of these rows is on the
        public page while it waits here.
      </p>
      {msg ? (
        <p className="text-[12.5px] font-semibold m-0" style={{ color: "var(--accent)" }}>
          {msg}
        </p>
      ) : null}

      {data.map((row) => (
        <article
          key={row.id}
          className="rounded-lg p-3.5"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[13.5px] font-bold m-0" style={{ color: "var(--text)" }}>
              {row.member || "unknown member"}
              {row.ticker ? ` · ${row.ticker}` : ""}
              {row.agency ? ` · ${row.agency}` : ""}
            </h4>
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>
              {row.source === "report" ? "reader report" : "agent"}
              {row.score != null ? ` · CTS ${Math.round(row.score)}` : ""}
            </span>
          </div>

          <p className="text-[12.5px] font-semibold m-0 mt-1" style={{ color: "var(--text)" }}>
            {row.reason}
          </p>
          {row.headline ? (
            <p className="text-[12.5px] leading-relaxed m-0 mt-1" style={{ color: "var(--text-soft)" }}>
              {row.headline}
            </p>
          ) : null}
          {row.evidence && row.evidence !== row.headline ? (
            <p className="text-[11.5px] leading-relaxed m-0 mt-1" style={{ color: "var(--text-mute)" }}>
              {row.evidence}
            </p>
          ) : null}
          {row.proposal ? (
            <pre
              className="text-[11px] rounded p-2 mt-2 overflow-x-auto m-0"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}
            >
              {JSON.stringify(row.proposal, null, 1)}
            </pre>
          ) : null}

          <input
            value={notes[row.id] ?? ""}
            onChange={(e) => setNotes({ ...notes, [row.id]: e.target.value })}
            placeholder="Note for the audit log (optional)"
            className="text-[12.5px] rounded px-2 py-1 w-full mt-2"
            style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text)" }}
          />

          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            <button
              disabled={busy === row.id}
              onClick={() => resolve(row.id, "publish")}
              className="text-[12.5px] font-bold px-3 py-1.5 rounded"
              style={{ background: "var(--accent)", color: "var(--on-accent)", opacity: busy === row.id ? 0.6 : 1 }}
            >
              Publish
            </button>
            <button
              disabled={busy === row.id}
              onClick={() => resolve(row.id, "retire")}
              className="text-[12.5px] font-semibold px-3 py-1.5 rounded"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--bad)" }}
              title="Take the row down — a leg no longer holds."
            >
              Retire
            </button>
            <button
              disabled={busy === row.id}
              onClick={() => resolve(row.id, "dismiss")}
              className="text-[12.5px] font-semibold px-3 py-1.5 rounded"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}
              title="Close without changing the row."
            >
              Dismiss
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

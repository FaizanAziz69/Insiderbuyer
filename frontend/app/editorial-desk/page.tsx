"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, RefreshCw, X } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";

/**
 * The Editorial Desk — Editorial Playbook v2 §2 Layer 3 ("the content team
 * member reads the briefing, picks the top candidate, and begins writing") plus
 * §3, §6, §7 and §10 rendered from the same codified spec the publish route
 * enforces.
 *
 * Internal tool, not a reader page: it is `noindex`, it is not linked from the
 * navigation, and every write it makes goes through the admin token.
 *
 * THE TOKEN. Story Desk routes sit behind `AdminTokenGuard`, and production has
 * no `ADMIN_API_TOKEN` set — so those endpoints answer 503 until ops sets one.
 * The token is held in this browser's localStorage rather than baked into the
 * bundle (a build-time env var would ship the secret to every visitor). The
 * playbook and the checklist are unguarded, so the reference material and the
 * pre-publish check work with no token at all.
 */

const TOKEN_KEY = "ib-admin-token";

interface Pitch {
  id: string;
  priority: number;
  ticker: string | null;
  companyName: string;
  signals: string[];
  headline: string;
  lede: string;
  insiderAngle: string;
  watchFor: string;
  suggestedViz: string | null;
  category: string | null;
  status: string;
  publishedSlug: string | null;
}

interface Briefing {
  runsEnabled: boolean;
  generatorReady: boolean;
  runs: Array<{ runAt: string; pitches: Pitch[] }>;
}

interface Playbook {
  meta: {
    version: string;
    updated: string;
    refreshCycle: string;
    standard: string;
    threeQuestions: string[];
  };
  categories: string[];
  articleArc: Array<{ section: string; length: string; purpose: string }>;
  voicePrinciples: Array<{ principle: string; practice: string }>;
  headlineFormats: Array<{ format: string; rule: string; weak: string; strong: string }>;
  headlineMaxWords: number;
  wordCount: { min: number; max: number };
  bannedHeadlineWords: string[];
  bannedBodyWords: string[];
  vizTypes: Array<{
    key: string;
    title: string;
    whenToUse: string;
    embed: string;
    note: string;
  }>;
  slots: Array<{ slot: number; position: string; role: string; refresh: string }>;
  evergreenTypes: string[];
  sourceWatchlist: Array<{ source: string; look: string; url: string; cadence: string }>;
  disclaimer: string;
}

interface Check {
  id: string;
  label: string;
  passed: boolean;
  severity: "error" | "warning";
  detail?: string;
  section: string;
}

interface ChecklistReport {
  ok: boolean;
  errors: number;
  warnings: number;
  wordCount: number;
  checks: Check[];
}

const PRIORITY_STYLE: Record<number, { label: string; color: string }> = {
  1: { label: "PRIORITY 1", color: "var(--bad)" },
  2: { label: "PRIORITY 2", color: "var(--gold)" },
  3: { label: "PRIORITY 3", color: "var(--text-mute)" },
};

export default function EditorialDeskPage() {
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<"briefing" | "checklist" | "playbook">("briefing");

  useEffect(() => {
    try {
      setToken(localStorage.getItem(TOKEN_KEY) || "");
    } catch {
      /* private window — the Desk still renders the reference material */
    }
  }, []);

  const saveToken = (value: string) => {
    setToken(value);
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* nothing to do — the token just will not persist across reloads */
    }
  };

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8">
      <header className="mb-6">
        <p
          className="text-[11px] font-bold uppercase tracking-wider mb-1"
          style={{ color: "var(--accent)" }}
        >
          Internal · Editorial Operations
        </p>
        <h1 className="text-[28px] sm:text-[34px] font-bold leading-tight">
          The Editorial Desk
        </h1>
        <p className="mt-2 text-[14px] text-soft max-w-[70ch]">
          Story briefing, pre-publish checklist and the Playbook v2 rules, all
          read from the same spec the publish route enforces.
        </p>
      </header>

      <TokenBar token={token} onChange={saveToken} />

      <nav className="flex gap-1 mt-6 mb-5" role="tablist">
        {(
          [
            ["briefing", "Story briefing"],
            ["checklist", "Pre-publish check"],
            ["playbook", "The playbook"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className="px-3.5 py-2 text-[13px] font-semibold rounded-t-lg"
            style={{
              background: tab === key ? "var(--bg-2)" : "transparent",
              border: "1px solid",
              borderColor: tab === key ? "var(--border)" : "transparent",
              borderBottomColor: tab === key ? "var(--bg-2)" : "var(--border)",
              color: tab === key ? "var(--text)" : "var(--text-mute)",
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "briefing" && <BriefingTab token={token} />}
      {tab === "checklist" && <ChecklistTab token={token} />}
      {tab === "playbook" && <PlaybookTab />}
    </main>
  );
}

function TokenBar({ token, onChange }: { token: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(token);
  useEffect(() => setDraft(token), [token]);
  return (
    <div
      className="rounded-lg p-3.5 flex flex-wrap items-center gap-3"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <label className="text-[12px] font-semibold whitespace-nowrap">
        Admin token
      </label>
      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="x-admin-token — ask ops for ADMIN_API_TOKEN"
        className="flex-1 min-w-[220px] px-3 py-1.5 text-[13px] rounded font-mono"
        style={{ background: "var(--bg-1)", border: "1px solid var(--border)", color: "var(--text)" }}
      />
      <button
        onClick={() => onChange(draft.trim())}
        className="px-3 py-1.5 text-[12.5px] font-semibold rounded"
        style={{ background: "var(--accent)", color: "var(--on-accent)" }}
      >
        Save
      </button>
      {token ? (
        <span className="text-[11.5px]" style={{ color: "var(--good)" }}>
          Stored in this browser only
        </span>
      ) : (
        <span className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>
          The briefing needs this; the playbook and the check do not
        </span>
      )}
    </div>
  );
}

/** SWR fetcher that carries the admin header. */
function adminFetcher(token: string) {
  return async (url: string) => {
    const res = await fetch(url, { headers: token ? { "x-admin-token": token } : {} });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        body?.message ||
          (res.status === 503
            ? "Admin endpoints are disabled — ADMIN_API_TOKEN is not set on the server."
            : `Request failed (${res.status})`),
      );
    }
    return res.json();
  };
}

function BriefingTab({ token }: { token: string }) {
  const { data, error, isLoading, mutate } = useSWR<Briefing>(
    `${API_BASE}/story-desk/briefing?days=5`,
    adminFetcher(token),
    { revalidateOnFocus: false },
  );
  const [running, setRunning] = useState(false);

  const runNow = useCallback(async () => {
    setRunning(true);
    try {
      await fetch(`${API_BASE}/story-desk/run`, {
        method: "POST",
        headers: token ? { "x-admin-token": token } : {},
      });
      await mutate();
    } finally {
      setRunning(false);
    }
  }, [token, mutate]);

  const setStatus = async (id: string, status: string) => {
    await fetch(`${API_BASE}/story-desk/pitch/${id}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-admin-token": token } : {}),
      },
      body: JSON.stringify({ status }),
    });
    await mutate();
  };

  if (error) {
    return (
      <Notice
        kind="error"
        title="Briefing unavailable"
        body={String(error.message || error)}
      />
    );
  }
  if (isLoading && !data) return <div className="shimmer rounded-lg h-[260px]" />;

  const runs = data?.runs || [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={runNow}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold rounded"
          style={{ background: "var(--accent)", color: "var(--on-accent)", opacity: running ? 0.6 : 1 }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Running discovery…" : "Run discovery now"}
        </button>
        <span className="text-[12px]" style={{ color: "var(--text-mute)" }}>
          Scheduled 07:00 and 13:00 ET, weekdays.
          {data && !data.runsEnabled ? " Scheduled runs are currently OFF." : ""}
          {data && !data.generatorReady ? " Model key not configured." : ""}
        </span>
      </div>

      {runs.length === 0 ? (
        <Notice
          kind="info"
          title="No briefings yet"
          body="Run discovery to build the first one. It cross-references Form 4 filings from the last 24 hours against the movers table and the news feed."
        />
      ) : (
        runs.map((run) => (
          <section key={run.runAt} className="mb-8">
            <h2
              className="text-[12px] font-bold uppercase tracking-wider mb-3 pb-1.5"
              style={{ color: "var(--text-mute)", borderBottom: "1px solid var(--border)" }}
            >
              Briefing · {new Date(run.runAt).toLocaleString()}
            </h2>
            <div className="space-y-3">
              {run.pitches.map((p) => (
                <PitchCard key={p.id} pitch={p} onStatus={setStatus} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function PitchCard({
  pitch,
  onStatus,
}: {
  pitch: Pitch;
  onStatus: (id: string, status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pri = PRIORITY_STYLE[pitch.priority] || PRIORITY_STYLE[3];
  const dim = pitch.status === "passed";

  return (
    <article
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div className="px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: pri.color, color: "#fff" }}
          >
            {pri.label}
          </span>
          {pitch.category ? (
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              {pitch.category}
            </span>
          ) : null}
          {pitch.ticker ? (
            <Link
              href={`/companies/${pitch.ticker}`}
              className="text-[11.5px] font-mono font-bold hover:underline"
              style={{ color: "var(--text-soft)" }}
            >
              {pitch.ticker}
            </Link>
          ) : (
            <span className="text-[11.5px]" style={{ color: "var(--text-soft)" }}>
              {pitch.companyName}
            </span>
          )}
          {pitch.status !== "open" ? (
            <span className="text-[10.5px] uppercase tracking-wider" style={{ color: "var(--text-mute)" }}>
              · {pitch.status}
            </span>
          ) : null}
        </div>

        <h3 className="text-[17px] font-bold leading-snug">{pitch.headline}</h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-soft">{pitch.lede}</p>

        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-accent"
        >
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform"
            style={{ transform: open ? "rotate(180deg)" : undefined }}
          />
          {open ? "Hide" : "Insider angle, signals & what to watch"}
        </button>

        {open ? (
          <div className="mt-3 space-y-3 text-[13px] leading-relaxed">
            <Field label="Insider angle" value={pitch.insiderAngle} />
            <Field label="Watch for" value={pitch.watchFor} />
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-mute)" }}
              >
                Signals that flagged it
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-soft">
                {pitch.signals.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            {pitch.suggestedViz ? (
              <div>
                <div
                  className="text-[10px] font-bold uppercase tracking-wider mb-1"
                  style={{ color: "var(--text-mute)" }}
                >
                  Suggested visualization
                </div>
                <code
                  className="block text-[11.5px] font-mono px-2.5 py-1.5 rounded overflow-x-auto"
                  style={{ background: "var(--bg-3)" }}
                >
                  {pitch.suggestedViz === "pull-quote"
                    ? `<div data-viz="pull-quote">One striking stat.</div>`
                    : `<div data-viz="${pitch.suggestedViz}"${pitch.ticker ? ` data-ticker="${pitch.ticker}"` : ""}></div>`}
                </code>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className="px-4 py-2 flex flex-wrap gap-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {(
          [
            ["writing", "Taking it"],
            ["published", "Published"],
            ["passed", "Pass"],
            ["open", "Reopen"],
          ] as const
        ).map(([status, label]) => (
          <button
            key={status}
            onClick={() => onStatus(pitch.id, status)}
            className="px-2.5 py-1 text-[11.5px] font-semibold rounded"
            style={{
              border: "1px solid var(--border)",
              color: pitch.status === status ? "var(--accent)" : "var(--text-soft)",
              background: pitch.status === status ? "var(--accent-soft)" : "transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div
        className="text-[10px] font-bold uppercase tracking-wider mb-1"
        style={{ color: "var(--text-mute)" }}
      >
        {label}
      </div>
      <p className="text-soft">{value}</p>
    </div>
  );
}

/** §10 — paste a draft, see every checkbox resolved before publishing. */
function ChecklistTab({ token }: { token: string }) {
  const [draft, setDraft] = useState({
    slug: "",
    title: "",
    summary: "",
    body: "",
    category: "",
    ticker: "",
    imageUrl: "",
    imageAlt: "",
    tags: "",
  });
  const [report, setReport] = useState<ChecklistReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/content/editorial/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-admin-token": token } : {}),
        },
        body: JSON.stringify({
          ...draft,
          tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Request failed (${res.status})`);
      }
      setReport(await res.json());
    } catch (e: any) {
      setError(String(e?.message || e));
      setReport(null);
    } finally {
      setBusy(false);
    }
  };

  const field = (
    key: keyof typeof draft,
    label: string,
    opts: { textarea?: boolean; placeholder?: string; rows?: number } = {},
  ) => (
    <label className="block mb-3">
      <span className="block text-[11.5px] font-semibold mb-1">{label}</span>
      {opts.textarea ? (
        <textarea
          value={draft[key]}
          rows={opts.rows || 8}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          placeholder={opts.placeholder}
          className="w-full px-3 py-2 text-[13px] rounded font-mono"
          style={{ background: "var(--bg-1)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      ) : (
        <input
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          placeholder={opts.placeholder}
          className="w-full px-3 py-1.5 text-[13px] rounded"
          style={{ background: "var(--bg-1)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      )}
    </label>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div>
        {field("title", "Headline (max 12 words)")}
        {field("slug", "Slug", { placeholder: "editorial-mrna-insider-data-cancer-2026-08-27" })}
        {field("category", "Category tag", { placeholder: "MARKET MOVER" })}
        {field("ticker", "Ticker", { placeholder: "MRNA" })}
        {field("summary", "Summary / meta description (max 155 chars)")}
        {field("imageUrl", "Thumbnail URL")}
        {field("imageAlt", "Thumbnail alt text")}
        {field("tags", "Tags (comma separated)")}
        {field("body", "Body HTML", {
          textarea: true,
          rows: 14,
          placeholder: '<p>Lede…</p>\n<div data-viz="insider-timeline" data-ticker="MRNA"></div>',
        })}
        <button
          onClick={run}
          disabled={busy}
          className="px-4 py-2 text-[13px] font-semibold rounded"
          style={{ background: "var(--accent)", color: "var(--on-accent)", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Checking…" : "Run the checklist"}
        </button>
      </div>

      <div>
        {error ? <Notice kind="error" title="Check failed" body={error} /> : null}
        {report ? (
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            <div
              className="px-4 py-3"
              style={{
                background: report.ok ? "var(--good-soft)" : "var(--bad-soft)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <strong className="text-[14px]">
                {report.ok
                  ? "Ready to publish"
                  : `${report.errors} error${report.errors === 1 ? "" : "s"} block publishing`}
              </strong>
              <span className="ml-2 text-[12.5px]" style={{ color: "var(--text-soft)" }}>
                {report.warnings} warning{report.warnings === 1 ? "" : "s"} ·{" "}
                {report.wordCount} words
              </span>
            </div>
            <ul>
              {report.checks.map((c) => (
                <li
                  key={c.id}
                  className="px-4 py-2.5 flex gap-2.5 items-start"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <span className="mt-0.5 flex-shrink-0">
                    {c.passed ? (
                      <Check className="h-4 w-4" style={{ color: "var(--good)" }} />
                    ) : c.severity === "error" ? (
                      <X className="h-4 w-4" style={{ color: "var(--bad)" }} />
                    ) : (
                      <AlertTriangle className="h-4 w-4" style={{ color: "var(--gold)" }} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="text-[13px]"
                      style={{ color: c.passed ? "var(--text-soft)" : "var(--text)" }}
                    >
                      {c.label}
                    </span>
                    <span className="ml-1.5 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                      §{c.section}
                    </span>
                    {c.detail ? (
                      <span className="block text-[12px] mt-0.5" style={{ color: "var(--text-mute)" }}>
                        {c.detail}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : !error ? (
          <Notice
            kind="info"
            title="The §10 checklist"
            body="Paste a draft on the left. Every item the manual lists is checked here — headline length, the mandatory viz embed, the Form 4 attribution, the paywalled score, links, the CTA, word count and the voice rules. Errors block the publish route; warnings do not."
          />
        ) : null}
      </div>
    </div>
  );
}

function PlaybookTab() {
  const { data, isLoading } = useSWR<Playbook>(
    `${API_BASE}/content/editorial-playbook`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
      },
      () => setCopied(null),
    );
  };

  if (isLoading && !data) return <div className="shimmer rounded-lg h-[400px]" />;
  if (!data) return null;

  return (
    <div className="space-y-8">
      <Panel title={`The standard · v${data.meta.version}, ${data.meta.updated}`}>
        <p className="text-[13.5px] leading-relaxed text-soft">{data.meta.standard}</p>
        <ol className="mt-3 list-decimal pl-5 space-y-1 text-[13px]">
          {data.meta.threeQuestions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
        <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-mute)" }}>
          If the answer to any of these is no, the article is not ready to publish.
        </p>
      </Panel>

      <Panel title="§7 — the six data visualizations (one per article, minimum)">
        <div className="space-y-3">
          {data.vizTypes.map((v) => (
            <div key={v.key} className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-[13.5px]">{v.title}</strong>
                <button
                  onClick={() => copy(v.embed, v.key)}
                  className="text-[11.5px] font-semibold text-accent"
                >
                  {copied === v.key ? "Copied" : "Copy embed"}
                </button>
              </div>
              <p className="text-[12.5px] mt-0.5" style={{ color: "var(--text-soft)" }}>
                {v.whenToUse}
              </p>
              <code
                className="block text-[11.5px] font-mono px-2.5 py-1.5 rounded mt-1.5 overflow-x-auto"
                style={{ background: "var(--bg-3)" }}
              >
                {v.embed}
              </code>
              <p className="text-[11.5px] mt-1" style={{ color: "var(--text-mute)" }}>
                {v.note}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="§5 — the article arc">
        <table className="w-full text-[13px]">
          <tbody>
            {data.articleArc.map((s) => (
              <tr key={s.section} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="py-2 pr-3 font-semibold whitespace-nowrap align-top">
                  {s.section}
                </td>
                <td
                  className="py-2 pr-3 whitespace-nowrap align-top text-[12px]"
                  style={{ color: "var(--text-mute)" }}
                >
                  {s.length}
                </td>
                <td className="py-2 text-soft align-top">{s.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="§4 — the six voice principles">
        <div className="space-y-2.5">
          {data.voicePrinciples.map((v) => (
            <div key={v.principle}>
              <strong className="text-[13px]">{v.principle}</strong>
              <p className="text-[12.5px] text-soft">{v.practice}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`§6 — headlines (max ${data.headlineMaxWords} words)`}>
        <div className="space-y-4">
          {data.headlineFormats.map((h) => (
            <div key={h.format}>
              <strong className="text-[13px]">{h.format}</strong>
              <p className="text-[12.5px] text-soft mb-1.5">{h.rule}</p>
              <p className="text-[13px]" style={{ color: "var(--bad)" }}>
                ✗ {h.weak}
              </p>
              <p className="text-[13px]" style={{ color: "var(--good)" }}>
                ✓ {h.strong}
              </p>
            </div>
          ))}
          <p className="text-[12.5px]" style={{ color: "var(--text-mute)" }}>
            Never in a headline: {data.bannedHeadlineWords.join(", ")}. Never in
            the body: {data.bannedBodyWords.join(", ")}.
          </p>
        </div>
      </Panel>

      <Panel title="§8 — the five slots">
        <p className="text-[12.5px] mb-2.5" style={{ color: "var(--text-mute)" }}>
          Rotation is automatic on this site: Top Stories shows the newest
          editorial articles in publish order, so a new article is slot 1 and
          everything below it steps down on its own. There is no CMS step.
        </p>
        <table className="w-full text-[13px]">
          <tbody>
            {data.slots.map((s) => (
              <tr key={s.slot} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="py-2 pr-3 font-semibold whitespace-nowrap align-top">
                  {s.slot}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap align-top">{s.position}</td>
                <td className="py-2 pr-3 text-soft align-top">{s.role}</td>
                <td
                  className="py-2 whitespace-nowrap align-top text-[12px]"
                  style={{ color: "var(--text-mute)" }}
                >
                  {s.refresh}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[12.5px] mt-3 mb-1 font-semibold">
          Evergreen options for slots 4–5 on a slow news day
        </p>
        <ul className="list-disc pl-5 text-[12.5px] text-soft space-y-0.5">
          {data.evergreenTypes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="§3 — the daily source watchlist">
        <table className="w-full text-[12.5px]">
          <tbody>
            {data.sourceWatchlist.map((s) => (
              <tr key={s.source} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="py-2 pr-3 font-semibold align-top whitespace-nowrap">
                  {s.url.startsWith("/") ? (
                    <Link href={s.url} className="text-accent hover:underline">
                      {s.source}
                    </Link>
                  ) : (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {s.source}
                    </a>
                  )}
                </td>
                <td className="py-2 pr-3 text-soft align-top">{s.look}</td>
                <td
                  className="py-2 align-top whitespace-nowrap"
                  style={{ color: "var(--text-mute)" }}
                >
                  {s.cadence}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="§9 — the disclaimer">
        <p className="text-[12.5px] text-soft leading-relaxed">{data.disclaimer}</p>
        <p className="text-[11.5px] mt-2" style={{ color: "var(--text-mute)" }}>
          Rendered automatically by the article page's compliance footer — do not
          paste it into the body, or it appears twice.
        </p>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <h2
        className="px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider"
        style={{ background: "var(--brand-surface)", color: "var(--gold)" }}
      >
        {title}
      </h2>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

function Notice({
  kind,
  title,
  body,
}: {
  kind: "error" | "info";
  title: string;
  body: string;
}) {
  return (
    <div
      className="rounded-lg px-4 py-3.5"
      style={{
        background: kind === "error" ? "var(--bad-soft)" : "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <strong className="text-[13.5px]">{title}</strong>
      <p className="text-[13px] mt-1 text-soft leading-relaxed">{body}</p>
    </div>
  );
}

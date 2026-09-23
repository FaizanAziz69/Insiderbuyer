"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/api";

interface RequestRow {
  id: string;
  dataset: string;
  datasetLabel: string;
  name: string;
  title: string;
  company: string;
  companyEmail: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
}

interface ActionSigs {
  exp: string;
  approveSig: string;
  declineSig: string;
}

type QueueRow = RequestRow & ActionSigs;

type Action = "approve" | "decline";

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? { bg: "var(--good-soft)", fg: "var(--good-strong)" }
      : status === "declined"
        ? { bg: "var(--bad-soft)", fg: "var(--bad-strong)" }
        : { bg: "var(--gold-soft)", fg: "var(--text)" };
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {status}
    </span>
  );
}

/** Post a decision. The signature in the link is the whole credential, so the
 *  call carries no token and the page never asks for one. */
async function decide(
  params: { id: string; action: Action; exp: string; sig: string },
): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/data-access/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || "That did not go through.");
  return json;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12" style={{ color: "var(--text)" }}>
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-mute)" }}>
        InsiderBuying desk
      </p>
      <h1 className="mt-1 mb-7 text-[26px] font-bold leading-tight">Dataset access requests</h1>
      {children}
    </main>
  );
}

/** One request, opened straight from an Approve or Decline button in the mail.
 *  The click in the email only brought you here; this is where it is decided. */
function Single({ id, action, exp, sig }: { id: string; action: Action; exp: string; sig: string }) {
  const [row, setRow] = useState<RequestRow | null>(null);
  const [actions, setActions] = useState<ActionSigs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ id, action, exp, sig });
    fetch(`${API_BASE}/data-access/review?${qs}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message || "This link is not valid.");
        return j;
      })
      .then((j) => {
        setRow(j.request);
        setActions(j.actions);
      })
      .catch((e) => setError(e.message));
  }, [id, action, exp, sig]);

  const act = useCallback(
    async (which: Action) => {
      // The emailed link is signed for ONE action, so both buttons post with
      // the pair the server minted when it let us read the request — that is
      // how arriving on Approve and deciding to Decline still works.
      if (!actions) return;
      setBusy(which);
      setError(null);
      try {
        const r = await decide({
          id,
          action: which,
          exp: actions.exp,
          sig: which === "approve" ? actions.approveSig : actions.declineSig,
        });
        setDone(r.status);
        setRow((prev) => (prev ? { ...prev, status: r.status } : prev));
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not go through.");
      } finally {
        setBusy(null);
      }
    },
    [id, actions],
  );

  if (error && !row) {
    return (
      <Shell>
        <p style={{ color: "var(--bad-strong)" }}>{error}</p>
        <p className="mt-3 text-[13px]" style={{ color: "var(--text-mute)" }}>
          Links stay valid for 30 days. Ask for a fresh notification, or open the full list from any
          newer request email.
        </p>
      </Shell>
    );
  }
  if (!row) {
    return (
      <Shell>
        <p style={{ color: "var(--text-mute)" }}>Loading the request…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <dl className="grid gap-y-3 text-[14px]" style={{ gridTemplateColumns: "150px 1fr" }}>
        <dt style={{ color: "var(--text-mute)" }}>Requested</dt>
        <dd>{when(row.createdAt)}</dd>
        <dt style={{ color: "var(--text-mute)" }}>Who</dt>
        <dd>
          <strong>{row.name}</strong>, {row.title}
        </dd>
        <dt style={{ color: "var(--text-mute)" }}>Company</dt>
        <dd>{row.company}</dd>
        <dt style={{ color: "var(--text-mute)" }}>Email</dt>
        <dd>
          <a href={`mailto:${row.companyEmail}`} style={{ color: "var(--accent)" }}>
            {row.companyEmail}
          </a>
        </dd>
        <dt style={{ color: "var(--text-mute)" }}>Dataset</dt>
        <dd>{row.datasetLabel}</dd>
        <dt style={{ color: "var(--text-mute)" }}>Status</dt>
        <dd>
          <StatusChip status={row.status} />
        </dd>
      </dl>

      {done ? (
        <div className="mt-8">
          <p className="text-[15px] font-semibold">
            {done === "approved"
              ? "Approved. The access link is on its way to their company address."
              : "Declined. Nothing was sent to them."}
          </p>
          <p className="mt-2 text-[13px]" style={{ color: "var(--text-mute)" }}>
            You can change this later from the request list.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => act("approve")}
              className="rounded px-5 py-2.5 text-[14px] font-bold"
              style={{ background: "var(--good)", color: "#ffffff", opacity: busy ? 0.6 : 1 }}
            >
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => act("decline")}
              className="rounded px-5 py-2.5 text-[14px] font-bold"
              style={{
                background: "transparent",
                color: "var(--text)",
                border: "1px solid var(--border-strong)",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy === "decline" ? "Declining…" : "Decline"}
            </button>
          </div>
          <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-mute)" }}>
            Approving mints an access key and emails it to {row.companyEmail}. Declining sends them
            nothing.
          </p>
        </>
      )}
      {error ? (
        <p className="mt-4 text-[13px]" style={{ color: "var(--bad-strong)" }}>
          {error}
        </p>
      ) : null}
    </Shell>
  );
}

/** The whole queue, from the "see every access request" link. */
function Queue({ exp, sig }: { exp: string; sig: string }) {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ exp, sig });
    fetch(`${API_BASE}/data-access/queue?${qs}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message || "This link is not valid.");
        return j;
      })
      .then((j) => setRows(j.rows || []))
      .catch((e) => setError(e.message));
  }, [exp, sig]);

  useEffect(load, [load]);

  const act = async (row: QueueRow, action: Action) => {
    setBusy(`${row.id}:${action}`);
    setError(null);
    try {
      await decide({
        id: row.id,
        action,
        exp: row.exp,
        sig: action === "approve" ? row.approveSig : row.declineSig,
      });
      setRows((prev) =>
        (prev || []).map((r) =>
          r.id === row.id ? { ...r, status: action === "approve" ? "approved" : "declined" } : r,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(null);
    }
  };

  if (error && !rows) {
    return (
      <Shell>
        <p style={{ color: "var(--bad-strong)" }}>{error}</p>
      </Shell>
    );
  }
  if (!rows) {
    return (
      <Shell>
        <p style={{ color: "var(--text-mute)" }}>Loading requests…</p>
      </Shell>
    );
  }
  if (rows.length === 0) {
    return (
      <Shell>
        <p style={{ color: "var(--text-mute)" }}>Nobody has requested a dataset yet.</p>
      </Shell>
    );
  }

  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <Shell>
      <p className="-mt-4 mb-6 text-[13px]" style={{ color: "var(--text-mute)" }}>
        {rows.length} request{rows.length === 1 ? "" : "s"}
        {pending > 0 ? `, ${pending} waiting on you` : ", none waiting"}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "var(--text-mute)" }}>
              {["Requested", "Who", "Dataset", "Status", ""].map((h) => (
                <th
                  key={h}
                  className="py-2 pr-4 text-left text-[11px] font-bold uppercase tracking-wider"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="py-3 pr-4 align-top whitespace-nowrap" style={{ color: "var(--text-mute)" }}>
                  {when(r.createdAt)}
                </td>
                <td className="py-3 pr-4 align-top">
                  <div className="font-semibold">{r.name}</div>
                  <div style={{ color: "var(--text-mute)" }}>
                    {r.title} · {r.company}
                  </div>
                  <a href={`mailto:${r.companyEmail}`} style={{ color: "var(--accent)" }}>
                    {r.companyEmail}
                  </a>
                </td>
                <td className="py-3 pr-4 align-top">{r.datasetLabel}</td>
                <td className="py-3 pr-4 align-top">
                  <StatusChip status={r.status} />
                </td>
                <td className="py-3 align-top whitespace-nowrap">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act(r, "approve")}
                    className="mr-2 rounded px-3 py-1.5 text-[12.5px] font-bold"
                    style={{ background: "var(--good)", color: "#ffffff", opacity: busy ? 0.6 : 1 }}
                  >
                    {busy === `${r.id}:approve` ? "…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act(r, "decline")}
                    className="rounded px-3 py-1.5 text-[12.5px] font-bold"
                    style={{
                      background: "transparent",
                      color: "var(--text)",
                      border: "1px solid var(--border-strong)",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    {busy === `${r.id}:decline` ? "…" : "Decline"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? (
        <p className="mt-4 text-[13px]" style={{ color: "var(--bad-strong)" }}>
          {error}
        </p>
      ) : null}
      <p className="mt-6 text-[12px]" style={{ color: "var(--text-mute)" }}>
        Approving emails the access link to the requester's company address. Re-deciding a request
        is allowed; approving one that was declined sends the link then.
      </p>
    </Shell>
  );
}

function Inner() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const exp = params.get("exp") || "";
  const sig = params.get("sig") || "";
  const action: Action = params.get("action") === "decline" ? "decline" : "approve";

  if (!exp || !sig) {
    return (
      <Shell>
        <p style={{ color: "var(--text-mute)" }}>
          This page opens from the link in an access-request email. Those links carry the
          authorisation; there is nothing to see without one.
        </p>
      </Shell>
    );
  }
  return id ? <Single id={id} action={action} exp={exp} sig={sig} /> : <Queue exp={exp} sig={sig} />;
}

export default function PageClient() {
  return (
    <Suspense
      fallback={
        <Shell>
          <p style={{ color: "var(--text-mute)" }}>Loading…</p>
        </Shell>
      }
    >
      <Inner />
    </Suspense>
  );
}

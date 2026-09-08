"use client";
import useSWR from "swr";
import { API_BASE } from "@/lib/api";

const STATUSES = ["received", "in_review", "approved", "published", "reported"] as const;
const LABEL: Record<string, string> = { received: "Received", in_review: "In Review", approved: "Approved", published: "Published", reported: "Reported" };

interface Row {
  id: string;
  package: string;
  packageName: string;
  amountCents: number;
  email: string;
  status: string;
  company: string | null;
  ticker: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  writeForMe: boolean;
  pressKitFilename: string | null;
  notes: string | null;
  intakeCompleted: boolean;
  createdAt: string;
  attribution: Record<string, string> | null;
}

/** Brief v3 §6 — the press-order queue: Received → In Review → Approved → Published → Reported. */
export function PressOrdersAdmin({ token }: { token: string }) {
  const headers = token ? { "x-admin-token": token, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  const { data, error, mutate, isLoading } = useSWR<{ rows: Row[] }>(
    token ? `${API_BASE}/press/orders` : null,
    (url: string) =>
      fetch(url, { headers }).then(async (r) => {
        if (!r.ok) throw new Error(r.status === 503 ? "ADMIN_API_TOKEN is not set on the server" : r.status === 401 || r.status === 403 ? "Token rejected" : `HTTP ${r.status}`);
        return r.json();
      }),
  );
  const setStatus = async (id: string, status: string) => {
    await fetch(`${API_BASE}/press/orders/${id}/status`, { method: "PATCH", headers, body: JSON.stringify({ status }) });
    void mutate();
  };
  if (!token) return <p className="text-mute text-[13px]">Enter the admin token above to load the press-order queue.</p>;
  if (error) return <p className="text-[13px]" style={{ color: "var(--bad)" }}>{String(error.message || error)}</p>;
  const rows = data?.rows || [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-semibold">Press orders {isLoading ? "…" : `(${rows.length})`}</h2>
        <button type="button" onClick={() => mutate()} className="btn-secondary text-[12px]">Refresh</button>
      </div>
      {rows.length === 0 && !isLoading && <p className="text-mute text-[13px]">No orders yet.</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Date", "Package", "Company / Ticker", "Contact", "Press kit", "Status", "Ref"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-mute">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-3 py-2 whitespace-nowrap text-mute">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 whitespace-nowrap font-semibold">
                  {r.packageName} <span className="text-mute font-normal">${(r.amountCents / 100).toLocaleString()}</span>
                </td>
                <td className="px-3 py-2">
                  {r.company || <span className="text-faint">intake pending</span>}
                  {r.ticker && <span className="font-mono text-accent"> · {r.ticker}</span>}
                </td>
                <td className="px-3 py-2">
                  <div>{r.contactName || "—"}</div>
                  <div className="text-mute text-[12px]">{r.contactEmail || r.email}{r.contactPhone ? ` · ${r.contactPhone}` : ""}</div>
                </td>
                <td className="px-3 py-2 text-[12px]">
                  {r.writeForMe ? <span className="badge badge-neutral">write for me</span> : r.pressKitFilename || <span className="text-faint">—</span>}
                  {r.notes && <div className="text-mute mt-1 max-w-[260px] truncate" title={r.notes}>{r.notes}</div>}
                </td>
                <td className="px-3 py-2">
                  <select value={r.status} onChange={(e) => void setStatus(r.id, e.target.value)} className="input-base text-[12px] py-1">
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{LABEL[s]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-faint">{r.id.slice(0, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import useSWR from "swr";
import { API_BASE } from "@/lib/api";

interface Banner {
  id: string;
  title: string;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  placement: "bar" | "card";
  audience: "all" | "guest" | "free" | "premium";
  pagePrefix: string | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  priority: number;
  dismissible: boolean;
  frequencyCapHours: number;
  utmCampaign: string | null;
  impressions: number;
  clicks: number;
}
type Draft = Omit<Banner, "id" | "impressions" | "clicks">;
const EMPTY: Draft = { title: "", body: "", ctaLabel: "", ctaUrl: "", placement: "bar", audience: "all", pagePrefix: "", startsAt: "", endsAt: "", active: true, priority: 0, dismissible: true, frequencyCapHours: 168, utmCampaign: "" };

/** Workstream H admin — create, schedule, target and track banners. */
export function BannersAdmin({ token }: { token: string }) {
  const headers = token ? { "x-admin-token": token, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  const { data, error, mutate } = useSWR<{ rows: Banner[] }>(
    token ? `${API_BASE}/banners/admin` : null,
    (url: string) => fetch(url, { headers }).then(async (r) => { if (!r.ok) throw new Error(r.status === 503 ? "ADMIN_API_TOKEN is not set on the server" : `HTTP ${r.status}`); return r.json(); }),
  );
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async () => {
    setMsg(null);
    const body = { ...draft, startsAt: draft.startsAt || null, endsAt: draft.endsAt || null, pagePrefix: draft.pagePrefix || null };
    const res = await fetch(editing ? `${API_BASE}/banners/admin/${editing}` : `${API_BASE}/banners/admin`, { method: editing ? "PATCH" : "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) { setMsg((await res.json().catch(() => ({})))?.message || `HTTP ${res.status}`); return; }
    setDraft(EMPTY); setEditing(null); void mutate();
  };
  const del = async (id: string) => { await fetch(`${API_BASE}/banners/admin/${id}`, { method: "DELETE", headers }); void mutate(); };
  const edit = (b: Banner) => { setEditing(b.id); setDraft({ ...b, body: b.body || "", ctaLabel: b.ctaLabel || "", ctaUrl: b.ctaUrl || "", pagePrefix: b.pagePrefix || "", utmCampaign: b.utmCampaign || "", startsAt: b.startsAt ? b.startsAt.slice(0, 16) : "", endsAt: b.endsAt ? b.endsAt.slice(0, 16) : "" }); };
  if (!token) return <p className="text-mute text-[13px]">Enter the admin token above to manage banners.</p>;
  if (error) return <p className="text-[13px]" style={{ color: "var(--bad)" }}>{String(error.message || error)}</p>;
  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (<label className="block"><span className="label-mini block mb-1">{label}</span>{children}</label>);
  return (
    <div className="space-y-5">
      <div className="card p-4 space-y-3">
        <h2 className="text-[15px] font-semibold">{editing ? "Edit banner" : "New banner"}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <F label="Title"><input className="input-base" value={draft.title} onChange={(e) => set("title", e.target.value)} /></F>
          <F label="Body"><input className="input-base" value={draft.body || ""} onChange={(e) => set("body", e.target.value)} /></F>
          <F label="CTA label"><input className="input-base" value={draft.ctaLabel || ""} onChange={(e) => set("ctaLabel", e.target.value)} /></F>
          <F label="CTA URL"><input className="input-base" value={draft.ctaUrl || ""} onChange={(e) => set("ctaUrl", e.target.value)} placeholder="/premium or https://…" /></F>
          <F label="Placement"><select className="input-base" value={draft.placement} onChange={(e) => set("placement", e.target.value as Draft["placement"])}><option value="bar">Top bar</option><option value="card">In-content card</option></select></F>
          <F label="Audience"><select className="input-base" value={draft.audience} onChange={(e) => set("audience", e.target.value as Draft["audience"])}><option value="all">Everyone</option><option value="guest">Guests</option><option value="free">Free accounts</option><option value="premium">Premium</option></select></F>
          <F label="Page prefix (blank = site-wide)"><input className="input-base" value={draft.pagePrefix || ""} onChange={(e) => set("pagePrefix", e.target.value)} placeholder="/press" /></F>
          <F label="Starts"><input type="datetime-local" className="input-base" value={draft.startsAt || ""} onChange={(e) => set("startsAt", e.target.value)} /></F>
          <F label="Ends"><input type="datetime-local" className="input-base" value={draft.endsAt || ""} onChange={(e) => set("endsAt", e.target.value)} /></F>
          <F label="Priority"><input type="number" className="input-base" value={draft.priority} onChange={(e) => set("priority", Number(e.target.value))} /></F>
          <F label="Frequency cap (hours after dismiss)"><input type="number" className="input-base" value={draft.frequencyCapHours} onChange={(e) => set("frequencyCapHours", Number(e.target.value))} /></F>
          <F label="utm_campaign"><input className="input-base" value={draft.utmCampaign || ""} onChange={(e) => set("utmCampaign", e.target.value)} /></F>
        </div>
        <div className="flex items-center gap-4 text-[13px]">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} /> Active</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.dismissible} onChange={(e) => set("dismissible", e.target.checked)} /> Dismissible</label>
          <button type="button" onClick={() => void save()} className="btn-primary text-[13px]">{editing ? "Save changes" : "Create banner"}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); setDraft(EMPTY); }} className="btn-secondary text-[13px]">Cancel</button>}
          {msg && <span style={{ color: "var(--bad)" }}>{msg}</span>}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>{["Title", "Where", "Audience", "Window", "Active", "Impr.", "Clicks", ""].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-mute">{h}</th>)}</tr></thead>
          <tbody>
            {(data?.rows || []).map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-3 py-2 font-semibold">{b.title}<div className="text-mute text-[12px] font-normal">{b.placement === "bar" ? "Top bar" : "Card"}{b.ctaLabel ? ` · ${b.ctaLabel}` : ""}</div></td>
                <td className="px-3 py-2 font-mono text-[12px]">{b.pagePrefix || "site-wide"}</td>
                <td className="px-3 py-2">{b.audience}</td>
                <td className="px-3 py-2 text-[12px] text-mute whitespace-nowrap">{b.startsAt ? new Date(b.startsAt).toLocaleDateString() : "now"} → {b.endsAt ? new Date(b.endsAt).toLocaleDateString() : "open"}</td>
                <td className="px-3 py-2">{b.active ? "yes" : "no"}</td>
                <td className="px-3 py-2 tabular">{b.impressions}</td>
                <td className="px-3 py-2 tabular">{b.clicks}</td>
                <td className="px-3 py-2 whitespace-nowrap"><button type="button" className="text-accent font-semibold mr-3" onClick={() => edit(b)}>Edit</button><button type="button" className="text-mute" onClick={() => void del(b.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

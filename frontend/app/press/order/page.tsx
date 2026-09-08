"use client";
/**
 * Post-purchase intake (Brief v3 §6): Stripe returns here with the session id;
 * we verify it server-side, materialise the order, and collect company,
 * ticker, press kit upload or "write it for me", and contact. On submit the
 * confirmation email with the timeline goes out and the timeline shows here.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { track } from "@/lib/analytics";

interface Order {
  id: string;
  packageName: string;
  amountCents: number;
  email: string;
  status: string;
  company: string | null;
  ticker: string | null;
  contactName: string | null;
  contactEmail: string | null;
  writeForMe: boolean;
  pressKitFilename: string | null;
  intakeCompleted: boolean;
}

const TIMELINE = [
  ["Received", "Today — order and intake on file"],
  ["In Review", "Within 1 business day — our editors review the material"],
  ["Approve", "You review the final copy and request any changes"],
  ["Published", "Distributed to the network and featured on InsiderBuying.com, within your package's delivery window"],
  ["Reported", "You receive a report with live links and SEO data"],
];

export default function OrderPage() {
  return (
    <Suspense fallback={<main className="b2b3-doc"><div className="b2b3-doc-in">Loading…</div><style>{CSS}</style></main>}>
      <OrderInner />
    </Suspense>
  );
}

function OrderInner() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeForMe, setWriteForMe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ company: "", ticker: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" });

  useEffect(() => {
    if (!sessionId) {
      setErr("This page needs the checkout session from Stripe. If you just paid, use the link in your receipt or contact us.");
      return;
    }
    fetch(`${API_BASE}/press/orders/session/${encodeURIComponent(sessionId)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
        return j as Order;
      })
      .then((o) => {
        setOrder(o);
        setForm((f) => ({ ...f, contactEmail: f.contactEmail || o.email }));
        track("press_order_paid", { package: o.packageName, amount: o.amountCents / 100 });
      })
      .catch((e) => setErr(e.message || "Could not load your order."));
  }, [sessionId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || busy) return;
    setErr(null);
    const file = fileRef.current?.files?.[0];
    if (!writeForMe && !file) {
      setErr("Upload your press kit, or choose “write it for me”.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append("writeForMe", writeForMe ? "true" : "false");
      if (file && !writeForMe) fd.append("pressKit", file);
      const r = await fetch(`${API_BASE}/press/orders/${order.id}/intake`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(Array.isArray(j?.message) ? j.message[0] : j?.message || `HTTP ${r.status}`);
      setOrder(j as Order);
      track("press_order_intake_complete", { package: order.packageName, writeForMe });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="b2b3-doc">
      <div className="b2b3-doc-in">
        <p className="b2b3-kicker">InsiderBuying.com · Press Publishing</p>
        {!order && !err && <p>Confirming your payment…</p>}
        {err && !order && (
          <>
            <h1>We couldn&rsquo;t load your order</h1>
            <p className="ord-err">{err}</p>
            <p><Link href="/press">← Back to press publishing</Link></p>
          </>
        )}
        {order && !order.intakeCompleted && (
          <>
            <h1>Payment received. Tell us about your story.</h1>
            <p className="b2b3-doc-lead">
              {order.packageName} package · ${(order.amountCents / 100).toLocaleString()} paid · receipt sent to {order.email}
            </p>
            <form onSubmit={submit} className="ord-form" noValidate>
              <label>Company name *<input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required /></label>
              <label>Ticker (if listed)<input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })} placeholder="e.g. NVDA" /></label>
              <fieldset className="ord-kit">
                <legend>Press kit</legend>
                <label className="ord-toggle">
                  <input type="checkbox" checked={writeForMe} onChange={(e) => setWriteForMe(e.target.checked)} />
                  <span><strong>Write it for me</strong> — our editors draft the release from your company materials</span>
                </label>
                {!writeForMe && (
                  <label>Upload your investor press kit (PDF, Word, ZIP · up to 25 MB)
                    <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg,.txt" />
                  </label>
                )}
              </fieldset>
              <label>Contact name *<input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required /></label>
              <label>Contact email *<input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} required /></label>
              <label>Phone<input type="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></label>
              <label>Anything we should know<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Embargo date, quotes to include, links…" /></label>
              {err && <p className="ord-err">{err}</p>}
              <button type="submit" className="ord-btn" disabled={busy}>{busy ? "Saving…" : "Submit and start my order"}</button>
            </form>
          </>
        )}
        {order && order.intakeCompleted && (
          <>
            <h1>You&rsquo;re all set, {order.contactName?.split(" ")[0] || "thank you"}.</h1>
            <p className="b2b3-doc-lead">
              Your {order.packageName} order for <strong>{order.company}</strong>{order.ticker ? ` (${order.ticker})` : ""} is in the queue.
              A confirmation with this timeline is on its way to {order.contactEmail}.
            </p>
            <ol className="ord-timeline">
              {TIMELINE.map(([t, w], i) => (
                <li key={t} className={i === 0 ? "done" : ""}><span>{i + 1}</span><div><b>{t}</b><small>{w}</small></div></li>
              ))}
            </ol>
            <p className="ord-ref">Order reference <code>{order.id}</code>. Questions or changes: reply to the confirmation email.</p>
            <p className="b2b3-doc-foot"><Link href="/press">← Back to press publishing</Link> · <Link href="/press/guarantee">Money Back Guarantee</Link></p>
          </>
        )}
      </div>
      <style>{CSS}</style>
    </main>
  );
}

const CSS = `
.b2b3-doc { min-height: 100vh; background: #F7F9FC; color: #0A1E3C; font-family: var(--b2b-body), system-ui, sans-serif; padding: 56px 20px 80px; }
.b2b3-doc-in { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #E3E8F0; border-radius: 16px; padding: 40px 36px; }
.b2b3-kicker { font-family: var(--b2b-mono), monospace; font-size: 12px; letter-spacing: 1.6px; text-transform: uppercase; color: #C9A227; font-weight: 600; margin: 0 0 10px; }
.b2b3-doc h1 { font-family: var(--b2b-display), sans-serif; font-weight: 800; font-size: 30px; margin: 0 0 12px; letter-spacing: -0.5px; }
.b2b3-doc p { font-size: 15.5px; line-height: 1.65; color: #2B3A4F; }
.b2b3-doc-lead { font-size: 16px !important; }
.b2b3-doc a { color: #0E9F6E; font-weight: 700; text-decoration: none; }
.ord-form { display: grid; gap: 14px; margin-top: 18px; }
.ord-form label { display: grid; gap: 6px; font-size: 13px; font-weight: 700; color: #0A1E3C; }
.ord-form input:not([type=checkbox]):not([type=file]), .ord-form textarea { border: 1px solid #CBD5E1; border-radius: 10px; padding: 11px 12px; font: inherit; font-weight: 400; font-size: 15px; color: #0A1E3C; }
.ord-kit { border: 1px solid #E3E8F0; border-radius: 12px; padding: 14px 16px; display: grid; gap: 12px; }
.ord-kit legend { font-weight: 800; font-size: 13px; padding: 0 6px; }
.ord-toggle { display: flex !important; align-items: flex-start; gap: 10px; font-weight: 400 !important; font-size: 14.5px !important; }
.ord-toggle input { margin-top: 3px; }
.ord-btn { background: #0E9F6E; color: #fff; font-weight: 800; border: 0; border-radius: 12px; padding: 14px 20px; font-size: 16px; cursor: pointer; }
.ord-btn:disabled { opacity: 0.6; }
.ord-err { color: #B42318 !important; font-weight: 600; }
.ord-timeline { list-style: none; padding: 0; margin: 20px 0; display: grid; gap: 12px; }
.ord-timeline li { display: flex; gap: 12px; align-items: flex-start; }
.ord-timeline span { width: 28px; height: 28px; border-radius: 14px; background: #0A1E3C; color: #fff; font-weight: 800; font-size: 13px; display: grid; place-items: center; flex-shrink: 0; }
.ord-timeline li.done span { background: #0E9F6E; }
.ord-timeline b { display: block; font-size: 15px; } .ord-timeline small { color: #5C6B7F; font-size: 13px; }
.ord-ref { font-size: 13px !important; } .ord-ref code { font-family: var(--b2b-mono), monospace; font-size: 12px; }
.b2b3-doc-foot { margin-top: 24px; font-size: 13.5px !important; }
`;

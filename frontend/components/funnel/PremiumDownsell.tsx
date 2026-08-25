"use client";
/**
 * Downsell 1 — the monthly plan (Round-2 brief, Section 2, Step 4).
 *
 * Shown on /premium only, on exit intent or once the visitor has scrolled past
 * the pricing block, once per session, never to a subscriber. Copy verbatim
 * from the brief; the price comes from the live Stripe amount so the popup can
 * never advertise a figure checkout would not charge. "No thanks" hands the
 * visitor to Step 5, the $3 report.
 */
import { useEffect } from "react";
import { X } from "lucide-react";

export function PremiumDownsell({
  open,
  monthlyLabel,
  busy,
  onStart,
  onDismiss,
  onClose,
}: {
  open: boolean;
  /** Formatted live monthly price, e.g. "$39.99". */
  monthlyLabel: string;
  busy: boolean;
  onStart: () => void;
  /** "No thanks" → the $3 report downsell. */
  onDismiss: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="pd-wrap" role="dialog" aria-modal="true" aria-label="Not ready for the full year?">
      <button type="button" className="pd-scrim" aria-label="Close" onClick={onClose} />
      <div className="pd-card">
        <button type="button" className="pd-x" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 className="pd-head">Not Ready for the Full Year?</h2>
        <p className="pd-body">
          Start with a month. No commitment.
          <br />
          Full access to every tool, every alert, every score.
          <br />
          Cancel anytime. {monthlyLabel}/month.
        </p>
        <button type="button" className="pd-cta" onClick={onStart} disabled={busy}>
          {busy ? "Opening checkout…" : `Start Monthly — ${monthlyLabel}`}
        </button>
        <button type="button" className="pd-dismiss" onClick={onDismiss}>
          No thanks, I&apos;ll keep looking on my own.
        </button>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.pd-wrap { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 20px; }
.pd-scrim { position: absolute; inset: 0; background: rgba(4,10,20,0.74); backdrop-filter: blur(2px); border: 0; }
.pd-card { position: relative; width: 100%; max-width: 500px; background: #0D1F35; color: #fff;
  border: 1px solid rgba(200,162,74,0.34); border-radius: 14px; padding: 32px 28px 24px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.55); text-align: center;
  font-family: var(--font-sans), system-ui, sans-serif; }
.pd-x { position: absolute; top: 10px; right: 10px; height: 30px; width: 30px; display: grid; place-items: center;
  border-radius: 999px; background: rgba(255,255,255,0.08); color: #cbd5e1; border: 0; cursor: pointer; }
.pd-x:hover { background: rgba(255,255,255,0.16); color: #fff; }
.pd-head { font-family: var(--font-heading), var(--font-sans), sans-serif; font-size: 27px; line-height: 1.18;
  font-weight: 800; letter-spacing: -0.3px; margin: 4px 0 14px; color: #fff; }
.pd-body { font-size: 15px; line-height: 1.65; color: #cbd5e1; margin: 0 0 22px; }
.pd-cta { height: 52px; width: 100%; border: 0; border-radius: 9px; cursor: pointer;
  background: linear-gradient(135deg, #D8B45C 0%, #B98F35 100%); color: #10203A; font-size: 16px; font-weight: 800; }
.pd-cta:hover { filter: brightness(1.06); }
.pd-cta:disabled { opacity: 0.7; cursor: default; }
.pd-dismiss { display: block; margin: 16px auto 0; background: none; border: 0; cursor: pointer;
  font-size: 12.5px; color: #7f8ea3; text-decoration: underline; }
.pd-dismiss:hover { color: #cbd5e1; }
@media (max-width: 640px) {
  .pd-wrap { padding: 0; align-items: flex-end; }
  .pd-card { max-width: none; border-radius: 16px 16px 0 0; border-left: 0; border-right: 0; border-bottom: 0; padding: 26px 20px 22px; }
  .pd-head { font-size: 23px; }
}
`;

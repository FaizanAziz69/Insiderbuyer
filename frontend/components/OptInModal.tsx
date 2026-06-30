"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles, X } from "lucide-react";
import { API_BASE } from "@/lib/api";

// Shared client-side email check: require a local part, a domain, and a TLD.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

export interface OptInPromo {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}

/**
 * Lead-capture opt-in popup. Opened by ad slots across the site instead of
 * linking out to an article — collects an email (POST /subscribers) and shows
 * a success state.
 */
export function OptInModal({
  open,
  onClose,
  promo,
  source,
}: {
  open: boolean;
  onClose: () => void;
  promo: OptInPromo;
  source: string;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  function validateEmail() {
    if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address.");
      return false;
    }
    setEmailError(null);
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone: phone || undefined, source }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setDone(true);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-50"
        style={{ background: "rgba(10, 22, 40, 0.55)", backdropFilter: "blur(6px)" }}
        aria-hidden
      />
      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md rounded-2xl overflow-hidden"
          style={{ background: "var(--bg-1)", border: "1px solid var(--border)", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}
        >
          {/* Header band */}
          <div
            className="px-6 py-3 flex items-center gap-2"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "#fff" }}
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Insider Buying — Premium Report
            </span>
            <button
              onClick={onClose}
              className="ml-auto h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-white/15 transition"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6">
            {done ? (
              <div className="text-center py-6">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--good)" }} />
                <h3 className="text-[18px] font-bold mb-1">You&rsquo;re in!</h3>
                <p className="text-[14px] text-soft">
                  Check your inbox — your report is on the way.
                </p>
                <button onClick={onClose} className="btn-primary mt-5" style={{ padding: "10px 20px" }}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="text-[11px] uppercase tracking-wider font-bold text-accent mb-1.5">
                  {promo.eyebrow}
                </div>
                <h3 className="text-[20px] font-bold leading-snug tracking-tight mb-2">
                  {promo.title}
                </h3>
                <p className="text-[14px] text-soft leading-relaxed mb-4">{promo.body}</p>
                <p className="text-[13px] text-mute mb-4">
                  Enter your email below to get this free report.
                </p>
                <form onSubmit={submit} noValidate className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-semibold mb-1" style={{ color: "var(--text-soft)" }}>
                      Email address <span style={{ color: "var(--bad)" }}>*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={validateEmail}
                      placeholder="Enter your email address"
                      aria-invalid={!!emailError}
                      autoFocus
                      className="w-full px-4 py-3 rounded-lg text-[14px]"
                      style={{
                        background: "var(--bg-2)",
                        border: emailError ? "1px solid var(--bad)" : "1px solid var(--border-strong)",
                        color: "var(--text)",
                      }}
                    />
                    {emailError && (
                      <p className="mt-1.5 text-left text-[12px]" style={{ color: "var(--bad)" }}>
                        {emailError}
                      </p>
                    )}
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number (optional)"
                    className="w-full px-4 py-3 rounded-lg text-[14px]"
                    style={{ background: "var(--bg-2)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-hover w-full py-3.5 rounded-lg font-bold uppercase tracking-wider text-[13px]"
                    style={{ background: submitting ? "var(--bg-3)" : "var(--gold)", color: submitting ? "var(--text-mute)" : "#1a1300" }}
                  >
                    {submitting ? "Submitting…" : promo.cta}
                  </button>
                  {error && (
                    <p className="text-left text-[12px]" style={{ color: "var(--bad)" }}>
                      {error}
                    </p>
                  )}
                  <p className="text-[11px] text-mute text-center">
                    No spam. Unsubscribe anytime.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

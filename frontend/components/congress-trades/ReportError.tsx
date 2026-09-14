"use client";
import { useState } from "react";
import { API_BASE } from "@/lib/api";

/**
 * §5's corrections channel: "a visible 'report an error' path on every flag,
 * triaged by the Stage 5 verification agent … Fast, documented corrections are
 * the defamation defense that matters."
 *
 * Visible by default and never behind a login, because a channel a subject of
 * the page cannot reach is not a corrections channel.
 */
export function ReportError({ flagId }: { flagId?: number }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [reply, setReply] = useState("");

  async function send() {
    if (message.trim().length < 5) return;
    setState("sending");
    try {
      const res = await fetch(`${API_BASE}/congress-trades/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flagId, message, email }),
      });
      const out = await res.json();
      setReply(out?.message || "Thank you — your report has been logged.");
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="mt-6 rounded-lg p-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <h2 className="text-[14px] font-bold m-0 mb-1" style={{ color: "var(--text)" }}>
        Spot something wrong?
      </h2>
      <p className="text-[12.5px] leading-relaxed m-0" style={{ color: "var(--text-soft)" }}>
        Every figure here is read from a public filing, and filings get amended. Tell us what looks wrong and we will
        check it against the primary source. Corrections are applied with a dated note on the page.
      </p>
      {state === "sent" ? (
        <p className="text-[12.5px] mt-2 font-semibold" style={{ color: "var(--good)" }}>{reply}</p>
      ) : open ? (
        <div className="mt-2.5 flex flex-col gap-2" style={{ maxWidth: 560 }}>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="What is wrong, and which record shows it?"
            className="text-[13px] rounded px-2.5 py-2"
            style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional, so we can tell you the outcome)"
            className="text-[13px] rounded px-2.5 py-1.5"
            style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <div className="flex gap-2">
            <button
              onClick={send}
              disabled={state === "sending"}
              className="text-[12.5px] font-bold px-3 py-1.5 rounded"
              style={{ background: "var(--accent)", color: "var(--on-accent)", opacity: state === "sending" ? 0.6 : 1 }}
            >
              {state === "sending" ? "Sending…" : "Send report"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-[12.5px] font-semibold px-3 py-1.5 rounded"
              style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}
            >
              Cancel
            </button>
          </div>
          {state === "error" ? (
            <p className="text-[12px]" style={{ color: "var(--bad)" }}>That did not send. Please try again.</p>
          ) : null}
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="mt-2 text-[12.5px] font-semibold text-accent hover:underline">
          Report an error →
        </button>
      )}
    </section>
  );
}

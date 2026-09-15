"use client";
import { useState } from "react";
import { Mail } from "lucide-react";
import { API_BASE } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Signup for the Promoter Score email list (George 2026-09-16) — a list
 * dedicated to this dataset only: a welcome email on joining, then one
 * monthly issue with the new campaigns, the month's top movers and the top
 * promoters as plain tables. Posts to the promoter module's own list, not the
 * site-wide subscriber table.
 */
export function PromoterEmailSignup({ source }: { source: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setState("error");
      setMessage("Please enter a valid email address.");
      return;
    }
    setState("busy");
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/promoter/emails/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const j = (await res.json()) as { existing?: boolean };
      setState("done");
      setMessage(j.existing ? "You're already on the list — the next issue goes out on the 1st." : "You're on the list — a welcome email is on its way.");
    } catch {
      setState("error");
      setMessage("Something went wrong — please try again.");
    }
  }

  return (
    <section
      className="mt-6 rounded-lg p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Mail size={16} style={{ color: "var(--accent)" }} />
          <h2 className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
            Promoter Score by email
          </h2>
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-soft)" }}>
          One email a month, tables only: the IR campaigns disclosed last month, the ten campaigns whose stocks moved
          most after the engagement began, and the top-ranked promoters. This list covers the Promoter Score and Top IR
          Promoters datasets and nothing else.
        </p>
      </div>
      {state === "done" ? (
        <div className="text-[13px] font-semibold md:max-w-[280px]" style={{ color: "var(--good)" }}>
          {message}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-1.5 md:w-[320px] flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === "error") setState("idle");
              }}
              placeholder="you@example.com"
              aria-label="Email address"
              className="text-[13px] rounded-md px-3 py-2 flex-1 min-w-0"
              style={{
                background: "var(--bg)",
                border: `1px solid ${state === "error" ? "var(--bad)" : "var(--border)"}`,
                color: "var(--text)",
              }}
            />
            <button
              type="submit"
              disabled={state === "busy"}
              className="text-[13px] font-bold rounded-md px-3.5 py-2 whitespace-nowrap"
              style={{ background: "var(--accent)", color: "#fff", opacity: state === "busy" ? 0.7 : 1 }}
            >
              {state === "busy" ? "Joining…" : "Join the list"}
            </button>
          </div>
          {state === "error" && message ? (
            <div className="text-[12px] font-semibold" style={{ color: "var(--bad)" }}>
              {message}
            </div>
          ) : (
            <div className="text-[11px] text-faint">Free. Unsubscribe in one click from any issue.</div>
          )}
        </form>
      )}
    </section>
  );
}

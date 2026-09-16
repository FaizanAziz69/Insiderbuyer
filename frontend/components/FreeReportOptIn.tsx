"use client";
import { useState } from "react";
import { FileText } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { FUNNEL_COOKIES, setCookie } from "@/lib/funnel";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const FREE_REPORT_PDF = `${API_BASE}/free-report/pdf`;

/**
 * Opt-in for the free investor report "Get On The Inside" (George's
 * lead-magnet document, 2026-09-16). Stores the address on the site list
 * with source `free-report`; the backend fulfils it with the PDF link at
 * once, and the page shows the same link so nobody waits on their inbox.
 */
export function FreeReportOptIn({ source = "free-report" }: { source?: string }) {
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
      const res = await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      try {
        setCookie(FUNNEL_COOKIES.optedIn, "true", 365);
      } catch {
        /* cookies unavailable — the report still opens */
      }
      setState("done");
      setMessage("The report is on its way to your inbox. You can also open it right here.");
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <section
      className="rounded-lg p-5 md:p-6"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <FileText size={16} style={{ color: "var(--accent)" }} />
        <h2 className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
          Get the free report
        </h2>
      </div>
      <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--text-soft)" }}>
        Enter your email and we send you the PDF: the guide to following insider buying and the three stocks insiders
        are buying right now. Free. No credit card.
      </p>
      {state === "done" ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <a
            href={FREE_REPORT_PDF}
            target="_blank"
            rel="noopener"
            className="inline-block text-[14px] font-bold rounded-md px-4 py-2.5 text-center"
            style={{ background: "#0D1F35", color: "#C8A24A" }}
          >
            Open the report (PDF) →
          </a>
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--good)" }}>
            {message}
          </span>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-1.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === "error") setState("idle");
              }}
              placeholder="you@example.com"
              aria-label="Email address"
              className="text-[14px] rounded-md px-3 py-2.5 flex-1 min-w-0"
              style={{
                background: "var(--bg)",
                border: `1px solid ${state === "error" ? "var(--bad)" : "var(--border)"}`,
                color: "var(--text)",
              }}
            />
            <button
              type="submit"
              disabled={state === "busy"}
              className="text-[14px] font-bold rounded-md px-4 py-2.5 whitespace-nowrap"
              style={{ background: "var(--accent)", color: "#fff", opacity: state === "busy" ? 0.7 : 1 }}
            >
              {state === "busy" ? "Sending…" : "Send me the report"}
            </button>
          </div>
          {state === "error" && message ? (
            <div className="text-[12px] font-semibold" style={{ color: "var(--bad)" }}>
              {message}
            </div>
          ) : (
            <div className="text-[11px] text-faint">You also join the Insider Buying list. Unsubscribe anytime.</div>
          )}
        </form>
      )}
    </section>
  );
}

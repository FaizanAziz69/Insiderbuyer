"use client";
import { useState } from "react";
import { API_BASE } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * §7 viz 10 — in-article email capture.
 *
 * Sponsored and long-form pieces carry their own call to action near the end,
 * and until now the only way to put one in an article body was a paragraph
 * with a link out, which loses the reader at exactly the point they were ready
 * to act. This is the same site-wide subscriber list every popup and landing
 * page writes to (`POST /subscribers`), tagged with the article's own source
 * so the list can tell where a name came from.
 *
 * `<div data-viz="email-capture" data-title="…" data-list="pesorama-interview">
 *  <p>Body copy the writer supplies.</p></div>`
 */
export function EmailCaptureViz({
  html,
  title,
  list,
}: {
  html: string;
  title?: string | null;
  list?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!title && !html.trim()) return null;

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
        body: JSON.stringify({ email: email.trim(), source: list || "article" }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setState("done");
      setMessage("You're in. Check your inbox.");
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <aside
      className="my-8 rounded-lg px-5 py-5 sm:px-6 sm:py-6 not-prose"
      style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-surface-border)" }}
    >
      {title ? (
        <h3
          className="text-[19px] sm:text-[21px] font-bold leading-snug mb-2"
          // The panel is navy in BOTH themes, so this heading must name its own
          // colour: the global h1/h2/h3 rule paints var(--text), which is dark
          // ink in light mode and would leave the headline unreadable here.
          style={{ color: "#fff", fontFamily: "var(--font-heading), var(--font-sans)" }}
        >
          {title}
        </h3>
      ) : null}
      <div
        className="text-[14.5px] leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0"
        style={{ color: "rgba(255,255,255,0.82)" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {state === "done" ? (
        <p className="mt-4 text-[15px] font-semibold" style={{ color: "var(--gold)" }}>
          {message}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            className="flex-1 min-w-[220px] rounded-md px-3 py-2.5 text-[15px]"
            style={{ background: "#fff", color: "#14202a", border: "1px solid rgba(255,255,255,0.25)" }}
          />
          <button
            type="submit"
            disabled={state === "busy"}
            className="rounded-md px-5 py-2.5 text-[15px] font-bold disabled:opacity-60"
            style={{ background: "var(--gold)", color: "#14202a" }}
          >
            {state === "busy" ? "Sending…" : "Submit"}
          </button>
          {message ? (
            <p className="w-full text-[13px]" style={{ color: "var(--gold)" }}>
              {message}
            </p>
          ) : null}
        </form>
      )}
    </aside>
  );
}

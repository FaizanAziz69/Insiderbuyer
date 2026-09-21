"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { FUNNEL_COOKIES, isValidEmail, setCookie } from "@/lib/funnel";
import { track } from "@/lib/analytics";

const PREVIEW_URL = `${API_BASE}/email-flows/preview?flow=welcome&step=w1`;

export default function WelcomeClient() {
  const [email, setEmail] = useState("");
  const [known, setKnown] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const e = sessionStorage.getItem("ib_welcome_email");
      if (e) {
        setEmail(e);
        setKnown(true);
      }
    } catch {
      /* storage blocked — ask for the address */
    }
    track("web_welcome_page_view", {});
  }, []);

  async function requestSpotlight(e?: React.FormEvent) {
    e?.preventDefault();
    if (state === "busy") return;
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      setError("Enter a valid email address.");
      return;
    }
    setState("busy");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean, source: "penny-spotlight" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setCookie(FUNNEL_COOKIES.optedIn, "true", 3650);
      track("web_penny_spotlight_requested", {});
      setState("done");
    } catch {
      setState("error");
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="max-w-[820px] mx-auto px-4 py-8">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-7 w-7 shrink-0 mt-0.5" style={{ color: "var(--good)" }} />
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight" style={{ color: "var(--text)" }}>
            You&rsquo;re on the inside.
          </h1>
          <p className="text-[14.5px] mt-1.5" style={{ color: "var(--text-soft)" }}>
            Your free report, <em>Get On The Inside</em>, is on its way to your inbox as a PDF. Below is the first
            message you&rsquo;ll get from us, so you know what to expect.
          </p>
        </div>
      </div>

      {/* The first welcome email, rendered by the same template the sender uses. */}
      <div
        className="mt-6 rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)", background: "#fff" }}
      >
        <div
          className="flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold"
          style={{ background: "var(--bg-2)", color: "var(--text-mute)", borderBottom: "1px solid var(--border)" }}
        >
          <Mail className="h-3.5 w-3.5" /> Email 1 of your welcome series
        </div>
        <iframe
          title="Welcome to Insider Buying"
          src={PREVIEW_URL}
          className="w-full block"
          style={{ height: 1500, border: 0, background: "#fff" }}
          sandbox="allow-same-origin allow-popups allow-top-navigation-by-user-activation"
        />
      </div>

      {/* George 2026-09-21: the CTA that follows the welcome message. */}
      <section
        className="mt-8 rounded-lg p-6 text-center"
        style={{ background: "#0D1F35", borderTop: "5px solid #C8A24A", color: "#fff" }}
      >
        <div className="text-[10px] font-bold tracking-[3px]" style={{ color: "#C8A24A" }}>
          NEXT
        </div>
        {/* Explicit white: the global h2 colour is the dark text token, which
            vanished on this navy card in the live check (2026-09-21). */}
        <h2 className="text-[24px] font-extrabold leading-tight mt-2" style={{ color: "#fff" }}>
          Get our penny stock spotlight: one stock under $100M
        </h2>
        <p className="text-[14px] mt-2 max-w-[560px] mx-auto" style={{ color: "#cbd5e1" }}>
          One company under $100 million in market value where insiders have been buying with their own money in
          the last 90 days, with the filings behind it. Straight to your inbox.
        </p>
        {state === "done" ? (
          <p className="mt-5 text-[15px] font-semibold" style={{ color: "#C8A24A" }}>
            On its way. Check your inbox in the next few minutes.
          </p>
        ) : (
          <form onSubmit={requestSpotlight} className="mt-5 flex flex-col sm:flex-row gap-2.5 justify-center">
            {!known && (
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="Your email address"
                aria-label="Your email address"
                className="h-12 rounded-md px-4 text-[15px] sm:w-[300px]"
                style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }}
              />
            )}
            <button
              type="submit"
              disabled={state === "busy"}
              className="h-12 rounded-md px-6 text-[15px] font-extrabold"
              style={{ background: "linear-gradient(135deg, #D8B45C 0%, #B98F35 100%)", color: "#10203A" }}
            >
              {state === "busy" ? "Sending…" : "Get the Penny Stock Spotlight →"}
            </button>
          </form>
        )}
        {error && (
          <p className="mt-3 text-[13px]" style={{ color: "#fca5a5" }} role="alert">
            {error}
          </p>
        )}
        <p className="mt-4 text-[11.5px]" style={{ color: "#94a3b8" }}>
          Informational only, not investment advice. Micro-cap stocks are volatile.{" "}
          <Link href="/" className="underline">
            Back to InsiderBuying.com
          </Link>
        </p>
      </section>
    </div>
  );
}

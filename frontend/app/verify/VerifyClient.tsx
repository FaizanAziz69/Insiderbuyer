"use client";

import { useEffect, useRef, useState } from "react";
import { safeReturnPath } from "@/lib/bot-gate";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
          callback: (token: string) => void;
          "error-callback"?: (code?: string) => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      reset: (id?: string) => void;
    };
    onIbTurnstileLoad?: () => void;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onIbTurnstileLoad";

type Phase = "loading" | "widget" | "verifying" | "done" | "error";

export function VerifyClient({ siteKey }: { siteKey: string }) {
  const slot = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Only same-origin paths — never an absolute URL someone pasted into ?return=.
    const returnTo = safeReturnPath(new URLSearchParams(window.location.search).get("return"));

    if (!siteKey) {
      // Kill switch tripped between build and request: the middleware is
      // already passing everything, so just go where the visitor was going.
      window.location.replace(returnTo);
      return;
    }

    const submit = async (token: string) => {
      setPhase("verifying");
      try {
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && data.ok) {
          setPhase("done");
          window.location.replace(returnTo);
          return;
        }
        setMessage(data.error === "turnstile_failed" ? "The check did not pass. Please try again." : "Verification failed. Please try again.");
        setPhase("error");
        if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
      } catch {
        setMessage("Could not reach the server. Check your connection and try again.");
        setPhase("error");
      }
    };

    const render = () => {
      if (!slot.current || !window.turnstile || widgetId.current) return;
      const theme =
        document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      widgetId.current = window.turnstile.render(slot.current, {
        sitekey: siteKey,
        theme,
        appearance: "always",
        callback: submit,
        "error-callback": () => {
          setMessage("The challenge could not load. Reload the page to try again.");
          setPhase("error");
        },
        "expired-callback": () => {
          if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
        },
      });
      setPhase("widget");
    };

    window.onIbTurnstileLoad = render;
    if (window.turnstile) {
      render();
    } else if (!document.querySelector(`script[src^="https://challenges.cloudflare.com/turnstile/"]`)) {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onerror = () => {
        setMessage("The challenge script is blocked. Disable ad-blockers for this site and reload.");
        setPhase("error");
      };
      document.head.appendChild(s);
    }

    return () => {
      window.onIbTurnstileLoad = undefined;
    };
  }, [siteKey]);

  return (
    <main
      data-bare-page=""
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--bg-3)",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow-lg)",
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        {/* Same theme-swapped wordmark as the site header (.logo-wrap rules in globals.css). */}
        <div className="logo-wrap" style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <img
            className="logo-light"
            src="/logo-wordmark-dark-text.png"
            alt="InsiderBuying"
            style={{ height: 32, width: "auto" }}
          />
          <img
            className="logo-dark"
            src="/logo-wordmark-light-text.png"
            alt="InsiderBuying"
            style={{ height: 32, width: "auto" }}
          />
        </div>

        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: 22,
            fontWeight: 800,
            margin: "0 0 8px",
            letterSpacing: "-0.01em",
          }}
        >
          {phase === "done" ? "You're verified" : "Checking your browser…"}
        </h1>
        <p style={{ color: "var(--text-soft)", fontSize: 14, lineHeight: 1.5, margin: "0 0 20px" }}>
          {phase === "verifying"
            ? "One moment while we confirm the result."
            : phase === "done"
              ? "Taking you to the page you asked for."
              : "This quick check keeps automated scrapers off the site so it stays fast for real readers. It only happens once."}
        </p>

        <div
          ref={slot}
          style={{ display: "flex", justifyContent: "center", minHeight: 65 }}
          aria-live="polite"
        />

        {phase === "loading" && (
          <p style={{ color: "var(--text-mute)", fontSize: 13, margin: "12px 0 0" }}>
            Loading the challenge…
          </p>
        )}
        {phase === "error" && message && (
          <p style={{ color: "var(--bad)", fontSize: 13, margin: "12px 0 0" }} role="alert">
            {message}
          </p>
        )}

        <p style={{ color: "var(--text-faint)", fontSize: 12, margin: "20px 0 0" }}>
          Protected by Cloudflare Turnstile. No personal data is collected by this check.
        </p>
      </div>
    </main>
  );
}

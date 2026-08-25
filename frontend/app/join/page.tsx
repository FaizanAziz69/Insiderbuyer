"use client";
/**
 * /join — the pre-sell opt-in (Round-2 brief, Section 2, Step 2).
 *
 * Built to the brief's "Exact Spec", which supersedes the longer advertorial
 * notes above it in the same section ("That's the full spec. Everything else
 * in the brief stays the same."):
 *   · full screen, dark navy #0D1F35, nothing else on the page
 *   · no header, no footer, no navigation (BARE_ROUTES in AppShell)
 *   · vertically centred, single column, max width 560px
 *   · one email field, one CTA
 *   · submit → capture with tag 'optin-join' → immediate redirect to /premium
 *   · already logged in or previously opted in → no form, one Continue button
 *   · no animation delays, no multi-step
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FUNNEL_COOKIES, hasOptedIn, isValidEmail, setCookie } from "@/lib/funnel";

const NEXT = "/premium";

export default function JoinPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [known, setKnown] = useState(false);

  // Cookies are only readable on the client, so the decision lands after mount.
  useEffect(() => {
    setKnown(hasOptedIn());
  }, []);

  const skipForm = useMemo(() => known || !!user, [known, user]);

  // Prefetch the sales page so the redirect is instant, as the brief asks.
  useEffect(() => {
    router.prefetch?.(NEXT);
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const clean = email.trim().toLowerCase();
    try {
      await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean, source: "optin-join" }),
      });
    } catch {
      /* Capture is best-effort — a network blip must not trap a warm visitor
         on this page. The redirect happens either way. */
    }
    setCookie(FUNNEL_COOKIES.optedIn, "true", 3650);
    router.push(NEXT);
  };

  return (
    <div className="jn">
      <main className="jn-box">
        <h1 className="jn-h1">
          See What Insiders Are Buying
          <br />
          Before the Market Does.
        </h1>

        {skipForm ? (
          <>
            <p className="jn-sub">You&apos;re on the list. Pick up where you left off.</p>
            <a href={NEXT} className="jn-btn">
              Continue to Insider Access →
            </a>
          </>
        ) : (
          <>
            <p className="jn-sub">Enter your email to get started.</p>
            <form className="jn-form" onSubmit={submit}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                className="jn-input"
                placeholder="your@email.com"
                aria-label="Your email address"
                value={email}
                onChange={(ev) => {
                  setEmail(ev.target.value);
                  setError(null);
                }}
              />
              <button type="submit" className="jn-btn" disabled={busy}>
                {busy ? "One moment…" : "Get Insider Access →"}
              </button>
            </form>
            {error && (
              <p className="jn-error" role="alert">
                {error}
              </p>
            )}
            <p className="jn-fine">Free to start. No credit card.</p>
          </>
        )}
      </main>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.jn {
  min-height: 100vh; min-height: 100dvh; width: 100%;
  background: #0D1F35; display: flex; align-items: center; justify-content: center;
  padding: 28px 20px; font-family: var(--font-sans), system-ui, sans-serif;
}
.jn-box { width: 100%; max-width: 560px; text-align: center; }
.jn-h1 {
  font-family: var(--font-heading), var(--font-sans), sans-serif;
  color: #ffffff; font-weight: 800; letter-spacing: -0.5px;
  /* 36px keeps "See What Insiders Are Buying" on one line inside the 560px
     column, so the headline stays the two lines the brief asks for (the site's
     desktop body zoom of 1.10 renders it ~40px). */
  font-size: 36px; line-height: 1.16; margin: 0 0 16px;
}
.jn-sub { color: #C8A24A; font-size: 16px; line-height: 1.5; margin: 0 0 26px; }
.jn-form { display: flex; flex-direction: column; gap: 12px; }
.jn-input {
  height: 54px; width: 100%; border-radius: 10px; padding: 0 16px; font-size: 16px;
  color: #ffffff; background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.22); text-align: center;
}
.jn-input::placeholder { color: #8fa0b6; }
.jn-input:focus { outline: none; border-color: #C8A24A; background: rgba(255,255,255,0.1); }
.jn-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 54px; width: 100%; border: 0; border-radius: 10px; cursor: pointer;
  background: linear-gradient(135deg, #D8B45C 0%, #B98F35 100%);
  color: #10203A; font-size: 16.5px; font-weight: 800; letter-spacing: 0.1px;
  text-decoration: none;
}
.jn-btn:hover { filter: brightness(1.06); }
.jn-btn:disabled { opacity: 0.7; cursor: default; }
.jn-fine { color: #7f8ea3; font-size: 12.5px; margin: 14px 0 0; }
.jn-error { color: #fca5a5; font-size: 13px; margin: 12px 0 0; }
@media (max-width: 560px) {
  .jn-h1 { font-size: 30px; }
}
`;

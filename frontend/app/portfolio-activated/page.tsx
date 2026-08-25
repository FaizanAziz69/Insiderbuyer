"use client";
/**
 * /portfolio-activated — where Stripe returns after the $19 purchase.
 *
 * The brief (Section 3D): "After purchase confirmation: redirect to
 * /portfolio-activated with a message: 'Your portfolio is now live. Add your
 * stocks and we'll do the rest.'" — plus the other 3D instruction that belongs
 * here: "on purchase of the $19 portfolio tier, trigger a phone number
 * collection flow. Send confirmation SMS."
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";
import { getAuthToken, useAuth } from "@/lib/auth";
import { track } from "@/lib/analytics";

export default function PortfolioActivatedPage() {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"ask" | "saving" | "done">("ask");
  const [smsSent, setSmsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stripe's return leg: mirror the subscription immediately so the tier is
  // live without waiting on a webhook, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("checkout") === "success") {
      track("web_purchase", { product: "portfolio", price: 19 });
    }
    if (!sessionId) return;
    window.history.replaceState(null, "", window.location.pathname);
    fetch(`${API_BASE}/billing/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken() ?? ""}`,
      },
      body: JSON.stringify({ sessionId }),
    }).catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "saving") return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Enter a mobile number we can text, including the country code.");
      return;
    }
    setState("saving");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/portfolio/phone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken() ?? ""}`,
        },
        body: JSON.stringify({ phone }),
      });
      const json = (await res.json()) as { ok?: boolean; sms?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message || "failed");
      setSmsSent(!!json.sms);
      setState("done");
      track("web_portfolio_phone_saved", { sms: !!json.sms });
    } catch {
      setError("We couldn't save that number. Try again, or add it later in Settings.");
      setState("ask");
    }
  };

  return (
    <div className="max-w-xl mx-auto py-10 sm:py-16 space-y-8">
      <header className="text-center">
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
          Your portfolio is now live. Add your stocks and we&apos;ll do the rest.
        </h1>
      </header>

      {!user ? (
        <div className="card p-6 text-center">
          <p className="text-soft text-[15px]">
            Sign in with the email you used at checkout to finish setting up your alerts.
          </p>
          <Link href="/portfolio" className="btn-primary mt-4 inline-flex">
            Go to My Portfolio
          </Link>
        </div>
      ) : state === "done" ? (
        <div className="card p-6 text-center space-y-3">
          <p className="text-[16px] font-semibold">
            {smsSent
              ? "Number saved — check your phone for the confirmation text."
              : "Number saved. Your alerts are queued and will start texting as soon as our SMS line goes live."}
          </p>
          <Link href="/portfolio" className="btn-primary inline-flex">
            Add my stocks →
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card p-6 space-y-4">
          <div>
            <p className="text-[16px] font-semibold">Where should we text your alerts?</p>
            <p className="text-soft text-[14px] mt-1.5 leading-relaxed">
              We&apos;ll send one confirmation message now, then only when insiders move in a
              stock you own. Reply STOP any time.
            </p>
          </div>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="input-base w-full"
            placeholder="+1 555 010 1234"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setError(null);
            }}
            aria-label="Mobile number for SMS alerts"
          />
          {error && (
            <p className="text-[13px]" style={{ color: "var(--bad)" }} role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={state === "saving"}>
              {state === "saving" ? "Saving…" : "Turn on SMS alerts"}
            </button>
            <Link href="/portfolio" className="btn-secondary">
              Skip for now
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

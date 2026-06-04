"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { API_BASE } from "@/lib/api";

export default function CtaOptInPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const safeTicker = ticker.toUpperCase();
  const isGeneric = safeTicker === "TOP5";
  const headline = isGeneric
    ? "5 Top Stocks to Buy Right Now — Free Report"
    : `Should You Invest $1,000 in ${safeTicker} Right Now?`;
  const subhead = isGeneric
    ? "Our analysts have just released their five highest-IQS stocks for the month."
    : `Before you consider ${safeTicker}, you'll want to hear this.`;

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone: phone || undefined,
          source: `cta-${safeTicker}`,
        }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setState("done");
    } catch (err: any) {
      setState("error");
      setError(err?.message || "Submission failed");
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.10)",
        }}
      >
        {/* Brand bar — MarketBeat-style */}
        <div
          className="px-6 py-3 text-center text-white font-bold tracking-wider text-[13px] uppercase"
          style={{
            background:
              "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
          }}
        >
          <Sparkles className="h-4 w-4 inline mr-2 -mt-0.5" />
          INSIDER BUYING — Premium Report
        </div>

        <div className="p-7 sm:p-9">
          {state === "done" ? (
            <div className="text-center py-8">
              <div
                className="h-14 w-14 rounded-full mx-auto flex items-center justify-center mb-5"
                style={{
                  background:
                    "color-mix(in srgb, var(--good) 22%, transparent)",
                  color: "var(--good)",
                }}
              >
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="text-[24px] font-semibold tracking-tight mb-2">
                You&rsquo;re on the list
              </h2>
              <p className="text-soft mb-6">
                Check your inbox — the report is on its way.
              </p>
              <Link
                href="/companies"
                className="btn-primary inline-flex items-center gap-1.5"
                style={{ padding: "11px 22px", fontSize: 13 }}
              >
                See live IQS rankings
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              <h1
                className="text-[26px] sm:text-[32px] font-semibold tracking-tight leading-tight mb-2 text-center"
                style={{ letterSpacing: "-0.5px" }}
              >
                {headline}
              </h1>
              <p className="text-mute text-center text-[14px] mb-7">{subhead}</p>

              <div className="space-y-3 mb-7 text-[14px] text-soft leading-relaxed">
                <p>
                  Insider Buying keeps track of Wall Street&rsquo;s top-rated and
                  best-performing research signals and the stocks they point to on a
                  daily basis. We&rsquo;ve identified the{" "}
                  <strong className="text-[var(--text)]">five stocks</strong> that top
                  IQS scores are quietly highlighting before the broader market catches
                  on{!isGeneric && ` — and ${safeTicker} may or may not be on the list`}.
                </p>
                <p>
                  This is a report that normally sells for $29.97 on our site, but
                  we&rsquo;re making it available free today. Enter your email below to
                  see which companies made the cut.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your Email Address"
                  className="w-full px-4 py-3 rounded-md text-[14px]"
                  style={{
                    background: "var(--bg-1)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text)",
                  }}
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="🇺🇸 Your Phone Number (Optional)"
                  className="w-full px-4 py-3 rounded-md text-[14px]"
                  style={{
                    background: "var(--bg-1)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text)",
                  }}
                />
                <button
                  type="submit"
                  disabled={state === "submitting"}
                  className="w-full py-3 rounded-md font-bold uppercase tracking-wider text-[13px]"
                  style={{
                    background:
                      state === "submitting" ? "var(--bg-3)" : "var(--gold)",
                    color: "#1a1300",
                    cursor: state === "submitting" ? "default" : "pointer",
                  }}
                >
                  {state === "submitting" ? "Submitting…" : "Download Now"}
                </button>
              </form>

              {error && (
                <div className="mt-3 text-[12px] text-[var(--bad)] text-center">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

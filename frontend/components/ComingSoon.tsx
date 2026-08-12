"use client";
import Link from "next/link";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { usePremium } from "@/components/premium/PremiumContext";

interface Props {
  title: string;
  description: string;
  features?: string[];
  premium?: boolean;
}

export function ComingSoon({
  title,
  description,
  features,
  premium: premiumProp,
}: Props) {
  // Subscribers (and unlocked/testing mode) never see the upsell framing —
  // these read as plain upcoming features instead.
  //
  // Free-tier accuracy (client audit): every page that passes `premium` today
  // (/ai-insights, /top-performers) is UNBUILT, so the old copy — "Available on
  // premium. Subscribe to unlock this" — promised something a subscription does
  // not deliver. The premium framing now sells the roadmap, not access.
  const { unlocked } = usePremium();
  const premium = !unlocked && premiumProp;
  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-[24px] font-bold tracking-tight">{title}</h1>
        <p className="text-mute text-sm mt-1">{description}</p>
      </header>

      <div className="card p-8 sm:p-10 text-center relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -inset-px rounded-lg opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 50%, transparent), transparent 70%)",
          }}
        />
        <div className="relative">
          <div
            className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-5"
            style={{
              background: "color-mix(in srgb, var(--accent) 15%, var(--bg-3))",
              color: "var(--accent)",
            }}
          >
            {premium ? <Sparkles className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            {premium ? "Coming to Insider Access" : "Coming soon"}
          </h2>
          <p className="text-soft mt-2 max-w-md mx-auto text-[15px]">
            {premium
              ? "Not live yet — it ships to Insider Access members first. Get in now and it lands in your account the day it goes live."
              : "We're building this. Want early access? Join the waitlist."}
          </p>

          {features && features.length > 0 && (
            <ul className="mt-6 space-y-2 inline-block text-left text-sm text-soft">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                  {f}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/premium" className="btn-primary">
              {premium ? "Get Insider Access" : "Join waitlist"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/" className="btn-secondary">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

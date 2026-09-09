"use client";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { usePremium } from "@/components/premium/PremiumContext";
import { PRODUCT_NAME } from "@/components/premium/PaywallCta";
import { SUBSCRIBE_HREF } from "@/lib/funnel";

export default function SettingsPage() {
  // The plan row used to be a hardcoded "Free" badge, so a paying subscriber
  // was told they were on the free tier (client free/paid accuracy audit).
  // `premium` is the real Stripe entitlement — not `unlocked`, which the env
  // override and the session dismissal also flip.
  const { premium } = usePremium();
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight">Settings</h1>
        <p className="text-mute text-sm mt-1">Account and display preferences.</p>
      </header>

      <div className="card p-6 space-y-5">
        <Row label="Theme" hint="Switch between dark and light">
          <ThemeToggle />
        </Row>
        <div className="h-px" style={{ background: "var(--border)" }} />
        <Row label="Email" hint="Sign-in not enabled yet">
          <span className="text-mute text-sm">—</span>
        </Row>
        <div className="h-px" style={{ background: "var(--border)" }} />
        <Row
          label="Plan"
          hint={
            premium
              ? `${PRODUCT_NAME} · every score, list and filing unlocked`
              : "Free tier · Insider Scores and full rankings are locked"
          }
        >
          {premium ? (
            <span className="badge badge-gold">{PRODUCT_NAME}</span>
          ) : (
            <Link href={SUBSCRIBE_HREF} className="badge badge-neutral hover:text-accent transition">
              Free — unlock
            </Link>
          )}
        </Row>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-mute mt-0.5">{hint}</div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

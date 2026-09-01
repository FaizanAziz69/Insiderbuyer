"use client";
import { usePremium } from "./premium/PremiumContext";
import { PaywallCta } from "./premium/PaywallCta";

/**
 * Whole-page subscribe gate (George, 2026-09-02: "subscribe gate access to
 * both bubbles pages").
 *
 * Same rule as ScoreGate: when locked the real page is NEVER rendered. Here
 * that is enforced structurally rather than with a blur — the caller keeps the
 * page body in a separate component and only mounts it for subscribers, so a
 * guest's browser never runs the map's data fetches at all. A CSS overlay
 * would still have pulled the whole payload and left it in the DOM.
 */
export function PageSubscribeGate({
  title,
  subtitle,
  bullets,
}: {
  title: string;
  subtitle: string;
  bullets?: string[];
}) {
  return (
    <div className="w-full max-w-3xl mx-auto py-10 sm:py-16 px-4">
      <PaywallCta
        eyebrow="Insider Access"
        title={title}
        subtitle={subtitle}
        bullets={bullets}
        size="lg"
      />
    </div>
  );
}

/** Convenience wrapper: renders `children` only for subscribers. */
export function SubscriberOnlyPage({
  title,
  subtitle,
  bullets,
  children,
}: {
  title: string;
  subtitle: string;
  bullets?: string[];
  children: React.ReactNode;
}) {
  const { unlocked } = usePremium();
  if (!unlocked) {
    return <PageSubscribeGate title={title} subtitle={subtitle} bullets={bullets} />;
  }
  return <>{children}</>;
}

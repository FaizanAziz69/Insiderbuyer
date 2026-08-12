"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { PREMIUM_UNLOCKED } from "@/lib/premium";
import { API_BASE } from "@/lib/api";
import { getAuthToken, useAuth } from "@/lib/auth";

interface PremiumState {
  /** True when premium data should be visible (subscriber, env override,
   *  or a session-scoped dismissal of a wall). */
  unlocked: boolean;
  /** True only when the signed-in user has a live Stripe subscription. */
  premium: boolean;
  /** Opens premium data for the current view only (the wall's cross). */
  unlock: () => void;
  /** Re-check the subscription with the backend (e.g. after checkout). */
  refreshPremium: () => Promise<void>;
}

const Ctx = createContext<PremiumState>({
  unlocked: true,
  premium: false,
  unlock: () => {},
  refreshPremium: async () => {},
});

/**
 * Premium entitlement, backed by Stripe.
 *
 * The signed-in user's subscription state comes from GET /billing/status
 * (mirrored from Stripe on the backend). Subscribers see everything; everyone
 * else keeps the dismissible walls — the cross opens the current view only and
 * is deliberately not persisted, so a refresh puts the walls back.
 *
 * `NEXT_PUBLIC_UNLOCK_PREMIUM=true` still opens everything for testing.
 */
export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [premium, setPremium] = useState(false);

  const refreshPremium = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setPremium(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/billing/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      setPremium(res.ok && data?.premium === true);
    } catch {
      /* network hiccup — keep the current state */
    }
  }, []);

  // Re-check whenever the signed-in user changes (login, logout, hydrate).
  // On sign-out BOTH flags reset immediately, so every paywall snaps back
  // live — no page refresh needed (client spec).
  useEffect(() => {
    if (!user) {
      setPremium(false);
      setDismissed(false);
      return;
    }
    void refreshPremium();
  }, [user, refreshPremium]);

  const unlock = useCallback(() => setDismissed(true), []);
  const value = useMemo(
    () => ({
      unlocked: PREMIUM_UNLOCKED || premium || dismissed,
      premium,
      unlock,
      refreshPremium,
    }),
    [premium, dismissed, unlock, refreshPremium],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePremium = (): PremiumState => useContext(Ctx);

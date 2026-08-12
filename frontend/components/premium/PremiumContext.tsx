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
  /** True when premium data should be visible — a live subscription, or the
   *  test-only env override. Nothing a visitor can click sets this. */
  unlocked: boolean;
  /** True only when the signed-in user has a live Stripe subscription. */
  premium: boolean;
  /** Re-check the subscription with the backend (e.g. after checkout). */
  refreshPremium: () => Promise<void>;
}

/**
 * Fail CLOSED. If a gated component ever renders outside PremiumProvider it
 * must hide premium data, not reveal it — this default used to be
 * `unlocked: true`, which made "no provider" mean "everything is free".
 */
const Ctx = createContext<PremiumState>({
  unlocked: false,
  premium: false,
  refreshPremium: async () => {},
});

/**
 * Premium entitlement, backed by Stripe.
 *
 * The signed-in user's subscription state comes from GET /billing/status
 * (mirrored from Stripe on the backend). Subscribers see everything; everyone
 * else gets the walls, and there is no way to dismiss one.
 *
 * There used to be a session "dismissed" flag, set by a cross on the wall and
 * OR'd into `unlocked` here — so one click on any single wall opened every
 * paywall in the app for the rest of the session. It is gone.
 *
 * `NEXT_PUBLIC_UNLOCK_PREMIUM=true` still opens everything for testing.
 */
export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
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
  // On sign-out the flag resets immediately, so every paywall snaps back live —
  // no page refresh needed (client spec).
  useEffect(() => {
    if (!user) {
      setPremium(false);
      return;
    }
    void refreshPremium();
  }, [user, refreshPremium]);

  const value = useMemo(
    () => ({
      unlocked: PREMIUM_UNLOCKED || premium,
      premium,
      refreshPremium,
    }),
    [premium, refreshPremium],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePremium = (): PremiumState => useContext(Ctx);

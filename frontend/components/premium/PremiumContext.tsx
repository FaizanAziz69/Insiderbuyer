"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { PREMIUM_UNLOCKED } from "@/lib/premium";

interface PremiumState {
  /** True when premium data should be visible. */
  unlocked: boolean;
  /** Opens premium data for the current view only. */
  unlock: () => void;
}

const Ctx = createContext<PremiumState>({ unlocked: true, unlock: () => {} });

/**
 * Session-scoped premium gate.
 *
 * Until Stripe is wired up every wall carries a cross, and dismissing any one
 * of them opens the whole page — but the choice is deliberately NOT persisted,
 * so a refresh or a fresh navigation puts the walls back. When Stripe lands,
 * replace `unlock` with a real entitlement check and drop the crosses.
 *
 * Gates are on by default; `NEXT_PUBLIC_UNLOCK_PREMIUM=true` opens everything
 * for end-to-end testing. See lib/premium.ts.
 */
export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(PREMIUM_UNLOCKED);
  const unlock = useCallback(() => setUnlocked(true), []);
  const value = useMemo(() => ({ unlocked, unlock }), [unlocked, unlock]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePremium = (): PremiumState => useContext(Ctx);

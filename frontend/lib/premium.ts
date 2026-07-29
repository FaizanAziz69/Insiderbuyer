/**
 * Global premium gate switch.
 *
 * Default: LOCKED — premium data (Insider Scores, potential upside, the ranked
 * leaderboards) is gated, per the client spec. Every wall carries a cross while
 * Stripe is pending, and dismissing one opens the rest of that view; the choice
 * is deliberately not persisted, so a refresh restores the walls.
 *
 * Set `NEXT_PUBLIC_UNLOCK_PREMIUM=true` to open everything — useful for
 * end-to-end testing or screenshots with no gates in the way.
 *
 * Every paywall reads this one flag through PremiumProvider — PremiumGate,
 * ScoreGate, PaywallOverlay, PremiumRowWall, PremiumValue and the DataTable
 * `gate` prop — so flipping it toggles the whole site at once.
 */
export const PREMIUM_UNLOCKED =
  process.env.NEXT_PUBLIC_UNLOCK_PREMIUM === "true";

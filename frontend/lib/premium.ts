/**
 * Global premium gate switch.
 *
 * Default: UNLOCKED — every premium feature is open so the product can be
 * tested end-to-end without a subscription. To re-enable paywalls, set
 * `NEXT_PUBLIC_LOCK_PREMIUM=true` in the frontend environment and rebuild.
 *
 * Every paywall in the app (PremiumGate, the Insider Score filter, the
 * blur/overlay sections) reads this single flag, so flipping it toggles the
 * whole site at once.
 */
export const PREMIUM_UNLOCKED =
  process.env.NEXT_PUBLIC_LOCK_PREMIUM !== "true";

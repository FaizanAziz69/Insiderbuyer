import PageClient from "./PageClient";

/**
 * Top IR Promoters — a PAID dataset (George 2026-09-16: "paygated, not
 * available for free subscribers").
 *
 * Deliberately NO ssrFallback here, unlike the sibling data pages: seeding
 * the ranking into the HTML would put every firm name into view-source for a
 * logged-out visitor, which is the exact leak the decoy pattern exists to
 * prevent. The client fetches after hydration and masks the identities.
 */
export default function Page() {
  return <PageClient />;
}

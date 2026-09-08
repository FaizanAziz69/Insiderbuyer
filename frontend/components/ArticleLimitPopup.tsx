"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { usePremium } from "@/components/premium/PremiumContext";
import { PaywallCta, UnlockButton } from "@/components/premium/PaywallCta";
import { LoginModal } from "@/components/LoginModal";
import { SUBSCRIBE_HREF } from "@/lib/funnel";

/** Free articles a reader can open before the article locks. */
const FREE_ARTICLES = 3;
const STORE_KEY = "ib_articles_read";
/** The countdown banner, once closed, stays closed for the browser session. */
const BANNER_DISMISSED_KEY = "ib_articles_banner_dismissed";

/**
 * Metered article paywall (client spec, 2026-09-06):
 *
 *   "Allow freemium users and website visitors to click on and read 3
 *    articles. Put a temporary banner at the bottom of the article page
 *    showing that they have 2 more articles or 1 article left. Then put the
 *    subscribe gate feature as it is."
 *
 * So the meter applies to EVERYONE without a live subscription — anonymous
 * visitors and signed-in free accounts alike (until 2026-09-06 a free account
 * lifted the gate; it no longer does). Subscribers never see any of it.
 *
 *   • Articles 1–3: readable in full, with a slim bottom banner counting down
 *     ("2 free articles left", "1 free article left", "This is your last free
 *     article"). The banner can be closed for the session.
 *   • Article 4+: the whole article (cover + body) is blurred and unreadable,
 *     and the site's ONE paywall presentation (PaywallCta → /premium) slides up
 *     from the bottom. No dismiss. A "Log in" link stays for subscribers who
 *     arrive signed out.
 *
 * The count is per browser (localStorage), keyed by article slug, so
 * re-reading an article never spends a second credit. Storage failures never
 * block reading.
 */
export function ArticleGate({
  slug,
  children,
  /**
   * Skip the gate entirely, and do not count the article against the free
   * allowance. Used for unlisted drafts: a review link is internal material,
   * not funnel content. Without this, sending a draft to an editor spends one
   * of their three free reads and then walls them out of the very article they
   * were asked to review.
   */
  bypass = false,
}: {
  slug: string;
  children: React.ReactNode;
  bypass?: boolean;
}) {
  const { unlocked } = usePremium();
  /** Distinct articles opened so far, this one included. null = not yet read. */
  const [readCount, setReadCount] = useState<number | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [bannerClosed, setBannerClosed] = useState(false);

  useEffect(() => {
    if (!slug || unlocked || bypass) {
      setReadCount(null);
      return;
    }
    try {
      const read: string[] = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      if (!read.includes(slug)) {
        read.push(slug);
        localStorage.setItem(STORE_KEY, JSON.stringify(read.slice(-50)));
      }
      // A re-read of an earlier article counts where it sat, not as a new
      // credit — so "the third article" is stable no matter the order.
      setReadCount(read.indexOf(slug) + 1);
    } catch {
      setReadCount(null); // storage unavailable — never block reading
    }
    try {
      setBannerClosed(sessionStorage.getItem(BANNER_DISMISSED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, [slug, unlocked, bypass]);

  const closeBanner = () => {
    setBannerClosed(true);
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (bypass || unlocked || readCount == null) return <>{children}</>;

  const locked = readCount > FREE_ARTICLES;
  const remaining = Math.max(0, FREE_ARTICLES - readCount);

  if (!locked) {
    return (
      <>
        {children}
        {/* Countdown banner — slim, bottom of the viewport, closable */}
        <AnimatePresence>
          {!bannerClosed && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-0 sm:pb-4 pointer-events-none"
              role="status"
              aria-live="polite"
            >
              <div
                className="pointer-events-auto mx-auto max-w-3xl rounded-xl px-4 py-3 sm:px-5 flex items-center gap-3 sm:gap-4"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border-strong)",
                  boxShadow: "0 14px 40px rgba(0,0,0,0.30)",
                }}
              >
                <span
                  className="hidden sm:inline-flex h-8 min-w-8 px-2 items-center justify-center rounded-lg text-[14px] font-bold tabular flex-shrink-0"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {remaining}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] sm:text-[14px] font-bold leading-tight">
                    {remaining === 0
                      ? "This is your last free article"
                      : remaining === 1
                        ? "You have 1 free article left"
                        : `You have ${remaining} free articles left`}
                  </div>
                  <div className="text-[12px] text-mute leading-snug">
                    Subscribe for unlimited articles, Insider Scores and insider alerts.
                  </div>
                </div>
                <UnlockButton href={SUBSCRIBE_HREF} compact>
                  Subscribe
                </UnlockButton>
                <button
                  type="button"
                  onClick={closeBanner}
                  aria-label="Close"
                  className="text-mute hover:text-[var(--text)] transition flex-shrink-0 -mr-1 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
      {/* Whole article (cover image + body) — blurred and unreadable */}
      <div
        className="select-none pointer-events-none"
        style={{ filter: "blur(9px)", opacity: 0.7 }}
        aria-hidden
      >
        {children}
      </div>

      {/* Subscribe sheet — slides up from the bottom, no dismiss */}
      <AnimatePresence>
        {!loginOpen && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 220, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-40"
            role="dialog"
            aria-label="Subscribe to keep reading"
          >
            <div
              className="w-full"
              style={{
                background: "var(--bg-2)",
                borderTop: "4px solid var(--accent)",
                boxShadow: "0 -24px 70px rgba(0,0,0,0.35)",
              }}
            >
              <div className="mx-auto max-w-4xl px-5 sm:px-10 py-7 sm:py-9">
                <PaywallCta
                  size="lg"
                  eyebrow={`You've read your ${FREE_ARTICLES} free articles`}
                  title="Keep reading with Insider Access"
                  subtitle="Unlimited articles, every Insider Score, and alerts when executives buy their own stock."
                />
                <p className="mt-4 text-center text-[13px] text-mute">
                  Already a subscriber?{" "}
                  <button
                    type="button"
                    onClick={() => setLoginOpen(true)}
                    className="font-bold text-accent underline hover:brightness-110"
                  >
                    Log in
                  </button>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}

"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";

/** Free articles a visitor can read before the signup prompt appears. */
const FREE_ARTICLES = 3;
const STORE_KEY = "ib_articles_read";
const SNOOZE_KEY = "ib_article_popup_snoozed";

/**
 * Benzinga-style subscribe-gate: after a visitor reads 3 articles, a bar
 * slides up from the bottom asking them to create a FREE account to keep
 * reading. No payment — signup-gated only (client spec). Dismissible; stays
 * quiet for the rest of the session once closed, and never shows to
 * signed-in users.
 */
export function ArticleLimitPopup({ slug }: { slug: string }) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (!slug || user) return;
    try {
      if (sessionStorage.getItem(SNOOZE_KEY) === "1") return;
      const read: string[] = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      if (!read.includes(slug)) {
        read.push(slug);
        localStorage.setItem(STORE_KEY, JSON.stringify(read.slice(-50)));
      }
      if (read.length > FREE_ARTICLES) {
        // Slide up after the reader has settled into the page.
        const t = setTimeout(() => setShow(true), 1_500);
        return () => clearTimeout(t);
      }
    } catch {
      /* storage unavailable — never block reading */
    }
  }, [slug, user]);

  function snooze() {
    setShow(false);
    try {
      sessionStorage.setItem(SNOOZE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (user) return null;

  return (
    <>
      <AnimatePresence>
        {show && !loginOpen && (
          <motion.div
            initial={{ y: 160, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 160, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-40"
            role="dialog"
            aria-label="Create a free account to continue reading"
          >
            {/* Full-width Benzinga-style strip spanning the whole screen */}
            <div
              className="w-full"
              style={{
                background: "var(--bg-2)",
                borderTop: "3px solid var(--accent)",
                boxShadow: "0 -16px 48px rgba(0,0,0,0.28)",
              }}
            >
              <div className="mx-auto max-w-6xl px-5 sm:px-8 py-5 sm:py-7 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                <div
                  className="hidden sm:flex h-14 w-14 rounded-2xl items-center justify-center flex-shrink-0"
                  style={{ background: "var(--accent-soft)" }}
                >
                  <BookOpen className="h-6 w-6 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[18px] sm:text-[21px] font-bold leading-tight">
                    You&rsquo;ve reached your free article limit
                  </div>
                  <p className="text-[13.5px] sm:text-[14.5px] text-mute mt-1 leading-relaxed">
                    It&rsquo;s free to keep reading — create a free account for unlimited
                    articles, watchlists, and daily insider alerts.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setLoginOpen(true)}
                    className="btn-primary whitespace-nowrap flex-1 sm:flex-none"
                    style={{ padding: "12px 26px", fontSize: 15 }}
                  >
                    Create free account
                  </button>
                  <button
                    type="button"
                    onClick={snooze}
                    aria-label="Dismiss"
                    className="h-10 w-10 rounded-md flex items-center justify-center hover:bg-[var(--bg-3)] transition flex-shrink-0"
                    style={{ border: "1px solid var(--border)", color: "var(--text-mute)" }}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}

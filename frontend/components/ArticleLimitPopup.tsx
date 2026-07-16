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
        {show && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6"
            role="dialog"
            aria-label="Create a free account to continue reading"
          >
            <div
              className="mx-auto max-w-3xl rounded-xl px-5 py-4 sm:px-7 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border-strong)",
                boxShadow: "0 -12px 40px rgba(0,0,0,0.25), 0 8px 30px rgba(0,0,0,0.2)",
              }}
            >
              <div
                className="hidden sm:flex h-11 w-11 rounded-xl items-center justify-center flex-shrink-0"
                style={{ background: "var(--accent-soft)" }}
              >
                <BookOpen className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold leading-tight">
                  You&rsquo;ve reached your free article limit
                </div>
                <p className="text-[13px] text-mute mt-0.5 leading-relaxed">
                  It&rsquo;s free to keep reading — create a free account for unlimited
                  articles, watchlists, and daily insider alerts.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button type="button" onClick={() => setLoginOpen(true)} className="btn-primary whitespace-nowrap">
                  Create free account
                </button>
                <button
                  type="button"
                  onClick={snooze}
                  aria-label="Dismiss"
                  className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-[var(--bg-3)] transition"
                  style={{ border: "1px solid var(--border)", color: "var(--text-mute)" }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}

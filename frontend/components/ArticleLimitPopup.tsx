"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BookOpen, LineChart } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";

/** Free articles a visitor can read before the article locks. */
const FREE_ARTICLES = 3;
const STORE_KEY = "ib_articles_read";

const PERKS = [
  { icon: BookOpen, title: "Unlimited articles", body: "Every daily briefing, deep dive, and sector report." },
  { icon: LineChart, title: "Watchlists with live scores", body: "Track your stocks with live Insider Scores." },
  { icon: Bell, title: "Daily insider alerts", body: "Know the moment executives buy their own stock." },
];

/**
 * Benzinga-style HARD article gate: after 3 free articles the whole article
 * (cover image + body) is blurred and unreadable, and a LARGE unlock sheet
 * slides up from the bottom of the screen. No dismiss button — the only way
 * through is a free account. Signed-in users never see it. Free signup only.
 */
export function ArticleGate({ slug, children }: { slug: string; children: React.ReactNode }) {
  const { user } = useAuth();
  const [locked, setLocked] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (!slug || user) {
      setLocked(false);
      return;
    }
    try {
      const read: string[] = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      if (!read.includes(slug)) {
        read.push(slug);
        localStorage.setItem(STORE_KEY, JSON.stringify(read.slice(-50)));
      }
      setLocked(read.length > FREE_ARTICLES);
    } catch {
      setLocked(false); // storage unavailable — never block reading
    }
  }, [slug, user]);

  if (!locked || user) return <>{children}</>;

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

      {/* BIG unlock sheet — slides up from the bottom, no dismiss */}
      <AnimatePresence>
        {!loginOpen && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 220, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-40"
            role="dialog"
            aria-label="Create a free account to continue reading"
          >
            <div
              className="w-full"
              style={{
                background: "var(--bg-2)",
                borderTop: "4px solid var(--accent)",
                boxShadow: "0 -24px 70px rgba(0,0,0,0.35)",
              }}
            >
              <div className="mx-auto max-w-5xl px-5 sm:px-10 py-7 sm:py-10">
                <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-12">
                  {/* Headline block */}
                  <div className="min-w-0 lg:max-w-[380px] flex-shrink-0">
                    <span
                      className="inline-block text-[10.5px] font-bold uppercase tracking-widest px-2.5 py-1 rounded mb-3"
                      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                    >
                      InsiderBuying &middot; Free Account
                    </span>
                    <h2 className="text-[24px] sm:text-[30px] font-bold tracking-tight leading-tight">
                      Unlock unlimited free articles
                    </h2>
                    <p className="mt-2 text-[14px] sm:text-[15px] text-soft leading-relaxed">
                      Keep reading with a free account —{" "}
                      <strong>no credit card, no payment.</strong>
                    </p>
                  </div>

                  {/* Perks + CTA */}
                  <div className="flex-1 min-w-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
                      {PERKS.map((p) => {
                        const Icon = p.icon;
                        return (
                          <div key={p.title} className="flex items-start gap-3">
                            <span
                              className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ background: "var(--accent-soft)" }}
                            >
                              <Icon className="text-accent" style={{ height: 16, width: 16 }} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[13.5px] font-bold leading-tight">{p.title}</span>
                              <span className="block text-[12px] text-mute leading-snug mt-0.5">{p.body}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setLoginOpen(true)}
                        className="btn-primary flex-shrink-0"
                        style={{ padding: "14px 34px", fontSize: 16, fontWeight: 700 }}
                      >
                        Create Your Free Account
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoginOpen(true)}
                        className="text-[13.5px] text-mute hover:text-accent transition text-left"
                      >
                        Already have an account?{" "}
                        <span className="font-bold text-accent underline">Log in</span>
                      </button>
                    </div>
                  </div>
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

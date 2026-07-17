"use client";
import { useEffect, useState } from "react";
import { Bell, BookOpen, LineChart, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";
import { Logo } from "@/components/Logo";

/** Free articles a visitor can read before the article body locks. */
const FREE_ARTICLES = 3;
const STORE_KEY = "ib_articles_read";

const PERKS = [
  { icon: BookOpen, title: "Unlimited articles", body: "Every daily briefing, deep dive, and sector report — no limits." },
  { icon: LineChart, title: "Watchlists with live scores", body: "Track your stocks with live prices and Insider Scores." },
  { icon: Bell, title: "Daily insider alerts", body: "Know the moment executives buy their own stock." },
  { icon: Trophy, title: "Full Insider Score rankings", body: "The complete #50 → #1 conviction leaderboard." },
];

/**
 * Benzinga-style HARD article gate: after 3 free articles the article body is
 * blurred and unreadable, with a large sign-up panel over it. No dismiss —
 * the only way through is a free account (sign up or log in). Never shown to
 * signed-in users. Free signup only; no payment.
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
      <div className="relative">
        {/* Article body — blurred and unreadable until sign-in */}
        <div
          className="select-none pointer-events-none overflow-hidden"
          style={{ filter: "blur(7px)", maxHeight: 900, opacity: 0.75 }}
          aria-hidden
        >
          {children}
        </div>
        {/* Fade so the blur bleeds out at the bottom */}
        <div
          className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
          style={{ background: "linear-gradient(180deg, transparent, var(--bg-1))" }}
        />

        {/* The gate panel — big, benefit-rich, NOT dismissible */}
        <div className="absolute inset-0 flex items-start justify-center px-3 pt-10 sm:pt-16">
          <div
            className="w-full max-w-[640px] rounded-2xl overflow-hidden"
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 30px 90px rgba(0,0,0,0.35)",
            }}
          >
            {/* Brand band */}
            <div
              className="px-6 sm:px-9 py-4 flex items-center justify-between"
              style={{ background: "var(--brand-surface)" }}
            >
              <Logo size="sm" tone="light" />
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}
              >
                Free account
              </span>
            </div>

            <div className="px-6 sm:px-9 py-7 sm:py-8">
              <h2 className="text-[24px] sm:text-[30px] font-bold tracking-tight leading-tight">
                Unlock unlimited free articles
              </h2>
              <p className="mt-2 text-[14.5px] sm:text-[15.5px] text-soft leading-relaxed">
                You&rsquo;ve read your {FREE_ARTICLES} free articles. Create a free
                account to keep reading — <strong>100% free, no credit card, no payment.</strong>
              </p>

              {/* Benefits — 2×2 like Benzinga's unlock panel */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {PERKS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <div key={p.title} className="flex items-start gap-3">
                      <span
                        className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: "var(--accent-soft)" }}
                      >
                        <Icon className="h-4.5 w-4.5 text-accent" style={{ height: 18, width: 18 }} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-bold leading-tight">{p.title}</span>
                        <span className="block text-[12.5px] text-mute leading-snug mt-0.5">{p.body}</span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="btn-primary w-full mt-7"
                style={{ padding: "14px 20px", fontSize: 16, fontWeight: 700 }}
              >
                Create Your Free Account
              </button>
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="w-full mt-3 text-[13.5px] text-mute hover:text-accent transition text-center"
              >
                Already have an account? <span className="font-bold text-accent underline">Log in</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}

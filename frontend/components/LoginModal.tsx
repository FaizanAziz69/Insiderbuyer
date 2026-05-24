"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Mail, X } from "lucide-react";
import { useEffect } from "react";

export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50"
            style={{ background: "rgba(10, 22, 40, 0.55)", backdropFilter: "blur(6px)" }}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(440px,calc(100vw-32px))]"
          >
            <div
              className="card p-7 relative overflow-hidden"
              style={{
                background: "var(--bg-2)",
                boxShadow: "var(--shadow-lg)",
                borderColor: "var(--border)",
              }}
            >
              <div
                aria-hidden
                className="absolute -top-24 -right-24 h-56 w-56 rounded-full blur-3xl pointer-events-none"
                style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)" }}
              />
              <div
                aria-hidden
                className="absolute -bottom-20 -left-20 h-48 w-48 rounded-full blur-3xl pointer-events-none"
                style={{ background: "color-mix(in srgb, var(--accent-2) 18%, transparent)" }}
              />

              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 h-8 w-8 rounded-md hover:bg-[var(--bg-3)] flex items-center justify-center transition"
              >
                <X className="h-4 w-4 text-mute" />
              </button>

              <div className="relative text-center">
                <div
                  className="inline-flex h-14 w-14 rounded-2xl items-center justify-center mb-5"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
                    boxShadow: "0 8px 24px rgba(0,102,255,0.3)",
                  }}
                >
                  <Lock className="h-6 w-6 text-white" />
                </div>
                <h2
                  className="text-2xl font-bold tracking-tight mb-2"
                  style={{ letterSpacing: "-0.3px" }}
                >
                  Accounts are coming soon
                </h2>
                <p className="text-soft text-sm mb-6 max-w-sm mx-auto">
                  We're polishing sign-in, saved watchlists, and personalized alerts. Drop your
                  email and we'll let you know the moment they're live.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onClose();
                  }}
                  className="space-y-3"
                >
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="you@email.com"
                      className="input-base pl-10"
                    />
                  </div>
                  <button type="submit" className="btn-primary w-full" style={{ padding: "10px 16px" }}>
                    Notify me
                  </button>
                </form>

                <div className="text-[11px] text-mute mt-5">
                  In the meantime — explore the dashboard, charts, and rankings.
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

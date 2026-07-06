"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Mail, User as UserIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

type Mode = "signin" | "signup";

export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state whenever the modal closes.
  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
      setPassword("");
    }
  }, [open]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") await signUp(email, password, name);
      else await signIn(email, password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const isSignup = mode === "signup";

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

              <div className="relative">
                <div className="text-center">
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
                    {isSignup ? "Create your account" : "Welcome back"}
                  </h2>
                  <p className="text-soft text-sm mb-6 max-w-sm mx-auto">
                    {isSignup
                      ? "Sign up to save watchlists, follow insider buying, and get personalized alerts."
                      : "Sign in to access your watchlist and alerts."}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  {isSignup && (
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint pointer-events-none" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name (optional)"
                        autoComplete="name"
                        className="input-base pl-10"
                      />
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      autoComplete="email"
                      className="input-base pl-10"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignup ? "Create a password (8+ characters)" : "Password"}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      className="input-base pl-10"
                    />
                  </div>

                  {error && (
                    <p className="text-[12.5px] font-medium" style={{ color: "var(--bad)" }}>
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary w-full"
                    style={{ padding: "10px 16px" }}
                  >
                    {submitting
                      ? isSignup
                        ? "Creating account…"
                        : "Signing in…"
                      : isSignup
                        ? "Create account"
                        : "Sign in"}
                  </button>
                </form>

                <div className="text-[13px] text-mute mt-5 text-center">
                  {isSignup ? "Already have an account?" : "New to InsiderBuying?"}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode(isSignup ? "signin" : "signup");
                      setError(null);
                    }}
                    className="font-semibold text-accent hover:underline"
                  >
                    {isSignup ? "Sign in" : "Create an account"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

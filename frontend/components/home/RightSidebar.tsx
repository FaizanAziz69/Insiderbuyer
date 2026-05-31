"use client";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";

export function RightSidebar() {
  return (
    <aside className="space-y-5">
      {/* AI promo */}
      <Link
        href="/premium"
        className="card card-lift block p-5 relative overflow-hidden group"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent-2) 10%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent) 8%, var(--bg-2)) 100%)",
          borderColor: "color-mix(in srgb, var(--accent-2) 24%, var(--border))",
        }}
      >
        <div
          aria-hidden
          className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl pointer-events-none"
          style={{ background: "color-mix(in srgb, var(--accent-2) 30%, transparent)" }}
        />
        <div className="relative">
          <div
            className="text-[10px] uppercase tracking-[0.18em] font-bold mb-2"
            style={{ color: "var(--accent-2)" }}
          >
            New · AI Insights
          </div>
          <h3
            className="text-[18px] font-bold leading-tight tracking-tight"
            style={{ letterSpacing: "-0.2px" }}
          >
            AI-powered insider signals
          </h3>
          <p className="text-[12px] text-soft mt-2 leading-relaxed">
            Cluster detection, anomaly flags, and natural-language summaries of every IQS spike —
            built on top of our SEC Form 4 pipeline.
          </p>
          <div
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-white"
            style={{
              background: "linear-gradient(135deg, var(--accent-2), var(--accent))",
            }}
          >
            Read the brief
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </Link>

      {/* Newsletter box */}
      <div className="card p-5" style={{ background: "var(--bg-3)" }}>
        <div className="flex items-start gap-3">
          <Mail className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-mute font-mono font-semibold">
              Email Newsletter
            </div>
            <h3 className="text-[15px] font-bold tracking-tight mt-0.5">
              Make sense of the markets
            </h3>
            <p className="text-[12px] text-soft mt-1.5 leading-relaxed">
              Weekly insights on insider buying opportunities, in your inbox.
            </p>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="mt-3 flex flex-col gap-2"
            >
              <input
                type="email"
                required
                placeholder="you@email.com"
                className="input-base"
                style={{ fontSize: 13 }}
              />
              <button
                type="submit"
                className="btn-primary"
                style={{ padding: "8px 14px", fontSize: 13 }}
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}

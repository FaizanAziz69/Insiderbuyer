"use client";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { SUBSCRIBE_HREF } from "@/lib/funnel";

export function GetInsightsCard() {
  return (
    <div
      className="card p-5"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 6%, var(--bg-2)) 0%, var(--bg-2) 100%)",
        borderColor: "color-mix(in srgb, var(--accent) 18%, var(--border))",
      }}
    >
      <div
        className="inline-flex h-9 w-9 rounded-lg items-center justify-center mb-3"
        style={{
          background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
          boxShadow: "0 6px 18px rgba(0,102,255,0.25)",
        }}
      >
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <h3 className="text-[16px] font-bold tracking-tight">Get insights you can act on</h3>
      {/* Accuracy (client free/paid audit): this used to promise "full rankings"
          on a free account. Rankings are capped at six rows for everyone who
          isn't a subscriber, and the watchlist's Insider Score column is masked
          too — so the free list names only what a free visitor really gets. */}
      <p className="text-[12px] text-soft mt-1.5 leading-relaxed">
        Free: screener, watchlists, company profiles, daily digest. Insider
        Scores and full rankings come with Insider Access.
      </p>
      <Link
        href={SUBSCRIBE_HREF}
        className="btn-primary mt-4 w-full"
        style={{ padding: "8px 14px", fontSize: 13 }}
      >
        Sign up
      </Link>
      <div className="text-[11px] text-mute mt-3 text-center">
        Already have an account?{" "}
        <a className="underline hover:text-accent cursor-pointer">Sign in</a>
      </div>
    </div>
  );
}

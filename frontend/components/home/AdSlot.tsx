"use client";
import { Sparkles } from "lucide-react";

export function AdSlot() {
  return (
    <aside className="space-y-5">
      <div>
        <div className="text-[9px] uppercase tracking-[0.18em] text-mute font-mono mb-2 text-center">
          Advertisement
        </div>
        <div
          className="rounded-md border-2 border-dashed flex flex-col items-center justify-center text-center px-4"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-3)",
            height: 600,
          }}
        >
          <Sparkles className="h-6 w-6 text-faint mb-3" />
          <div className="text-[12px] font-semibold text-mute">Ad slot · 300×600</div>
          <div className="text-[11px] text-faint mt-1">Half-page banner</div>
        </div>
      </div>

      <div>
        <div className="text-[9px] uppercase tracking-[0.18em] text-mute font-mono mb-2 text-center">
          Sponsored
        </div>
        <div
          className="rounded-md border-2 border-dashed flex flex-col items-center justify-center text-center px-4"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-3)",
            height: 250,
          }}
        >
          <div className="text-[12px] font-semibold text-mute">Ad slot · 300×250</div>
          <div className="text-[11px] text-faint mt-1">Medium rectangle</div>
        </div>
      </div>

      <div
        className="card p-5"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 6%, var(--bg-2)) 0%, var(--bg-2) 100%)",
          borderColor: "color-mix(in srgb, var(--accent) 18%, var(--border))",
        }}
      >
        <div className="text-[10px] uppercase tracking-wider text-mute font-mono font-semibold mb-1">
          Promo space
        </div>
        <h3 className="text-[15px] font-bold tracking-tight">Your campaign here</h3>
        <p className="text-[12px] text-soft mt-1.5 leading-relaxed">
          Native promo card, in-feed sponsored content, or a custom partner unit. Configure in
          AdSlot.tsx.
        </p>
      </div>
    </aside>
  );
}

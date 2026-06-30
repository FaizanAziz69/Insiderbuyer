"use client";
import { ArrowRight, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { AiCoverImage } from "@/components/insights/AiCoverImage";
import { OptInModal } from "@/components/OptInModal";

type Slot = "leaderboard" | "inline" | "rail-top" | "rail-bottom" | "rail";

const PROMOS = [
  {
    eyebrow: "MarketBeat-style report",
    title: "Should You Invest $1,000 in NVIDIA Right Now?",
    body: "MarketBeat keeps track of Wall Street's top-rated analysts and the stocks they recommend. Get the report free today.",
    cta: "Download Now",
    sector: "technology",
  },
  {
    eyebrow: "Premium IQS list",
    title: "Forget SpaceX — These 5 Stocks Could Soar Next",
    body: "Our analysts have just released their five highest-rated stocks for the month. None of the usual suspects, including Apple and Nvidia, made the cut.",
    cta: "See the 5 stocks",
    sector: "financial",
  },
  {
    eyebrow: "Insider-buying signal",
    title: "3 Stocks Insiders Can't Stop Buying",
    body: "Three companies with cluster insider buying across multiple senior executives in the last 30 days.",
    cta: "Reveal the names",
    sector: "financial",
  },
  {
    eyebrow: "Tech insider",
    title: "Can the Tech Stock Rally Continue?",
    body: "Inside our analysis of the AI cycle, semiconductor cap-ex, and the names worth buying on dips.",
    cta: "Read the brief",
    sector: "technology",
  },
];

function pickPromo(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PROMOS[Math.abs(h) % PROMOS.length];
}

interface Props {
  slot?: Slot;
  seed?: string;
}

export function AdSlot({ slot = "leaderboard", seed }: Props) {
  // Pick a promo deterministically — seed is e.g. the page slug or article ID,
  // so the same surface keeps showing the same ad on a given page load.
  const promo = useMemo(() => pickPromo(seed || slot), [seed, slot]);
  const [open, setOpen] = useState(false);
  const source = `ad-${slot}-${promo.eyebrow.toLowerCase().replace(/[^a-z]+/g, "-")}`;

  const modal = (
    <OptInModal open={open} onClose={() => setOpen(false)} promo={promo} source={source} />
  );

  if (slot === "leaderboard") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full text-left group rounded-lg overflow-hidden border cursor-pointer"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 10%, var(--bg-2)) 100%)",
            borderColor: "color-mix(in srgb, var(--accent) 22%, var(--border))",
          }}
        >
          <div className="flex items-center gap-4 px-5 py-4">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              }}
            >
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-accent font-bold mb-0.5">
                Advertisement · {promo.eyebrow}
              </div>
              <div className="text-[14px] sm:text-[15px] font-bold leading-snug truncate">
                {promo.title}
              </div>
            </div>
            <div className="hidden sm:inline-flex items-center gap-1 text-[12px] font-semibold text-accent flex-shrink-0 group-hover:underline">
              {promo.cta}
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </button>
        {modal}
      </>
    );
  }

  if (slot === "inline") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full text-left group rounded-lg overflow-hidden border my-4 cursor-pointer"
          style={{
            background: "var(--bg-3)",
            borderColor: "var(--border)",
          }}
        >
          <div className="grid grid-cols-[110px_1fr_auto] gap-4 px-5 py-4 items-center">
            <AiCoverImage
              primary={null}
              seed={promo.title}
              sector={promo.sector}
              className="w-full rounded-md self-stretch"
              style={{ aspectRatio: "16 / 9" }}
            />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-mute mb-0.5">
                Ad · {promo.eyebrow}
              </div>
              <div className="text-[13px] font-bold text-accent leading-tight">
                {promo.title}
              </div>
              <div className="text-[12px] text-mute leading-snug mt-0.5 line-clamp-1">
                {promo.body}
              </div>
            </div>
            <div className="text-[12px] font-semibold text-accent group-hover:underline flex-shrink-0">
              {promo.cta} →
            </div>
          </div>
        </button>
        {modal}
      </>
    );
  }

  // Rail / rail-top / rail-bottom
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full text-left group rounded-lg overflow-hidden border cursor-pointer"
        style={{
          background: "var(--bg-2)",
          borderColor: "var(--border)",
        }}
      >
        <AiCoverImage
          primary={null}
          seed={promo.title}
          sector={promo.sector}
          className="w-full"
          style={{ aspectRatio: "16 / 9" }}
        />
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-mute mb-2">
            Advertisement
          </div>
          <div className="text-[10px] uppercase tracking-wider text-accent font-bold mb-1">
            {promo.eyebrow}
          </div>
          <div className="text-[14px] font-bold leading-snug mb-2 group-hover:text-accent transition">
            {promo.title}
          </div>
          <div className="text-[12px] text-mute leading-snug mb-3 line-clamp-3">
            {promo.body}
          </div>
          <div className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
            {promo.cta}
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </button>
      {modal}
    </>
  );
}

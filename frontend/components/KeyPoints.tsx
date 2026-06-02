"use client";
import { CheckCircle2 } from "lucide-react";
import { IqsTooltip } from "./IqsTooltip";

const POINTS: { title: string; body: string }[] = [
  {
    title: "Built on SEC Form 4 filings",
    body: "Every open-market insider buy is pulled directly from EDGAR within minutes of filing — no third-party aggregator.",
  },
  {
    title: "Four-factor IQS scoring",
    body: "Purchase volume, cluster effect, role-weighted size, and holding-change magnitude combine into a single ranked signal.",
  },
  {
    title: "Free tier, premium depth",
    body: "Ranks 4 and below are free; the top-3 strongest signals are gated behind a subscription.",
  },
  {
    title: "Updated continuously",
    body: "Rankings refresh as new Form 4s land; news, commentary, and SEC press releases are folded in automatically.",
  },
];

interface Props {
  points?: { title: string; body: string }[];
  heading?: string;
}

export function KeyPoints({ points = POINTS, heading = "Key points" }: Props) {
  return (
    <aside
      className="mt-6 mb-8 rounded-lg p-5"
      style={{
        background: "var(--accent-soft)",
        border: "1px solid color-mix(in srgb, var(--accent) 22%, var(--border))",
      }}
    >
      <div className="inline-flex items-center gap-1.5 mb-3 text-[10px] uppercase tracking-[0.18em] font-bold text-accent font-mono">
        <CheckCircle2 className="h-3 w-3" />
        {heading} ·{" "}
        <IqsTooltip>
          <span className="font-mono font-bold underline decoration-dotted underline-offset-2">
            IQS
          </span>
        </IqsTooltip>
      </div>
      <ul className="space-y-2.5">
        {points.map((p) => (
          <li key={p.title} className="flex items-start gap-2.5">
            <span
              className="h-1.5 w-1.5 rounded-full mt-2 flex-shrink-0"
              style={{ background: "var(--accent)" }}
            />
            <div>
              <div className="text-[13px] font-bold leading-snug">{p.title}</div>
              <div className="text-[12px] text-soft leading-relaxed mt-0.5">{p.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

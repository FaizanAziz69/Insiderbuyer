import { notFound } from "next/navigation";
import { SCORE_EXPLAINER_ENABLED } from "@/lib/score-explainer-flag";

export const metadata = { robots: { index: false, follow: false } };

export default function ScoreExplainerLayout({ children }: { children: React.ReactNode }) {
  if (!SCORE_EXPLAINER_ENABLED) notFound();
  return <>{children}</>;
}

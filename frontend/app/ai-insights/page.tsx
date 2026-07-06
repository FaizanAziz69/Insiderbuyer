import { ComingSoon } from "@/components/ComingSoon";

export default function AiInsightsPage() {
  return (
    <ComingSoon
      title="AI insights"
      description="GPT-generated daily summaries of where insider conviction is concentrating."
      premium
      features={[
        "Daily AI-written market briefs",
        "Anomaly detection on insider clusters",
        "Cross-references with earnings calendar",
        "Plain-English explanations of Insider Score spikes",
      ]}
    />
  );
}

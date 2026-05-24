import { ComingSoon } from "@/components/ComingSoon";

export default function SentimentChartPage() {
  return (
    <ComingSoon
      title="Sentiment chart"
      description="Bullish vs bearish insider sentiment over time."
      premium
      features={[
        "Daily sentiment scoring derived from IQS",
        "Aggregate or per-sector",
        "Compare against S&P 500 returns",
      ]}
    />
  );
}

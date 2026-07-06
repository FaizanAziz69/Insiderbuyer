import { PremiumChartPreview } from "@/components/charts/PremiumChartPreview";

export default function SentimentChartPage() {
  return (
    <PremiumChartPreview
      title="Sentiment chart"
      subtitle="Bullish vs bearish insider sentiment over time."
      variant="line"
      description="Daily sentiment scoring derived from Insider Score movements, sector-normalized, and benchmarked against the S&P 500."
      features={[
        "Daily sentiment scoring derived from Insider Score",
        "Aggregate or per-sector view",
        "Compare against S&P 500 returns",
        "Export to PNG for reports",
        "Annotated with major insider events",
        "180/365-day trends",
      ]}
    />
  );
}

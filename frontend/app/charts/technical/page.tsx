import { PremiumChartPreview } from "@/components/charts/PremiumChartPreview";

export default function TechnicalChartPage() {
  return (
    <PremiumChartPreview
      title="Technical chart"
      subtitle="Per-ticker candlesticks with insider transactions overlaid as markers."
      variant="candle"
      description="Combine price action with insider conviction markers — see exactly when the CEO bought, on the chart itself."
      features={[
        "Daily / weekly / monthly candles",
        "Insider buy & sell markers on the price line",
        "RSI, MACD, moving averages",
        "Volume profile + insider-volume overlay",
        "Drawing tools (trendlines, fibs)",
        "Save chart layouts",
      ]}
    />
  );
}

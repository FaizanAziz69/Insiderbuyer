import { ComingSoon } from "@/components/ComingSoon";

export default function TechnicalChartPage() {
  return (
    <ComingSoon
      title="Technical chart"
      description="Per-ticker candlesticks with insider transactions overlaid as markers."
      premium
      features={[
        "Daily/weekly candles",
        "Insider buy/sell markers on the price line",
        "RSI, MACD, moving averages",
      ]}
    />
  );
}

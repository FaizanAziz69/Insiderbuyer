import { ImageResponse } from "next/og";

/**
 * Branded share card for the Last-10-Trades strip (Brief v7 §3: "renders
 * to a branded image card for the social pipeline"). Same construction as
 * /api/og/market: server-side, reads the backend, satori-safe flex markup.
 */
export const runtime = "nodejs";

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";
const UP = "#1bb471";
const DOWN = "#e84b56";
const NEUTRAL = "#7a8aa0";

interface Item {
  date: string;
  ticker: string | null;
  name: string;
  side: "BUY" | "SELL";
  sizeLabel: string;
  returnPct: number | null;
  realized: boolean;
}
interface Payload {
  type: string;
  subject: { name: string } | null;
  precision: "exact" | "est" | "approx";
  items: Item[];
  summary: { line: string } | null;
}

const TYPE_LABEL: Record<string, string> = { congress: "MEMBER OF CONGRESS · STOCK ACT FILINGS", insider: "CORPORATE INSIDER · FORM 4 FILINGS", investor: "INVESTOR · 13F FILINGS" };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "congress";
  const key = searchParams.get("key") || "";
  let data: Payload | null = null;
  try {
    const res = await fetch(`${BACKEND}/api/wealth-tracker/last10?type=${encodeURIComponent(type)}&key=${encodeURIComponent(key)}`, { next: { revalidate: 300 } });
    if (res.ok) data = (await res.json()) as Payload;
  } catch {
    data = null;
  }
  const items = (data?.items || []).slice(0, 10);
  const name = data?.subject?.name || "Insider";
  const est = data?.precision && data.precision !== "exact";
  const line = data?.summary?.line || "No disclosed trades on record";
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" });
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 56px",
          background: "linear-gradient(135deg,#050a18,#0c1428,#101d38)",
          color: "#f0f4fa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 20, letterSpacing: 2, color: "#8794ab" }}>{TYPE_LABEL[type] || "INSIDER"}</div>
          <div style={{ display: "flex", fontSize: 20, letterSpacing: 2, color: "#8794ab" }}>LAST 10 TRADES{est ? " · EST." : ""}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 800, lineHeight: 1.05 }}>{name.slice(0, 40)}</div>
          <div style={{ display: "flex", fontSize: 28, color: "#c9d3e3", marginTop: 10 }}>{line}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {items.map((it, i) => {
            const buy = it.side === "BUY";
            const r = it.returnPct;
            const tone = !buy ? NEUTRAL : r == null ? NEUTRAL : r >= 0 ? UP : DOWN;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: 100,
                  height: 140,
                  borderRadius: 14,
                  padding: "10px 10px",
                  background: "rgba(255,255,255,0.05)",
                  border: `2px solid ${tone}`,
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", fontSize: 15, color: tone, fontWeight: 800 }}>{buy ? "BUY" : "SELL"}</div>
                <div style={{ display: "flex", fontSize: 22, fontWeight: 800 }}>{(it.ticker || it.name).slice(0, 6)}</div>
                <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: tone }}>{buy ? (r == null ? "—" : `${r >= 0 ? "+" : ""}${Math.round(r)}%`) : "·"}</div>
                <div style={{ display: "flex", fontSize: 13, color: "#8794ab" }}>{fmtDate(it.date)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>
            INSIDER<span style={{ color: "#20d0ff" }}>BUYING</span>
          </div>
          <div style={{ display: "flex", fontSize: 16, color: "#5d6b85", maxWidth: 640, textAlign: "right" }}>
            Returns on buys only, from disclosed filings{est ? "; congressional and 13F figures are estimates" : ""}. Not investment advice. insiderbuying.com
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

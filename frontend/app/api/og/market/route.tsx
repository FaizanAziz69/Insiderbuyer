import { ImageResponse } from "next/og";

/**
 * §9.8 per-entity OG share cards, server-rendered.
 *
 * A shared link to a bubble ("watch the market bet on the midterms live") has
 * to unfurl with the bubble and its headline stat, not with a generic site
 * card — that is the difference between a link that spreads and one that does
 * not. The card is drawn from the same normalised MarketContract the page
 * reads, so it can never disagree with what the visitor then sees.
 */

export const runtime = "nodejs";

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";

const fmtUsd = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";

  let question = "Prediction Market Bubbles";
  let yes: number | null = null;
  let volume = 0;
  let category = "Live odds, visualized";
  let move: number | null = null;

  if (id) {
    try {
      const res = await fetch(`${BACKEND}/api/visualizers/markets/${encodeURIComponent(id)}`, {
        next: { revalidate: 120 },
      });
      if (res.ok) {
        const m = (await res.json()) as {
          question?: string;
          yesPrice?: number | null;
          volumeTotal?: number;
          category?: string;
          oneDayChange?: number | null;
        };
        if (m?.question) {
          question = m.question;
          yes = m.yesPrice ?? null;
          volume = m.volumeTotal ?? 0;
          category = m.category ?? category;
          move = m.oneDayChange ?? null;
        }
      }
    } catch {
      /* fall through to the generic card */
    }
  }

  const lean = yes == null ? "#7a8aa0" : yes >= 0.5 ? "#1bb471" : "#e84b56";
  const pct = yes == null ? "—" : `${Math.round(yes * 100)}%`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #050a18 0%, #0c1428 55%, #101d38 100%)",
          padding: "56px 60px",
          fontFamily: "sans-serif",
          color: "#f0f4fa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              padding: "6px 14px",
              borderRadius: 999,
              border: "1px solid rgba(32,208,255,0.5)",
              background: "rgba(32,208,255,0.12)",
              color: "#20d0ff",
              fontSize: 22,
              letterSpacing: 2,
            }}
          >
            {category.toUpperCase()}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#8794ab", letterSpacing: 2 }}>
            POLYMARKET · LIVE
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 46 }}>
          <div
            style={{
              display: "flex",
              width: 260,
              height: 260,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              background: `radial-gradient(circle at 35% 30%, ${lean}, rgba(5,10,24,0.35))`,
              border: `3px solid ${lean}`,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1 }}>{pct}</div>
              <div style={{ fontSize: 24, letterSpacing: 4, opacity: 0.85 }}>YES</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 50, fontWeight: 800, lineHeight: 1.14 }}>
              {question.length > 110 ? `${question.slice(0, 110)}…` : question}
            </div>
            <div style={{ display: "flex", gap: 26, marginTop: 22, fontSize: 26, color: "#c9d3e3" }}>
              <div style={{ display: "flex" }}>{fmtUsd(volume)} traded</div>
              {move != null && (
                <div style={{ display: "flex", color: move >= 0 ? "#1bb471" : "#e84b56" }}>
                  {move >= 0 ? "+" : ""}
                  {Math.round(move * 100)} pts today
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>
            INSIDER<span style={{ color: "#20d0ff" }}>BUYING</span>
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#5d6b85" }}>
            Informational only — not betting advice
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

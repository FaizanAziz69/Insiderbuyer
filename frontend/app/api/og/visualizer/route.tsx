import { ImageResponse } from "next/og";

/**
 * §9.8 share cards for the three non-live visualizers. Same treatment as the
 * per-market card: the headline stat is drawn from the same payload the page
 * reads, so a shared link never advertises a number the page does not show.
 */

export const runtime = "nodejs";

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";

const fmtUsd = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v)}`;
};

interface Card {
  kicker: string;
  title: string;
  stat: string;
  statLabel: string;
  sub: string;
}

async function card(which: string): Promise<Card> {
  if (which === "contracts") {
    const base: Card = {
      kicker: "VISUALIZER 02",
      title: "Government Contracts",
      stat: "—",
      statLabel: "AWARDED, 12 MONTHS",
      sub: "Every bubble is a company, sized by the government dollars it won",
    };
    try {
      const r = await fetch(`${BACKEND}/api/visualizers/contracts?region=us&window=1y`, {
        next: { revalidate: 900 },
      });
      const d = (await r.json()) as { totalUsd?: number; bubbles?: unknown[] };
      if (d?.totalUsd) {
        base.stat = fmtUsd(d.totalUsd);
        base.sub = `${d.bubbles?.length ?? 0} recipients ranked by US federal obligations`;
      }
    } catch {
      /* the generic card still reads correctly */
    }
    return base;
  }
  if (which === "mining") {
    const base: Card = {
      kicker: "VISUALIZER 03",
      title: "Goldminer AI",
      stat: "—",
      statLabel: "GOLD PROJECTS MAPPED",
      sub: "Sized by what the most advanced study says the asset is worth",
    };
    try {
      const r = await fetch(`${BACKEND}/api/visualizers/mining`, { next: { revalidate: 900 } });
      const d = (await r.json()) as { projects?: { assetValueUsd: number }[] };
      const n = d?.projects?.length ?? 0;
      if (n) {
        base.stat = String(n);
        const total = d.projects!.reduce((s, p) => s + p.assetValueUsd, 0);
        base.sub = `${fmtUsd(total)} of asset value, every figure sourced`;
      }
    } catch {
      /* fall through */
    }
    return base;
  }
  const base: Card = {
    kicker: "VISUALIZER 04",
    title: "Biotech Catalysts",
    stat: "—",
    statLabel: "COMPANIES TRACKED",
    sub: "Pulsing when an FDA decision or a readout is inside ninety days",
  };
  try {
    const r = await fetch(`${BACKEND}/api/visualizers/biotech`, { next: { revalidate: 900 } });
    const d = (await r.json()) as { companies?: { nextCatalystDays: number | null }[] };
    const n = d?.companies?.length ?? 0;
    if (n) {
      base.stat = String(n);
      const soon = d.companies!.filter(
        (c) => c.nextCatalystDays != null && c.nextCatalystDays <= 90,
      ).length;
      base.sub = `${soon} with a catalyst inside ninety days`;
    }
  } catch {
    /* fall through */
  }
  return base;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const c = await card(searchParams.get("v") ?? "contracts");

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
          padding: "58px 62px",
          fontFamily: "sans-serif",
          color: "#f0f4fa",
        }}
      >
        <div
          style={{
            display: "flex",
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid rgba(32,208,255,0.5)",
            background: "rgba(32,208,255,0.12)",
            color: "#20d0ff",
            fontSize: 22,
            letterSpacing: 3,
          }}
        >
          {c.kicker}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 62, fontWeight: 800, letterSpacing: -1 }}>{c.title}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 18 }}>
            <div style={{ fontSize: 86, fontWeight: 800, color: "#20d0ff", lineHeight: 1 }}>
              {c.stat}
            </div>
            <div style={{ fontSize: 22, letterSpacing: 3, color: "#8794ab" }}>{c.statLabel}</div>
          </div>
          <div style={{ fontSize: 28, color: "#c9d3e3", marginTop: 16 }}>{c.sub}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>
            INSIDER<span style={{ color: "#20d0ff" }}>BUYING</span>
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#5d6b85" }}>
            insiderbuying.com/visualizers
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

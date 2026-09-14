import { Suspense } from "react";
import Link from "next/link";
import PageClient, { type Snapshot } from "./PageClient";

/**
 * §9.8 SEO: a canvas is invisible to a crawler, so the page ships a real,
 * server-rendered section under the arena — the §7.5 "biggest movers" list,
 * which is useful to a reader in its own right and is the same endpoint that
 * feeds the newsletter.
 */

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";

interface Mover {
  id: string;
  question: string;
  shortLabel: string;
  category: string;
  yesPrice: number | null;
  oneDayChange: number | null;
  volumeTotal: number;
}

async function movers(): Promise<{ up: Mover[]; down: Mover[] } | null> {
  try {
    const res = await fetch(`${BACKEND}/api/visualizers/markets/movers?limit=8`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as { up: Mover[]; down: Mover[] };
  } catch {
    return null;
  }
}

/** The arena's opening snapshot, fetched on the server so the canvas has
 *  bubbles on its first frame instead of after a round trip. Short revalidate:
 *  the prices move, and the SSE stream corrects anything stale within seconds
 *  of hydration anyway. */
async function snapshot(): Promise<Snapshot | null> {
  try {
    const res = await fetch(`${BACKEND}/api/visualizers/markets`, {
      next: { revalidate: 15 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Snapshot;
  } catch {
    return null;
  }
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/**
 * §9.8: a shared deep link must unfurl as the market it points at. The OG card
 * is drawn from the same normalised record the page reads, so the preview and
 * the page can never disagree.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const image = `https://insiderbuying.com/api/og/market${m ? `?id=${encodeURIComponent(m)}` : ""}`;
  let title = "Prediction Market Bubbles — Live Odds, Visualized | Insider Buying";
  if (m) {
    try {
      const res = await fetch(`${BACKEND}/api/visualizers/markets/${encodeURIComponent(m)}`, {
        next: { revalidate: 300 },
      });
      if (res.ok) {
        const market = (await res.json()) as { question?: string; yesPrice?: number | null };
        if (market?.question) {
          title = `${market.question} — ${pct(market.yesPrice ?? null)} YES | Insider Buying`;
        }
      }
    } catch {
      /* the default title is correct enough */
    }
  }
  return {
    title,
    openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function Page() {
  // Both server fetches in parallel — the SEO movers table and the snapshot
  // the canvas opens on.
  const [data, initial] = await Promise.all([movers(), snapshot()]);
  const rows = [...(data?.up ?? []), ...(data?.down ?? [])]
    .sort((a, b) => Math.abs(b.oneDayChange ?? 0) - Math.abs(a.oneDayChange ?? 0))
    .slice(0, 12);

  return (
    <>
      <Suspense fallback={<div style={{ minHeight: "70vh", background: "var(--bg-1)" }} />}>
        <PageClient initial={initial} />
      </Suspense>

      {rows.length > 0 && (
        <section style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 20px 52px" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              margin: "0 0 6px",
            }}
          >
            Biggest moves in the last 24 hours
          </h2>
          <p style={{ color: "var(--text-mute)", fontSize: 14, margin: "0 0 18px" }}>
            The curated board, ranked by how far the market&rsquo;s odds moved in a day.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-mute)", fontSize: 11.5 }}>
                  <th style={{ padding: "8px 10px" }}>Market</th>
                  <th style={{ padding: "8px 10px" }}>Category</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>YES</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>24h move</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px" }}>
                      <Link
                        href={`/visualizers/prediction-markets?m=${encodeURIComponent(m.id)}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {m.question}
                      </Link>
                    </td>
                    <td style={{ padding: "10px", color: "var(--text-mute)" }}>{m.category}</td>
                    <td
                      style={{
                        padding: "10px",
                        textAlign: "right",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {pct(m.yesPrice)}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        textAlign: "right",
                        fontFamily: "var(--font-mono)",
                        color:
                          (m.oneDayChange ?? 0) >= 0 ? "var(--good)" : "var(--bad)",
                      }}
                    >
                      {(m.oneDayChange ?? 0) >= 0 ? "+" : ""}
                      {Math.round((m.oneDayChange ?? 0) * 100)} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: "var(--text-faint)", fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}>
            Informational only; not betting or investment advice. Prices are from Polymarket and
            reflect what buyers and sellers are paying, not a forecast by InsiderBuying.{" "}
            <Link href="/methodology#prediction-markets" style={{ color: "var(--accent)" }}>
              Methodology
            </Link>
            .
          </p>
        </section>
      )}
    </>
  );
}

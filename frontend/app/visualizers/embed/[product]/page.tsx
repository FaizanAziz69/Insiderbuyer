import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import PredictionClient from "../../prediction-markets/PageClient";
import ContractsClient from "../../government-contracts/PageClient";
import GoldminerClient from "../../goldminer/PageClient";
import BiotechClient from "../../biotech/PageClient";

/**
 * §10 Phase 5, "embeds": the same visualizer with the site's chrome removed,
 * for an iframe on someone else's page. It is the identical component tree, not
 * a cut-down copy, so an embed can never drift from the page it came from —
 * and every panel keeps its source line and its disclaimer, which is exactly
 * why an embed must not be a stripped version.
 *
 * The attribution bar is not optional: an embed that does not say where the
 * data came from is a liability for whoever hosts it and worthless to us.
 */

const PRODUCTS: Record<string, { title: string; el: React.ReactNode }> = {
  "prediction-markets": { title: "Prediction Market Bubbles", el: <PredictionClient /> },
  "government-contracts": { title: "Government Contracts", el: <ContractsClient /> },
  goldminer: { title: "Goldminer AI", el: <GoldminerClient /> },
  biotech: { title: "Biotech Catalysts", el: <BiotechClient /> },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ product: string }>;
}): Promise<Metadata> {
  const { product } = await params;
  const p = PRODUCTS[product];
  return {
    title: p ? `${p.title} — embed | Insider Buying` : "Embed | Insider Buying",
    // An embed is a copy of a canonical page; it must never compete with it.
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const { product } = await params;
  const p = PRODUCTS[product];
  if (!p) notFound();

  return (
    <div data-bare-page style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Suspense fallback={<div style={{ minHeight: "80vh", background: "var(--bg-1)" }} />}>
        {p.el}
      </Suspense>
      <a
        href={`https://insiderbuying.com/visualizers/${product}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "9px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-1)",
          color: "var(--text-mute)",
          fontSize: 12,
          textDecoration: "none",
        }}
      >
        <span>
          <b style={{ color: "var(--text)" }}>
            INSIDER<span style={{ color: "var(--accent)" }}>BUYING</span>
          </b>{" "}
          · {p.title}
        </span>
        <span style={{ color: "var(--accent)" }}>Open the full visualizer →</span>
      </a>
    </div>
  );
}

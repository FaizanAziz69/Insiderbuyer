"use client";
import { InsiderTimelineViz } from "./InsiderTimelineViz";
import { IqsScoreCardViz } from "./IqsScoreCardViz";
import { SectorConvictionViz } from "./SectorConvictionViz";
import { PriceMarkersViz } from "./PriceMarkersViz";
import { TxCompareViz } from "./TxCompareViz";
import { PullQuoteViz } from "./PullQuoteViz";
import { PeerTableViz } from "./PeerTableViz";

/**
 * Editorial Playbook v2 §7 — the six approved data visualizations, dispatched
 * from the placeholder a writer puts in the article body.
 *
 * This is what §7 asks for in as many words: "The developer can build a
 * reusable embeddable widget — a small HTML snippet that auto-pulls IQS data
 * for a given ticker and renders inline in any article. This should be
 * prioritized."
 *
 * The snippet is one div:
 *
 *   <div data-viz="insider-timeline" data-ticker="MRNA"></div>
 *   <div data-viz="iqs-card"         data-ticker="CCJ"></div>
 *   <div data-viz="sector-table"     data-days="30" data-sector="Materials"></div>
 *   <div data-viz="price-markers"    data-ticker="CCJ" data-range="1y"></div>
 *   <div data-viz="tx-compare"       data-ticker="CCJ" data-days="30"></div>
 *   <div data-viz="pull-quote">One striking stat, as text.</div>
 *
 * Everything is pulled live at render, so an article published in August still
 * shows current filings in December — and an article can never state a figure
 * its own viz contradicts, because the viz is not a screenshot. The §10
 * checklist requires at least one of these in every editorial.
 */

export interface VizAttrs {
  viz: string;
  ticker?: string;
  days?: string;
  months?: string;
  range?: string;
  rows?: string;
  sector?: string;
  cite?: string;
  title?: string;
  source?: string;
  note?: string;
  subtitle?: string;
  /** Inner HTML of the placeholder — used by pull-quote and peer-table. */
  inner?: string;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function EditorialViz({ attrs }: { attrs: VizAttrs }) {
  const ticker = (attrs.ticker || "").toUpperCase();

  switch (attrs.viz) {
    case "insider-timeline":
      if (!ticker) return null;
      return (
        <InsiderTimelineViz
          ticker={ticker}
          months={num(attrs.months, 12)}
          limit={num(attrs.rows, 8)}
        />
      );
    case "iqs-card":
      if (!ticker) return null;
      return <IqsScoreCardViz ticker={ticker} />;
    case "sector-table":
      return (
        <SectorConvictionViz
          days={num(attrs.days, 30)}
          rows={num(attrs.rows, 8)}
          sector={attrs.sector || null}
        />
      );
    case "price-markers":
      if (!ticker) return null;
      return <PriceMarkersViz ticker={ticker} range={attrs.range || "1y"} />;
    case "tx-compare":
      if (!ticker) return null;
      return (
        <TxCompareViz ticker={ticker} days={num(attrs.days, 30)} max={num(attrs.rows, 5)} />
      );
    case "pull-quote":
      return <PullQuoteViz html={attrs.inner || ""} cite={attrs.cite || null} />;
    case "peer-table":
      return (
        <PeerTableViz
          html={attrs.inner || ""}
          title={attrs.title || null}
          subtitle={attrs.subtitle || null}
          source={attrs.source || null}
          note={attrs.note || null}
        />
      );
    default:
      // An unknown type renders nothing rather than an error block: the
      // checklist already refuses to publish one, so this only guards an
      // article stored before a type was renamed.
      return null;
  }
}

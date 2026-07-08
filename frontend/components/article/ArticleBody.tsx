"use client";
import { Fragment, useMemo } from "react";
import { ArticleStockCard } from "./ArticleStockCard";

/** Matches the embed placeholders the content engine writes into article
 *  HTML: `<div data-stock-embed="NVDA"></div>`. */
const EMBED_RE = /<div\s+data-stock-embed="([A-Za-z.\-]{1,10})"\s*><\/div>/g;

/**
 * Article body renderer — renders the stored HTML, swapping every
 * `data-stock-embed` placeholder for a live <ArticleStockCard> (price chart,
 * Insider Score, analyst rating pulled from our own APIs). Plain articles
 * without embeds render exactly as before.
 */
export function ArticleBody({ html }: { html: string }) {
  const segments = useMemo(() => {
    const out: Array<{ type: "html"; value: string } | { type: "stock"; ticker: string }> = [];
    let last = 0;
    for (const m of html.matchAll(EMBED_RE)) {
      const idx = m.index ?? 0;
      if (idx > last) out.push({ type: "html", value: html.slice(last, idx) });
      out.push({ type: "stock", ticker: m[1].toUpperCase() });
      last = idx + m[0].length;
    }
    if (last < html.length) out.push({ type: "html", value: html.slice(last) });
    return out;
  }, [html]);

  return (
    <div className="article-body">
      {segments.map((seg, i) =>
        seg.type === "stock" ? (
          <ArticleStockCard key={`stock-${seg.ticker}-${i}`} ticker={seg.ticker} />
        ) : (
          <Fragment key={`html-${i}`}>
            <div dangerouslySetInnerHTML={{ __html: seg.value }} />
          </Fragment>
        ),
      )}
    </div>
  );
}

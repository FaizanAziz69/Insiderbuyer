"use client";
import { Fragment, useMemo } from "react";
import { ArticleStockCard } from "./ArticleStockCard";
import { sanitizeArticleHtml } from "@/lib/sanitizeArticleHtml";

/** Matches the embed placeholders the content engine writes into article
 *  HTML: `<div data-stock-embed="NVDA"></div>`. */
const EMBED_RE = /<div\s+data-stock-embed="([A-Za-z.\-]{1,10})"\s*><\/div>/g;

/**
 * Article body renderer — renders the stored HTML, swapping every
 * `data-stock-embed` placeholder for a live <ArticleStockCard> (price chart,
 * Insider Score, analyst rating pulled from our own APIs). Plain articles
 * without embeds render exactly as before.
 */
const LINK_ALLOWED_PREFIXES = [
  "/companies/", "/insights/", "/topics/", "/stock-lists/", "/insiders/",
  "/market-data/", "/heatmaps/", "/learn/", "/articles/",
];
const LINK_ALLOWED_EXACT = new Set([
  "/", "/companies", "/insights", "/editorial", "/stock-lists", "/trades",
  "/insiders/hot", "/analyst-ratings", "/top-analysts", "/earnings", "/dividends", "/ipos",
  "/short-interest", "/short-squeeze", "/congressional-trades", "/sectors",
  "/screener", "/premium", "/news",
]);
const LINK_TOPIC_SLUGS = new Set(["ai", "biotech", "ev", "etf", "macro", "markets", "ma", "semis"]);

/** Render-time guard for older articles: rewrite invented internal routes
 *  (e.g. "/biotech") to their real hubs, strip unknown ones (keep the text). */
function fixInternalLinks(html: string): string {
  return html.replace(
    /<a\s+[^>]*href="(\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (full, href: string, text: string) => {
      const path = (href.split(/[?#]/)[0].replace(/\/$/, "") || "/").toLowerCase();
      if (LINK_ALLOWED_EXACT.has(path) || LINK_ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
        return full;
      }
      const slug = path.slice(1);
      if (LINK_TOPIC_SLUGS.has(slug)) return full.replace(href, `/topics/${slug}`);
      return text;
    },
  );
}

/** Strip the engine's trailing in-body disclosure paragraph(s) — the page now
 *  renders ONE standardized compliance footer under every article, so the
 *  generated variant would show as a duplicate disclaimer. */
function stripInlineDisclosure(html: string): string {
  return html.replace(
    /<p>\s*(?:<(?:em|i|strong)>\s*)?Not investment advice\.[\s\S]*?<\/p>\s*$/gi,
    '',
  );
}

export function ArticleBody({ html: rawHtml }: { html: string }) {
  const html = useMemo(
    () => sanitizeArticleHtml(stripInlineDisclosure(fixInternalLinks(rawHtml))),
    [rawHtml],
  );
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

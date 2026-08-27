"use client";
import { Fragment, useMemo } from "react";
import { ArticleStockCard } from "./ArticleStockCard";
import { EditorialViz, VizAttrs } from "./viz";
import { sanitizeArticleHtml } from "@/lib/sanitizeArticleHtml";
import { usePremium } from "@/components/premium/PremiumContext";

/** Matches the embed placeholders the content engine writes into article
 *  HTML: `<div data-stock-embed="NVDA"></div>`. */
const EMBED_RE = /<div\s+data-stock-embed="([A-Za-z.\-]{1,10})"\s*><\/div>/g;

/** Editorial Playbook v2 §7 data-viz placeholders — `<div data-viz="iqs-card"
 *  data-ticker="CCJ"></div>`, and the self-contained pull-quote form which
 *  carries its own text. Both open and self-closing div forms are matched
 *  because a writer pasting from the manual will produce either. */
const VIZ_RE = /<div\s+([^>]*\bdata-viz\s*=\s*"[a-z-]+"[^>]*)>([\s\S]*?)<\/div>/gi;

/** Pull `data-*` attributes off a matched placeholder's attribute string. */
function vizAttrs(attrString: string, inner: string): VizAttrs {
  const out: Record<string, string> = {};
  for (const m of attrString.matchAll(/data-([a-z-]+)\s*=\s*"([^"]*)"/gi)) {
    out[m[1].toLowerCase()] = m[2];
  }
  return { ...out, viz: (out.viz || "").toLowerCase(), inner } as VizAttrs;
}

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
  "/insiders/hot", "/analyst-ratings", "/analyst-stocks", "/earnings", "/dividends", "/ipos",
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
  // Stored bodies state the numeric Insider Score in prose; it is paygated
  // everywhere else, so it is masked here for anyone without an entitlement.
  // Subscribers get the prose verbatim — this gates, it does not delete.
  const { unlocked } = usePremium();
  const html = useMemo(
    () =>
      sanitizeArticleHtml(stripInlineDisclosure(fixInternalLinks(rawHtml)), {
        unlocked,
      }),
    [rawHtml, unlocked],
  );
  const segments = useMemo(() => {
    type Segment =
      | { type: "html"; value: string }
      | { type: "stock"; ticker: string }
      | { type: "viz"; attrs: VizAttrs };

    // Both placeholder families are found in one pass over the same string, so
    // an article carrying a stock card AND a viz keeps them in written order.
    // (Two sequential passes would splice the second family's offsets against
    // a string the first pass had already segmented.)
    const found: Array<{ start: number; end: number; seg: Segment }> = [];
    for (const m of html.matchAll(EMBED_RE)) {
      const idx = m.index ?? 0;
      found.push({
        start: idx,
        end: idx + m[0].length,
        seg: { type: "stock", ticker: m[1].toUpperCase() },
      });
    }
    for (const m of html.matchAll(VIZ_RE)) {
      const idx = m.index ?? 0;
      found.push({
        start: idx,
        end: idx + m[0].length,
        seg: { type: "viz", attrs: vizAttrs(m[1], m[2]) },
      });
    }
    found.sort((a, b) => a.start - b.start);

    const out: Segment[] = [];
    let last = 0;
    for (const f of found) {
      if (f.start < last) continue; // overlapping match — keep the first
      if (f.start > last) out.push({ type: "html", value: html.slice(last, f.start) });
      out.push(f.seg);
      last = f.end;
    }
    if (last < html.length) out.push({ type: "html", value: html.slice(last) });
    return out;
  }, [html]);

  return (
    <div className="article-body">
      {segments.map((seg, i) => {
        if (seg.type === "stock") {
          return <ArticleStockCard key={`stock-${seg.ticker}-${i}`} ticker={seg.ticker} />;
        }
        if (seg.type === "viz") {
          return <EditorialViz key={`viz-${seg.attrs.viz}-${i}`} attrs={seg.attrs} />;
        }
        return (
          <Fragment key={`html-${i}`}>
            <div dangerouslySetInnerHTML={{ __html: seg.value }} />
          </Fragment>
        );
      })}
    </div>
  );
}

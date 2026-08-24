import type { MetadataRoute } from "next";

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://insiderbuying.com";

const STATIC_ROUTES = [
  "", "/insights", "/editorial", "/stock-lists", "/companies", "/trades",
  "/insiders/hot", "/analyst-ratings", "/analyst-stocks", "/government-contracts", "/market-data/top-gainers",
  "/market-data/top-losers", "/earnings", "/dividends", "/ipos",
  "/short-interest", "/short-squeeze", "/congressional-trades",
  "/heatmaps/market", "/sectors", "/screener", "/watchlist", "/bubbles",
  "/stock-lists/hot-sectors", "/learn/insider-buying",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE}${r}`,
    changeFrequency: r === "" || r === "/insights" ? "hourly" : "daily",
    priority: r === "" ? 1 : 0.7,
  }));

  // Articles — the freshest, most SEO-valuable pages.
  try {
    const res = await fetch(`${BACKEND}/api/content/blogs?limit=200`, {
      next: { revalidate: 3600 },
    });
    const data = await res.json();
    for (const item of data?.items || []) {
      out.push({
        url: `${SITE}/insights/${item.slug}`,
        lastModified: item.generatedAt ? new Date(item.generatedAt) : undefined,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch { /* articles unavailable — static routes still ship */ }

  // Stock lists.
  try {
    const res = await fetch(`${BACKEND}/api/stock-lists`, { next: { revalidate: 3600 } });
    const data = await res.json();
    for (const l of data?.lists || []) {
      out.push({ url: `${SITE}/stock-lists/${l.slug}`, changeFrequency: "daily", priority: 0.6 });
    }
  } catch { /* ignore */ }

  return out;
}

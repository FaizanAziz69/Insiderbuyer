import {
  Activity,
  Bitcoin,
  Briefcase,
  Building2,
  Calendar,
  Coins,
  Crown,
  Cpu,
  FileText,
  FlaskConical,
  Flame,
  Gem,
  Globe2,
  Landmark,
  LineChart,
  Lock,
  Newspaper,
  Orbit,
  Receipt,
  Plane,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wrench,
  Megaphone,
} from "lucide-react";
import { SUBSCRIBE_HREF } from "@/lib/funnel";
import { DATA_ARTICLES_ENABLED } from "@/lib/data-articles-flag";

export interface NavLink {
  label: string;
  href: string;
  description?: string;
  icon?: any;
  badge?: "premium" | "new" | "live" | "popular";
  /** Sub-links rendered indented under this one (George 2026-09-14: Top
   *  Insider Scores hangs off Insider Bubbles rather than standing alone). */
  children?: NavLink[];
}

/** A titled block of links. A column may stack several of these so two short
 *  sections (Analyst / Congress) can share one column without a blank gap. */
export interface NavSection {
  title?: string;
  links: NavLink[];
}

export interface NavColumn {
  /** Optional column heading. Omit to render a clean, header-less link list. */
  title?: string;
  /** Flat link list. Ignored when `sections` is set. */
  links?: NavLink[];
  /** Several titled blocks stacked down one column. */
  sections?: NavSection[];
}

export interface NavCallout {
  title: string;
  description: string;
  href: string;
  icon: any;
  /** Marks the callout as a premium feature (standout styling). */
  premium?: boolean;
  /** Renders the banner layout: headline, bullets, closing line. */
  bullets?: string[];
  /** The line under the bullets. */
  footnote?: string;
  /** Show the live-score sample panel on the right. */
  score?: boolean;
}

export interface NavGroup {
  label: string;
  columns: NavColumn[];
  callouts?: NavCallout[];
  /** Where to render the callout cards relative to the columns. Default bottom. */
  calloutPosition?: "top" | "bottom";
}

/** A link as the mobile drawer lays it out: depth 1 = a child, indented
 *  under its parent (Top Insider Scores under Insider Bubbles). */
export type MobileLink = NavLink & { depth?: number };
export interface MobileBlock {
  title?: string;
  links: MobileLink[];
}

/** The group as titled blocks for the mobile drawer — the same sub-sections
 *  the desktop panel shows (George 2026-09-15: "on mobile view its not there").
 *  A plain column becomes one block carrying the column's own title. */
export function groupMobileBlocks(group: NavGroup): MobileBlock[] {
  const out: MobileBlock[] = [];
  for (const col of group.columns) {
    const blocks: NavSection[] = col.sections ?? [{ title: col.title, links: col.links ?? [] }];
    for (const block of blocks) {
      const links: MobileLink[] = [];
      for (const link of block.links) {
        links.push(link);
        if (link.children) links.push(...link.children.map((c) => ({ ...c, depth: 1 })));
      }
      if (links.length) out.push({ title: block.title, links });
    }
  }
  return out;
}

/** Every link in a group, flattened — sections, then links, then children.
 *  The mobile drawer renders one flat list per group, so it needs this rather
 *  than reaching into `columns[].links` (which is now optional). */
export function flattenGroupLinks(group: NavGroup): NavLink[] {
  const out: NavLink[] = [];
  for (const col of group.columns) {
    const blocks: NavSection[] = col.sections ?? [{ links: col.links ?? [] }];
    for (const block of blocks) {
      for (const link of block.links) {
        out.push(link);
        if (link.children) out.push(...link.children);
      }
    }
  }
  return out;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    // Reorganised 2026-09-14 (George: "this is starting to get too crowded").
    // One flat 13-link column plus two unlabelled ones became four titled
    // sections in the order he specified — insider data first, then analyst,
    // then congress, with everything else demoted to More Stock Tools.
    label: "Stock Data",
    columns: [
      {
        sections: [
          {
            title: "Insider Stock Data",
            links: [
              {
                label: "Insider Bubbles",
                href: "/bubbles",
                icon: Orbit,
                badge: "live",
                // Hangs off the bubbles rather than sitting beside it: the
                // scores board is what a bubble opens into.
                children: [
                  {
                    label: "Top Insider Scores",
                    href: "/insiders/hot",
                    icon: Flame,
                    badge: "popular",
                  },
                ],
              },
              { label: "Top Insider Buys", href: "/insiders/top-buys", icon: Receipt, badge: "new" },
              // The Form 4 people page. The 13F fund roster (/investors) used
              // to carry this same label — it is now "Top Investors & Funds"
              // under More Stock Tools, so the two stop colliding.
              // Brief v7 Build 3: the unified page is the destination; the Form 4
              // table keeps its own entry below.
              { label: "Top Insiders", href: "/insiders", icon: Users, badge: "popular" },
              { label: "Insider Leaderboard (Form 4)", href: "/insiders/leaderboard", icon: Users },
              { label: "Insider Trades", href: "/trades", icon: Activity },
            ],
          },
        ],
      },
      {
        sections: [
          {
            title: "Analyst Stock Data",
            links: [
              { label: "Top Analyst Stocks", href: "/analyst-stocks", icon: LineChart },
              { label: "Top Analysts", href: "/analyst-ratings", icon: Star },
            ],
          },
          {
            title: "Congress Stock Data",
            links: [
              { label: "Congress Bubbles", href: "/congress-bubbles", icon: Orbit, badge: "live" },
              // Renamed from "Congressional Trades" (George's wording).
              { label: "Politician Stock Tracker", href: "/congressional-trades", icon: Landmark },
              // Brief v5: trades crossed with committee jurisdiction and
              // federal contract awards.
              { label: "Top Congress Trades", href: "/top-congress-trades", icon: Landmark, badge: "new" },
              // Brief v7 Build 1: disclosed portfolios rebuilt trade by trade,
              // ranked by estimated growth.
              { label: "Wealth Tracker", href: "/politicians", icon: Landmark, badge: "new" },
              // Brief v9: the stock-level congressional buying score, the
              // congressional counterpart to the Insider Score.
              { label: "Congress Quality Score", href: "/cqs-index", icon: Landmark, badge: "new" },
              // Brief v6: the published proprietary index.
              { label: "Conviction Index (IBCX)", href: "/index-ibcx", icon: Landmark, badge: "new" },
            ],
          },
        ],
      },
      {
        sections: [
          {
            title: "More Stock Tools",
            links: [
              // Delisted 2026-09-01 (George: needs work, remove for now) — see lib/data-articles-flag.ts.
              ...(DATA_ARTICLES_ENABLED ? [{ label: "Data Articles", href: "/data", icon: FileText, badge: "new" as const }] : []),
              { label: "All Visualizers", href: "/visualizers", icon: Orbit },
              { label: "Prediction Markets", href: "/visualizers/prediction-markets", icon: Orbit, badge: "new" },
              { label: "Market Heatmap", href: "/heatmaps/market", icon: Flame },
              { label: "Sector Heatmap", href: "/sectors", icon: Building2 },
              { label: "Top Investors & Funds", href: "/insiders?type=investor", icon: Landmark },
              // Workstream F: TSXV/CSE disclosed investor-relations spend.
              { label: "Promoter Score", href: "/promoter-score", icon: Megaphone, badge: "new" },
              { label: "Top IR Promoters", href: "/top-ir-promoters", icon: Megaphone },
              { label: "Upcoming Earnings", href: "/earnings", icon: Calendar },
            ],
          },
        ],
      },
      {
        // Untitled continuation of More Stock Tools — one heading, two columns,
        // so neither runs to twice the height of the insider column.
        sections: [
          {
            links: [
              { label: "Top Gainers", href: "/market-data/top-gainers", icon: TrendingUp, badge: "popular" },
              { label: "Top Losers", href: "/market-data/top-losers", icon: TrendingUp },
              { label: "Short Squeeze List", href: "/short-squeeze", icon: Flame },
              { label: "Short Interest", href: "/short-interest", icon: TrendingUp },
              { label: "IPO Calendar", href: "/ipos", icon: Rocket, badge: "new" },
              { label: "Dividends", href: "/dividends", icon: Coins },
            ],
          },
        ],
      },
    ],
    callouts: [
      {
        title: "Real-time News Feed",
        description: "View real-time investing headlines and stock market news for your watchlist or the broader market.",
        href: "/news",
        icon: Newspaper,
      },
    ],
  },
  {
    label: "Stock Lists",
    columns: [
      {
        title: "Stocks By Interest",
        links: [
          { label: "Hot Sectors", href: "/stock-lists/hot-sectors", icon: Flame, badge: "new" },
          { label: "Government Contracts", href: "/government-contracts", icon: Briefcase, badge: "new" },
          { label: "Stock Ideas", href: "/lists", icon: Sparkles },
          { label: "Blue Sky Stocks", href: "/stock-lists/blue-sky", icon: Rocket },
          { label: "Large Cap", href: "/stock-lists/large-cap", icon: Building2 },
          { label: "Small Cap", href: "/stock-lists/small-cap", icon: Rocket },
          { label: "Penny Stocks", href: "/stock-lists/penny-stocks", icon: Coins },
          { label: "Blue Chip", href: "/stock-lists/blue-chip", icon: ShieldCheck },
        ],
      },
      {
        title: "Sectors & Themes",
        links: [
          { label: "FAANG", href: "/stock-lists/faang", icon: Cpu },
          { label: "REITs", href: "/stock-lists/reits", icon: Landmark },
          { label: "Tech", href: "/stock-lists/tech", icon: Cpu },
          { label: "Biotech", href: "/stock-lists/biotech", icon: FlaskConical },
          { label: "Metals & Mining", href: "/stock-lists/metals-and-mining", icon: Wrench },
          { label: "Gold", href: "/stock-lists/gold", icon: Coins },
          { label: "Silver", href: "/stock-lists/silver", icon: Gem },
          { label: "Oil", href: "/stock-lists/oil", icon: Flame },
        ],
      },
      {
        title: "Famous Investors",
        links: [
          { label: "Warren Buffett", href: "/stock-lists/warren-buffett", icon: Crown },
          { label: "Jeff Bezos", href: "/stock-lists/jeff-bezos", icon: Rocket },
          { label: "Ray Dalio", href: "/stock-lists/ray-dalio", icon: Globe2 },
          { label: "Eric Sprott", href: "/stock-lists/eric-sprott", icon: Coins },
          { label: "Trump Family", href: "/stock-lists/trump-family", icon: Star },
          { label: "Politicians", href: "/stock-lists/politicians", icon: Landmark },
        ],
      },
      {
        title: "By Exchange",
        links: [
          { label: "US (NYSE & NASDAQ) ", href: "/stock-lists/blue-chip", icon: ShieldCheck },
          { label: "Canada (TSX)", href: "/stock-lists/canada", icon: Globe2 },
          { label: "Germany (Xetra/DAX)", href: "/stock-lists/germany", icon: Building2 },
        ],
      },
    ],
    // Bottom, like every other dropdown (client 2026-08-24) — this group was
    // the only one rendering its callout above the columns.
    calloutPosition: "bottom",
    callouts: [
      {
        // Points at the main scores board, not the gated picks page: that page
        // shows no scores at all, and the top ranks here are gated anyway, so
        // this is the better landing (George, 2026-09-02).
        title: "Every stock's insider quality (IQ) score.",
        description: "",
        href: "/insiders/hot",
        icon: Flame,
        bullets: [
          "Transaction size",
          "Insider history & track record",
          "Ownership change",
          "+ more",
        ],
        footnote: "One score that tells you what insiders are doing right now.",
        score: true,
      },
    ],
  },
  {
    label: "News & Analysis",
    columns: [
      {
        links: [
          { label: "AI", href: "/topics/ai", icon: Sparkles },
          { label: "Biotech", href: "/topics/biotech", icon: FlaskConical },
          { label: "Electric Vehicles", href: "/topics/ev", icon: TrendingUp },
          { label: "ETFs", href: "/topics/etf", icon: Briefcase },
          { label: "Macro", href: "/topics/macro", icon: Globe2 },
          { label: "Markets", href: "/topics/markets", icon: LineChart },
          { label: "Mergers & Acquisitions", href: "/topics/ma", icon: Briefcase },
          { label: "Semiconductors", href: "/topics/semis", icon: Cpu },
        ],
      },
      // Data pages (Dividends, Short Interest, IPOs, Congressional Trades,
      // Stock Ideas) moved to Stock Data / Stock Lists 2026-08-21 — client:
      // News & Analysis should carry only news and articles.
      {
        links: [
          { label: "Editorial Desk", href: "/editorial", icon: Newspaper, badge: "new" },
          { label: "AI Insights", href: "/insights", icon: Sparkles },
          { label: "Intro to Insider Buying", href: "/learn/insider-buying", icon: FileText },
          { label: "Latest Financial News", href: "/insights?sort=latest", icon: Newspaper },
          { label: "Popular Articles", href: "/insights?sort=popular", icon: TrendingUp },
          { label: "Market Movers", href: "/articles/market-movers", icon: Flame },
          // "Reports & Advertorials" (/reports) hidden 2026-08-21 — client:
          // the page has wrong content, remove links for now.
          { label: "For Business / API", href: "/business", icon: Briefcase },
        ],
      },
    ],
    callouts: [
      {
        title: "Get Insider Access",
        description: "Unlock the top-5 daily Insider Score picks, real-time alerts, and analyst-consensus filters.",
        href: SUBSCRIBE_HREF,
        icon: Lock,
        premium: true,
      },
    ],
  },
];

export const INDICES_LABELS: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "Nasdaq",
  "^DJI": "Dow",
  "^NYA": "NYSE",
  "GC=F": "Gold",
  "SI=F": "Silver",
  "BTC-USD": "Bitcoin",
};

export const INDICES_ICONS: Record<string, any> = {
  "GC=F": Coins,
  "SI=F": Gem,
  "BTC-USD": Bitcoin,
};

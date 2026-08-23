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
  Plane,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
  description?: string;
  icon?: any;
  badge?: "premium" | "new" | "live" | "popular";
}

export interface NavColumn {
  /** Optional column heading. Omit to render a clean, header-less link list. */
  title?: string;
  links: NavLink[];
}

export interface NavCallout {
  title: string;
  description: string;
  href: string;
  icon: any;
  /** Marks the callout as a premium feature (lock icon + standout styling). */
  premium?: boolean;
}

export interface NavGroup {
  label: string;
  columns: NavColumn[];
  callouts?: NavCallout[];
  /** Where to render the callout cards relative to the columns. Default bottom. */
  calloutPosition?: "top" | "bottom";
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Stock Data",
    columns: [
      {
        links: [
          { label: "Insider Bubbles", href: "/bubbles", icon: Orbit, badge: "new" },
          { label: "Top Insider Scores", href: "/insiders/hot", icon: Flame, badge: "popular" },
          { label: "Top Analysts", href: "/analyst-ratings", icon: Star },
          { label: "Congressional Trades", href: "/congressional-trades", icon: Landmark },
          { label: "Insider Trades", href: "/trades", icon: Activity },
          { label: "Upcoming Earnings", href: "/earnings", icon: Calendar },
        ],
      },
      {
        links: [
          { label: "Top Gainers", href: "/market-data/top-gainers", icon: TrendingUp, badge: "popular" },
          { label: "Top Losers", href: "/market-data/top-losers", icon: TrendingUp },
          { label: "Short Squeeze List", href: "/short-squeeze", icon: Flame },
          { label: "Short Interest", href: "/short-interest", icon: TrendingUp },
          { label: "IPOs", href: "/ipos", icon: Rocket },
        ],
      },
      {
        links: [
          { label: "Market Heatmap", href: "/heatmaps/market", icon: Flame },
          { label: "Sector Heatmap", href: "/sectors", icon: Building2 },
          { label: "Top Insiders", href: "/insiders", icon: Users, badge: "popular" },
          { label: "Dividends", href: "/dividends", icon: Coins },
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
          { label: "Top Analyst Stocks", href: "/analyst-stocks", icon: Star },
          { label: "Blue Sky Stocks", href: "/stock-lists/blue-sky", icon: Rocket, badge: "premium" },
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
    calloutPosition: "top",
    callouts: [
      {
        title: "Top Insider Scores",
        description: "Unlock the top-ranked Insider Scores — the highest-quality insider-buying signals, ranked #50 → #1.",
        href: "/stock-lists/iqs-top-picks",
        icon: Lock,
        premium: true,
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
        href: "/premium",
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

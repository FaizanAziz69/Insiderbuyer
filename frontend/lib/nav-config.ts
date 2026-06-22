import {
  Activity,
  BarChart3,
  Bitcoin,
  Briefcase,
  Building2,
  Calendar,
  Coins,
  Crown,
  Cpu,
  FlaskConical,
  Flame,
  Gem,
  Globe2,
  Landmark,
  LineChart,
  Newspaper,
  Plane,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
  description?: string;
  icon?: any;
  badge?: "premium" | "new" | "live";
}

export interface NavColumn {
  title: string;
  links: NavLink[];
}

export interface NavCallout {
  title: string;
  description: string;
  href: string;
  icon: any;
}

export interface NavGroup {
  label: string;
  columns: NavColumn[];
  callouts?: NavCallout[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Market Data",
    columns: [
      {
        title: "Trading Activity",
        links: [
          { label: "Insider Trades", href: "/trades", description: "All open-market Form 4 buys & sells", icon: Activity },
          { label: "Insider Earnings Score", href: "/earnings-performance", description: "Insider track record into earnings", icon: Target },
          { label: "Upcoming Earnings", href: "/earnings", description: "Live earnings calendar, next 7 days", icon: Calendar },
          { label: "Most Active Stocks", href: "/market-data/most-active", description: "Highest dollar volume today", icon: BarChart3 },
        ],
      },
      {
        title: "Market Movers",
        links: [
          { label: "Top Gainers", href: "/market-data/top-gainers", description: "Today's biggest percentage gains", icon: TrendingUp },
          { label: "Top Losers", href: "/market-data/top-losers", description: "Today's biggest percentage losses", icon: TrendingUp },
          { label: "Market Movers Articles", href: "/articles/market-movers", description: "Stocks up 10%+ — and why", icon: Flame },
        ],
      },
      {
        title: "Heatmaps & Charts",
        links: [
          { label: "Market Heatmap", href: "/heatmaps/market", description: "Every ranked U.S. company", icon: Flame },
          { label: "Sector Heatmap", href: "/sectors", description: "Buying volume by sector", icon: Building2 },
          { label: "Volume Charts", href: "/charts/volume", description: "Buys by role over time", icon: BarChart3 },
          { label: "Top Insiders", href: "/insiders", description: "Most-active executives", icon: Users },
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
          { label: "Metals & Mining", href: "/stock-lists/metals-and-mining", icon: Wrench },
          { label: "Tech", href: "/stock-lists/tech", icon: Cpu },
          { label: "Gold", href: "/stock-lists/gold", icon: Coins },
          { label: "Silver", href: "/stock-lists/silver", icon: Gem },
          { label: "Blue Chip", href: "/stock-lists/blue-chip", icon: ShieldCheck },
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
          { label: "US (Blue Chip)", href: "/stock-lists/blue-chip", description: "NYSE & NASDAQ leaders", icon: ShieldCheck },
          { label: "Canada (TSX)", href: "/stock-lists/canada", description: "Toronto-listed majors, live prices", icon: Globe2 },
          { label: "Germany (Xetra/DAX)", href: "/stock-lists/germany", description: "Frankfurt-listed majors, live prices", icon: Building2 },
        ],
      },
    ],
    callouts: [
      {
        title: "IQS Top Picks · Premium",
        description: "Unlock the top-5 daily IQS picks — the strongest insider-buying signals before they hit the broader feed.",
        href: "/stock-lists/iqs-top-picks",
        icon: Sparkles,
      },
    ],
  },
  {
    label: "News & Analysis",
    columns: [
      {
        title: "Data Tools",
        links: [
          { label: "Analyst Ratings", href: "/analyst-ratings", description: "Consensus & price targets", icon: ShieldCheck },
          { label: "Dividends", href: "/dividends", description: "Yields, rates & ex-dates", icon: Coins },
          { label: "Short Interest", href: "/short-interest", description: "Shares short & days-to-cover", icon: TrendingUp },
          { label: "Earnings", href: "/earnings", description: "Live earnings calendar", icon: BarChart3 },
          { label: "IPOs", href: "/ipos", description: "Priced & upcoming offerings", icon: Rocket },
          { label: "Insider Trades", href: "/trades", description: "All Form 4 buys & sells", icon: Activity },
          { label: "Congressional Trades", href: "/congressional-trades", description: "STOCK Act disclosures", icon: Landmark },
          { label: "Stock Heatmap", href: "/heatmaps/market", description: "Every ranked U.S. company", icon: Flame },
        ],
      },
      {
        title: "News Topics",
        links: [
          { label: "AI", href: "/topics/ai", description: "AI-refined, updated daily", icon: Sparkles },
          { label: "Biotech", href: "/topics/biotech", description: "AI-refined, updated daily", icon: FlaskConical },
          { label: "Electric Vehicles", href: "/topics/ev", description: "AI-refined, updated daily", icon: TrendingUp },
          { label: "ETFs", href: "/topics/etf", description: "AI-refined, updated daily", icon: Briefcase },
          { label: "Macro", href: "/topics/macro", description: "AI-refined, updated daily", icon: Globe2 },
          { label: "Markets", href: "/topics/markets", description: "AI-refined, updated daily", icon: LineChart },
          { label: "Mergers & Acquisitions", href: "/topics/ma", description: "AI-refined, updated daily", icon: Briefcase },
          { label: "Semiconductors", href: "/topics/semis", description: "AI-refined, updated daily", icon: Cpu },
        ],
      },
      {
        title: "Sections",
        links: [
          { label: "AI Insights", href: "/insights", description: "AI-generated daily briefings — refreshed each morning", icon: Sparkles },
          { label: "Latest Financial News", href: "/news?sort=latest", description: "Freshest stories across all topics", icon: Newspaper },
          { label: "Popular Articles", href: "/news?sort=popular", description: "Most-read stories this week", icon: TrendingUp },
          { label: "Stock Ideas", href: "/lists", description: "Curated trade-idea lists", icon: Sparkles },
          { label: "Material Matters", href: "/featured/material-matters", description: "SEC Chairman podcast", icon: Activity },
        ],
      },
    ],
    callouts: [
      {
        title: "Subscribe — IQS Premium",
        description: "Unlock the top-5 daily IQS picks, real-time alerts, and analyst-consensus filters.",
        href: "/premium",
        icon: Sparkles,
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

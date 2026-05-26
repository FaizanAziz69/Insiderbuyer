"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  Eye,
  Flame,
  Home,
  LineChart,
  Newspaper,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

type NavItem =
  | { type: "link"; label: string; href: string; icon: any }
  | {
      type: "group";
      label: string;
      icon: any;
      key: string;
      items: { label: string; href: string }[];
    };

const NAV: NavItem[] = [
  { type: "link", label: "Home", href: "/", icon: Home },
  { type: "link", label: "Watchlist", href: "/watchlist", icon: Eye },
  { type: "link", label: "Stocks", href: "/companies", icon: TrendingUp },
  { type: "link", label: "Videos", href: "/videos", icon: LineChart },
  {
    type: "group",
    key: "trades",
    label: "Insider trades",
    icon: Activity,
    items: [
      { label: "All trades", href: "/trades" },
      { label: "Screener", href: "/screener" },
      { label: "Top insiders", href: "/insiders" },
      { label: "By sector", href: "/sectors" },
      { label: "Ideas & lists", href: "/lists" },
      { label: "Top performers", href: "/top-performers" },
    ],
  },
  {
    type: "group",
    key: "heatmaps",
    label: "Heatmaps",
    icon: Flame,
    items: [
      { label: "Sector activity", href: "/heatmaps/sector" },
      { label: "Confidence index", href: "/heatmaps/confidence" },
      { label: "Market heatmap", href: "/heatmaps/market" },
    ],
  },
  {
    type: "group",
    key: "charts",
    label: "Charts",
    icon: LineChart,
    items: [
      { label: "Trading volume", href: "/charts/volume" },
      { label: "Sentiment chart", href: "/charts/sentiment" },
      { label: "Sector rotation", href: "/charts/rotation" },
      { label: "Technical chart", href: "/charts/technical" },
    ],
  },
  {
    type: "group",
    key: "news",
    label: "News & analysis",
    icon: Newspaper,
    items: [
      { label: "Latest news", href: "/news" },
      { label: "Trending", href: "/news/trending" },
      { label: "Articles", href: "/articles" },
      { label: "AI insights", href: "/ai-insights" },
    ],
  },
  {
    type: "group",
    key: "moves",
    label: "Market moves",
    icon: TrendingUp,
    items: [
      { label: "Biggest movers", href: "/movers" },
      { label: "IPOs", href: "/ipos" },
      { label: "Earnings", href: "/earnings" },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname() || "/";
  const initialOpen: Record<string, boolean> = {};
  for (const item of NAV) {
    if (item.type === "group") {
      initialOpen[item.key] = item.items.some((s) => pathname.startsWith(s.href));
    }
  }
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);
  const toggle = (k: string) => setOpenGroups((s) => ({ ...s, [k]: !s[k] }));

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-[260px] flex-shrink-0 border-r border-[var(--border)] flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        style={{ background: "var(--bg-sidebar)" }}
      >
        <Link href="/" className="flex items-center gap-2.5 px-5 h-16 border-b border-[var(--border)]">
          <div className="relative h-8 w-8 rounded-lg flex items-center justify-center bg-[var(--accent)]">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold tracking-tight">insiderbuying</span>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-0.5">
          {NAV.map((item) => {
            if (item.type === "link") {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  onClick={onClose}
                  className="sidebar-link"
                >
                  <Icon className="h-4 w-4 opacity-80" />
                  <span>{item.label}</span>
                </Link>
              );
            }
            const Icon = item.icon;
            const isOpen = openGroups[item.key];
            const hasActive = item.items.some((s) => pathname === s.href);
            return (
              <div key={item.key}>
                <button
                  onClick={() => toggle(item.key)}
                  data-active={hasActive}
                  className="sidebar-link w-full justify-between text-left"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="h-4 w-4 opacity-80" />
                    {item.label}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-mute transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="ml-3 mt-0.5 mb-1 border-l border-[var(--border)]">
                    {item.items.map((s) => (
                      <Link
                        key={s.href}
                        href={s.href}
                        data-active={pathname === s.href}
                        onClick={onClose}
                        className="sidebar-sublink"
                      >
                        {s.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-[var(--border)]">
          <Link href="/settings" className="sidebar-link" data-active={pathname === "/settings"}>
            <Settings className="h-4 w-4 opacity-80" />
            <span>Settings</span>
          </Link>
          <div className="px-3 pt-3 text-[10px] text-faint font-mono">
            v1 · SEC EDGAR live feed
          </div>
        </div>
      </aside>
    </>
  );
}

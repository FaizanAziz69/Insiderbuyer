"use client";

/**
 * The stock-profile tab bar (Overview / Financials / …). Rendered by the page
 * as a sibling of both the header and the tab content, so its sticky range
 * spans the whole profile — it stays pinned under the app header while you
 * browse any tab's content (quiver-style). When it lived inside the header
 * card it un-stuck the moment you scrolled past the header.
 *
 * top:80 = app header height (TopHeader h-20). z-index sits below the app
 * header (z-[35]) so the header always wins where they meet.
 */
export function StockTabBar({
  tabs,
  activeTab,
  onTab,
}: {
  tabs: [string, string][];
  activeTab: string;
  onTab: (key: string) => void;
}) {
  return (
    <nav
      className="w-full"
      style={{
        position: "sticky",
        top: 80,
        zIndex: 20,
        background: "var(--bg-1)",
        borderBottom: "2px solid var(--sa-nav-border, var(--border))",
      }}
    >
      <div className="scrollbar-none flex items-center overflow-x-auto">
        {tabs.map(([key, label]) => {
          const on = key === activeTab;
          return (
            <button
              key={key}
              onClick={() => onTab(key)}
              aria-current={on ? "page" : undefined}
              className="whitespace-nowrap"
              style={{
                fontSize: 16,
                lineHeight: "24px",
                padding: "10px 20px",
                borderRadius: 0,
                fontWeight: on ? 600 : 400,
                color: on ? "var(--sa-text, var(--text))" : "var(--sa-tab-blue, var(--accent))",
                background: on ? "var(--sa-tab-active-bg, var(--accent-soft))" : "transparent",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

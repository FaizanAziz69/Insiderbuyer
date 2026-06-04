"use client";
import useSWR from "swr";
import Link from "next/link";
import { API_BASE, NewsResponse, fetcher, formatRelative } from "@/lib/api";

interface Props {
  excludeLink?: string;
  tag?: string;
}

export function RightRailArticles({ excludeLink, tag }: Props) {
  const qs = new URLSearchParams();
  qs.set("limit", "8");
  if (tag) qs.set("tag", tag);
  const { data } = useSWR<NewsResponse>(
    `${API_BASE}/news?${qs.toString()}`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const items = (data?.items || [])
    .filter((n) => n.link !== excludeLink)
    .slice(0, 5);

  return (
    <aside
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="px-4 py-2.5 border-b text-[10px] uppercase tracking-[0.18em] font-bold text-mute font-mono"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        Featured articles
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {items.map((n) => (
          <li key={n.id}>
            <Link
              href={`/article?u=${encodeURIComponent(n.link)}&c=${encodeURIComponent(n.label)}`}
              className="block px-4 py-3 hover:bg-[var(--accent-soft)] transition group"
            >
              <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-1">
                {n.category}
              </div>
              <div className="text-[13px] font-bold leading-snug line-clamp-3 group-hover:text-accent transition">
                {n.title}
              </div>
              <div className="text-[11px] text-mute mt-1">
                {n.source} · {formatRelative(n.pubDate)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

"use client";
import useSWR from "swr";
import { ArrowBigUp, ExternalLink, MessageCircle, MessagesSquare } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";

interface DiscussionPost {
  id: string;
  source: string;
  subreddit: string;
  author: string;
  title: string;
  excerpt: string;
  url: string;
  upvotes: number;
  comments: number;
  createdAt: string;
}
interface DiscussionsResponse {
  enabled: boolean;
  ticker: string;
  posts: DiscussionPost[];
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Conversations tab — community posts mentioning the ticker (Reddit's major
 * finance subreddits via the free Reddit API). X/Twitter needs a paid API, so
 * Reddit is the launch source; the backend reports enabled:false until
 * REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET are configured.
 */
export function ConversationsSection({ ticker }: { ticker: string }) {
  const sym = ticker.toUpperCase();
  const { data, isLoading } = useSWR<DiscussionsResponse>(
    `${API_BASE}/social/discussions/${encodeURIComponent(sym)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );

  if (isLoading) {
    return <div className="text-center text-mute py-12">Loading conversations…</div>;
  }

  if (!data?.enabled) {
    return (
      <div
        className="rounded-lg p-8 text-center"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <div
          className="mx-auto mb-3 h-11 w-11 rounded-xl flex items-center justify-center"
          style={{ background: "var(--accent-soft)" }}
        >
          <MessagesSquare className="h-5 w-5 text-accent" />
        </div>
        <div className="font-bold text-[15px] mb-1">Conversations are coming soon</div>
        <p className="text-[13px] text-mute max-w-md mx-auto leading-relaxed">
          Community discussion mentioning {sym} from investor forums will appear
          here — tracked automatically and refreshed throughout the day.
        </p>
      </div>
    );
  }

  if (!data.posts.length) {
    return (
      <div
        className="rounded-lg p-8 text-center text-mute text-[14px]"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        No recent community posts mentioning {sym}.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-mute leading-relaxed">
        Recent community posts mentioning <span className="font-mono font-bold">{sym}</span>{" "}
        across major investing forums. Community opinions are not investment advice.
      </p>
      {data.posts.map((p) => (
        <a
          key={p.id}
          href={p.url}
          target="_blank"
          rel="noreferrer nofollow"
          className="block rounded-lg p-4 transition hover:border-[var(--accent)]"
          style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2 mb-1.5 text-[11.5px]">
            <span
              className="px-1.5 py-0.5 rounded font-bold"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              r/{p.subreddit}
            </span>
            <span className="text-mute">u/{p.author}</span>
            <span className="text-faint">·</span>
            <span className="text-mute">{timeAgo(p.createdAt)}</span>
            <ExternalLink className="h-3 w-3 text-faint ml-auto flex-shrink-0" />
          </div>
          <div className="font-semibold text-[14.5px] leading-snug">{p.title}</div>
          {p.excerpt && (
            <p className="text-[13px] text-soft mt-1 leading-relaxed line-clamp-2">
              {p.excerpt}
            </p>
          )}
          <div className="flex items-center gap-4 mt-2 text-[12px] text-mute font-semibold">
            <span className="inline-flex items-center gap-1">
              <ArrowBigUp className="h-3.5 w-3.5" /> {p.upvotes.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" /> {p.comments.toLocaleString()} comments
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}

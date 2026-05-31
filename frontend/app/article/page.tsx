"use client";
import { Suspense } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { API_BASE, ExtractedArticle, NewsResponse, fetcher, formatDate } from "@/lib/api";
import { MostActiveStocks } from "@/components/home/MostActiveStocks";
import { GetInsightsCard } from "@/components/home/GetInsightsCard";
import { TrendingHeadlines } from "@/components/home/TrendingHeadlines";
import { RightSidebar } from "@/components/home/RightSidebar";
import { PopularTopics } from "@/components/home/PopularTopics";

function ArticleReader() {
  const params = useSearchParams();
  const u = params.get("u") || "";
  const cat = params.get("c") || "Press release";

  const { data, error, isLoading } = useSWR<ExtractedArticle>(
    u ? `${API_BASE}/news/article?u=${encodeURIComponent(u)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const { data: newsList } = useSWR<NewsResponse>(
    `${API_BASE}/news?limit=12`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 1000 },
  );
  const headlines = (newsList?.items || []).filter((n) => n.link !== u).slice(0, 10);

  const imgQs = u
    ? new URLSearchParams({
        u,
        category: cat || "Regulatory",
        seed: u,
        title: data?.title?.slice(0, 120) || "",
      }).toString()
    : "";
  const { data: img } = useSWR<{ image: string | null }>(
    u && data ? `${API_BASE}/news/image?${imgQs}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 24 * 60 * 60 * 1000 },
  );

  if (!u) {
    return (
      <div className="card p-10 text-center max-w-2xl mx-auto">
        <FileText className="h-8 w-8 text-faint mx-auto mb-3" />
        <div className="font-semibold mb-1">No article specified</div>
        <Link href="/news" className="btn-secondary mt-4 inline-flex">
          <ArrowLeft className="h-4 w-4" />
          Browse news
        </Link>
      </div>
    );
  }

  const articleBody = (
    <>
      <Link
        href="/news"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to news
      </Link>

      {isLoading || !data ? (
        error ? (
          <div className="card p-10 text-center text-mute">
            <FileText className="h-8 w-8 text-faint mx-auto mb-3" />
            <div className="font-semibold mb-1">Couldn't load this article</div>
            <div className="text-sm">
              {(error as Error)?.message || "Try the source directly."}
            </div>
            <a
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary mt-5 inline-flex"
            >
              <ExternalLink className="h-4 w-4" />
              Open source
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-4 w-32 shimmer rounded" />
            <div className="h-9 w-full shimmer rounded" />
            <div className="h-9 w-3/4 shimmer rounded" />
            <div className="h-4 w-48 shimmer rounded mt-4" />
            <div className="space-y-3 mt-6">
              <div className="h-3 w-full shimmer rounded" />
              <div className="h-3 w-[95%] shimmer rounded" />
              <div className="h-3 w-[90%] shimmer rounded" />
              <div className="h-3 w-full shimmer rounded" />
              <div className="h-3 w-[85%] shimmer rounded" />
            </div>
          </div>
        )
      ) : (
        <motion.article
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-2 text-mute text-xs mb-3 flex-wrap">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {cat}
            </span>
            <span className="font-semibold text-soft">{data.source}</span>
            {data.publishedAt && (
              <>
                <span className="text-faint">·</span>
                <span>{formatDate(data.publishedAt)}</span>
              </>
            )}
          </div>

          <h1
            className="text-[26px] sm:text-[34px] font-bold tracking-tight leading-tight"
            style={{ letterSpacing: "-0.4px" }}
          >
            {data.title}
          </h1>

          {img?.image && (
            <div
              className="relative mt-5 rounded-lg overflow-hidden bg-[var(--bg-3)]"
              style={{ aspectRatio: "16 / 9" }}
            >
              <img
                src={img.image}
                alt=""
                loading="eager"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          )}

          {data.byline && <div className="text-sm text-mute mt-3">By {data.byline}</div>}

          <div className="h-px my-6" style={{ background: "var(--border)" }} />

          <div
            className="article-body text-[15px] leading-relaxed text-soft"
            dangerouslySetInnerHTML={{ __html: data.html }}
          />

          <div
            className="mt-10 pt-6 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="text-xs text-mute">
              Sourced from{" "}
              <span className="font-semibold text-soft">{data.source}</span> · public release
            </div>
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex"
            >
              <ExternalLink className="h-4 w-4" />
              View original
            </a>
          </div>
        </motion.article>
      )}
    </>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_280px] gap-6 lg:gap-8">
      {/* LEFT sidebar */}
      <aside className="order-2 lg:order-1 space-y-6">
        <MostActiveStocks />
        <GetInsightsCard />
        <TrendingHeadlines items={headlines} />
      </aside>

      {/* CENTER article */}
      <div className="order-1 lg:order-2 min-w-0">{articleBody}</div>

      {/* RIGHT sidebar */}
      <aside className="order-3 space-y-6">
        <RightSidebar />
        <PopularTopics />
      </aside>

      <style jsx global>{`
        .article-body p {
          margin: 0 0 1.1em;
        }
        .article-body h1,
        .article-body h2,
        .article-body h3 {
          font-weight: 700;
          color: var(--text);
          letter-spacing: -0.2px;
          margin: 1.6em 0 0.5em;
        }
        .article-body h2 {
          font-size: 22px;
        }
        .article-body h3 {
          font-size: 18px;
        }
        .article-body li {
          margin: 0.4em 0 0.4em 1.4em;
          list-style: disc;
        }
        .article-body blockquote {
          margin: 1.2em 0;
          padding: 0.6em 1em;
          border-left: 3px solid var(--accent);
          background: var(--accent-soft);
          border-radius: 0 8px 8px 0;
          color: var(--text);
        }
      `}</style>
    </div>
  );
}

export default function ArticlePage() {
  return (
    <Suspense fallback={<div className="card p-10 max-w-3xl mx-auto shimmer h-64" />}>
      <ArticleReader />
    </Suspense>
  );
}

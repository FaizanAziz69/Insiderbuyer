"use client";
import { Suspense } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, ExternalLink, FileText } from "lucide-react";
import { API_BASE, ExtractedArticle, fetcher, formatDate } from "@/lib/api";
import { RightSidebar } from "@/components/home/RightSidebar";
import { PopularTopics } from "@/components/home/PopularTopics";
import { KeyPoints } from "@/components/KeyPoints";
import { IqsCommentary } from "@/components/IqsCommentary";

function ArticleReader() {
  const params = useSearchParams();
  const u = params.get("u") || "";
  const cat = params.get("c") || "Press release";

  const { data, error, isLoading } = useSWR<ExtractedArticle>(
    u ? `${API_BASE}/news/article?u=${encodeURIComponent(u)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

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
          </div>

          <h1
            className="text-[32px] sm:text-[44px] lg:text-[48px] font-black tracking-tight"
            style={{ letterSpacing: "-0.8px", lineHeight: 1.08 }}
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

          {/* Date below the thumbnail, prominently sized */}
          {data.publishedAt && (
            <div
              className="mt-5 inline-flex items-center gap-2 text-[15px] sm:text-[17px] font-bold"
              style={{ color: "var(--text)", letterSpacing: "-0.2px" }}
            >
              <Calendar className="h-4 w-4 sm:h-[18px] sm:w-[18px] text-accent" />
              Published {formatDate(data.publishedAt)}
            </div>
          )}

          {data.byline && (
            <div className="text-[14px] text-mute mt-2 font-semibold">By {data.byline}</div>
          )}

          <KeyPoints />

          <div className="h-px my-2" style={{ background: "var(--border)" }} />

          <div
            className="article-body"
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

          <IqsCommentary />
        </motion.article>
      )}
    </>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 lg:gap-10 lg:-ml-8 xl:-ml-20 2xl:-ml-40">
      <article className="min-w-0 max-w-3xl pr-2 sm:pr-4">{articleBody}</article>

      <aside className="space-y-6">
        <RightSidebar />
        <PopularTopics />
      </aside>

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

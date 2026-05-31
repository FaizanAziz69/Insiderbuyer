"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Mic, Headphones } from "lucide-react";
import useSWR from "swr";
import { API_BASE, NewsResponse, fetcher } from "@/lib/api";
import { MostActiveStocks } from "@/components/home/MostActiveStocks";
import { GetInsightsCard } from "@/components/home/GetInsightsCard";
import { TrendingHeadlines } from "@/components/home/TrendingHeadlines";
import { RightSidebar } from "@/components/home/RightSidebar";
import { PopularTopics } from "@/components/home/PopularTopics";
import { UpcomingEvents } from "@/components/home/UpcomingEvents";
import { MATERIAL_MATTERS } from "@/components/home/FeaturedStory";

export default function MaterialMattersPage() {
  const { data: newsList } = useSWR<NewsResponse>(
    `${API_BASE}/news?limit=12`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 1000 },
  );
  const headlines = (newsList?.items || []).slice(0, 10);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_280px] gap-6 lg:gap-8">
      <aside className="order-2 lg:order-1 space-y-6">
        <MostActiveStocks />
        <GetInsightsCard />
        <TrendingHeadlines items={headlines} />
      </aside>

      <div className="order-1 lg:order-2 min-w-0">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition mb-5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>

        <motion.article
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-2 text-mute text-xs mb-3 flex-wrap">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <Mic className="h-3 w-3" />
              Podcast
            </span>
            <span className="font-semibold text-soft">SEC</span>
            <span className="text-faint">·</span>
            <span>Material Matters</span>
          </div>

          <h1
            className="text-[26px] sm:text-[34px] font-bold tracking-tight leading-tight"
            style={{ letterSpacing: "-0.4px" }}
          >
            {MATERIAL_MATTERS.title}
          </h1>

          <div
            className="relative mt-5 rounded-lg overflow-hidden bg-[var(--bg-3)]"
            style={{ aspectRatio: "16 / 9" }}
          >
            <img
              src={MATERIAL_MATTERS.image}
              alt=""
              loading="eager"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.0) 50%, rgba(0,0,0,0.45) 100%)",
              }}
            />
            <div className="absolute bottom-3 left-3 right-3 text-white">
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold"
                style={{ background: "rgba(0,0,0,0.55)" }}
              >
                <Headphones className="h-3 w-3" />
                SEC podcast series
              </div>
            </div>
          </div>

          <div className="h-px my-6" style={{ background: "var(--border)" }} />

          <div className="article-body text-[15px] leading-relaxed text-soft space-y-4">
            <p>
              The work at the U.S. Securities and Exchange Commission impacts
              everyday investors, business owners, and even entire economies.
              Yet for many, the SEC remains something of a mystery. In the
              SEC's new podcast,{" "}
              <span className="font-semibold text-[var(--text)]">
                Material Matters
              </span>
              , Chairman Paul Atkins hosts conversations with leading experts,
              breaking down the complexities of financial regulation and
              advancing a free-market agenda.
            </p>
            <p>
              Each episode unpacks a single topic that shapes how markets
              function — from disclosure rules and investor protection to
              capital formation, market structure, and the regulatory choices
              that quietly determine where capital goes and at what cost.
              Listeners hear directly from the people writing, defending, or
              challenging the rules, with the Chairman pressing for plain
              explanations rather than jargon.
            </p>
            <p>
              The series is part of a broader push at the Commission to make
              its work more legible to the public it serves. Recent guests
              have explored shareholder voting, the line between public and
              private markets, the role of passive index funds, and how the
              agency thinks about cost-benefit analysis when it writes new
              rules.
            </p>
            <p>
              New episodes are released on a rolling cadence and are
              referenced regularly in the Commission's public statements and
              committee meetings. Anyone interested in how U.S. capital
              markets are governed — and where they may be heading — will
              find Material Matters a useful primer from the people in the
              room.
            </p>
          </div>

          <div
            className="mt-10 pt-6 border-t text-xs text-mute"
            style={{ borderColor: "var(--border)" }}
          >
            Sourced from{" "}
            <span className="font-semibold text-soft">SEC</span> · public
            release
          </div>
        </motion.article>
      </div>

      <aside className="order-3 space-y-6">
        <RightSidebar />
        <PopularTopics />
        <UpcomingEvents />
      </aside>

      <style jsx global>{`
        .article-body p {
          margin: 0 0 1.1em;
        }
      `}</style>
    </div>
  );
}

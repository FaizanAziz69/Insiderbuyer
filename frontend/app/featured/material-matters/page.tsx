"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Mic, Headphones } from "lucide-react";
import { MATERIAL_MATTERS } from "@/components/home/FeaturedStory";
import { RightSidebar } from "@/components/home/RightSidebar";
import { PopularTopics } from "@/components/home/PopularTopics";
import { KeyPoints } from "@/components/KeyPoints";
import { IqsCommentary } from "@/components/IqsCommentary";

const PODCAST_POINTS = [
  {
    title: "Chairman-hosted explainers",
    body: "Each episode features SEC Chairman Paul Atkins in conversation with leading experts on a single regulatory topic.",
  },
  {
    title: "Free-market regulatory lens",
    body: "Conversations advance a free-market agenda — investor protection without unnecessary cost of capital.",
  },
  {
    title: "Plain language, no jargon",
    body: "Material Matters breaks down disclosure rules, market structure, and capital formation for everyday investors.",
  },
  {
    title: "Released on a rolling cadence",
    body: "New episodes drop regularly and are referenced in the Commission's public statements and committee work.",
  },
];

export default function MaterialMattersPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 lg:gap-10 lg:-ml-8 xl:-ml-20 2xl:-ml-40">
      <article className="min-w-0 max-w-3xl pr-2 sm:pr-4">
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
            className="text-[32px] sm:text-[44px] lg:text-[48px] font-black tracking-tight"
            style={{ letterSpacing: "-0.8px", lineHeight: 1.08 }}
          >
            {MATERIAL_MATTERS.title}
          </h1>

          <div
            className="relative mt-5 rounded-lg overflow-hidden bg-black"
            style={{ aspectRatio: "16 / 9" }}
          >
            <iframe
              src="https://www.youtube.com/embed/0fAlJxYADh0?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1"
              title="Material Matters With SEC Chairman Paul Atkins"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-mute">
            <Headphones className="h-3 w-3 text-accent" />
            SEC podcast series
          </div>

          <div
            className="mt-5 inline-flex items-center gap-2 text-[15px] sm:text-[17px] font-bold"
            style={{ color: "var(--text)", letterSpacing: "-0.2px" }}
          >
            <Calendar className="h-4 w-4 sm:h-[18px] sm:w-[18px] text-accent" />
            Published May 30, 2026
          </div>

          <KeyPoints points={PODCAST_POINTS} heading="Key points" />

          <div className="h-px my-2" style={{ background: "var(--border)" }} />

          <div className="article-body">
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

          <IqsCommentary />
        </motion.article>
      </article>

      <aside className="space-y-6">
        <RightSidebar />
        <PopularTopics />
      </aside>

    </div>
  );
}

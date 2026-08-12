"use client";
import Link from "next/link";
import { IqsTooltip } from "./IqsTooltip";

export function IqsCommentary() {
  return (
    <section
      className="mt-10 rounded-lg p-6"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <h2
        className="text-[18px] font-bold tracking-tight mb-3"
        style={{ letterSpacing: "-0.2px" }}
      >
        About the{" "}
        <IqsTooltip>
          <span className="text-accent">Insider Score</span>
        </IqsTooltip>
      </h2>
      <p className="text-[14px] text-soft leading-relaxed mb-3">
        <span className="font-semibold text-[var(--text)]">Insider Score</span> is a daily ranking signal
        built from SEC Form 4 open-market purchases. We score each company across four
        components — purchase volume, cluster effect (multiple insiders buying within a short
        window), role-weighted size (CEO/CFO/Director carry more weight), and holding-change
        magnitude — and combine them into a single number. Higher = stronger insider
        conviction.
      </p>
      <p className="text-[14px] text-soft leading-relaxed">
        The data is sourced directly from EDGAR within minutes of filing. No third-party
        aggregator, no opinion, no estimates — just the public record, structured and ranked.
        Read the full{" "}
        <Link href="/companies" className="text-accent font-semibold hover:underline">
          Insider Score rankings
        </Link>{" "}
        or learn how to{" "}
        <Link href="/premium" className="text-accent font-semibold hover:underline">
          unlock the top-5 picks
        </Link>
        .
      </p>
    </section>
  );
}

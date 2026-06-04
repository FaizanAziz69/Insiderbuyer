"use client";
import useSWR from "swr";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";

interface Pick {
  ticker: string;
  name: string;
}

interface Props {
  articleUrl?: string;
  fallbackText?: string;
}

export function ProgrammaticCta({ articleUrl }: Props) {
  const { data } = useSWR<{ pick: Pick | null }>(
    articleUrl
      ? `${API_BASE}/cta/from-article?u=${encodeURIComponent(articleUrl)}`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 24 * 60 * 60 * 1000 },
  );

  const pick = data?.pick || null;
  const subject = pick ? pick.name : "this stock";
  const ticker = pick ? pick.ticker : "TOP5";
  const headline = pick
    ? `Should You Invest $1,000 in ${pick.name} Right Now?`
    : "Should You Invest $1,000 in This Stock Right Now?";
  const href = `/reports/cta/${encodeURIComponent(ticker)}`;

  return (
    <aside className="my-10">
      <h3
        className="tracking-tight"
        style={{
          fontSize: "clamp(28px, 3.2vw, 34px)",
          lineHeight: 1.12,
          color: "var(--accent)",
          letterSpacing: "-0.5px",
          fontWeight: 800,
        }}
      >
        {headline}
      </h3>
      <div
        className="mt-4 mb-6"
        style={{ height: 1, background: "var(--border)" }}
      />

      <p
        style={{
          fontSize: 20,
          lineHeight: 1.65,
          color: "var(--text)",
          fontWeight: 600,
          marginBottom: "1.25em",
        }}
      >
        Before you consider {subject}, you&rsquo;ll want to hear this.
      </p>

      <p
        style={{
          fontSize: 20,
          lineHeight: 1.65,
          color: "var(--text)",
          fontWeight: 600,
          marginBottom: "1.25em",
        }}
      >
        Insider Buying keeps track of Wall Street&rsquo;s top-rated and best
        performing research analysts and the stocks they recommend to their
        clients on a daily basis. Insider Buying has identified the{" "}
        <Link
          href={href}
          style={{
            color: "var(--accent)",
            fontWeight: 800,
            textDecoration: "underline",
            textDecorationThickness: "2px",
            textUnderlineOffset: "3px",
          }}
        >
          five stocks
        </Link>{" "}
        that top analysts are quietly whispering to their clients to buy now
        before the broader market catches on
        {pick ? `… and ${pick.name} wasn't on the list.` : "."}
      </p>

      <p
        style={{
          fontSize: 20,
          lineHeight: 1.65,
          color: "var(--text)",
          fontWeight: 600,
          marginBottom: "1.5em",
        }}
      >
        {pick
          ? `While ${pick.name} currently has a Moderate Buy rating among analysts, top-rated analysts believe these five stocks are better buys.`
          : "Top-rated analysts believe these five stocks are the best buys right now."}
      </p>

      <Link
        href={href}
        className="inline-flex items-center gap-2 uppercase"
        style={{
          background: "var(--gold)",
          color: "#1a1a1a",
          padding: "14px 26px",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.08em",
          borderRadius: 2,
          boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
        }}
      >
        View the Five Stocks Here
        <ChevronRight className="h-5 w-5" strokeWidth={3} />
      </Link>
    </aside>
  );
}

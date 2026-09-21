"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { DataTable, Column } from "@/components/DataTable";
import { useDataAccess } from "@/lib/data-access";
import { RequestAccessGate } from "@/components/promoter/RequestAccessGate";
import { MaskedCell } from "@/components/premium/MaskedCell";
import { firmDecoyFor } from "@/components/premium/lockedDecoys";
import { PromoterEmailSignup } from "@/components/promoter/PromoterEmailSignup";

/**
 * Top IR Promoters — the paid dataset (George 2026-09-16): "the top performing
 * promoters hired by companies based on stock performance and trade volume
 * growth post engagement".
 *
 * One row per IR / promotional firm from the Policy 3.4 disclosures, ranked
 * by a Promoter Performance score: the average percentile rank of the firm's
 * median post-engagement client return and median client volume growth. The
 * campaign count travels with every row because most firms on this list have
 * one or two priced campaigns, and a reader should see that before reading
 * anything into the ranking.
 *
 * Paygate: the first rows render with the metrics visible and the firm
 * identity replaced by a fixed decoy (never the real name, not even blurred —
 * a CSS blur leaves text in the DOM). The rest sits behind the shared wall.
 */
interface Firm {
  rank: number;
  slug: string;
  name: string;
  website: string | null;
  country: string | null;
  campaigns: number;
  issuers: number;
  pricedCampaigns: number;
  priced90: number;
  postReturn: number | null;
  postReturnWindow: "90d" | "since-start";
  medianReturn90d: number | null;
  medianReturnSinceStart: number | null;
  winRate90d: number | null;
  volumeCampaigns: number;
  medianVolumeGrowth: number | null;
  firstStart: string | null;
  latestStart: string | null;
  monthlyBookCad: number | null;
  tickers: string[];
  score: number | null;
}

interface Payload {
  asOf: string;
  minCampaigns: number;
  total: number;
  weights: { postReturn: number; volumeGrowth: number };
  firms: Firm[];
}

const LOCKED_ROWS = 8;

function pct(v: number | null, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${(v * 100).toFixed(digits)}%`;
}

function signColor(v: number | null): string {
  if (v == null) return "var(--text-mute)";
  return v > 0 ? "var(--good)" : v < 0 ? "var(--bad)" : "var(--text-mute)";
}

function monthYear(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-faint text-[12px]">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular font-extrabold text-[14px]" style={{ color: "var(--text)" }}>
        {score}
      </span>
      <span
        className="block h-1.5 w-[64px] rounded-full overflow-hidden"
        style={{ background: "var(--bg-3)" }}
        aria-hidden
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(3, Math.min(100, score))}%`,
            background: score >= 66 ? "var(--good)" : score >= 33 ? "var(--accent)" : "var(--bad)",
          }}
        />
      </span>
    </span>
  );
}

export default function TopIrPromotersPage() {
  // George 2026-09-21: sold on request, not by subscription — see
  // lib/data-access.ts.
  const { granted, checking } = useDataAccess("top-ir-promoters");
  const locked = !granted;
  const [minCampaigns, setMinCampaigns] = useState<1 | 2 | 3>(1);
  const [q, setQ] = useState("");

  const key = `${API_BASE}/promoter/top-promoters?limit=200&minCampaigns=${minCampaigns}`;
  const { data, isLoading } = useSWR<Payload>(key, fetcher, { revalidateOnFocus: false });

  const firms = useMemo(() => {
    const all = data?.firms || [];
    // Search only works unlocked: matching a hidden name would confirm it.
    if (locked || !q) return all;
    const needle = q.toLowerCase();
    return all.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        f.tickers.some((t) => t.toLowerCase().includes(needle)),
    );
  }, [data, q, locked]);

  const columns: Column<Firm>[] = [
    {
      key: "rank",
      label: "#",
      align: "center",
      sortValue: (f) => f.rank,
      render: (f) => (
        <span className="tabular text-[13px] font-bold" style={{ color: "var(--text-soft)" }}>
          {f.rank}
        </span>
      ),
    },
    {
      key: "name",
      label: "IR firm",
      sortable: !locked,
      sortValue: (f) => f.name,
      render: (f) => {
        if (locked) {
          const [dName, dCountry] = firmDecoyFor(f.rank - 1);
          return (
            <MaskedCell label="the IR firms" lock href="#request-access">
              <span className="block font-bold text-[13.5px] leading-tight" style={{ color: "var(--text)" }}>
                {dName}
              </span>
              <span className="block text-[11px] text-mute leading-tight">{dCountry}</span>
            </MaskedCell>
          );
        }
        return (
          <span className="block min-w-0">
            <span className="block font-bold text-[13.5px] leading-tight" style={{ color: "var(--text)" }}>
              {f.name}
              {f.country ? <span className="ml-1.5 text-[10.5px] font-semibold text-faint">{f.country}</span> : null}
            </span>
            {f.website ? (
              <a
                href={f.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="block text-[11px] text-accent leading-tight truncate max-w-[220px] hover:underline"
              >
                {f.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "campaigns",
      label: "Campaigns",
      align: "center",
      info: "Disclosed IR or promotional agreements attributed to this firm, and how many of them have a priced client (our price data covers roughly half of venture listings). Rankings built on one or two campaigns are thin — read the count first.",
      sortValue: (f) => f.campaigns,
      render: (f) => (
        <span className="inline-block text-center">
          <span className="block tabular text-[13.5px] font-bold" style={{ color: "var(--text)" }}>
            {f.campaigns}
          </span>
          <span className="block text-[10.5px] leading-tight text-faint">
            {f.pricedCampaigns} priced · {f.issuers} {f.issuers === 1 ? "issuer" : "issuers"}
          </span>
        </span>
      ),
    },
    {
      key: "tickers",
      label: "Clients",
      sortable: false,
      render: (f) => {
        if (locked) {
          return (
            <MaskedCell label="client tickers">
              <span className="text-[12px] font-semibold tabular" style={{ color: "var(--text-soft)" }}>
                ABCD · EFGH · IJKL
              </span>
            </MaskedCell>
          );
        }
        const shown = f.tickers.slice(0, 4);
        return (
          <span className="text-[12px] font-semibold tabular leading-tight" style={{ color: "var(--text-soft)" }}>
            {shown.map((t, i) => (
              <span key={t}>
                {i > 0 ? " · " : ""}
                <Link href={`/promoter-score/${t}`} className="hover:text-accent">
                  {t}
                </Link>
              </span>
            ))}
            {f.tickers.length > shown.length ? (
              <span className="text-faint"> +{f.tickers.length - shown.length}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "postReturn",
      label: "Client return",
      align: "right",
      info: "Median change in the client's share price from the first session on or after the contract start date to 90 days later. Where no campaign has a full 90 days behind it yet, the since-start figure is used and labelled. It measures what happened after the engagement; it does not claim the promotion caused it.",
      sortValue: (f) => f.postReturn ?? -Infinity,
      render: (f) => (
        <span className="inline-block text-right">
          <span className="block tabular text-[13.5px] font-bold" style={{ color: signColor(f.postReturn) }}>
            {pct(f.postReturn)}
          </span>
          <span className="block text-[10.5px] leading-tight text-faint">
            {f.postReturnWindow === "90d" ? "median, 90 days" : "median, since start"}
          </span>
        </span>
      ),
    },
    {
      key: "winRate90d",
      label: "Win rate",
      align: "right",
      info: "Share of priced campaigns where the client's stock was higher 90 days after the contract began.",
      sortValue: (f) => f.winRate90d ?? -1,
      render: (f) => (
        <span className="tabular text-[13px] font-semibold" style={{ color: "var(--text-soft)" }}>
          {f.winRate90d == null ? "—" : `${Math.round(f.winRate90d * 100)}%`}
          {f.winRate90d != null ? (
            <span className="ml-1 text-[10.5px] text-faint">of {f.priced90}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "medianVolumeGrowth",
      label: "Volume growth",
      align: "right",
      info: "Median change in the client's average daily trading volume: the 90 days after the contract start (30 days where 90 have not elapsed) against the 30 sessions before it.",
      sortValue: (f) => f.medianVolumeGrowth ?? -Infinity,
      render: (f) => (
        <span className="inline-block text-right">
          <span className="block tabular text-[13.5px] font-bold" style={{ color: signColor(f.medianVolumeGrowth) }}>
            {pct(f.medianVolumeGrowth)}
          </span>
          {f.medianVolumeGrowth != null ? (
            <span className="block text-[10.5px] leading-tight text-faint">median, {f.volumeCampaigns} priced</span>
          ) : (
            <span className="block text-[10.5px] leading-tight text-faint">no volume data</span>
          )}
        </span>
      ),
    },
    {
      key: "score",
      label: "Promoter Performance",
      align: "right",
      pro: true,
      info: "0–100. The average percentile rank on this list of the firm's median client return (60%) and median client volume growth (40%). A relative standing among ranked firms, not a return.",
      sortValue: (f) => f.score ?? -1,
      render: (f) => <ScoreBar score={f.score} />,
    },
    {
      key: "latestStart",
      label: "Latest campaign",
      align: "right",
      sortValue: (f) => (f.latestStart ? Date.parse(f.latestStart) : -Infinity),
      render: (f) => (
        <span className="tabular text-[12.5px]" style={{ color: "var(--text-soft)" }}>
          {monthYear(f.latestStart)}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-6">
      <header className="mb-5">
        <div className="flex items-center gap-2.5 mb-2">
          <Megaphone size={20} style={{ color: "var(--accent)" }} />
          <h1 className="text-[26px] font-extrabold leading-none" style={{ color: "var(--text)" }}>
            Top IR Promoters
          </h1>
        </div>
        <p className="text-[13.5px] leading-relaxed max-w-[780px]" style={{ color: "var(--text-soft)" }}>
          The investor-relations and promotional firms Canadian venture issuers hire, ranked by what their clients&apos;
          shares did after each engagement began: the median post-engagement return and the median growth in daily
          trading volume, taken from the TSX Venture Policy 3.4 and CSE disclosures behind our{" "}
          <Link href="/promoter-score" className="text-accent font-semibold hover:underline">
            Promoter Score
          </Link>
          .{" "}
          <span style={{ color: "var(--text-mute)" }}>
            Every firm here was disclosed by an issuer as a paid provider. The figures describe what followed the
            engagement, not what caused it, and most firms carry only a handful of priced campaigns — the count is in
            every row.
          </span>
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 mt-5 mb-3">
        <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              onClick={() => setMinCampaigns(n)}
              className="text-[12px] font-semibold px-2.5 py-1.5"
              style={{
                background: minCampaigns === n ? "var(--accent)" : "var(--bg-elevated)",
                color: minCampaigns === n ? "#fff" : "var(--text-soft)",
              }}
            >
              {n === 1 ? "All firms" : `${n}+ campaigns`}
            </button>
          ))}
        </div>
        {!locked ? (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search firm or client ticker"
            className="text-[12.5px] rounded-md px-2.5 py-1.5 flex-1 min-w-[180px]"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        ) : null}
        {data ? (
          <span className="text-[11.5px] text-faint ml-auto">
            {data.total} firms ranked · {data.firms.reduce((a, f) => a + f.pricedCampaigns, 0)} priced campaigns
          </span>
        ) : null}
      </div>

      <DataTable
        rows={firms}
        columns={columns}
        rowKey={(f) => f.slug}
        initialSort={{ key: "score", dir: "desc" }}
        pageSize={50}
        gate={{
          label: "Top IR Promoters",
          freeRows: LOCKED_ROWS,
          teaser: true,
          bullets: [],
          // Not a subscription product: the page owns the lock.
          locked,
          ctaHref: "#request-access",
          ctaLabel: "Request access",
        }}
        empty={isLoading ? "Ranking IR firms by client results…" : "No firms with priced campaigns yet."}
      />

      {locked && !checking && (
        <RequestAccessGate
          dataset="top-ir-promoters"
          title="The Top IR Promoters dataset is available on request"
          bullets={[
            "Every IR and promotional firm named in Policy 3.4 disclosures, ranked by client results",
            "Median client return and volume growth after each engagement, with campaign counts",
            "The issuers behind every campaign, the fees disclosed, and the dollars traded since",
          ]}
        />
      )}

      <PromoterEmailSignup source="top-ir-promoters" />

      <section
        className="mt-6 rounded-lg p-4"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-[15px] font-bold mb-1.5" style={{ color: "var(--text)" }}>
          How the ranking is built
        </h2>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-soft)" }}>
          For every disclosed agreement we take the client&apos;s first close on or after the contract start date and
          measure the change to 90 days later, and the average daily volume in the 90 days after the start against the
          30 sessions before it. A firm&apos;s figures are the medians across its priced campaigns. The Promoter
          Performance score averages the firm&apos;s percentile rank on the two, weighted 60/40 toward return; a firm
          with no client volume baseline is ranked on return alone. Listings our price data does not cover are counted
          as campaigns but not as priced ones.
        </p>
      </section>
    </div>
  );
}

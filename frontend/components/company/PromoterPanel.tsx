"use client";
import useSWR from "swr";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { SpendSparkline } from "@/components/promoter/SpendSparkline";
import { PromoterScoreCell } from "@/components/promoter/PromoterScoreCell";

/**
 * Workstream F §2.5 — "Per-issuer module on existing stock report pages:
 * current IR contracts, spend history sparkline, score."
 *
 * Renders NOTHING when the issuer has no disclosed agreements, which is the
 * overwhelming majority of the stock pages on this site: the dataset is
 * TSXV/CSE only (§2.2), so a US company page must not grow an empty panel
 * announcing an absence that means nothing.
 */
export function PromoterPanel({ ticker }: { ticker: string }) {
  const { data } = useSWR<{
    ticker: string;
    current: { quarter: string; spend: number; score: number | null } | null;
    history: Array<{ quarter: string; spend: number; score: number | null; active_contracts: number }>;
    contracts: Array<{
      id: number;
      providerName: string | null;
      monthlyFee: number | null;
      currency: string | null;
      termMonths: number | null;
      startDate: string | null;
      status: string;
      source: { url: string };
    }>;
  }>(`${API_BASE}/promoter/issuer/${ticker}`, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  if (!data?.contracts?.length) return null;
  const active = data.contracts.filter((c) => c.status === "active");

  return (
    <section className="rounded-lg p-4" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <h2 className="flex items-center gap-2 text-[15px] font-bold m-0" style={{ color: "var(--text)" }}>
          <Megaphone size={16} style={{ color: "var(--accent)" }} />
          Investor relations spend
        </h2>
        {data.current ? <PromoterScoreCell score={data.current.score} /> : null}
      </div>

      <p className="text-[12.5px] leading-relaxed mb-3" style={{ color: "var(--text-soft)" }}>
        This issuer has disclosed {data.contracts.length} investor-relations or promotional{" "}
        {data.contracts.length === 1 ? "agreement" : "agreements"}
        {active.length ? `, ${active.length} of them currently running` : ""}. Canadian venture issuers must announce
        these by news release.
      </p>

      <SpendSparkline history={data.history} />

      <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-1.5">
        {(active.length ? active : data.contracts).slice(0, 4).map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="truncate font-semibold" style={{ color: "var(--text)" }}>
              {c.providerName || "Provider not stated"}
            </span>
            <span className="tabular whitespace-nowrap" style={{ color: "var(--text-soft)" }}>
              {c.monthlyFee != null
                ? `${c.currency === "USD" ? "US$" : "C$"}${c.monthlyFee.toLocaleString()}/mo`
                : "fee not stated"}
              {c.termMonths ? ` · ${c.termMonths}m` : ""}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={`/promoter-score/${ticker}`}
        className="inline-block mt-3 text-[12.5px] font-semibold text-accent hover:underline"
      >
        Full IR contract history →
      </Link>
    </section>
  );
}

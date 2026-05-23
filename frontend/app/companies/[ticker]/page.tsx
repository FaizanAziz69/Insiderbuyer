"use client";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowLeft, Building2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { IqsBadge } from "@/components/IqsBadge";
import { Reveal } from "@/components/Reveal";
import { API_BASE, CompanyDetail, fetcher, formatCurrency, scoreTier } from "@/lib/api";

const FactorBreakdown = dynamic(
  () => import("@/components/FactorBreakdown").then((m) => m.FactorBreakdown),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl h-28 shimmer" />
        ))}
      </div>
    ),
  },
);

const TransactionList = dynamic(
  () => import("@/components/TransactionList").then((m) => m.TransactionList),
  {
    ssr: false,
    loading: () => <div className="glass rounded-2xl h-64 shimmer" />,
  },
);

export default function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const { data, isLoading } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  return (
    <main className="min-h-screen flex flex-col">
      <Header />

      <section className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 flex-1">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-[var(--brand-1)] transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to rankings
        </Link>

        {isLoading || !data ? (
          <div className="mt-6 glass rounded-2xl p-10 shimmer h-40" />
        ) : !data.company ? (
          <div className="mt-6 glass rounded-2xl p-10 text-center text-mute">
            Company not found.
          </div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 hud-corner glass rounded-3xl p-5 sm:p-7 relative overflow-hidden"
            >
              <div
                aria-hidden
                className="absolute -top-20 -right-20 h-64 w-64 rounded-full blur-3xl opacity-40"
                style={{
                  background: "radial-gradient(circle, var(--brand-1), transparent 70%)",
                }}
              />
              <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6">
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16">
                    <div className="absolute inset-0 rounded-2xl brand-gradient opacity-90" />
                    <div
                      className="absolute inset-[2px] rounded-[14px] flex items-center justify-center"
                      style={{ background: "var(--logo-core)" }}
                    >
                      <Building2 className="h-7 w-7 text-[var(--brand-1)]" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-mute font-mono">
                      {data.company.ticker || data.company.cik}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
                      {data.company.name}
                    </h1>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-mute">
                      {data.company.sector && (
                        <span
                          className="px-2 py-0.5 rounded-full border"
                          style={{
                            background: "var(--surface)",
                            borderColor: "var(--border)",
                          }}
                        >
                          {data.company.sector}
                        </span>
                      )}
                      {data.company.marketCap !== null && (
                        <span>Mkt cap {formatCurrency(data.company.marketCap)}</span>
                      )}
                      {data.company.lastPrice !== null && (
                        <span>Last ${data.company.lastPrice.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {data.score && (
                  <div className="sm:ml-auto flex items-center gap-4">
                    <IqsBadge iqs={data.score.iqs} size="lg" />
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-mute font-mono">
                        IQS · {scoreTier(Number(data.score.iqs) || 0).label}
                      </div>
                      <div className="text-xs text-soft mt-1">
                        {data.score.distinctBuyers} insider
                        {data.score.distinctBuyers === 1 ? "" : "s"} ·{" "}
                        {data.score.transactionCount} transaction
                        {data.score.transactionCount === 1 ? "" : "s"}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--brand-3)" }}>
                        {formatCurrency(Number(data.score.totalPurchaseValue) || 0)} bought
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {data.score && (
              <Reveal direction="blur" amount={0.2} delay={0.05} className="mt-8">
                <div className="text-[10px] uppercase tracking-[0.22em] text-mute font-mono mb-3">
                  IQS factor breakdown
                </div>
                <FactorBreakdown
                  purchaseVolumeFactor={data.score.purchaseVolumeFactor}
                  clusterFactor={data.score.clusterFactor}
                  roleWeightedVolume={data.score.roleWeightedVolume}
                  holdingChangeFactor={data.score.holdingChangeFactor}
                />
              </Reveal>
            )}

            <Reveal direction="up" amount={0.15} className="mt-10">
              <div className="text-[10px] uppercase tracking-[0.22em] text-mute font-mono mb-3">
                Insider transactions (last 90 days)
              </div>
              <TransactionList transactions={data.transactions} />
            </Reveal>
          </>
        )}
      </section>

      <Footer />
    </main>
  );
}

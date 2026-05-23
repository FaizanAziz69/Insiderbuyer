"use client";
import useSWR from "swr";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { RankingTable } from "@/components/RankingTable";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/Reveal";
import { API_BASE, RankingsResponse, fetcher } from "@/lib/api";

export default function Page() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=200`,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );

  const csvHref = `${API_BASE}/rankings.csv`;
  const today = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <Hero asOfDate={today} csvHref={csvHref} />

      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 mt-2 sm:mt-4 flex-1">
        <Reveal direction="blur" amount={0.05}>
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-mute font-mono">
                Live ranking
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mt-1">
                Companies by IQS
              </h2>
            </div>
            {data && (
              <div className="text-[11px] text-mute font-mono">
                {data.rows.length} of {data.total} ranked
              </div>
            )}
          </div>
        </Reveal>

        <Reveal direction="up" amount={0.05}>
          <RankingTable rows={data?.rows || []} loading={isLoading} />
        </Reveal>
      </section>

      <Footer />
    </main>
  );
}

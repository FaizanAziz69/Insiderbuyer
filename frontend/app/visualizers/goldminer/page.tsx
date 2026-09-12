import { Suspense } from "react";
import Link from "next/link";
import PageClient from "./PageClient";
import { SeoTable } from "@/components/visualizers/SeoTable";

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";

interface Project {
  id: string;
  name: string;
  company: string;
  ticker: string | null;
  country: string;
  stage: string;
  ozMeasuredIndicated: number | null;
  assetValueUsd: number;
}

const usd = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(0)}M`);

export default async function Page() {
  let rows: Project[] = [];
  try {
    const res = await fetch(`${BACKEND}/api/visualizers/mining`, { next: { revalidate: 1800 } });
    if (res.ok) {
      rows = ((await res.json()) as { projects?: Project[] }).projects?.slice(0, 25) ?? [];
    }
  } catch {
    /* the table simply does not render */
  }

  return (
    <>
      <Suspense fallback={<div style={{ minHeight: "70vh", background: "var(--bg-1)" }} />}>
        <PageClient />
      </Suspense>
      <SeoTable
        title="Largest gold projects on the map"
        intro="Ranked by asset value. Ounces are proven and probable reserves as reported by the operator."
        columns={["Project", "Operator", "Country", "Stage", "Reserves (Moz)", "Asset value"]}
        rows={rows.map((p) => ({
          href: `/visualizers/goldminer?m=${encodeURIComponent(p.id)}`,
          cells: [
            p.name,
            p.ticker ?? p.company,
            p.country,
            p.stage,
            p.ozMeasuredIndicated ? (p.ozMeasuredIndicated / 1e6).toFixed(2) : "—",
            usd(p.assetValueUsd),
          ],
        }))}
        note={
          <>
            Every figure carries the operator&rsquo;s own disclosure and an as-of date on its
            panel.{" "}
            <Link href="/methodology#goldminer" style={{ color: "var(--accent)" }}>
              How asset value is calculated
            </Link>
            .
          </>
        }
      />
    </>
  );
}

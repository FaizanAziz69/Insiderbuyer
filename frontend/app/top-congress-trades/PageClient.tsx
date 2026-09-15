"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ExternalLink, FileText, Landmark } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { DataTable, Column } from "@/components/DataTable";
import { CtsScoreCell } from "@/components/congress-trades/CtsScoreCell";
import { EvidenceChain } from "@/components/congress-trades/EvidenceChain";

/**
 * Top Ranking Congress Trades — Brief v5 §4, the flagship page.
 *
 * "the leaderboard of top-ranking congress trades, ordered by CTS — member,
 * company, agency, award, score — with filters by chamber/party/agency/
 * committee, each row expanding to the full evidence chain."
 *
 * Everything on this page is bound by §5, and the two rules that shape the
 * markup are these: the standing frame is rendered ABOVE the table, not below
 * it — "Correlation-not-causation stated plainly, not buried" — and every row
 * carries a visible way to report an error, because §5 calls fast documented
 * corrections "the defamation defense that matters".
 *
 * The API serves only rows the Stage 5 agent has verified, so there is no
 * client-side filtering to get that wrong.
 */

interface Row {
  id: number;
  member: string;
  party: string | null;
  chamber: string | null;
  ticker: string;
  company: string | null;
  agency: string;
  awardValue: number;
  awardDate: string | null;
  tradeDate: string | null;
  tradeAction: string | null;
  tradeValue: number | null;
  committee: string;
  role: string;
  score: number | null;
  components: Record<string, number | null>;
  headline: string;
  evidence: any;
}

interface Payload {
  rows: Row[];
  frame: string;
  amountNote: string;
  weights: Record<string, number>;
}

function money(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

/** §5: "Every date shown distinguishes transaction date vs. disclosure date". */
function day(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? String(v).slice(0, 10)
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function TopCongressTradesPage() {
  const [chamber, setChamber] = useState("");
  const [party, setParty] = useState("");
  const [agency, setAgency] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const key =
    `${API_BASE}/congress-trades/leaderboard?limit=250` +
    (chamber ? `&chamber=${encodeURIComponent(chamber)}` : "") +
    (party ? `&party=${encodeURIComponent(party)}` : "") +
    (agency ? `&agency=${encodeURIComponent(agency)}` : "");
  const { data, isLoading } = useSWR<Payload>(key, fetcher, { revalidateOnFocus: false });

  const rows = useMemo(
    () =>
      (data?.rows || []).filter(
        (r) =>
          !q ||
          r.member.toLowerCase().includes(q.toLowerCase()) ||
          r.ticker.toLowerCase().includes(q.toLowerCase()) ||
          (r.company || "").toLowerCase().includes(q.toLowerCase()) ||
          r.agency.toLowerCase().includes(q.toLowerCase()),
      ),
    [data, q],
  );

  const agencies = useMemo(
    () => [...new Set((data?.rows || []).map((r) => r.agency))].sort(),
    [data],
  );

  const columns: Column<Row>[] = [
    {
      key: "member",
      label: "Member",
      sortValue: (r) => r.member,
      render: (r) => (
        <span className="block min-w-0">
          <span className="block font-bold text-[13.5px] leading-tight" style={{ color: "var(--text)" }}>
            {r.member}
          </span>
          <span className="block text-[11.5px] text-mute leading-tight truncate max-w-[220px]">
            {r.committee}
            {r.role !== "member" ? ` · ${r.role === "ranking" ? "Ranking member" : r.role === "viceChair" ? "Vice chair" : "Chair"}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "score",
      label: "CTS",
      align: "center",
      info: "The Congress Trade Score, 0–100. It blends the member's committee role, how close the trade sits to the award date, the size of the position against that member's usual trade, and how material the contract is to the company. It measures the proximity of public records. It is not a probability of wrongdoing and makes no allegation.",
      sortValue: (r) => r.score ?? null,
      render: (r) => <CtsScoreCell score={r.score} components={r.components} weights={data?.weights} />,
    },
    {
      key: "ticker",
      label: "Company",
      sortValue: (r) => r.ticker,
      render: (r) => (
        <Link href={`/companies/${r.ticker}`} className="group block min-w-0">
          <span className="block font-bold text-[13px] leading-tight group-hover:text-accent" style={{ color: "var(--text)" }}>
            {r.ticker}
          </span>
          <span className="block text-[11.5px] text-mute leading-tight truncate max-w-[170px]">{r.company || "—"}</span>
        </Link>
      ),
    },
    {
      key: "agency",
      label: "Awarding agency",
      sortValue: (r) => r.agency,
      render: (r) => <span className="text-[12.5px] text-soft truncate inline-block max-w-[190px]">{r.agency}</span>,
    },
    {
      key: "awardValue",
      label: "Award",
      align: "right",
      info: "Total obligated value of the federal contract award, from USAspending.gov.",
      sortValue: (r) => r.awardValue ?? 0,
      render: (r) => (
        <span className="block text-right">
          <span className="tabular font-bold text-[13.5px]" style={{ color: "var(--text)" }}>
            {money(r.awardValue)}
          </span>
          <span className="block text-[11px] text-mute">{day(r.awardDate)}</span>
        </span>
      ),
    },
    {
      key: "tradeDate",
      label: "Disclosed trade",
      align: "right",
      info: "The member's disclosed transaction. Amounts are estimates: disclosures report a range and the figure shown is its midpoint. Periodic transaction reports are filed with a lag of up to 45 days.",
      sortValue: (r) => (r.tradeDate ? Date.parse(r.tradeDate) : 0),
      render: (r) => (
        <span className="block text-right">
          <span className="tabular text-[13px]" style={{ color: "var(--text)" }}>
            {r.tradeAction || "Holding"} {r.tradeValue ? `· ~${money(r.tradeValue)}` : ""}
          </span>
          <span className="block text-[11px] text-mute">{day(r.tradeDate)}</span>
        </span>
      ),
    },
    {
      key: "evidence",
      label: "Sources",
      align: "center",
      sortable: false,
      render: (r) => {
        // The filing opens straight from the row, the way a Form 4 does
        // everywhere else on the site — a reader who wants the document should
        // not have to open a panel first to find the way to it.
        const filing = r.evidence?.trade?.url || r.evidence?.boardSeat?.url || null;
        return (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            {filing ? (
              <a
                href={filing}
                target="_blank"
                rel="noopener noreferrer nofollow"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center text-mute hover:text-accent"
                title="Open the disclosure filing"
              >
                <FileText className="h-4 w-4" />
              </a>
            ) : null}
            <button
              onClick={() => setOpen(open === r.id ? null : r.id)}
              className="text-[12px] font-semibold text-accent hover:underline"
            >
              {open === r.id ? "Hide" : "Evidence"}
            </button>
          </span>
        );
      },
    },
  ];

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-6">
      <header className="mb-4">
        <div className="flex items-center gap-2.5 mb-2">
          <Landmark size={20} style={{ color: "var(--accent)" }} />
          <h1 className="text-[26px] font-extrabold leading-none" style={{ color: "var(--text)" }}>
            Top Ranking Congress Trades
          </h1>
        </div>
        <p className="text-[13.5px] leading-relaxed max-w-[820px]" style={{ color: "var(--text-soft)" }}>
          Where three public records meet: a member of Congress&rsquo;s disclosed stock trade, the committee that
          oversees a federal agency, and a contract that agency awarded to the company. Every row links to all three
          documents.
        </p>
      </header>

      {/* §5: the standing frame, above the table and not buried. */}
      <section
        className="rounded-lg p-3.5 mb-4 text-[12.5px] leading-relaxed"
        style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-soft)" }}
      >
        {data?.frame ||
          "Members of Congress may lawfully own and trade stocks, and these trades are disclosed under the STOCK Act. This page reports the proximity of public records and draws no conclusion of wrongdoing. Proximity is not causation."}
        <span className="block mt-1" style={{ color: "var(--text-mute)" }}>
          {data?.amountNote || "Amounts are estimates: disclosures report a range, and the figure shown is that range’s midpoint."}
        </span>
      </section>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={chamber}
          onChange={(e) => setChamber(e.target.value)}
          className="text-[12.5px] font-semibold rounded-md px-2.5 py-1.5"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
          aria-label="Chamber"
        >
          <option value="">All chambers</option>
          <option value="House">House</option>
          <option value="Senate">Senate</option>
        </select>
        <select
          value={party}
          onChange={(e) => setParty(e.target.value)}
          className="text-[12.5px] font-semibold rounded-md px-2.5 py-1.5"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
          aria-label="Party"
        >
          <option value="">All parties</option>
          <option value="Democrat">Democrat</option>
          <option value="Republican">Republican</option>
        </select>
        <select
          value={agency}
          onChange={(e) => setAgency(e.target.value)}
          className="text-[12.5px] font-semibold rounded-md px-2.5 py-1.5 max-w-[240px]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
          aria-label="Agency"
        >
          <option value="">All agencies</option>
          {agencies.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search member, company or agency"
          className="text-[12.5px] rounded-md px-2.5 py-1.5 flex-1 min-w-[180px]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
      </div>

      {/* §4: "Free tier shows the top of the leaderboard; full ranking history
          + scores behind Premium wall." Note the direction — unlike the other
          paygated lists on this site, which count DOWN so the biggest names
          sit behind the wall, the brief puts the TOP of this leaderboard in
          front of it. A reader is meant to see the highest-scoring rows and
          pay for the depth, not be shown the tail. */}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => String(r.id)}
        initialSort={{ key: "score", dir: "desc" }}
        empty={isLoading ? "Loading verified rows…" : "No verified rows match these filters yet."}
        gate={{
          label: "Top Congress Trades",
          bullets: [
            "The full ranking, not just the top of the board",
            "Every score and how each one is made up",
            "The complete evidence chain on every row",
            "New flags as they clear verification",
          ],
        }}
      />

      {open != null && rows.find((r) => r.id === open) ? (
        <EvidenceChain row={rows.find((r) => r.id === open)!} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}

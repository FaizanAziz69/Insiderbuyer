"use client";
import { ExternalLink, X } from "lucide-react";
import { ReportError } from "./ReportError";
import { CorrectionNote, Correction } from "./CorrectionNote";

/**
 * Brief v5 §2 Stage 3: "Every flag stores its full evidence chain: the
 * PTR/disclosure link, the committee assignment source, the jurisdiction-table
 * version, and the USAspending award record — one click from any public
 * surface to every underlying document."
 *
 * So this panel is not a summary. It shows each of the three legs separately,
 * names the source each came from, and links out where a document exists. §7
 * P1 accepts only when the chain is "complete and clickable", which is a
 * requirement about this component as much as about the database.
 */

interface Row {
  id: number;
  member: string;
  ticker: string;
  company: string | null;
  agency: string;
  awardValue: number;
  committee: string;
  headline: string;
  evidence: any;
}

function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${Math.round(v / 1e6)}M`;
  return `$${Math.round(v).toLocaleString()}`;
}

/** What the link at the end of a leg actually opens, said plainly. A reader
 *  decides whether to trust a figure by what stands behind it, and "Source" on
 *  its own says nothing about whether that is a filed PDF or a search page. */
function linkLabel(href: string): { label: string; note?: string } {
  if (/disclosures-clerk\.house\.gov/.test(href) || /\.pdf($|\?)/i.test(href))
    return { label: "Open the filing (PDF)" };
  if (/efdsearch\.senate\.gov/.test(href))
    return {
      label: "Open the filing on Senate EFD",
      // The 403 a cold click gets is the Senate's own terms gate, not a broken
      // link. Saying so is the difference between a reader thinking we are
      // sloppy and a reader clicking through.
      note: "Senate EFD asks you to accept its terms of use the first time.",
    };
  if (/usaspending\.gov/.test(href)) return { label: "Open the award record" };
  if (/sec\.gov/.test(href)) return { label: "Open the SEC filing" };
  return { label: "Open the source record" };
}

function Leg({
  title,
  source,
  children,
  href,
}: {
  title: string;
  source: string;
  children: React.ReactNode;
  href?: string | null;
}) {
  const link = href ? linkLabel(href) : null;
  return (
    <div className="rounded-lg p-3 flex flex-col" style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}>
      <h4 className="text-[12.5px] font-bold m-0 mb-1" style={{ color: "var(--text)" }}>
        {title}
      </h4>
      <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-soft)" }}>
        {children}
      </div>
      <div className="text-[11px] mt-1" style={{ color: "var(--text-mute)" }}>
        {source}
      </div>
      {href && link ? (
        <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          {/* A full-width target that names the document, rather than a small
              word in the corner. The whole point of the evidence chain is that
              a reader can go and look, so the way out is the loudest thing in
              the card. */}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold hover:underline"
            style={{ color: "var(--accent)" }}
          >
            {link.label} <ExternalLink size={12} />
          </a>
          {link.note ? (
            <div className="text-[10.5px] mt-1 leading-snug" style={{ color: "var(--text-faint)" }}>
              {link.note}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function EvidenceChain({ row, onClose }: { row: Row; onClose: () => void }) {
  const e = row.evidence || {};
  const trade = e.trade || {};
  const committee = e.committee || {};
  const juris = e.jurisdiction || {};
  const award = e.award || {};
  const vendor = e.vendorResolution || {};
  const board = e.boardSeat || null;
  // §5: a fix is only half of a correction; the other half is the dated note
  // on the page. The agent writes its changes into the row's evidence, so a
  // row that has moved says so wherever it is shown.
  const corrections: Correction[] = Array.isArray(e.corrections) ? e.corrections : [];

  return (
    <section
      className="mt-4 rounded-xl p-4"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[13.5px] leading-relaxed m-0" style={{ color: "var(--text)" }}>
          {row.headline}
        </p>
        <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-mute)" }}>
          <X size={16} />
        </button>
      </div>

      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {board ? (
          <Leg title="Board seat" source={`Filed on ${board.form || "an SEC filing"}`} href={board.url}>
            {row.member} — {board.role}
            {board.since ? `, since ${String(board.since).slice(0, 10)}` : ""}
          </Leg>
        ) : (
          <Leg
            title="The disclosed trade"
            source={trade.source || "Periodic transaction report"}
            href={trade.url || null}
          >
            {trade.action || "Holding"}
            {trade.disclosedRange
              ? ` of ${money(trade.disclosedRange.min)}–${money(trade.disclosedRange.max)}`
              : ""}
            {trade.transactionDate ? (
              <>
                <br />
                Transaction date {String(trade.transactionDate).slice(0, 10)}
                {trade.disclosureDate ? ` · disclosed ${String(trade.disclosureDate).slice(0, 10)}` : ""}
              </>
            ) : null}
            {trade.estimateNote ? (
              <>
                <br />
                <span style={{ color: "var(--text-mute)" }}>{trade.estimateNote}</span>
              </>
            ) : null}
          </Leg>
        )}

        <Leg
          title="The committee seat"
          source={committee.source || e.serviceHistory ? "Public service record" : "unitedstates/congress-legislators"}
        >
          {e.serviceHistory ? (
            <>
              Served as {e.serviceHistory.office}
              {e.serviceHistory.from ? ` from ${e.serviceHistory.from}` : ""}
              {e.serviceHistory.to ? ` to ${e.serviceHistory.to}` : ""}
            </>
          ) : (
            <>
              {committee.committee || row.committee}
              {committee.role && committee.role !== "member" ? ` — ${committee.role}` : ""}
              {committee.parent ? (
                <>
                  <br />
                  Subcommittee of {committee.parent}
                </>
              ) : null}
            </>
          )}
          {juris.basis ? (
            <>
              <br />
              <span style={{ color: "var(--text-mute)" }}>
                Jurisdiction ({juris.kind || "oversight"}): {juris.basis}
                {juris.tableVersion ? ` · table v${juris.tableVersion}` : ""}
              </span>
            </>
          ) : null}
        </Leg>

        <Leg title="The contract award" source={award.source || "USAspending.gov"} href={award.url || null}>
          {money(award.amount ?? row.awardValue)} to {award.recipient || row.company || row.ticker}
          <br />
          {award.subAgency || award.agency || row.agency}
          {award.actionDate ? ` · ${String(award.actionDate).slice(0, 10)}` : ""}
          {award.awardId ? (
            <>
              <br />
              <span style={{ color: "var(--text-mute)" }}>Award ID {award.awardId}</span>
            </>
          ) : null}
        </Leg>

        {vendor.chain?.length ? (
          <Leg title="How the vendor was matched to the ticker" source={`Method: ${vendor.method || "—"}`}>
            <ol className="list-decimal pl-4 m-0">
              {vendor.chain.map((line: string, i: number) => (
                <li key={i} className="py-[1px]">
                  {line}
                </li>
              ))}
            </ol>
          </Leg>
        ) : null}
      </div>

      <CorrectionNote corrections={corrections} />

      <ReportError flagId={row.id} />
    </section>
  );
}

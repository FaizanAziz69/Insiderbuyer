"use client";
import useSWR from "swr";
import Link from "next/link";
import {
  API_BASE,
  CompanyDetail,
  fetcher,
  formatCurrency,
  formatDate,
  formatNumber,
} from "@/lib/api";
import { VizFrame, VizSkeleton } from "./VizFrame";

/**
 * §7 viz 1 — Insider Transaction Timeline.
 *
 * THE POINT OF THIS ONE IS THE ABSENCE. The manual's own example is Moderna:
 * "Last 12 months of insider transactions — shows all option exercises but NO
 * open-market purchases. The visual makes the absence visible." The existing
 * `InsiderActivityTable` returns null when a company has no 'P' filings, which
 * renders exactly nothing at the moment the story is at its most interesting.
 * So this component never returns null on empty: it says what is missing, and
 * shows what IS on file instead (exercises, awards, sales), which is the
 * honest version of the same fact.
 *
 * `data-viz="insider-timeline" data-ticker="MRNA" data-months="12"`
 */

/**
 * Tickers whose suffix marks a non-US listing. `.V` / `.TO` / `.CN` / `.NE`
 * are TSXV / TSX / CSE / NEO; a five-letter symbol ending in F is the OTC
 * foreign-ordinary convention (WHGOF). None of these file Form 4 with the SEC.
 */
export function isNonSecIssuer(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return /\.(V|TO|CN|NE|TSX|TSXV)$/.test(s) || /^[A-Z]{4}F$/.test(s);
}

/** Form 4 transaction codes, in the words an article can use. */
const CODE_LABEL: Record<string, string> = {
  P: "Open-market purchase",
  S: "Sale",
  M: "Option exercise",
  A: "Award / grant",
  F: "Tax withholding",
  G: "Gift",
  C: "Conversion",
  X: "Option exercise",
};

export function InsiderTimelineViz({
  ticker,
  months = 12,
  limit = 8,
}: {
  ticker: string;
  months?: number;
  limit?: number;
}) {
  const sym = ticker.toUpperCase();
  const { data, isLoading } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(sym)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );

  // Awards, gifts and exercises carry no transaction price (Form 4 reports
  // $0), so Price/Value rendered as "—" and read as missing data. Show the
  // market close on the filing date instead, marked ≈ so it is not mistaken
  // for a price the insider paid.
  const { data: hist } = useSWR<{
    history: { bars: Array<{ date: string; close: number }> } | null;
  }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(sym)}&range=${
      months > 12 ? "5y" : "1y"
    }`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60_000 },
  );
  const closeOn = (isoDate: string): number | null => {
    const bars = hist?.history?.bars;
    if (!bars?.length) return null;
    const d = isoDate.slice(0, 10);
    let best: number | null = null;
    for (const b of bars) {
      if (b.date <= d) best = b.close;
      else break;
    }
    return best;
  };

  if (isLoading && !data) return <VizSkeleton height={230} />;
  if (!data?.company) return null;
  // A company that does not file with the SEC has no Form 4 record BY
  // CONSTRUCTION, and an empty table under a "no Form 4 activity was filed"
  // caption reads as a finding about its insiders when it is a fact about
  // our coverage. Canadian issuers report to SEDI. Render nothing; the
  // article has to source that data elsewhere (see the peer-table viz).
  if (isNonSecIssuer(sym)) return null;

  const cutoff = Date.now() - months * 30.44 * 86400_000;
  const inWindow = (data.transactions || []).filter(
    (t) => Date.parse(t.transactionDate) >= cutoff,
  );
  const purchases = inWindow.filter((t) => t.transactionCode === "P");
  const other = inWindow.filter((t) => t.transactionCode !== "P");
  const rows = (purchases.length ? purchases : other).slice(0, limit);
  const name = data.company.name || sym;

  return (
    <VizFrame
      title={`Insider transactions — ${sym}`}
      subtitle={`Last ${months} months`}
      footnote={
        purchases.length === 0 ? (
          <strong style={{ color: "var(--text-soft)" }}>
            No open-market purchases on file for {name} in this window.
            {other.length > 0
              ? ` The ${other.length} filing${other.length === 1 ? "" : "s"} below ${
                  other.length === 1 ? "is" : "are"
                } compensation activity — awards, option exercises and sales — which carry no conviction signal.`
              : " No Form 4 activity of any kind was filed."}
          </strong>
        ) : (
          <>
            {purchases.length} open-market purchase
            {purchases.length === 1 ? "" : "s"} totalling{" "}
            {formatCurrency(
              purchases
                .filter((t) => !t.priceSuspect)
                .reduce((a, t) => a + Number(t.totalValue || 0), 0),
            )}
            .
          </>
        )
      }
    >
      {rows.length === 0 ? (
        <div
          className="px-4 py-6 text-[13.5px]"
          style={{ color: "var(--text-soft)" }}
        >
          No Form 4 filings for {name} in the last {months} months.{" "}
          <Link
            href={`/companies/${sym}`}
            className="text-accent hover:underline"
          >
            See the full filing history →
          </Link>
        </div>
      ) : (
        <table
          className="w-full text-[13px]"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {[
                "Date",
                "Insider",
                "Title",
                "Type",
                "Shares",
                "Price",
                "Value",
              ].map((h, i) => (
                <th
                  key={h}
                  className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider whitespace-nowrap"
                  style={{
                    color: "var(--text-mute)",
                    textAlign: i >= 4 ? "right" : "left",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr
                key={t.id}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td className="px-3 py-2 whitespace-nowrap tabular">
                  {formatDate(t.transactionDate)}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/insiders/${encodeURIComponent(t.insiderName)}`}
                    className="hover:text-accent hover:underline"
                  >
                    {t.insiderName}
                  </Link>
                </td>
                <td
                  className="px-3 py-2 text-[12px]"
                  style={{ color: "var(--text-soft)" }}
                >
                  {t.rawTitle || t.role}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-[12px]">
                  <span
                    style={{
                      color:
                        t.transactionCode === "P"
                          ? "var(--good)"
                          : t.transactionCode === "S"
                            ? "var(--bad)"
                            : "var(--text-mute)",
                      fontWeight: t.transactionCode === "P" ? 700 : 400,
                    }}
                  >
                    {CODE_LABEL[t.transactionCode] || t.transactionCode}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular whitespace-nowrap">
                  {formatNumber(Number(t.sharesBought))}
                </td>
                {(() => {
                  if (!t.priceSuspect) {
                    return (
                      <>
                        <td className="px-3 py-2 text-right tabular whitespace-nowrap">
                          ${Number(t.pricePerShare).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular whitespace-nowrap font-semibold">
                          {formatCurrency(Number(t.totalValue))}
                        </td>
                      </>
                    );
                  }
                  const mkt = closeOn(t.transactionDate);
                  const est = { color: "var(--text-soft)" } as const;
                  const tip =
                    "Market close on the filing date — not a price the insider paid";
                  return (
                    <>
                      <td
                        className="px-3 py-2 text-right tabular whitespace-nowrap"
                        style={est}
                        title={tip}
                      >
                        {mkt == null ? "—" : `≈$${mkt.toFixed(2)}`}
                      </td>
                      <td
                        className="px-3 py-2 text-right tabular whitespace-nowrap font-semibold"
                        style={est}
                        title={tip}
                      >
                        {mkt == null
                          ? "—"
                          : `≈${formatCurrency(mkt * Number(t.sharesBought))}`}
                      </td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </VizFrame>
  );
}

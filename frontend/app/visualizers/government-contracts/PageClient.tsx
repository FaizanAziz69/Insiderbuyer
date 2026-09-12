"use client";

/**
 * Product 3 — Government Contracts Visualizer (Developer Brief v2 §6), Phase 2.
 *
 * The same field engine as the prediction board, a different dataset: one
 * bubble per company, sized by the government dollars it was awarded inside
 * the window, ticker printed inside. The region switcher re-seeds the field
 * from a different dataset (§6.1) and the window selector changes the period
 * the totals cover.
 *
 * Awardees we could not resolve to a listed ticker render dashed with a reduced
 * panel, exactly as §6.1 specifies — that is an honest "we have not proved this
 * is listed", not a claim that the company is private.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";
import { track } from "@/lib/analytics";
import { BubbleEngine, type EngineNode } from "@/lib/visualizers/engine";
import { fmtDate, fmtUsd } from "@/lib/visualizers/format";
import type { ContractAward, ContractsBubble } from "@/lib/visualizers/types";
import { SuiteShell } from "@/components/visualizers/SuiteShell";
import { BubbleField } from "@/components/visualizers/BubbleField";
import { Chip, Legend, Toggle } from "@/components/visualizers/controls";
import { Badge, Cell, DetailPanel, Disclaimer, Row, Section } from "@/components/visualizers/DetailPanel";
import { InsiderIntelligence } from "@/components/visualizers/InsiderIntelligence";

interface Payload {
  region: string;
  window: string;
  bubbles: ContractsBubble[];
  totalUsd: number;
  asOf: string;
  fxNote?: string;
  empty?: boolean;
}

const REGIONS: { key: string; label: string }[] = [
  { key: "us", label: "USA" },
  { key: "ca", label: "Canada" },
  { key: "global", label: "Global" },
];

/** Listed awardees get the brand accent; unresolved ones stay neutral so the
 *  eye lands on the companies you can actually act on. */
const colorFor = (b: ContractsBubble): string =>
  b.isPublic ? "rgb(45,150,205)" : "rgb(120,134,158)";

export default function GovernmentContractsClient() {
  const router = useRouter();
  const params = useSearchParams();

  const [region, setRegion] = useState(params.get("region") ?? "us");
  const [window_, setWindow] = useState(params.get("window") ?? "1y");
  const [motion, setMotion] = useState(true);
  const [publicOnly, setPublicOnly] = useState(false);
  const [insidersOnly, setInsidersOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(params.get("m"));
  const [version, setVersion] = useState(0);

  const { data, isLoading } = useSWR<Payload>(
    `${API_BASE}/visualizers/contracts?region=${region}&window=${window_}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30 * 60_000 },
  );

  const engine = useMemo(
    () =>
      new BubbleEngine<ContractsBubble>({
        valueOf: (b) => b.totalUsd,
        labelOf: (b) => b.ticker ?? shortName(b.name),
        colorOf: colorFor,
        base: 20,
        k: 76,
        min: 24,
        max: 112,
        // Federal dollars span $50M to $28B in the same field.
        scale: "log",
      }),
    [],
  );

  const bubbles = useMemo(() => (data?.bubbles ?? []).slice(0, 140), [data]);

  useEffect(() => {
    engine.setData(bubbles);
    setVersion((v) => v + 1);
  }, [engine, bubbles]);

  useEffect(() => {
    if (!publicOnly && !insidersOnly) {
      engine.setPredicate(null);
      return;
    }
    engine.setPredicate(
      (b) => (!publicOnly || b.isPublic) && (!insidersOnly || !!b.insidersBuying),
    );
  }, [engine, publicOnly, insidersOnly]);

  const selectedBubble = selected ? bubbles.find((b) => b.id === selected) ?? null : null;

  const { data: awards, isLoading: awardsLoading } = useSWR<ContractAward[]>(
    selected
      ? `${API_BASE}/visualizers/contracts/${encodeURIComponent(selected)}/awards?window=${window_}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const syncUrl = useCallback(
    (next: { region?: string; window?: string; m?: string | null }) => {
      const qs = new URLSearchParams(Array.from(params.entries()));
      if (next.region) qs.set("region", next.region);
      if (next.window) qs.set("window", next.window);
      if (next.m !== undefined) {
        if (next.m) qs.set("m", next.m);
        else qs.delete("m");
      }
      router.replace(`/visualizers/government-contracts?${qs}`, { scroll: false });
    },
    [params, router],
  );

  const select = useCallback(
    (node: EngineNode<ContractsBubble> | null) => {
      setSelected(node?.id ?? null);
      syncUrl({ m: node?.id ?? null });
      if (node) {
        track("web_bubble_click", {
          vertical: "contracts",
          recipient: node.id,
          ticker: node.data.ticker,
        });
      }
    },
    [syncUrl],
  );

  const tooltip = useCallback((n: EngineNode<ContractsBubble>) => {
    const b = n.data;
    return (
      `<div class="viz-tip-head">${escapeHtml(b.name)}</div>` +
      `<div class="viz-tip-row">${fmtUsd(b.totalUsd)} awarded${
        b.ticker ? ` · ${escapeHtml(b.ticker)}` : " · unlisted"
      }</div>` +
      (b.trendPct != null
        ? `<div class="viz-tip-row" style="color:${
            b.trendPct >= 0 ? "var(--viz-good)" : "var(--viz-bad)"
          }">${b.trendPct >= 0 ? "+" : ""}${b.trendPct.toFixed(0)}% vs prior window</div>`
        : "")
    );
  }, []);

  const asOf = data?.asOf ? new Date(data.asOf) : null;
  const hasData = !!data && !data.empty && bubbles.length > 0;

  return (
    <SuiteShell
      active="contracts"
      kicker="Visualizer 02"
      title="Government Contracts"
      subtitle={
        <>
          One bubble is one company, sized by the government dollars it was awarded in the window.
          Blue bubbles are listed companies; dashed ones we have not matched to a ticker.
        </>
      }
      controls={
        <>
          {REGIONS.map((r) => (
            <Chip
              key={r.key}
              on={region === r.key}
              onClick={() => {
                setRegion(r.key);
                syncUrl({ region: r.key });
                track("web_filter_use", { vertical: "contracts", filter: "region", value: r.key });
              }}
            >
              {r.label}
            </Chip>
          ))}
          <span style={{ width: 10 }} />
          <select
            className="viz-select"
            value={window_}
            onChange={(e) => {
              setWindow(e.target.value);
              syncUrl({ window: e.target.value });
            }}
            aria-label="Time window"
          >
            <option value="90d">Last 90 days</option>
            <option value="1y">Last 12 months</option>
          </select>
          <span className="viz-spacer" />
          <Toggle on={publicOnly} onClick={() => setPublicOnly(!publicOnly)}>
            Listed only
          </Toggle>
          <Toggle on={insidersOnly} onClick={() => setInsidersOnly(!insidersOnly)}>
            Insiders buying
          </Toggle>
          <Toggle on={motion} onClick={() => setMotion(!motion)}>
            Motion
          </Toggle>
        </>
      }
    >
      <div className="viz-arena">
        <BubbleField
          engine={engine}
          version={version}
          selectedId={selected}
          onSelect={select}
          tooltip={tooltip}
          valueLabel={(n) => fmtUsd(n.data.totalUsd)}
          motion={motion}
          dashed={(n) => !n.data.isPublic}
          ariaLabel="Government contract awardees"
        />

        <Legend
          title={`${region === "ca" ? "Canada" : region === "global" ? "Global" : "US federal"} · ${
            window_ === "90d" ? "90 days" : "12 months"
          }`}
          rows={[
            { color: "rgb(45,150,205)", label: "Listed company" },
            { color: "rgb(120,134,158)", label: "Private or not yet matched" },
          ]}
          note={
            asOf
              ? `Size = dollars awarded in the window. Updated ${fmtDate(asOf.toISOString())}.`
              : "Size = dollars awarded in the window."
          }
        />

        {!isLoading && !hasData && (
          <div className="viz-empty">
            <b>No award data for this view yet</b>
            The {region === "ca" ? "Canadian" : region === "global" ? "combined" : "US federal"}{" "}
            dataset for this window has not been built yet. It refreshes nightly.
          </div>
        )}
        {isLoading && (
          <div className="viz-empty">
            <b>Loading awards</b>
            Reading obligations for the selected window.
          </div>
        )}

        <DetailPanel
          open={!!selectedBubble}
          onClose={() => select(null)}
          title={selectedBubble?.name ?? ""}
          badges={
            selectedBubble && (
              <>
                {selectedBubble.ticker ? (
                  <Badge kind="ticker">
                    {selectedBubble.ticker}
                    {selectedBubble.exchange ? ` · ${selectedBubble.exchange}` : ""}
                  </Badge>
                ) : (
                  <Badge kind="private">
                    {selectedBubble.confirmedPrivate ? "PRIVATE / NOT LISTED" : "NOT MATCHED TO A TICKER"}
                  </Badge>
                )}
                <Badge kind="source">
                  {selectedBubble.region === "ca" ? "OPEN.CANADA.CA" : "USASPENDING.GOV"}
                </Badge>
              </>
            )
          }
          headline={
            selectedBubble && (
              <div style={{ textAlign: "right", flex: "none" }}>
                <div
                  style={{
                    fontFamily: "var(--viz-mono), monospace",
                    fontSize: 21,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {fmtUsd(selectedBubble.totalUsd)}
                </div>
                <div style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--text-faint)" }}>
                  {window_ === "90d" ? "90 DAYS" : "12 MONTHS"}
                </div>
              </div>
            )
          }
        >
          {selectedBubble && (
            <>
              <Section title="Awarded in this window">
                <div className="viz-grid" data-cols="3">
                  <Cell label="Total" value={fmtUsd(selectedBubble.totalUsd)} />
                  <Cell label="Prior window" value={fmtUsd(selectedBubble.priorUsd)} />
                  <Cell
                    label="Trend"
                    value={
                      selectedBubble.trendPct == null
                        ? "—"
                        : `${selectedBubble.trendPct >= 0 ? "+" : ""}${selectedBubble.trendPct.toFixed(0)}%`
                    }
                    color={
                      selectedBubble.trendPct == null
                        ? undefined
                        : selectedBubble.trendPct >= 0
                          ? "var(--viz-good)"
                          : "var(--viz-bad)"
                    }
                  />
                </div>
                {(selectedBubble.marketCap != null ||
                  selectedBubble.govRevenueSharePct != null) && (
                  <div style={{ marginTop: 10 }} className="viz-grid" data-cols="3">
                    <Cell label="Market cap" value={fmtUsd(selectedBubble.marketCap)} />
                    <Cell
                      label="Awards ÷ market cap"
                      value={
                        selectedBubble.marketCap
                          ? `${((selectedBubble.totalUsd / selectedBubble.marketCap) * 100).toFixed(0)}%`
                          : "—"
                      }
                    />
                    {/* §6.2 government-revenue concentration. */}
                    <Cell
                      label="Gov. share of revenue"
                      value={
                        selectedBubble.govRevenueSharePct != null
                          ? `${selectedBubble.govRevenueSharePct.toFixed(0)}%`
                          : "—"
                      }
                    />
                  </div>
                )}
                {selectedBubble.govRevenueSharePct != null && (
                  <div className="viz-src">
                    Government share is this window&rsquo;s awards over trailing-twelve-month
                    revenue — an approximation of dependence, not a reported segment figure.
                  </div>
                )}
              </Section>

              <Section title="Recent awards">
                {awards?.length ? (
                  <div className="viz-rows">
                    {awards.slice(0, 6).map((a) => (
                      <div key={a.id} style={{ paddingBottom: 8 }}>
                        <Row
                          k={<b style={{ color: "var(--viz-ink)" }}>{a.agency ?? "—"}</b>}
                          v={fmtUsd(Number(a.amountUsd))}
                        />
                        <div style={{ fontSize: 11.5, color: "var(--viz-mute)", lineHeight: 1.45 }}>
                          {a.description ? truncate(a.description, 130) : "No description filed"}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>
                          {a.awardDate ? fmtDate(a.awardDate) : "—"}
                          {a.popEnd ? ` → ${fmtDate(a.popEnd)}` : ""}
                          {a.vehicle ? ` · ${a.vehicle}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : awardsLoading ? (
                  // The first open of a recipient is a live call to the source
                  // and can take a few seconds; saying so beats an empty box
                  // that looks like "no awards".
                  <p className="viz-about">Reading award detail from the source…</p>
                ) : (
                  <p className="viz-about">
                    No award-level detail came back for this recipient. Its awards most likely sit
                    under a different legal name in the filing system.
                  </p>
                )}
              </Section>

              {selectedBubble.ticker ? (
                <InsiderIntelligence ticker={selectedBubble.ticker} />
              ) : (
                <Section title="Insider Intelligence">
                  <p className="viz-about">
                    {selectedBubble.confirmedPrivate
                      ? "This awardee is private, state-owned or a non-profit operator — a shipbuilder, a national-lab consortium, a university. There are no Form 4 filings to read, so it appears on the map for scale with a reduced panel."
                      : "We have not matched this awardee to a listed parent yet, so there is no Form 4 record attached. Government systems record the entity that signed the contract, which is often a subsidiary; the mapping is reviewed by hand and this one has not been resolved."}
                  </p>
                </Section>
              )}

              <Disclaimer>
                Contract totals are obligations recorded in the window by{" "}
                {selectedBubble.region === "ca"
                  ? "the Government of Canada's proactive disclosure of contracts, in Canadian dollars"
                  : "USAspending.gov, in US dollars"}
                , not company-reported revenue. Awardee-to-ticker matching is our own and may lag
                corporate restructurings. Informational only; not investment advice.
              </Disclaimer>

              <div className="viz-cta">
                <Link
                  href="/government-contracts"
                  data-primary="1"
                  onClick={() =>
                    track("web_panel_cta_click", { vertical: "contracts", cta: "table" })
                  }
                >
                  Full contractor table
                </Link>
                <Link
                  href="/methodology"
                  onClick={() =>
                    track("web_panel_cta_click", { vertical: "contracts", cta: "methodology" })
                  }
                >
                  Methodology
                </Link>
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </SuiteShell>
  );
}

/** Legal names are long; a bubble holds about two words. */
function shortName(name: string): string {
  const cleaned = name
    .replace(/\b(CORPORATION|CORP|INCORPORATED|INC|COMPANY|CO|LLC|L\.L\.C\.|LP|LLP|PLC|LTD|LIMITED|HOLDINGS?|GROUP)\b\.?/gi, "")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ");
  return words.slice(0, 2).join(" ") || name;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n).trim()}…`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

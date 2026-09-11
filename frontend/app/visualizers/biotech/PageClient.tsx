"use client";

/**
 * Product 2 — Biotech Bubble Visualizer (Developer Brief v2 §5), Phase 4.
 *
 * The same map engine as Goldminer, biotech vertical: companies anchored to
 * headquarters, sized by market cap, and — the killer feature per §5.2 — the
 * catalyst calendar first in the panel, with days-until countdowns. Catalyst
 * mode pulses any company with an FDA decision or a major readout inside
 * ninety days (§5.3).
 *
 * Boston and South San Francisco put dozens of companies on one pixel, so
 * co-located companies are jittered apart deterministically — the same ticker
 * lands in the same place on every load.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";
import { track } from "@/lib/analytics";
import { countdownLabel, fmtDate, fmtNum, fmtUsd } from "@/lib/visualizers/format";
import type { BiotechProfile } from "@/lib/visualizers/types";
import { SuiteShell } from "@/components/visualizers/SuiteShell";
import { MapField, type MapPoint } from "@/components/visualizers/MapField";
import { Chip, Legend, Toggle } from "@/components/visualizers/controls";
import {
  Badge,
  Cell,
  DetailPanel,
  Disclaimer,
  Row,
  Section,
  SourceLine,
} from "@/components/visualizers/DetailPanel";
import { InsiderIntelligence } from "@/components/visualizers/InsiderIntelligence";

interface Payload {
  companies: BiotechProfile[];
  asOf: string;
  empty?: boolean;
}

const CAP_BANDS: { key: string; label: string; min: number; max: number }[] = [
  { key: "micro", label: "Under $500M", min: 0, max: 5e8 },
  { key: "small", label: "$500M–$2B", min: 5e8, max: 2e9 },
  { key: "mid", label: "$2B–$10B", min: 2e9, max: 1e10 },
  { key: "large", label: "$10B+", min: 1e10, max: Infinity },
];

const CATALYST_WINDOWS = [
  { key: 0, label: "Any date" },
  { key: 30, label: "Within 30d" },
  { key: 90, label: "Within 90d" },
  { key: 180, label: "Within 180d" },
];

/** Runway is the number that decides whether a catalyst even gets funded, so
 *  it drives the colour: red under a year, amber to two, green beyond. */
function runwayColor(q: number | null): string {
  if (q == null) return "rgb(120,150,180)";
  if (q < 4) return "rgb(215,85,95)";
  if (q < 8) return "rgb(220,170,70)";
  return "rgb(60,175,135)";
}

/** Deterministic scatter for companies sharing a headquarters city. */
function jitter(ticker: string): { dx: number; dy: number } {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) >>> 0;
  const a = (h % 360) * (Math.PI / 180);
  const r = 0.12 + ((h >> 9) % 100) / 400;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

export default function BiotechClient() {
  const router = useRouter();
  const params = useSearchParams();

  const [caps, setCaps] = useState<Set<string>>(new Set());
  const [catalystDays, setCatalystDays] = useState(0);
  const [phase, setPhase] = useState("");
  const [insidersOnly, setInsidersOnly] = useState(false);
  const [catalystMode, setCatalystMode] = useState(true);
  const [selected, setSelected] = useState<string | null>(params.get("m"));

  const { data, isLoading } = useSWR<Payload>(`${API_BASE}/visualizers/biotech`, fetcher, {
    revalidateOnFocus: false,
  });

  const companies = data?.companies ?? [];

  const points: MapPoint<BiotechProfile>[] = useMemo(
    () =>
      companies
        .filter((c) => c.lat != null && c.lng != null)
        .map((c) => {
          const j = jitter(c.ticker);
          const band = CAP_BANDS.find(
            (b) => (c.marketCap ?? 0) >= b.min && (c.marketCap ?? 0) < b.max,
          );
          const dim =
            (caps.size > 0 && (!band || !caps.has(band.key))) ||
            (catalystDays > 0 &&
              (c.nextCatalystDays == null || c.nextCatalystDays > catalystDays)) ||
            (!!phase && !c.trials.some((t) => (t.phase ?? "").includes(phase))) ||
            (insidersOnly && !c.insidersBuying);
          return {
            id: c.ticker,
            lat: (c.lat as number) + j.dy,
            lng: (c.lng as number) + j.dx,
            value: c.marketCap ?? 0,
            label: c.ticker,
            color: runwayColor(c.runwayQuarters),
            dim,
            pulse:
              catalystMode && c.nextCatalystDays != null && c.nextCatalystDays <= 90 && !dim,
            data: c,
          };
        }),
    [companies, caps, catalystDays, phase, insidersOnly, catalystMode],
  );

  const selectedCompany = selected ? companies.find((c) => c.ticker === selected) ?? null : null;

  const select = useCallback(
    (p: MapPoint<BiotechProfile> | null) => {
      setSelected(p?.id ?? null);
      const qs = new URLSearchParams(Array.from(params.entries()));
      if (p) qs.set("m", p.id);
      else qs.delete("m");
      router.replace(`/visualizers/biotech${qs.toString() ? `?${qs}` : ""}`, { scroll: false });
      if (p) track("web_bubble_click", { vertical: "biotech", ticker: p.id });
    },
    [params, router],
  );

  const tooltip = useCallback((p: MapPoint<BiotechProfile>) => {
    const c = p.data;
    return (
      `<div class="viz-tip-head">${escapeHtml(c.name)} (${escapeHtml(c.ticker)})</div>` +
      `<div class="viz-tip-row">${fmtUsd(c.marketCap)} market cap</div>` +
      (c.nextCatalystDays != null
        ? `<div class="viz-tip-row">Next catalyst ${countdownLabel(c.nextCatalystDays)}</div>`
        : `<div class="viz-tip-row">${c.trials.length} active trials</div>`)
    );
  }, []);

  const sizeFor = useCallback(
    (v: number, max: number) => Math.max(8, Math.min(46, 8 + Math.sqrt(v / max) * 36)),
    [],
  );

  const withCatalysts = companies.filter((c) => c.catalysts.length > 0).length;

  return (
    <SuiteShell
      active="biotech"
      kicker="Visualizer 04"
      title="Biotech Catalysts"
      subtitle={
        <>
          Companies on the map by headquarters, sized by market cap and coloured by how many
          quarters of cash they have left. A pulsing ring means a catalyst inside ninety days.
        </>
      }
      controls={
        <>
          {CAP_BANDS.map((b) => (
            <Chip
              key={b.key}
              on={caps.has(b.key)}
              onClick={() => {
                const next = new Set(caps);
                if (next.has(b.key)) next.delete(b.key);
                else next.add(b.key);
                setCaps(next);
              }}
            >
              {b.label}
            </Chip>
          ))}
          <span style={{ width: 8 }} />
          <select
            className="viz-select"
            value={String(catalystDays)}
            onChange={(e) => setCatalystDays(Number(e.target.value))}
            aria-label="Catalyst window"
          >
            {CATALYST_WINDOWS.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
          <select
            className="viz-select"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            aria-label="Trial phase"
          >
            <option value="">All phases</option>
            <option value="1">Phase 1</option>
            <option value="2">Phase 2</option>
            <option value="3">Phase 3</option>
          </select>
          <span className="viz-spacer" />
          <Toggle on={catalystMode} onClick={() => setCatalystMode(!catalystMode)}>
            Catalyst pulse
          </Toggle>
          <Toggle on={insidersOnly} onClick={() => setInsidersOnly(!insidersOnly)}>
            Insiders buying
          </Toggle>
        </>
      }
    >
      <div className="viz-arena">
        <MapField
          points={points}
          selectedId={selected}
          onSelect={select}
          tooltip={tooltip}
          sizeFor={sizeFor}
          ariaLabel="World map of biotech companies"
        />

        <Legend
          title="Cash runway"
          rows={[
            { color: "rgb(215,85,95)", label: "Under 4 quarters" },
            { color: "rgb(220,170,70)", label: "4 to 8 quarters" },
            { color: "rgb(60,175,135)", label: "Over 8 quarters" },
            { color: "rgb(120,150,180)", label: "Not derivable" },
          ]}
          note="Size = market cap. Pulse = catalyst inside 90 days."
        />

        {isLoading && (
          <div className="viz-empty">
            <b>Loading the sector</b>
            Reading the roster, trials and cash positions.
          </div>
        )}
        {!isLoading && companies.length === 0 && (
          <div className="viz-empty">
            <b>The sector map is still building</b>
            The roster, headquarters geocoding and trial pull run on a nightly schedule.
          </div>
        )}

        <DetailPanel
          open={!!selectedCompany}
          onClose={() => select(null)}
          title={selectedCompany?.name ?? ""}
          badges={
            selectedCompany && (
              <>
                <Badge kind="ticker">{selectedCompany.ticker}</Badge>
                {selectedCompany.hqCity && <Badge kind="source">{selectedCompany.hqCity}</Badge>}
                {selectedCompany.nextCatalystDays != null &&
                  selectedCompany.nextCatalystDays <= 90 && (
                    <Badge kind="good">
                      Catalyst {countdownLabel(selectedCompany.nextCatalystDays)}
                    </Badge>
                  )}
              </>
            )
          }
          headline={
            selectedCompany && (
              <div style={{ textAlign: "right", flex: "none" }}>
                <div
                  style={{
                    fontFamily: "var(--viz-mono), monospace",
                    fontSize: 19,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {fmtUsd(selectedCompany.marketCap)}
                </div>
                <div style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--text-faint)" }}>
                  MARKET CAP
                </div>
              </div>
            )
          }
        >
          {selectedCompany && (
            <>
              {/* §5.2 catalyst calendar first — it is the reason to open the panel. */}
              <Section title="Catalyst calendar">
                {selectedCompany.catalysts.length ? (
                  <div className="viz-rows">
                    {selectedCompany.catalysts.slice(0, 6).map((c) => (
                      <div key={c.id} style={{ paddingBottom: 8 }}>
                        <Row
                          k={
                            <>
                              <b style={{ color: "var(--viz-ink)" }}>{c.type}</b>
                              {c.drug ? ` · ${c.drug}` : ""}
                            </>
                          }
                          v={
                            <span
                              style={{
                                color:
                                  c.daysUntil <= 30
                                    ? "var(--viz-gold)"
                                    : c.daysUntil <= 90
                                      ? "var(--viz-good)"
                                      : undefined,
                              }}
                            >
                              {fmtDate(c.eventDate)}
                              {c.isEstimate ? " (est.)" : ""} · {countdownLabel(c.daysUntil)}
                            </span>
                          }
                        />
                        <div style={{ fontSize: 11.5, color: "var(--viz-mute)", lineHeight: 1.45 }}>
                          {c.description}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>
                          {c.sourceName} · as of {c.sourceDate}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="viz-about">
                    No curated catalyst on file. There is no official machine-readable PDUFA feed,
                    so this calendar is curated from company disclosures and FDA notices — a
                    company with none listed simply has not been curated yet, not one with nothing
                    coming.
                  </p>
                )}
              </Section>

              <Section title="Cash and runway">
                <div className="viz-grid" data-cols="3">
                  <Cell label="Cash" value={fmtUsd(selectedCompany.cash)} />
                  <Cell label="Quarterly burn" value={fmtUsd(selectedCompany.quarterlyBurn)} />
                  <Cell
                    label="Runway"
                    value={
                      selectedCompany.runwayQuarters != null
                        ? `${selectedCompany.runwayQuarters.toFixed(1)}Q`
                        : "—"
                    }
                    color={runwayColor(selectedCompany.runwayQuarters)}
                  />
                </div>
                <div className="viz-src">
                  Runway is cash divided by the trailing quarter&rsquo;s net loss — a rough guide,
                  not guidance. Financials as of {selectedCompany.financialsAsOf ?? "—"}.
                </div>
              </Section>

              <Section title="Active trials">
                {selectedCompany.trials.length ? (
                  <div className="viz-rows">
                    {selectedCompany.trials.slice(0, 6).map((t) => (
                      <div key={t.id} style={{ paddingBottom: 7 }}>
                        <Row
                          k={<b style={{ color: "var(--viz-ink)" }}>{t.phase ?? "Phase n/a"}</b>}
                          v={t.status ?? "—"}
                        />
                        <div style={{ fontSize: 11.5, color: "var(--viz-mute)", lineHeight: 1.45 }}>
                          {t.indication ? `${t.indication} — ` : ""}
                          {t.title.length > 110 ? `${t.title.slice(0, 110)}…` : t.title}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>
                          {t.enrollment ? `${fmtNum(t.enrollment)} enrolled · ` : ""}
                          {t.completionDate ? `completes ${fmtDate(t.completionDate)}` : ""} ·{" "}
                          <a
                            href={`https://clinicaltrials.gov/study/${t.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--viz-mute)" }}
                          >
                            {t.id}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="viz-about">No recruiting or active trials found for this sponsor.</p>
                )}
              </Section>

              <InsiderIntelligence ticker={selectedCompany.ticker} />

              <SourceLine
                name="ClinicalTrials.gov, company filings via FMP, OpenStreetMap"
                date={data?.asOf ? data.asOf.slice(0, 10) : null}
              />

              <Disclaimer>
                Catalyst dates are as disclosed by the company or the FDA and move often; a date
                here is not a guarantee that an event happens on it. Trial data is from
                ClinicalTrials.gov. Nothing on this page is investment or medical advice.
              </Disclaimer>

              <div className="viz-cta">
                <Link href={`/companies/${selectedCompany.ticker}`} data-primary="1">
                  {selectedCompany.ticker} profile
                </Link>
                <Link href="/premium">Premium</Link>
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </SuiteShell>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

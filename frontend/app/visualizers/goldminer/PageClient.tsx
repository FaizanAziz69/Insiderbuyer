"use client";

/**
 * Product 1 — Goldminer AI (Developer Brief v2 §4), Phase 3.
 *
 * Every major gold project on the world map, anchored where it physically is,
 * sized by what the best available economics say the asset is worth, coloured
 * by stage. Clusters at low zoom and explodes on zoom (§4.5).
 *
 * The map is our own canvas projection over Natural Earth's public-domain land
 * outline rather than deck.gl over Mapbox: no access token to provision and no
 * third-party basemap style fighting the site's palette. The interaction
 * contract — hover, click, filter, cluster — is identical either way.
 *
 * The dataset is deliberately not shipped with the code. §4.4 assigns curation
 * of the top 300-500 projects to editorial and §12 Q2 has not been answered, so
 * rather than inventing NPVs the page states plainly what it is waiting for and
 * the admin importer stands ready behind it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";
import { track } from "@/lib/analytics";
import { fmtNum, fmtUsd } from "@/lib/visualizers/format";
import type { MiningProject } from "@/lib/visualizers/types";
import { parseNlQuery } from "@/lib/visualizers/nl-query";
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
  projects: MiningProject[];
  peerMedians: Record<string, number>;
}

/** §4.5 colour = stage. Cool for ground still being proved, warm for metal
 *  actually coming out — the ladder reads left to right on the legend. */
const STAGE_COLORS: Record<string, string> = {
  Exploration: "rgb(110,140,180)",
  Resource: "rgb(90,160,200)",
  PEA: "rgb(80,180,190)",
  PFS: "rgb(120,190,140)",
  FS: "rgb(190,190,110)",
  Construction: "rgb(225,165,80)",
  Production: "rgb(230,190,60)",
};
const STAGES = Object.keys(STAGE_COLORS);
const OUNCE_STEPS = [0, 1e6, 3e6, 10e6];

export default function GoldminerClient() {
  const router = useRouter();
  const params = useSearchParams();

  const [stages, setStages] = useState<Set<string>>(new Set());
  const [minOz, setMinOz] = useState(0);
  const [country, setCountry] = useState("");
  const [insidersOnly, setInsidersOnly] = useState(false);
  const [publicOnly, setPublicOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(params.get("m"));
  const [nl, setNl] = useState("");
  const [nlNote, setNlNote] = useState<string | null>(null);

  const { data, isLoading } = useSWR<Payload>(`${API_BASE}/visualizers/mining`, fetcher, {
    revalidateOnFocus: false,
  });

  const projects = data?.projects ?? [];

  const countries = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of projects) c.set(p.country, (c.get(p.country) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [projects]);

  /** §4.6 the query bar: one sentence in, the four filters set. */
  const runQuery = useCallback(
    (text: string) => {
      const f = parseNlQuery(text, {
        countries: countries.map(([c]) => c),
        regions: [...new Set(projects.map((p) => p.region).filter(Boolean) as string[])],
      });
      if (f.unparsed.length) {
        setNlNote(
          `Could not turn that into a filter. Try a stage, a country, an ounce threshold, or "with insider buying".`,
        );
        return;
      }
      setStages(new Set(f.stages));
      setMinOz(f.minOz ?? 0);
      setCountry(f.country ?? "");
      setInsidersOnly(f.insidersBuying);
      setPublicOnly(f.publicOnly);
      const parts = [
        f.stages.length ? f.stages.join(" / ") : null,
        f.minOz ? `over ${(f.minOz / 1e6).toFixed(f.minOz % 1e6 ? 1 : 0)}M oz` : null,
        f.country,
        f.insidersBuying ? "insiders buying" : null,
        f.publicOnly ? "listed only" : null,
      ].filter(Boolean);
      setNlNote(parts.length ? `Filtered to ${parts.join(", ")}.` : null);
      track("web_filter_use", { vertical: "mining", filter: "nl_query" });
    },
    [countries, projects],
  );

  const points: MapPoint<MiningProject>[] = useMemo(
    () =>
      projects.map((p) => {
        const oz = (p.ozMeasuredIndicated ?? 0) + (p.ozInferred ?? 0);
        const dim =
          (stages.size > 0 && !stages.has(p.stage)) ||
          (minOz > 0 && oz < minOz) ||
          (!!country && p.country !== country) ||
          (insidersOnly && !p.insidersBuying) ||
          (publicOnly && !p.isPublic);
        return {
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          value: p.assetValueUsd,
          label: p.name,
          color: STAGE_COLORS[p.stage] ?? "rgb(120,134,158)",
          dim,
          dashed: !p.isPublic,
          data: p,
        };
      }),
    [projects, stages, minOz, country, insidersOnly, publicOnly],
  );

  const selectedProject = selected ? projects.find((p) => p.id === selected) ?? null : null;

  const select = useCallback(
    (p: MapPoint<MiningProject> | null) => {
      setSelected(p?.id ?? null);
      const qs = new URLSearchParams(Array.from(params.entries()));
      if (p) qs.set("m", p.id);
      else qs.delete("m");
      router.replace(`/visualizers/goldminer${qs.toString() ? `?${qs}` : ""}`, { scroll: false });
      if (p) track("web_bubble_click", { vertical: "mining", project: p.id });
    },
    [params, router],
  );

  const tooltip = useCallback((p: MapPoint<MiningProject>) => {
    const d = p.data;
    return (
      `<div class="viz-tip-head">${escapeHtml(d.name)}</div>` +
      `<div class="viz-tip-row">${escapeHtml(d.company)} · ${escapeHtml(d.stage)}</div>` +
      `<div class="viz-tip-row">${fmtUsd(d.assetValueUsd)} asset value</div>`
    );
  }, []);

  const sizeFor = useCallback(
    (v: number, max: number) => Math.max(9, Math.min(52, 9 + Math.sqrt(v / max) * 40)),
    [],
  );

  const evGap =
    selectedProject?.evPerOz != null && selectedProject?.peerMedianEvPerOz
      ? (selectedProject.evPerOz / selectedProject.peerMedianEvPerOz - 1) * 100
      : null;

  return (
    <SuiteShell
      active="mining"
      kicker="Visualizer 03"
      title="Goldminer AI"
      subtitle={
        <>
          Every major gold project on the map, anchored where it is and sized by what the most
          advanced study says the asset is worth. Colour is the stage it has reached.
        </>
      }
      controls={
        <>
          <input
            className="viz-search"
            style={{ minWidth: 260 }}
            placeholder='Ask: "PEA projects in Canada over 2M oz with insider buying"'
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runQuery(nl);
            }}
            aria-label="Natural-language project query"
          />
          {STAGES.map((s) => (
            <Chip
              key={s}
              on={stages.has(s)}
              count={projects.filter((p) => p.stage === s).length || undefined}
              onClick={() => {
                const next = new Set(stages);
                if (next.has(s)) next.delete(s);
                else next.add(s);
                setStages(next);
              }}
            >
              {s}
            </Chip>
          ))}
          <span style={{ width: 8 }} />
          <select
            className="viz-select"
            value={String(minOz)}
            onChange={(e) => setMinOz(Number(e.target.value))}
            aria-label="Minimum ounces"
          >
            {OUNCE_STEPS.map((o) => (
              <option key={o} value={o}>
                {o === 0 ? "Any size" : `${o / 1e6}M+ oz`}
              </option>
            ))}
          </select>
          <select
            className="viz-select"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Country"
          >
            <option value="">All countries</option>
            {countries.map(([c, n]) => (
              <option key={c} value={c}>
                {c} ({n})
              </option>
            ))}
          </select>
          <span className="viz-spacer" />
          <Toggle on={publicOnly} onClick={() => setPublicOnly(!publicOnly)}>
            Listed only
          </Toggle>
          <Toggle on={insidersOnly} onClick={() => setInsidersOnly(!insidersOnly)}>
            Insiders buying
          </Toggle>
        </>
      }
    >
      <div className="viz-arena">
        {nlNote && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 4,
              padding: "7px 13px",
              borderRadius: 999,
              border: "1px solid var(--viz-line)",
              background: "color-mix(in srgb, var(--bg-1) 84%, transparent)",
              backdropFilter: "blur(8px)",
              fontSize: 12,
              color: "var(--viz-soft)",
            }}
          >
            {nlNote}
          </div>
        )}
        <MapField
          points={points}
          selectedId={selected}
          onSelect={select}
          tooltip={tooltip}
          sizeFor={sizeFor}
          ariaLabel="World map of gold projects"
        />

        <Legend
          title="Stage"
          rows={STAGES.filter((s) => projects.some((p) => p.stage === s)).map((s) => ({
            color: STAGE_COLORS[s],
            label: s,
          }))}
          note="Size = asset value. Dashed = private or state-owned."
        />

        {!isLoading && projects.length === 0 && (
          <div className="viz-empty" style={{ maxWidth: 560, margin: "0 auto" }}>
            <div>
              <b>The map is built. The dataset is being curated.</b>
              <p style={{ lineHeight: 1.6, marginTop: 6 }}>
                Every part of this product is live — the projection, clustering, the asset-value
                hierarchy, the fair-value comparison and the panel. What it needs is the seed:
                the top gold projects with ounces, grade, study type, NPV and its gold-price
                assumption, each with a source and an as-of date.
              </p>
              <p style={{ lineHeight: 1.6, marginTop: 8, fontSize: 12.5 }}>
                That curation runs off technical reports on SEDAR+ and EDGAR, and we do not put
                numbers on this map that we cannot point at a filing for. As soon as the sheet
                exists it imports in one call and every bubble below appears.
              </p>
            </div>
          </div>
        )}

        <DetailPanel
          open={!!selectedProject}
          onClose={() => select(null)}
          title={selectedProject?.name ?? ""}
          badges={
            selectedProject && (
              <>
                {selectedProject.ticker ? (
                  <Badge kind="ticker">
                    {selectedProject.ticker}
                    {selectedProject.exchange ? ` · ${selectedProject.exchange}` : ""}
                  </Badge>
                ) : (
                  <Badge kind="private">PRIVATE / STATE-OWNED</Badge>
                )}
                <Badge>{selectedProject.stage}</Badge>
                <Badge kind="source">{selectedProject.country}</Badge>
              </>
            )
          }
          headline={
            selectedProject && (
              <div style={{ textAlign: "right", flex: "none" }}>
                <div
                  style={{
                    fontFamily: "var(--viz-mono), monospace",
                    fontSize: 21,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: "var(--viz-gold)",
                  }}
                >
                  {fmtUsd(selectedProject.assetValueUsd)}
                </div>
                <div style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--text-faint)" }}>
                  ASSET VALUE
                </div>
              </div>
            )
          }
        >
          {selectedProject && (
            <>
              <Section title="Sized by">
                <p className="viz-about">{selectedProject.sizedBy}</p>
              </Section>

              <Section title="Resource">
                <div className="viz-grid" data-cols="3">
                  <Cell
                    label="P&amp;P / M&amp;I oz"
                    value={
                      selectedProject.ozMeasuredIndicated
                        ? `${(selectedProject.ozMeasuredIndicated / 1e6).toFixed(2)}M`
                        : "—"
                    }
                  />
                  <Cell
                    label="Inferred"
                    value={
                      selectedProject.ozInferred
                        ? `${(selectedProject.ozInferred / 1e6).toFixed(2)}M`
                        : "—"
                    }
                  />
                  <Cell
                    label="Grade"
                    value={selectedProject.gradeGpt ? `${selectedProject.gradeGpt} g/t` : "—"}
                  />
                </div>
                {selectedProject.depositType && (
                  <div style={{ marginTop: 9 }}>
                    <Row k="Deposit type" v={selectedProject.depositType} />
                  </div>
                )}
              </Section>

              <Section title="Economics">
                <div className="viz-rows">
                  <Row
                    k="Study"
                    v={selectedProject.studyType ?? "None published"}
                  />
                  <Row
                    k="After-tax NPV"
                    v={
                      selectedProject.npvAfterTaxUsd
                        ? `${fmtUsd(selectedProject.npvAfterTaxUsd)}${
                            selectedProject.npvDiscountRate
                              ? ` @ ${selectedProject.npvDiscountRate}%`
                              : ""
                          }`
                        : "—"
                    }
                  />
                  <Row
                    k="Gold price assumed"
                    v={
                      selectedProject.goldPriceAssumption
                        ? `$${fmtNum(selectedProject.goldPriceAssumption)}/oz`
                        : "—"
                    }
                  />
                  <Row k="IRR" v={selectedProject.irrPct ? `${selectedProject.irrPct}%` : "—"} />
                  <Row k="Capex" v={fmtUsd(selectedProject.capexUsd)} />
                  <Row
                    k="AISC"
                    v={selectedProject.aiscPerOz ? `$${fmtNum(selectedProject.aiscPerOz)}/oz` : "—"}
                  />
                  <Row
                    k="Mine life"
                    v={selectedProject.mineLifeYears ? `${selectedProject.mineLifeYears} yrs` : "—"}
                  />
                  <Row
                    k="Annual production"
                    v={
                      selectedProject.annualProductionOz
                        ? `${fmtNum(selectedProject.annualProductionOz)} oz`
                        : "—"
                    }
                  />
                </div>
              </Section>

              {selectedProject.evPerOz != null && (
                <Section title="Fair value vs peers">
                  <div className="viz-grid">
                    <Cell
                      label="This project"
                      value={`$${selectedProject.evPerOz.toFixed(0)}/oz`}
                    />
                    <Cell
                      label={`${selectedProject.stage} median`}
                      value={
                        selectedProject.peerMedianEvPerOz
                          ? `$${selectedProject.peerMedianEvPerOz.toFixed(0)}/oz`
                          : "—"
                      }
                    />
                  </div>
                  {evGap != null && (
                    <p className="viz-about" style={{ marginTop: 9 }}>
                      Valued{" "}
                      <b style={{ color: evGap >= 0 ? "var(--viz-good)" : "var(--viz-bad)" }}>
                        {Math.abs(evGap).toFixed(0)}% {evGap >= 0 ? "above" : "below"}
                      </b>{" "}
                      the median for {selectedProject.stage}-stage projects on this map. This is a
                      peer comparison, not a valuation or a recommendation.
                    </p>
                  )}
                </Section>
              )}

              {(selectedProject.ownershipPct != null || selectedProject.jvPartners) && (
                <Section title="Ownership">
                  <div className="viz-rows">
                    <Row
                      k={selectedProject.company}
                      v={
                        selectedProject.ownershipPct != null
                          ? `${selectedProject.ownershipPct}%`
                          : "operator"
                      }
                    />
                    {selectedProject.jvPartners && (
                      <Row k="JV partners" v={selectedProject.jvPartners} />
                    )}
                  </div>
                </Section>
              )}

              {selectedProject.ticker ? (
                <InsiderIntelligence ticker={selectedProject.ticker} />
              ) : (
                <Section title="Insider Intelligence">
                  <p className="viz-about">
                    {selectedProject.company} is private or state-owned, so there are no Form 4
                    filings to read. Private projects appear on the map for scale with a reduced
                    panel.
                  </p>
                </Section>
              )}

              <div className="viz-src">
                Ounce figures are the operator&rsquo;s own reported category — proven and probable
                reserves where a reserve is declared, which is the most conservative measure.
              </div>
              <SourceLine
                name={selectedProject.sourceName}
                url={selectedProject.sourceUrl}
                date={selectedProject.sourceDate}
              />

              <Disclaimer>
                Resource and economic figures are as published by the operator in the study named
                above and are not independently verified by InsiderBuying. Asset value is our own
                calculation from those disclosures using a published method. Peer comparisons are
                data, not advice.
              </Disclaimer>
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

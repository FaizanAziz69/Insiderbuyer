"use client";

/**
 * Product 4 — Prediction Market Bubbles (Developer Brief v2 §7), Phase 1.
 *
 * A live bubble field where one bubble is one event contract. Size is total
 * dollar volume, colour is market lean (green at or above an even-money YES,
 * red below, intensity by conviction), and every price move flashes the ring
 * green or red. Click a bubble for the full question, the YES/NO split, the
 * live line, best bid and ask, volumes, and a streaming trades feed — all of it
 * updating while the panel is open.
 *
 * Data path (§7.2): the browser never talks to Polymarket. Our backend polls
 * Gamma, normalises into MarketContract, and pushes coalesced deltas over SSE;
 * this page reads one snapshot for first paint and then applies deltas to the
 * engine. If the stream cannot connect it silently falls back to re-fetching
 * the snapshot, so the page degrades to "slower", never to "broken".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { track } from "@/lib/analytics";
import { BubbleEngine, leanColor, type EngineNode } from "@/lib/visualizers/engine";
import { agoLabel, fmtProb, fmtUsd, fmtDate, countdownLabel, daysUntil } from "@/lib/visualizers/format";
import type { MarketContract, MarketTrade, PriceTick } from "@/lib/visualizers/types";
import { SuiteShell } from "@/components/visualizers/SuiteShell";
import { BubbleField } from "@/components/visualizers/BubbleField";
import { Chip, Legend, LivePill, Toggle } from "@/components/visualizers/controls";
import { Badge, Cell, DetailPanel, Disclaimer, Row, Section } from "@/components/visualizers/DetailPanel";
import { Sparkline, SplitBar } from "@/components/visualizers/Sparkline";

const CATEGORIES = ["Politics", "Economy", "Crypto", "Sports", "Tech & Science", "Other"];

interface Snapshot {
  markets: MarketContract[];
  asOf: number;
  stale: boolean;
}

export default function PredictionMarketsClient() {
  const router = useRouter();
  const params = useSearchParams();

  const [markets, setMarkets] = useState<Map<string, MarketContract>>(new Map());
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [motion, setMotion] = useState(true);
  const [selected, setSelected] = useState<string | null>(params.get("m"));
  const [connected, setConnected] = useState(false);
  const [asOf, setAsOf] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  // The engine is created once; data flows through setData/patch (§9.2).
  const engine = useMemo(
    () =>
      new BubbleEngine<MarketContract>({
        valueOf: (m) => m.volumeTotal,
        labelOf: (m) => m.shortLabel,
        colorOf: (m) => leanColor(m.yesPrice),
        base: 16,
        k: 62,
        min: 20,
        max: 104,
      }),
    [],
  );

  const marketsRef = useRef(markets);
  marketsRef.current = markets;

  /* ------------------------------------------------------- first paint */

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/visualizers/markets`, { cache: "no-store" });
      const json = (await res.json()) as Snapshot;
      const next = new Map<string, MarketContract>();
      for (const m of json.markets ?? []) next.set(m.id, m);
      setMarkets(next);
      setAsOf(json.asOf ?? Date.now());
      setVersion((v) => v + 1);
    } catch {
      /* the stream or the next poll will fill this in */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  /* ------------------------------------------------------------ stream */

  useEffect(() => {
    let es: EventSource | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const startFallback = () => {
      if (fallback) return;
      // §9.4 AC: kill the ingest and the client recovers. Polling is that
      // recovery — slower, correct, and it costs one cached request.
      fallback = setInterval(() => void loadSnapshot(), 20_000);
    };

    try {
      es = new EventSource(`${API_BASE}/visualizers/markets/stream`);
      es.addEventListener("hello", () => {
        if (closed) return;
        setConnected(true);
        if (fallback) {
          clearInterval(fallback);
          fallback = null;
        }
      });
      es.addEventListener("delta", (ev) => {
        if (closed) return;
        try {
          const frame = JSON.parse((ev as MessageEvent).data) as {
            updates: (Partial<MarketContract> & { id: string; dir?: number })[];
            ts: number;
          };
          setMarkets((prev) => {
            const next = new Map(prev);
            for (const u of frame.updates) {
              const cur = next.get(u.id);
              if (!cur) continue;
              const merged = { ...cur, ...u, updatedAt: frame.ts };
              next.set(u.id, merged);
              engine.patch(u.id, merged, u.dir ?? 0);
            }
            return next;
          });
          setAsOf(frame.ts);
        } catch {
          /* a malformed frame must not kill the stream */
        }
      });
      es.onerror = () => {
        setConnected(false);
        startFallback();
      };
    } catch {
      startFallback();
    }

    return () => {
      closed = true;
      es?.close();
      if (fallback) clearInterval(fallback);
    };
  }, [engine, loadSnapshot]);

  /* -------------------------------------------------------- engine feed */

  const visible = useMemo(() => {
    const all = [...markets.values()];
    return cats.size ? all.filter((m) => cats.has(m.category)) : all;
  }, [markets, cats]);

  useEffect(() => {
    engine.setData([...markets.values()]);
    setVersion((v) => v + 1);
    // Only the id set matters here; values arrive through patch().
  }, [engine, markets.size]);

  useEffect(() => {
    engine.setPredicate(cats.size ? (m) => cats.has(m.category) : null);
  }, [engine, cats]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of markets.values()) c[m.category] = (c[m.category] ?? 0) + 1;
    return c;
  }, [markets]);

  /* --------------------------------------------------------- selection */

  const selectedMarket = selected ? markets.get(selected) ?? null : null;

  const select = useCallback(
    (node: EngineNode<MarketContract> | null) => {
      const id = node?.id ?? null;
      setSelected(id);
      // §9.3 deep-link: ?m=<id> opens the panel, so any view is shareable.
      const qs = new URLSearchParams(Array.from(params.entries()));
      if (id) qs.set("m", id);
      else qs.delete("m");
      router.replace(`/visualizers/prediction-markets${qs.toString() ? `?${qs}` : ""}`, {
        scroll: false,
      });
      if (id && node) {
        track("web_bubble_click", {
          vertical: "prediction",
          market_id: id,
          category: node.data.category,
        });
      }
    },
    [params, router],
  );

  /* ------------------------------------------------ panel live details */

  const [history, setHistory] = useState<PriceTick[]>([]);
  const [trades, setTrades] = useState<MarketTrade[]>([]);

  useEffect(() => {
    if (!selected) {
      setHistory([]);
      setTrades([]);
      return;
    }
    let alive = true;
    const pull = async () => {
      try {
        const [h, t] = await Promise.all([
          fetch(`${API_BASE}/visualizers/markets/${encodeURIComponent(selected)}/history`).then((r) =>
            r.json(),
          ),
          fetch(`${API_BASE}/visualizers/markets/${encodeURIComponent(selected)}/trades`).then((r) =>
            r.json(),
          ),
        ]);
        if (!alive) return;
        setHistory(Array.isArray(h) ? h : []);
        setTrades(Array.isArray(t) ? t : []);
      } catch {
        /* leave whatever is on screen */
      }
    };
    void pull();
    const iv = setInterval(pull, 8_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [selected]);

  /* ------------------------------------------------------------- render */

  const tooltip = useCallback((n: EngineNode<MarketContract>) => {
    const m = n.data;
    const move = m.oneDayChange;
    return (
      `<div class="viz-tip-head">${escapeHtml(m.shortLabel)}</div>` +
      `<div class="viz-tip-row">YES ${fmtProb(m.yesPrice)}` +
      (move != null
        ? ` · <span style="color:${move >= 0 ? "var(--viz-good)" : "var(--viz-bad)"}">${
            move >= 0 ? "+" : ""
          }${Math.round(move * 100)}pt 24h</span>`
        : "") +
      `</div>` +
      `<div class="viz-tip-row">${fmtUsd(m.volumeTotal)} volume · ${escapeHtml(m.category)}</div>`
    );
  }, []);

  const valueLabel = useCallback(
    (n: EngineNode<MarketContract>) => fmtProb(n.data.yesPrice),
    [],
  );

  const live = connected && !!asOf && Date.now() - asOf < 90_000;
  const endDays = daysUntil(selectedMarket?.endDate ?? null);

  return (
    <SuiteShell
      active="prediction"
      kicker="Visualizer 01"
      title="Prediction Market Bubbles"
      subtitle={
        <>
          Every bubble is one event contract on Polymarket, sized by total dollars traded and
          coloured by which way the money leans. Prices move live.
        </>
      }
      controls={
        <>
          <Chip on={cats.size === 0} onClick={() => setCats(new Set())}>
            All
          </Chip>
          {CATEGORIES.filter((c) => counts[c]).map((c) => (
            <Chip
              key={c}
              on={cats.has(c)}
              count={counts[c]}
              onClick={() => {
                const next = new Set(cats);
                if (next.has(c)) next.delete(c);
                else next.add(c);
                setCats(next);
                track("web_filter_use", { vertical: "prediction", filter: "category", value: c });
              }}
            >
              {c}
            </Chip>
          ))}
          <span className="viz-spacer" />
          <Toggle on={motion} onClick={() => setMotion(!motion)} title="Pause the drift">
            Motion
          </Toggle>
          <LivePill
            live={live}
            label={live ? "Live" : asOf ? `Updated ${agoLabel(asOf)}` : "Connecting"}
          />
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
          valueLabel={valueLabel}
          motion={motion}
          ariaLabel="Prediction market bubbles"
        />

        <Legend
          title="How to read it"
          rows={[
            { color: "rgb(27,180,113)", label: "YES leading — 50% or above" },
            { color: "rgb(232,75,86)", label: "NO leading — below 50%" },
          ]}
          note="Size = total dollars traded. A flashing ring is a price move."
        />

        {!loading && visible.length === 0 && (
          <div className="viz-empty">
            <b>Nothing in this filter</b>
            No curated market matches those categories right now.
          </div>
        )}
        {loading && (
          <div className="viz-empty">
            <b>Loading the board</b>
            Fetching curated markets and their live prices.
          </div>
        )}

        <DetailPanel
          open={!!selectedMarket}
          onClose={() => select(null)}
          title={selectedMarket?.question ?? ""}
          badges={
            selectedMarket && (
              <>
                <Badge kind="source">POLYMARKET</Badge>
                <Badge>{selectedMarket.category}</Badge>
                {selectedMarket.endDate && (
                  <Badge kind={endDays != null && endDays <= 7 ? "good" : undefined}>
                    Resolves {fmtDate(selectedMarket.endDate)} · {countdownLabel(endDays)}
                  </Badge>
                )}
              </>
            )
          }
          headline={
            selectedMarket && (
              <div style={{ textAlign: "right", flex: "none" }}>
                <div
                  style={{
                    fontFamily: "var(--viz-mono), monospace",
                    fontSize: 26,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: leanColor(selectedMarket.yesPrice),
                  }}
                >
                  {fmtProb(selectedMarket.yesPrice)}
                </div>
                <div style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--text-faint)" }}>
                  YES
                </div>
              </div>
            )
          }
        >
          {selectedMarket && (
            <>
              <Section title="Market lean">
                <SplitBar yes={selectedMarket.yesPrice} />
                {selectedMarket.oneDayChange != null && (
                  <div style={{ marginTop: 9, fontSize: 12.3, color: "var(--viz-soft)" }}>
                    YES has moved{" "}
                    <b
                      style={{
                        color:
                          selectedMarket.oneDayChange >= 0 ? "var(--viz-good)" : "var(--viz-bad)",
                      }}
                    >
                      {selectedMarket.oneDayChange >= 0 ? "+" : ""}
                      {Math.round(selectedMarket.oneDayChange * 100)} points
                    </b>{" "}
                    in the last 24 hours.
                  </div>
                )}
              </Section>

              <Section title="Live line">
                <Sparkline points={history} color={leanColor(selectedMarket.yesPrice)} />
                <div className="viz-grid" style={{ marginTop: 11 }}>
                  <Cell label="Best bid (YES)" value={fmtProb(selectedMarket.bestBid)} />
                  <Cell label="Best ask (YES)" value={fmtProb(selectedMarket.bestAsk)} />
                </div>
              </Section>

              <Section title="Size of the market">
                <div className="viz-grid" data-cols="3">
                  <Cell label="Total volume" value={fmtUsd(selectedMarket.volumeTotal)} />
                  <Cell label="24h volume" value={fmtUsd(selectedMarket.volume24h)} />
                  <Cell
                    label="Book liquidity"
                    value={fmtUsd(selectedMarket.openInterest)}
                  />
                </div>
                <div className="viz-src">
                  Polymarket publishes resting book liquidity rather than open interest; that is
                  the figure shown.
                </div>
              </Section>

              <Section title="Recent trades">
                {trades.length ? (
                  <div className="viz-rows">
                    {trades.slice(0, 8).map((t, i) => (
                      <Row
                        key={`${t.ts}-${i}`}
                        k={
                          <span
                            style={{
                              color: t.side === "BUY" ? "var(--viz-good)" : "var(--viz-bad)",
                              fontFamily: "var(--viz-mono), monospace",
                              fontSize: 11.5,
                            }}
                          >
                            {t.side} {t.outcome}
                          </span>
                        }
                        v={
                          <>
                            {fmtUsd(t.sizeUsd)} @ {fmtProb(t.price)}{" "}
                            <span style={{ color: "var(--text-faint)" }}>
                              {agoLabel(t.ts * 1000)}
                            </span>
                          </>
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="viz-about">No trades reported in the recent window.</p>
                )}
              </Section>

              {selectedMarket.slug && (
                <Section title="Context">
                  <p className="viz-about">
                    This is a real-money event contract. The price is what buyers and sellers are
                    paying right now for a YES share that settles at $1 if the event happens and $0
                    if it does not — which is why it reads as a probability.
                  </p>
                </Section>
              )}

              <div className="viz-cta">
                <Link href="/insights" data-primary="1">
                  Read our market coverage
                </Link>
                <Link href="/premium">Premium</Link>
              </div>

              <Disclaimer>
                Informational only; not betting or investment advice. InsiderBuying aggregates and
                displays publicly available market prices. We do not take bets, route orders, or
                facilitate wagering, and we do not link to trading venues. Prices and volumes are
                sourced from Polymarket and are as of{" "}
                {asOf ? new Date(asOf).toLocaleTimeString("en-US") : "—"}.
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

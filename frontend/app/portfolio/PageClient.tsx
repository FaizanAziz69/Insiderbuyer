"use client";
/**
 * /portfolio — "My Portfolio".
 *
 * Client 2026-09-08: no "Create an account" popup here or on any paygated
 * button. Anyone can enter up to 10 stocks; the Insider Score (the paygated
 * figure) renders as the standard blurred decoy that links to Insider Access,
 * every free figure (price, buyers, dollars bought, last buy) shows in full,
 * and a FAQ under the table explains the score. The $19 "Portfolio
 * Intelligence" upsell with its SMS mockups is gone — SMS alerts do not ship
 * yet, and a page must not promise what it cannot deliver.
 *
 * Storage: the list lives in the browser (`ib_portfolio`, max 10). A signed-in
 * visitor's server-side portfolio seeds it the first time and adds/removes are
 * mirrored to the server best-effort, so nothing an existing user built is
 * lost. Stats come from the public GET /portfolio/preview, which never sends a
 * score to a locked viewer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Lock, Plus, Trash2 } from "lucide-react";
import { API_BASE, formatRelative } from "@/lib/api";
import { getAuthToken, useAuth } from "@/lib/auth";
import { StockSearch } from "@/components/nav/StockSearch";
import { IqsScoreCell } from "@/components/IqsScoreCell";
import { PremiumValue } from "@/components/premium/PremiumValue";
import { PremiumRowWall } from "@/components/premium/PremiumRowWall";
import { usePremium } from "@/components/premium/PremiumContext";
import { SUBSCRIBE_HREF } from "@/lib/funnel";
import { track } from "@/lib/analytics";

interface Holding {
  ticker: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  iqs: number | null;
  locked: boolean;
  buyers90d: number;
  bought90d: number;
  lastBuy: string | null;
}
interface PreviewResponse {
  holdings: Holding[];
  active: boolean;
  limit: number;
}

const LIMIT = 10;
const LS_KEY = "ib_portfolio";

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;

function readLocal(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    return Array.isArray(v) ? v.map((t) => String(t).toUpperCase()).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}
function writeLocal(tickers: string[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(tickers.slice(0, LIMIT)));
  } catch {
    /* storage unavailable */
  }
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What is the Insider Score?",
    a: "A 0–100 reading of how much conviction sits behind a company's insider buying. It only exists where insiders have made qualifying open-market purchases in the last 90 days — a company with no recent buying has no score rather than a low one.",
  },
  {
    q: "How do we calculate it?",
    a: "It is a weighted composite of six pillars read from the SEC Form 4 record and market data: the quality of the insider buying itself (size, stake growth, cluster and repeat purchases), the caliber and track record of the buyers, the sector's strength, management tone, price momentum, and dilution. Awards, option exercises, tax withholding and 10b5-1 plan trades are excluded — only open-market purchases count. Scores refresh daily and cap at 99.",
  },
  {
    q: "What does it mean?",
    a: "55 and above reads Bullish — unusual, high-conviction buying. 40 to 54 is Neutral — buying is present but routine. Below 40 is Low Buying — filings exist but carry little conviction. It is a research signal about insider behaviour, not a price prediction or a recommendation.",
  },
  {
    q: "How many stocks can I add?",
    a: `Up to ${LIMIT}. The list is saved in this browser; sign in and it is kept on your account as well.`,
  },
  {
    q: "Why is the score blurred?",
    a: (
      <>
        The Insider Score is part of Insider Access. Everything else on the row — price, how many insiders bought in
        the last 90 days, how much they spent and when — is free.{" "}
        <Link href={SUBSCRIBE_HREF} className="font-semibold text-accent">See what Insider Access includes →</Link>
      </>
    ),
  },
];

export default function PortfolioPage() {
  const { user } = useAuth();
  const { unlocked } = usePremium();
  const [tickers, setTickers] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from the browser, then (signed in, empty) seed from the account.
  useEffect(() => {
    const local = readLocal();
    setTickers(local);
    setHydrated(true);
    if (!user || local.length) return;
    fetch(`${API_BASE}/portfolio`, { headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { holdings?: { ticker: string }[] } | null) => {
        const remote = (d?.holdings || []).map((h) => h.ticker.toUpperCase()).slice(0, LIMIT);
        if (remote.length) {
          setTickers(remote);
          writeLocal(remote);
        }
      })
      .catch(() => undefined);
  }, [user]);

  const key = tickers.length ? `${API_BASE}/portfolio/preview?tickers=${encodeURIComponent(tickers.join(","))}` : null;
  const { data, isLoading } = useSWR<PreviewResponse>(
    key,
    (url: string) => {
      const token = getAuthToken();
      return fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json());
    },
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000 },
  );

  const mirror = useCallback(
    (method: "POST" | "DELETE", ticker: string) => {
      if (!user) return;
      const token = getAuthToken();
      if (!token) return;
      const url = method === "POST" ? `${API_BASE}/portfolio` : `${API_BASE}/portfolio/${encodeURIComponent(ticker)}`;
      fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: method === "POST" ? JSON.stringify({ ticker }) : undefined,
      }).catch(() => undefined);
    },
    [user],
  );

  const add = (raw: string) => {
    const ticker = raw.trim().toUpperCase();
    setError(null);
    if (!ticker) return;
    if (tickers.includes(ticker)) {
      setError(`${ticker} is already in your portfolio.`);
      return;
    }
    if (tickers.length >= LIMIT) {
      setError(`Portfolios hold up to ${LIMIT} stocks — remove one to add another.`);
      return;
    }
    const next = [...tickers, ticker];
    setTickers(next);
    writeLocal(next);
    setAdding(false);
    mirror("POST", ticker);
    track("web_portfolio_add", { ticker, count: next.length });
  };
  const remove = (ticker: string) => {
    const next = tickers.filter((t) => t !== ticker);
    setTickers(next);
    writeLocal(next);
    mirror("DELETE", ticker);
  };

  // Rows in the order the visitor added them; a ticker the API does not know
  // still shows, so the reader can see it and remove it.
  const holdings = useMemo(() => {
    const byTicker = new Map((data?.holdings || []).map((h) => [h.ticker.toUpperCase(), h]));
    return tickers.map(
      (t) =>
        byTicker.get(t) ?? {
          ticker: t,
          name: null,
          sector: null,
          price: null,
          iqs: null,
          locked: !unlocked,
          buyers90d: 0,
          bought90d: 0,
          lastBuy: null,
        },
    );
  }, [tickers, data, unlocked]);
  const count = tickers.length;
  const scoresLocked = !unlocked && !(data?.active ?? false);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[28px] sm:text-[38px] font-bold tracking-tight" style={{ letterSpacing: "-0.6px" }}>
          Your Portfolio. Scored by Insiders.
        </h1>
        <p className="text-soft text-[15px] sm:text-[16px] mt-3 max-w-2xl leading-relaxed">
          Add up to {LIMIT} stocks you own. We&apos;ll show you what the insiders at each company have been doing
          — who bought, how much, and how much conviction sits behind it.
        </p>
      </header>

      {/* ── ADD / EMPTY STATE ────────────────────────────────────── */}
      {hydrated && count === 0 && (
        <section className="card p-8 text-center">
          <p className="text-[17px] font-semibold">Add your first stock to get started.</p>
          <p className="text-[13px] text-mute mt-1">No account needed — your list is saved in this browser.</p>
          <div className="mt-5 max-w-sm mx-auto">
            {adding ? (
              <StockSearch dark={false} placeholder="Add a ticker or company (e.g. Apple)…" onSelect={(r) => add(r.symbol)} />
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="btn-primary w-full justify-center">
                <Plus className="h-4 w-4" /> Add a Stock
              </button>
            )}
          </div>
          {error && (
            <p className="text-[13px] mt-3" style={{ color: "var(--bad)" }} role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {/* ── HOLDINGS ─────────────────────────────────────────────── */}
      {count > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] font-semibold">
              {count} of {LIMIT} {count === 1 ? "stock" : "stocks"} in your portfolio.
            </p>
            {adding ? (
              <div className="w-full sm:w-72">
                <StockSearch dark={false} placeholder="Add a ticker or company…" onSelect={(r) => add(r.symbol)} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="btn-secondary"
                disabled={count >= LIMIT}
                title={count >= LIMIT ? `Portfolios hold up to ${LIMIT} stocks` : undefined}
              >
                <Plus className="h-3.5 w-3.5" /> Add a Stock
              </button>
            )}
          </div>
          {error && (
            <p className="text-[13px]" style={{ color: "var(--bad)" }} role="alert">
              {error}
            </p>
          )}

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="text-left" style={{ borderBottom: "1px solid var(--border)" }}>
                    <Th>Stock</Th>
                    <Th right>Price</Th>
                    <Th center>
                      <span className="inline-flex items-center gap-1.5">
                        {scoresLocked && <Lock className="h-3 w-3" style={{ color: "var(--premium)" }} />}
                        Insider Score
                      </span>
                    </Th>
                    <Th right>Buyers (90d)</Th>
                    <Th right>Bought (90d)</Th>
                    <Th right>Last buy</Th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.ticker} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3">
                        <Link href={`/companies/${encodeURIComponent(h.ticker)}`} className="font-semibold text-accent">
                          {h.ticker}
                        </Link>
                        {h.name && <div className="text-[12px] text-mute">{h.name}</div>}
                      </td>
                      <td className="px-4 py-3 text-right tabular">{h.price != null ? `$${h.price.toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {h.locked ? (
                          // Decoy only — the API sent no score for a locked viewer.
                          <PremiumValue label="Insider Score">
                            <span />
                          </PremiumValue>
                        ) : (
                          <IqsScoreCell iqs={h.iqs} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular">{h.buyers90d || "—"}</td>
                      <td className="px-4 py-3 text-right tabular text-good font-semibold">
                        {h.bought90d ? money(h.bought90d) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-[13px] text-mute whitespace-nowrap">
                        {h.lastBuy ? formatRelative(h.lastBuy) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => remove(h.ticker)}
                          className="text-mute hover:text-accent transition"
                          aria-label={`Remove ${h.ticker}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isLoading && !data && <p className="px-4 py-3 text-[12.5px] text-mute">Loading insider data…</p>}
            </div>
            {scoresLocked && (
              <PremiumRowWall
                label="Portfolio Insider Scores"
                total={count}
                bullets={[
                  "The Insider Score on every stock you hold, updated daily",
                  "Insider ROI, signals and the full Form 4 record behind each",
                  "Top Insider Buys, rankings and every other Insider Access signal",
                ]}
              />
            )}
          </div>
          <p className="text-[12px] text-mute">
            Buyers and dollars are open-market insider purchases (SEC Form 4, code P) in the last 90 days. Awards,
            option exercises and tax withholding are excluded. Informational only — not investment advice.
          </p>
        </section>
      )}

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-[22px] font-bold tracking-tight mb-3">About the Insider Score</h2>
        <div className="card divide-y divide-[var(--border)]">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-4">
              <summary className="cursor-pointer font-semibold text-[15px] list-none flex items-center justify-between">
                {f.q}
                <span aria-hidden className="text-mute group-open:rotate-45 transition">+</span>
              </summary>
              <p className="text-[14px] text-mute mt-2 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <th
      className={`px-4 py-3 text-[10.5px] uppercase tracking-wider text-mute ${right ? "text-right" : center ? "text-center" : ""}`}
    >
      {children}
    </th>
  );
}

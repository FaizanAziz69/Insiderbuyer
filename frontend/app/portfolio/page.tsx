"use client";
/**
 * /portfolio — "My Portfolio" (Round-2 brief, Section 3).
 *
 * The brief's copy verbatim: 3A (headline, subheadline, free state, the
 * after-adding upgrade line), 3B (the upgrade card), 3C (the four SMS mockups
 * in a phone frame), and the 3D rules — free portfolios hold five stocks, the
 * Insider Score is blurred until the $19/month tier is live, and that tier is
 * its own Stripe subscription which can stack on top of premium.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Plus, Trash2 } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { getAuthToken, useAuth } from "@/lib/auth";
import { LoginModal } from "@/components/LoginModal";
import { StockSearch } from "@/components/nav/StockSearch";
import { PhoneFrame } from "@/components/portfolio/PhoneFrame";
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

interface PortfolioResponse {
  holdings: Holding[];
  active: boolean;
  limit: number;
}

/** WHAT YOU GET — the brief's four lines, verbatim. */
const BENEFITS = [
  "IQS score for every stock you hold — updated daily",
  "SMS alert the moment an insider files a Form 4",
  "Flag when conviction is rising OR fading at a company you own",
  "Pre-earnings insider activity alerts",
];

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;

export default function PortfolioPage() {
  const { user } = useAuth();
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState<string>("$19");

  const authed = !!user;

  const load = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/portfolio`, {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
      });
      if (res.ok) setData((await res.json()) as PortfolioResponse);
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => {
    void load();
  }, [load]);

  // The $19 figure comes from the live Stripe price, never a hardcoded one.
  useEffect(() => {
    fetch(`${API_BASE}/billing/plans`)
      .then((r) => r.json())
      .then((d) => {
        const cents = d?.portfolio?.amount;
        if (typeof cents === "number") {
          setPrice(cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);
        }
      })
      .catch(() => undefined);
  }, []);

  const add = async (ticker: string) => {
    if (!authed) {
      setLoginOpen(true);
      return;
    }
    setError(null);
    const res = await fetch(`${API_BASE}/portfolio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken() ?? ""}`,
      },
      body: JSON.stringify({ ticker }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        (Array.isArray(json?.message) ? json.message[0] : json?.message) ||
          "Could not add that stock.",
      );
      return;
    }
    setAdding(false);
    track("web_portfolio_add", { ticker });
    void load();
  };

  const remove = async (ticker: string) => {
    await fetch(`${API_BASE}/portfolio/${encodeURIComponent(ticker)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
    });
    void load();
  };

  const upgrade = async () => {
    if (!authed) {
      setLoginOpen(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    track("web_portfolio_checkout_start", { price: 19 });
    try {
      const res = await fetch(`${API_BASE}/portfolio/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken() ?? ""}`,
        },
      });
      const json = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !json.url) throw new Error(json.message || "checkout failed");
      window.location.href = json.url;
    } catch {
      setError("Checkout could not open — please try again in a moment.");
      setBusy(false);
    }
  };

  const holdings = data?.holdings ?? [];
  const count = holdings.length;
  const active = data?.active ?? false;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] sm:text-[38px] font-bold tracking-tight" style={{ letterSpacing: "-0.6px" }}>
          Your Portfolio. Scored by Insiders.
        </h1>
        <p className="text-soft text-[15px] sm:text-[16px] mt-3 max-w-2xl leading-relaxed">
          Add the stocks you own. We&apos;ll tell you what the insiders
          <br className="hidden sm:block" /> at each company are doing — and alert you the moment
          <br className="hidden sm:block" /> something changes.
        </p>
      </header>

      {/* ── FREE STATE — no stocks yet ───────────────────────────────── */}
      {count === 0 && !loading && (
        <section className="card p-8 text-center">
          <p className="text-[17px] font-semibold">Add your first stock to get started.</p>
          <div className="mt-5 max-w-sm mx-auto">
            {adding && authed ? (
              <StockSearch
                dark={false}
                placeholder="Add a ticker or company (e.g. Apple)…"
                onSelect={(r) => void add(r.symbol)}
              />
            ) : (
              <button
                type="button"
                onClick={() => (authed ? setAdding(true) : setLoginOpen(true))}
                className="btn-primary w-full justify-center"
              >
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

      {/* ── HOLDINGS ─────────────────────────────────────────────────── */}
      {count > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] font-semibold">
              You&apos;ve added {count} {count === 1 ? "stock" : "stocks"} to your portfolio.
            </p>
            {adding ? (
              <div className="w-full sm:w-72">
                <StockSearch
                  dark={false}
                  placeholder="Add a ticker or company…"
                  onSelect={(r) => void add(r.symbol)}
                />
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="btn-secondary">
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
                    <th className="px-4 py-3 text-[10.5px] uppercase tracking-wider text-mute">Stock</th>
                    <th className="px-4 py-3 text-[10.5px] uppercase tracking-wider text-mute text-right">Price</th>
                    <th className="px-4 py-3 text-[10.5px] uppercase tracking-wider text-mute text-right">Insider Score</th>
                    <th className="px-4 py-3 text-[10.5px] uppercase tracking-wider text-mute text-right">Buyers (90d)</th>
                    <th className="px-4 py-3 text-[10.5px] uppercase tracking-wider text-mute text-right">Bought (90d)</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.ticker} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-4 py-3">
                        <Link href={`/companies/${h.ticker}`} className="font-semibold text-accent">
                          {h.ticker}
                        </Link>
                        {h.name && <div className="text-[12px] text-mute">{h.name}</div>}
                      </td>
                      <td className="px-4 py-3 text-right tabular">
                        {h.price != null ? `$${h.price.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {h.locked ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[12px] font-bold select-none"
                            style={{
                              background: "var(--bg-3, rgba(120,130,150,0.14))",
                              color: "var(--text-mute)",
                              filter: "blur(0.6px)",
                            }}
                            aria-label="Insider Score locked"
                            title="Unlock with Portfolio Intelligence"
                          >
                            <Lock className="h-3 w-3" style={{ filter: "none" }} /> 00
                          </span>
                        ) : (
                          <span className="font-bold tabular">{h.iqs ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular">{h.buyers90d || "—"}</td>
                      <td className="px-4 py-3 text-right tabular">
                        {h.bought90d ? money(h.bought90d) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void remove(h.ticker)}
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
            </div>
          </div>

          {/* Free state after adding — the brief's exact lines. */}
          {!active && (
            <div className="card p-5">
              <p className="text-[15px] leading-relaxed">
                Unlock Insider Scores for all of them — and get
                <br className="hidden sm:block" /> SMS alerts when insiders make a move.
              </p>
              <button
                type="button"
                onClick={upgrade}
                disabled={busy}
                className="btn-primary mt-4"
              >
                {busy ? "Opening checkout…" : `Unlock Portfolio Intelligence — ${price}/month`}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── 3B UPGRADE CARD + 3C PHONE FRAME ─────────────────────────── */}
      {!active && (
        <section className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
          <div className="card p-6 sm:p-7">
            <h2 className="text-[22px] sm:text-[26px] font-bold tracking-tight leading-snug">
              You&apos;re 1 step away from knowing what insiders
              <br className="hidden sm:block" /> at your companies are doing.
            </h2>
            <p className="text-soft text-[15px] mt-3 leading-relaxed">
              Insider scores, cluster buy alerts, and real-time
              <br className="hidden sm:block" /> SMS notifications — for every stock in your portfolio.
            </p>

            <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-mute mt-6">
              What you get
            </p>
            <ul className="mt-3 space-y-2.5">
              {BENEFITS.map((b) => (
                <li key={b} className="flex gap-2.5 text-[14.5px] leading-relaxed">
                  <span aria-hidden style={{ color: "var(--good)" }}>✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <p className="text-[17px] font-bold mt-6">{price}/month — cancel anytime</p>
            <button
              type="button"
              onClick={upgrade}
              disabled={busy}
              className="btn-primary mt-4 w-full sm:w-auto justify-center"
            >
              {busy ? "Opening checkout…" : "Unlock My Portfolio Scores →"}
            </button>
            <p className="text-[12px] text-mute mt-3">
              30-day money-back guarantee. You keep the alerts.
            </p>
          </div>

          <PhoneFrame />
        </section>
      )}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}

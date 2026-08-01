"use client";

/**
 * Standalone "Insider Quality Score" lead-gen landing page.
 *
 * Renders without the site chrome (see BARE_ROUTES in AppShell): its own mini
 * header/footer, a real ticker search, and an email/SMS opt-in gate that
 * stores the request via POST /report-requests. Actual delivery is stubbed
 * server-side until an email/SMS provider key is configured — leads are kept
 * as 'pending' and the report renders at /report-requests/:id/preview.
 *
 * Colors come from the site theme variables (globals.css), so the page
 * follows the light/dark toggle like every other page. The Quality Score
 * section sits on --brand-surface, which stays dark in both themes.
 */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { API_BASE } from "@/lib/api";
import { Logo } from "@/components/Logo";

/* ── site theme palette ───────────────────────────────────────────── */
const INK = "var(--text)";
const SOFT = "var(--text-mute)";
const RULE = "var(--border)";
const CARD = "var(--bg-elevated)";
const PAGE = "var(--bg-3)";
const WELL = "var(--bg-3)";
const ACCENT = "var(--accent)";
const ON_ACCENT = "var(--on-accent)";
const BUY = "var(--good)";
const BUY_SOFT = "var(--good-soft)";
const BUY_STRONG = "var(--good-strong)";
const SELL = "var(--bad)";
const SELL_SOFT = "var(--bad-soft)";
const SPX = "var(--text-faint)";
const HILITE = "var(--gold)";
/* Always-dark Quality Score section (sits on the brand chrome surface). */
const DARK_CARD = "rgba(255,255,255,0.07)";
const DARK_RULE = "rgba(255,255,255,0.18)";
const DARK_TEXT = "rgba(255,255,255,0.75)";

/* ── tiny scroll-reveal helper ────────────────────────────────────── */
function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ── search + opt-in gate (the signature object) ──────────────────── */
interface SearchHit {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
}

function LookupCard() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "sending" | "done">("idle");
  const boxRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((value: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    const query = value.trim();
    if (!query) {
      setHits([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/market-stats/search?q=${encodeURIComponent(query)}&limit=6`,
        );
        const data = await res.json();
        setHits(Array.isArray(data?.rows) ? data.rows : []);
        setOpen(true);
      } catch {
        setHits([]);
        setOpen(false);
      }
    }, 220);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const choose = (s: SearchHit) => {
    setPicked(s);
    setQ(s.symbol);
    setOpen(false);
    setPhase("idle");
    setError(null);
  };

  const submit = async () => {
    if (!picked || phase === "sending") return;
    const v = contact.trim();
    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    const okPhone = /^[\d\s()+.-]{7,20}$/.test(v);
    if (channel === "email" ? !okEmail : !okPhone) {
      setError(
        channel === "email"
          ? "Please enter a valid email address."
          : "Please enter a valid phone number.",
      );
      return;
    }
    setError(null);
    setPhase("sending");
    try {
      const res = await fetch(`${API_BASE}/report-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: picked.symbol,
          companyName: picked.name,
          contact: v,
          channel,
          source: "insider-report-landing",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Something went wrong — try again.");
      }
      setPhase("done");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
    }
  };

  return (
    <div
      id="lookup"
      className="ir-glow w-full max-w-[720px] rounded-xl scroll-mt-24"
      style={{
        background: CARD,
        border: `1px solid ${RULE}`,
        borderTop: `4px solid ${HILITE}`,
      }}
    >
      <div className="px-7 pt-6 text-center">
        <h3
          className="font-heading font-extrabold text-[25px] leading-tight"
          style={{ color: INK }}
        >
          Find out what insiders are{" "}
          <em className="not-italic" style={{ color: ACCENT }}>
            really
          </em>{" "}
          doing.
        </h3>
        <p className="text-[15px] mt-1" style={{ color: SOFT }}>
          Search any stock to get its Insider Quality Score and full report.
        </p>
      </div>

      <div className="px-7 pt-5 pb-7">
        {/* search */}
        <div className="relative" ref={boxRef}>
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2"
            width="18"
            height="18"
            viewBox="0 0 20 20"
            aria-hidden="true"
            style={{ color: SOFT }}
          >
            <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M13 13l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              runSearch(e.target.value);
            }}
            placeholder="Search any stock — ticker or company name"
            aria-label="Search for a stock"
            autoComplete="off"
            className="w-full rounded-lg pl-12 pr-4 py-4 text-[16px] font-semibold uppercase placeholder:normal-case placeholder:font-medium placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            style={{
              border: "2px solid var(--border-strong)",
              background: WELL,
              color: INK,
            }}
          />
          {open && (
            <ul
              className="absolute z-30 left-0 right-0 mt-1.5 rounded-lg max-h-72 overflow-auto list-none m-0 p-0"
              style={{
                background: CARD,
                border: `1px solid var(--border-strong)`,
                boxShadow: "var(--shadow-lg, 0 18px 44px rgba(16,26,43,.22))",
              }}
              role="listbox"
            >
              {hits.length === 0 ? (
                <li className="px-4 py-3.5 text-[15px] text-center" style={{ color: SOFT }}>
                  No matches — try a ticker like AAPL or NVDA…
                </li>
              ) : (
                hits.map((s, i) => (
                  <li
                    key={`${s.symbol}-${s.exchange}`}
                    role="option"
                    aria-selected={false}
                    onClick={() => choose(s)}
                    className={`px-4 py-3 flex items-center gap-3.5 cursor-pointer text-[15px] hover:bg-[var(--accent-soft)] ${
                      i > 0 ? "border-t border-[var(--border)]" : ""
                    }`}
                  >
                    <span
                      className="font-mono font-bold text-[15px] shrink-0 min-w-[64px]"
                      style={{ color: "var(--accent)" }}
                    >
                      {s.symbol}
                    </span>
                    <span className="flex-1 truncate text-left" style={{ color: INK }}>
                      {s.name}
                    </span>
                    {s.exchange && (
                      <span
                        className="shrink-0 font-mono text-[11.5px] uppercase tracking-wide px-2 py-0.5 rounded"
                        style={{ color: SOFT, border: `1px solid ${RULE}` }}
                      >
                        {s.exchange}
                      </span>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {/* picked stock + gate */}
        {picked && (
          <div className="mt-5">
            <div
              className="flex items-center justify-between gap-4 rounded-xl px-5 py-4"
              style={{ border: `1px solid ${RULE}`, background: WELL }}
            >
              <div>
                <div className="font-mono font-semibold text-[20px]" style={{ color: INK }}>
                  {picked.symbol}
                </div>
                <div className="text-[13.5px]" style={{ color: SOFT }}>
                  {picked.name}
                </div>
              </div>
              <div className="text-right">
                <div
                  className="ir-shimmer font-heading font-extrabold text-[32px] select-none rounded-md"
                  style={{ color: INK }}
                  aria-hidden="true"
                >
                  <span style={{ filter: "blur(9px)" }}>87.1</span>
                </div>
                <div
                  className="text-[11px] uppercase tracking-wider font-mono"
                  style={{ color: SOFT }}
                >
                  🔒 Score locked
                </div>
              </div>
            </div>

            {phase !== "done" ? (
              <div className="mt-5">
                <div className="font-semibold text-[15px] mb-2.5" style={{ color: INK }}>
                  Where should we send the insider report?
                </div>
                <div
                  className="inline-flex rounded-lg overflow-hidden mb-3.5"
                  style={{ border: `1px solid ${RULE}` }}
                  role="tablist"
                >
                  {(["email", "sms"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setChannel(m);
                        setContact("");
                        setError(null);
                      }}
                      className="px-5 py-2 text-[14px] font-semibold"
                      style={
                        channel === m
                          ? { background: ACCENT, color: ON_ACCENT }
                          : { background: CARD, color: SOFT }
                      }
                    >
                      {m === "email" ? "Email" : "SMS"}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type={channel === "email" ? "email" : "tel"}
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder={channel === "email" ? "you@example.com" : "(555) 123-4567"}
                    aria-label="Email address or phone number"
                    className="flex-1 rounded-lg px-4 py-3.5 text-[16px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    style={{
                      border: "1px solid var(--border-strong)",
                      background: CARD,
                      color: INK,
                    }}
                  />
                  <button
                    type="button"
                    onClick={submit}
                    disabled={phase === "sending"}
                    className="whitespace-nowrap rounded-lg px-7 py-3.5 text-[16px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ background: ACCENT, color: ON_ACCENT }}
                  >
                    {phase === "sending" ? "Sending…" : "Get the insider report"}
                  </button>
                </div>
                {error && (
                  <p className="text-[13.5px] font-medium mt-2" style={{ color: SELL }}>
                    {error}
                  </p>
                )}
                <p className="text-[12.5px] mt-3" style={{ color: SOFT }}>
                  By requesting the report you agree to receive it by email or SMS, plus
                  occasional insider alerts. Unsubscribe anytime. Msg &amp; data rates may
                  apply.
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <span
                  className="inline-block font-mono font-semibold text-[13px] tracking-widest uppercase rounded-lg px-4 py-2 mb-4"
                  style={{ color: BUY, border: `2px solid ${BUY}` }}
                >
                  ✓ Report requested
                </span>
                <h4
                  className="font-heading font-extrabold text-[24px] mb-2"
                  style={{ color: INK }}
                >
                  Your insider report for {picked.symbol} is on its way.
                </h4>
                <p className="text-[15px] max-w-[44ch] mx-auto" style={{ color: SOFT }}>
                  Check your {channel === "email" ? "inbox" : "messages"} soon. It includes
                  the Insider Quality Score, every recent insider transaction, and what the
                  smart money is signaling.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="px-7 py-3.5 flex flex-wrap justify-between gap-2 font-mono text-[12px]"
        style={{ borderTop: `1px solid ${RULE}`, color: SOFT }}
      >
        <span>5,000+ U.S. stocks covered</span>
        <span>Data: SEC EDGAR Form 4</span>
      </div>
    </div>
  );
}

/* ── animated score gauge (always-dark section) ───────────────────── */
function ScoreGauge() {
  const ref = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState(0);
  const target = 87.1;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          if (reduced) {
            setVal(target);
            return;
          }
          const t0 = performance.now();
          const dur = 1200;
          const step = (t: number) => {
            const p = Math.min((t - t0) / dur, 1);
            setVal(target * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const full = 314;
  const offset = full - (full * val) / 100;
  return (
    <div ref={ref} className="relative w-[230px] mx-auto mb-2.5">
      <svg
        viewBox="0 0 230 130"
        className="w-full h-auto"
        role="img"
        aria-label={`Gauge showing an Insider Quality Score of ${target} out of 100`}
      >
        <path
          d="M15 120 A100 100 0 0 1 215 120"
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M15 120 A100 100 0 0 1 215 120"
          fill="none"
          stroke="#5ED49A"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={full}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center pt-8 text-center">
        <div>
          <span className="font-heading text-[58px] font-extrabold text-white leading-none">
            {val.toFixed(1)}
          </span>
          <div
            className="font-mono text-[12px] tracking-wider uppercase mt-1"
            style={{ color: DARK_TEXT }}
          >
            Insider Quality Score
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── live Form 4 feed (real data) ─────────────────────────────────── */
interface FeedRow {
  id: string;
  ticker: string | null;
  insiderName: string;
  role: string;
  rawTitle: string;
  type?: "BUY" | "SELL";
  totalValue: number;
}

function LiveFeed() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/trades?limit=5&side=all&month=1`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d?.rows) ? d.rows.slice(0, 5) : []))
      .catch(() => setRows([]));
  }, []);

  const money = (n: number) =>
    n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`;

  return (
    <div
      className="max-w-[680px] mx-auto rounded-xl overflow-hidden"
      style={{
        background: CARD,
        border: `1px solid ${RULE}`,
        boxShadow: "var(--shadow-md, 0 12px 32px rgba(16,26,43,.08))",
      }}
    >
      <div
        className="flex justify-between items-center px-5 py-3 font-mono text-[12px] uppercase tracking-wider"
        style={{ borderBottom: `1px solid ${RULE}`, color: SOFT }}
      >
        <span>
          <span
            className="inline-block w-[7px] h-[7px] rounded-full mr-2 animate-pulse"
            style={{ background: BUY }}
          />
          Latest insider transactions
        </span>
        <span>Form 4 feed</span>
      </div>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr>
            {["Ticker", "Insider", "Type", "Value"].map((h) => (
              <th
                key={h}
                className="text-left px-5 py-2.5 font-mono font-medium text-[11px] uppercase tracking-wider"
                style={{ color: SOFT, borderBottom: `1px solid ${RULE}` }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-5 py-6 text-center" style={{ color: SOFT }}>
                Loading the latest filings…
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const isBuy = r.type !== "SELL";
              return (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-5 py-3 font-mono font-semibold" style={{ color: INK }}>
                    {r.ticker || "—"}
                  </td>
                  <td className="px-5 py-3" style={{ color: INK }}>
                    {r.rawTitle || r.role || r.insiderName}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="font-mono text-[12px] font-semibold px-2 py-1 rounded-md"
                      style={
                        isBuy
                          ? { background: BUY_SOFT, color: BUY }
                          : { background: SELL_SOFT, color: SELL }
                      }
                    >
                      {isBuy ? "P — Purchase" : "S — Sale"}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono" style={{ color: INK }}>
                    {money(Number(r.totalValue) || 0)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <div
        className="px-5 py-2.5 font-mono text-[12px]"
        style={{ borderTop: `1px solid ${RULE}`, color: SOFT }}
      >
        Live data · Filed within 2 business days of trade, per SEC rules
      </div>
    </div>
  );
}

/* ── static illustrative pieces ───────────────────────────────────── */
function IndexChart() {
  return (
    <div
      className="ir-lift rounded-xl px-6 sm:px-8 pt-8 pb-6"
      style={{
        background: CARD,
        border: `1px solid ${RULE}`,
        boxShadow: "var(--shadow-sm, 0 12px 32px rgba(16,26,43,.06))",
      }}
    >
      <div className="flex justify-between items-baseline flex-wrap gap-3 mb-5">
        <div className="font-semibold text-[16px]" style={{ color: INK }}>
          Cumulative return, trailing 5 years
        </div>
        <div className="flex gap-5 flex-wrap text-[13px]" style={{ color: SOFT }}>
          {[
            ["Insider Buying Index", BUY],
            ["S&P 500", SPX],
            ["Insider Selling Index", SELL],
          ].map(([label, color]) => (
            <span key={label} className="flex items-center gap-2">
              <span className="w-[18px] h-[3px] rounded" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <svg
        viewBox="0 0 900 380"
        role="img"
        aria-label="Line chart: Insider Buying Index rising well above the S&P 500, Insider Selling Index trailing below it"
        className="w-full h-auto"
      >
        <g stroke="var(--border)" strokeWidth="1">
          {[40, 110, 180, 250, 320].map((y) => (
            <line key={y} x1="60" y1={y} x2="880" y2={y} />
          ))}
        </g>
        <g fill="var(--text-faint)" fontSize="12" fontFamily="monospace">
          <text x="50" y="44" textAnchor="end">+160%</text>
          <text x="50" y="114" textAnchor="end">+120%</text>
          <text x="50" y="184" textAnchor="end">+80%</text>
          <text x="50" y="254" textAnchor="end">+40%</text>
          <text x="50" y="324" textAnchor="end">0%</text>
          <text x="60" y="350">2021</text>
          <text x="255" y="350">2022</text>
          <text x="455" y="350">2023</text>
          <text x="655" y="350">2024</text>
          <text x="845" y="350">2025</text>
        </g>
        <path
          d="M60,320 C140,318 190,330 260,326 C340,322 400,336 470,328 C560,318 640,324 720,314 C790,306 840,304 880,298"
          fill="none"
          stroke="var(--bad)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M60,320 C150,300 200,312 270,290 C350,264 410,286 480,258 C570,224 650,232 730,204 C800,182 840,176 880,166"
          fill="none"
          stroke="var(--text-faint)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M60,320 C150,288 210,296 280,258 C360,216 420,232 490,186 C580,132 650,138 730,96 C800,62 840,56 880,44"
          fill="none"
          stroke="var(--good)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <g fontSize="12" fontWeight="600" fontFamily="monospace">
          <text x="886" y="48" fill="var(--good)">+158%</text>
          <text x="886" y="170" fill="var(--text-faint)">+89%</text>
          <text x="886" y="302" fill="var(--bad)">+13%</text>
        </g>
      </svg>
      <p className="font-mono text-[12.5px] mt-4" style={{ color: SOFT }}>
        Hypothetical illustration. Past performance does not guarantee future results.
      </p>
    </div>
  );
}

const ROOKIE_BAD = [
  ["Option exercises", " dressed up as purchases — compensation, not conviction."],
  ["Scheduled 10b5-1 plan buys", " — automatic trades set months in advance."],
  ["Token purchases", " — a $15k buy from an executive earning $4M a year."],
  ["A lone director nibbling", " — one small buy, no one else following."],
] as const;

const ROOKIE_GOOD = [
  ["Open-market buys, big for the company", " — $5M into a $300M small cap, not a $500B giant."],
  ["Clusters", " — CEO, CFO, and directors all buying within weeks of each other."],
  ["Senior conviction", " — the executives closest to the numbers, not junior insiders."],
  ["Real stake growth", " — a CFO doubling their position, not adding 1%."],
] as const;

const FACTORS = [
  ["A", "Purchase volume vs. market cap", "A $5M buy is huge for a $50M company and a rounding error for a $500B one. Size is measured relative to the company."],
  ["B", "Cluster buying", "One insider buying is good. The CEO, CFO, and multiple directors all buying within weeks is a much stronger signal."],
  ["C", "Insider role weighting", "A CEO or CFO purchase means more than a director's, which means more than a lower-level insider's."],
  ["D", "Holding change", "A CFO who doubles their stake is making a real commitment. An executive adding 1% to a huge position isn't."],
  ["+", "Analyst ratings & news sentiment", "Wall Street consensus, implied upside to price targets, and AI-scored tone of the last two weeks of coverage."],
] as const;

/* ── page ─────────────────────────────────────────────────────────── */
export default function InsiderReportLanding() {
  const eyebrow = useMemo(
    () =>
      "font-heading font-extrabold text-[13px] tracking-[.12em] uppercase mb-4",
    [],
  );

  return (
    <div style={{ background: PAGE, color: INK }} className="min-h-screen">
      {/* futuristic motion — every effect is disabled under prefers-reduced-motion */}
      <style>{`
        @keyframes ir-glow-pulse {
          0%, 100% { box-shadow: 0 16px 40px rgba(16,26,43,.12), 0 0 0 0 var(--gold-soft, rgba(255,199,0,.18)); }
          50%      { box-shadow: 0 16px 40px rgba(16,26,43,.12), 0 0 34px 4px var(--gold-soft, rgba(255,199,0,.18)); }
        }
        .ir-glow { box-shadow: 0 16px 40px rgba(16,26,43,.12); }
        @keyframes ir-gradient-move {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .ir-gradient-text {
          background: linear-gradient(90deg, var(--accent), var(--accent-2), var(--gold), var(--accent));
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        @keyframes ir-orb-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(34px, -26px) scale(1.08); }
          66%      { transform: translate(-26px, 20px) scale(0.94); }
        }
        .ir-orb {
          position: absolute; border-radius: 9999px; filter: blur(70px);
          opacity: .5; pointer-events: none;
        }
        @keyframes ir-shimmer {
          0% { transform: translateX(-160%) skewX(-18deg); }
          100% { transform: translateX(260%) skewX(-18deg); }
        }
        .ir-shimmer { position: relative; overflow: hidden; }
        .ir-shimmer::after {
          content: ""; position: absolute; top: 0; bottom: 0; width: 45%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
        }
        @keyframes ir-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
        .ir-lift { transition: transform .3s ease, box-shadow .3s ease; }
        .ir-lift:hover { transform: translateY(-4px); }
        @media (prefers-reduced-motion: no-preference) {
          .ir-glow { animation: ir-glow-pulse 3.4s ease-in-out infinite; }
          .ir-gradient-text { animation: ir-gradient-move 5s linear infinite; }
          .ir-orb { animation: ir-orb-drift 14s ease-in-out infinite; }
          .ir-shimmer::after { animation: ir-shimmer 2.8s ease-in-out infinite; }
          .ir-float { animation: ir-float 6s ease-in-out infinite; }
        }
      `}</style>
      {/* header */}
      <header
        className="sticky top-0 z-20"
        style={{ background: CARD, borderBottom: `1px solid ${RULE}` }}
      >
        <div className="max-w-[1120px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/insider-report" className="no-underline shrink-0" aria-label="Insider Buying">
            <Logo size="sm" />
          </Link>
          <nav
            className="hidden md:flex gap-7 text-[15px] font-medium"
            style={{ color: SOFT }}
          >
            <a href="#buying" className="hover:text-[var(--text)]">Buying index</a>
            <a href="#rookie" className="hover:text-[var(--text)]">The rookie mistake</a>
            <a href="#score" className="hover:text-[var(--text)]">Quality Score</a>
          </nav>
          <a
            href="#lookup"
            className="rounded-lg px-5 py-2.5 text-[15px] font-semibold no-underline hover:opacity-90"
            style={{ background: ACCENT, color: ON_ACCENT }}
          >
            Check a stock
          </a>
        </div>
      </header>

      {/* hero */}
      <section
        className="relative overflow-hidden py-14 sm:py-16"
        style={{ borderBottom: `1px solid ${RULE}` }}
      >
        {/* drifting accent orbs behind the hero */}
        <div
          className="ir-orb w-[420px] h-[420px] -top-40 -left-24"
          style={{ background: "var(--accent-soft)" }}
          aria-hidden="true"
        />
        <div
          className="ir-orb w-[360px] h-[360px] top-24 -right-28"
          style={{ background: "var(--gold-soft, rgba(255,199,0,.18))", animationDelay: "-7s" }}
          aria-hidden="true"
        />
        <div className="relative max-w-[1120px] mx-auto px-6 flex flex-col items-center gap-10">
          <div className="text-center max-w-[760px]">
            <div className={`${eyebrow} flex items-center justify-center gap-2.5`}>
              Built on SEC Form 4 filings
            </div>
            <h1 className="font-heading font-extrabold text-[clamp(36px,4.6vw,56px)] leading-[1.08] tracking-tight mb-5">
              Thousands of stocks. Pick the right ones, and you can be{" "}
              <em className="not-italic ir-gradient-text">wealthy</em>.
            </h1>
            <p className="text-[18px] sm:text-[19px] max-w-[52ch] mx-auto" style={{ color: SOFT }}>
              For over 30 years, corporate insiders buying their own stock have outperformed
              the market by <strong style={{ color: INK }}>7%+ per year</strong>.{" "}
              <span
                className="rounded-full px-3 py-0.5 font-bold"
                style={{
                  background: BUY_SOFT,
                  border: `1px solid ${BUY}`,
                  color: BUY_STRONG,
                  boxDecorationBreak: "clone",
                }}
              >
                It pays to know what stocks insiders are buying, right now.
              </span>
            </p>
          </div>
          <Reveal className="w-full flex justify-center">
            <LookupCard />
          </Reveal>
        </div>
      </section>

      {/* buying index */}
      <section id="buying" className="py-16 sm:py-20">
        <div className="max-w-[1120px] mx-auto px-6">
          <Reveal className="max-w-[680px] mb-12">
            <div className={eyebrow}>Insider Buying Index</div>
            <h2 className="font-heading font-extrabold text-[clamp(28px,3.4vw,40px)] leading-[1.12] tracking-tight mb-4">
              When insiders buy with their own money, the market tends to follow.
            </h2>
            <p className="text-[17px]" style={{ color: SOFT }}>
              Our Insider Buying Index tracks stocks with clustered open-market purchases by
              executives — measured against the S&amp;P 500.
            </p>
          </Reveal>
          <Reveal>
            <IndexChart />
          </Reveal>
          <Reveal>
            <div
              className="grid grid-cols-1 sm:grid-cols-3 gap-px rounded-xl overflow-hidden mt-7"
              style={{ background: RULE, border: `1px solid ${RULE}` }}
            >
              {[
                ["Buying index vs S&P 500", "+69 pts", BUY, "Cumulative outperformance, 5-yr illustration"],
                ["Selling index vs S&P 500", "−76 pts", SELL, "Cumulative underperformance, 5-yr illustration"],
                ["Filings tracked", "40k+/yr", INK, "Every Form 4, parsed within minutes"],
              ].map(([label, value, color, sub]) => (
                <div key={label as string} className="px-6 py-6" style={{ background: CARD }}>
                  <div
                    className="font-mono text-[11.5px] uppercase tracking-wider mb-2"
                    style={{ color: SOFT }}
                  >
                    {label}
                  </div>
                  <div
                    className="font-heading text-[34px] font-extrabold leading-none"
                    style={{ color: color as string }}
                  >
                    {value}
                  </div>
                  <div className="text-[13px] mt-2" style={{ color: SOFT }}>
                    {sub}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* rookie mistake */}
      <section id="rookie" className="py-16 sm:py-20" style={{ borderTop: `1px solid ${RULE}` }}>
        <div className="max-w-[1120px] mx-auto px-6">
          <Reveal className="max-w-[680px] mb-12">
            <div className={eyebrow}>Not all insider buying is equal</div>
            <h2 className="font-heading font-extrabold text-[clamp(28px,3.4vw,40px)] leading-[1.12] tracking-tight mb-4">
              Copying every insider buy is a{" "}
              <em className="not-italic" style={{ color: ACCENT }}>rookie mistake</em>.
            </h2>
            <p className="text-[17px]" style={{ color: SOFT }}>
              Most insider transactions are noise — routine, scheduled, or too small to mean
              anything. The signal is in <strong style={{ color: INK }}>which</strong> insiders
              buy, <strong style={{ color: INK }}>how much</strong>, and{" "}
              <strong style={{ color: INK }}>whether they&apos;re buying together</strong>.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
            {[
              { tag: "Noise — the rookie trade", title: `"An insider bought. I'm in."`, items: ROOKIE_BAD, good: false },
              { tag: "Signal — what actually predicts returns", title: `"The people who know best are loading up."`, items: ROOKIE_GOOD, good: true },
            ].map((card) => (
              <Reveal key={card.tag}>
                <div
                  className="ir-lift rounded-xl p-7 h-full"
                  style={{
                    background: CARD,
                    border: `1px solid ${RULE}`,
                    borderTop: `4px solid ${card.good ? BUY : SELL}`,
                  }}
                >
                  <span
                    className="inline-block font-mono text-[12px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md mb-4"
                    style={
                      card.good
                        ? { background: BUY_SOFT, color: BUY }
                        : { background: SELL_SOFT, color: SELL }
                    }
                  >
                    {card.tag}
                  </span>
                  <h3 className="font-heading font-extrabold text-[24px] leading-tight mb-3">
                    {card.title}
                  </h3>
                  <ul className="list-none m-0 p-0">
                    {card.items.map(([b, rest]) => (
                      <li
                        key={b}
                        className="py-3 border-t border-[var(--border)] text-[15px] flex gap-3"
                        style={{ color: SOFT }}
                      >
                        <span
                          className="font-mono font-semibold shrink-0"
                          style={{ color: card.good ? BUY : SELL }}
                        >
                          {card.good ? "✓" : "✕"}
                        </span>
                        <span>
                          <strong style={{ color: INK }}>{b}</strong>
                          {rest}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="mt-9 max-w-[760px] text-[17px]" style={{ color: SOFT }}>
              Separating the two by hand means reading thousands of filings.{" "}
              <strong style={{ color: INK }}>So we score every stock instead.</strong>
            </p>
          </Reveal>
        </div>
      </section>

      {/* quality score — sits on the brand chrome surface, dark in both themes */}
      <section
        id="score"
        className="py-16 sm:py-20"
        style={{
          background: "var(--brand-surface)",
          borderTop: "1px solid var(--brand-surface-border)",
        }}
      >
        <div className="max-w-[1120px] mx-auto px-6">
          <Reveal className="max-w-[680px] mb-12">
            <div className={`${eyebrow}`} style={{ color: HILITE }}>New</div>
            <h2 className="font-heading font-extrabold text-white text-[clamp(28px,3.4vw,40px)] leading-[1.12] tracking-tight mb-4">
              The Insider Quality Score. Every stock, rated 0–99.
            </h2>
            <p className="text-[17px]" style={{ color: DARK_TEXT }}>
              One number that measures the size, intensity, and significance of insider
              buying — so you never mistake noise for conviction again.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_72px_1fr] items-center">
            <Reveal>
              <div className="grid gap-3.5">
                {FACTORS.map(([id, title, desc]) => (
                  <div
                    key={id}
                    className="rounded-xl px-5 py-4 flex gap-4 items-start"
                    style={{
                      background: id === "+" ? "transparent" : DARK_CARD,
                      border: `1px ${id === "+" ? "dashed" : "solid"} ${DARK_RULE}`,
                    }}
                  >
                    <span
                      className="font-mono font-semibold text-[13px] rounded-md w-7 h-7 grid place-items-center shrink-0 mt-0.5"
                      style={{ color: HILITE, border: `1px solid ${DARK_RULE}` }}
                    >
                      {id}
                    </span>
                    <div>
                      <h4 className="text-[15.5px] font-semibold text-white mb-0.5">{title}</h4>
                      <p className="text-[13.5px] leading-relaxed" style={{ color: DARK_TEXT }}>
                        {desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
            <div
              className="grid place-items-center py-3 rotate-90 lg:rotate-0"
              style={{ color: DARK_RULE }}
              aria-hidden="true"
            >
              <svg width="40" height="40" viewBox="0 0 40 40">
                <path
                  d="M4 20h26M22 10l10 10-10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <Reveal>
              <div
                className="ir-float rounded-xl px-8 py-9 text-center"
                style={{ background: DARK_CARD, border: `1px solid ${DARK_RULE}` }}
              >
                <ScoreGauge />
                <div className="font-mono text-[13px] mb-5" style={{ color: HILITE }}>
                  STRONG INSIDER CONVICTION
                </div>
                <div className="flex justify-center gap-2.5 flex-wrap">
                  {[
                    ["92.3", "Elite", "#5ED49A"],
                    ["87.5", "Strong", "#5ED49A"],
                    ["61.0", "Mixed", "var(--gold)"],
                    ["28.4", "Weak", "#E98A78"],
                  ].map(([n, label, color]) => (
                    <span
                      key={label as string}
                      className="font-mono text-[13px] font-semibold px-3 py-1.5 rounded-md"
                      style={{ border: `1px solid ${DARK_RULE}`, color: DARK_TEXT }}
                    >
                      <b style={{ color: color as string }}>{n}</b> {label}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <p className="mt-7 text-center text-[13px]" style={{ color: DARK_TEXT }}>
              Higher score = stronger insider conviction — even if the share price is falling.
              Scores update continuously as new Form 4 filings arrive.{" "}
              <Link href="/methodology" style={{ color: HILITE }}>
                Read the full methodology →
              </Link>
            </p>
          </Reveal>
        </div>
      </section>

      {/* live feed + closing CTA */}
      <section id="feed" className="py-16 sm:py-20" style={{ borderTop: `1px solid ${RULE}` }}>
        <div className="max-w-[1120px] mx-auto px-6">
          <Reveal className="text-center max-w-[680px] mx-auto mb-12">
            <div className={`${eyebrow} flex items-center justify-center gap-2.5`}>
              <span className="w-7 h-px" style={{ background: SOFT }} />
              Straight from the source
            </div>
            <h2 className="font-heading font-extrabold text-[clamp(28px,3.4vw,40px)] leading-[1.12] tracking-tight mb-4">
              Insiders are filing right now.
            </h2>
            <p className="text-[17px]" style={{ color: SOFT }}>
              Every trade below was disclosed to the SEC within two business days of
              execution. The only question is whether you see it in time.
            </p>
          </Reveal>
          <Reveal>
            <LiveFeed />
          </Reveal>
          <Reveal className="text-center mt-10">
            <a
              href="#lookup"
              className="inline-block rounded-lg px-8 py-4 text-[16px] font-semibold no-underline hover:opacity-90"
              style={{ background: ACCENT, color: ON_ACCENT }}
            >
              Check your stock&apos;s Insider Score →
            </a>
            <p className="text-[13px] mt-3.5" style={{ color: SOFT }}>
              Free report by email or SMS · No card required
            </p>
          </Reveal>
        </div>
      </section>

      {/* footer */}
      <footer className="py-9" style={{ borderTop: `1px solid ${RULE}` }}>
        <div
          className="max-w-[1120px] mx-auto px-6 flex justify-between gap-5 flex-wrap text-[13px]"
          style={{ color: SOFT }}
        >
          <span>
            © 2026 Insider Buying. For informational purposes only — not investment advice.
          </span>
          <span className="font-mono">Data source: SEC EDGAR Form 4 filings</span>
        </div>
      </footer>
    </div>
  );
}

"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, CheckCircle2, Clock, Crown, DollarSign, Lock, Mail, ShieldCheck } from "lucide-react";
import {
  API_BASE,
  TradesResponse,
  TradeRow,
  fetcher,
  formatCurrency,
  formatRelative,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { ToolIntro } from "@/components/ToolIntro";
import { ComplianceFooter } from "@/components/ComplianceFooter";
import { usePremium } from "@/components/premium/PremiumContext";
import { PremiumValue } from "@/components/premium/PremiumValue";
import { PremiumRowWall } from "@/components/premium/PremiumRowWall";
import { MaskedCell } from "@/components/premium/MaskedCell";
import { SUBSCRIBE_HREF } from "@/lib/funnel";
import { track } from "@/lib/analytics";

/**
 * /alerts — landing page (client 2026-09-08: "Redo this page — paygate
 * alerts and show 3-5, make this like a landing page").
 *
 * Structure: hero with the email form → what an alert contains → a rendered
 * sample of the real email → the live feed with FREE_ALERTS rows open and
 * the rest as blurred decoys behind the shared wall → FAQ → compliance.
 *
 * The promise on this page is exactly what the engine sends (see
 * backend/src/insider-alerts): CEO/CFO open-market buys and $1M+ open-market
 * buys, emailed within hours of the Form 4, each with its Insider Score. The
 * copy reads the engine's status so it can never claim delivery is live while
 * the switch is off.
 */
const BIG_BUY = 1_000_000;
const FREE_ALERTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

function alertTags(t: TradeRow): string[] {
  if (t.type === "SELL") return [];
  const sym = (t.ticker || "").trim().toUpperCase();
  if (!sym || sym === "N/A" || sym === "NONE") return [];
  // A purchase with no dollar value (a $0 line, a missing price) is not an
  // alert — the engine never mails one, and "CFO bought $0" is not a signal.
  if (!(Number(t.totalValue) > 0)) return [];
  const tags: string[] = [];
  if (["CEO", "CFO", "COO"].includes(t.role)) tags.push("EXEC BUY");
  if (Number(t.totalValue) >= BIG_BUY) tags.push("BIG BUY");
  return tags;
}

const TAG_STYLE: Record<string, { bg: string; fg: string }> = {
  "EXEC BUY": { bg: "color-mix(in srgb, var(--accent) 16%, transparent)", fg: "var(--accent)" },
  "BIG BUY": { bg: "color-mix(in srgb, var(--good) 16%, transparent)", fg: "var(--good)" },
};

/** Fixed decoys for the locked rows — the real ticker/insider never render. */
const DECOYS: Array<[string, string, string, string]> = [
  ["ACME", "Acme Holdings Inc", "J. Whitfield", "CEO"],
  ["NRTH", "Northline Energy Corp", "M. Okafor", "CFO"],
  ["BLUE", "Bluewater Therapeutics", "S. Lindqvist", "Director"],
  ["VNTG", "Vantage Semiconductor", "R. Castellano", "10% Owner"],
  ["HRBR", "Harbor Financial Group", "A. Nakamura", "CEO"],
  ["SLST", "Solstice Biosciences", "D. Achterberg", "CFO"],
  ["PNCL", "Pinnacle Logistics Inc", "K. Moreau", "COO"],
  ["GRNF", "Greenfield Materials", "T. Balogun", "Director"],
];

interface AlertStatus {
  sendingEnabled: boolean;
  filingsAlerted?: number;
  lastRunAt?: string | null;
  rules?: { bigBuyUsd?: number; execRoles?: string; lookbackHours?: number };
}

const FAQ = [
  {
    q: "What triggers an alert?",
    a: "Two things, straight from the SEC Form 4 record: an open-market purchase by a CEO or CFO, and any open-market purchase of $1 million or more. Awards, option exercises, tax withholding and 10b5-1 plan trades are not purchases and never trigger one.",
  },
  {
    q: "How fast is it?",
    a: "Filings are ingested continuously through the trading day. A qualifying buy is emailed within hours of the Form 4 hitting EDGAR — usually the same session.",
  },
  {
    q: "What is in the email?",
    a: "The ticker and company, who bought and their role, shares and price, the dollar value, the company's Insider Score, and a link to the filing and the company page. One buy per email, no digests.",
  },
  {
    q: "Is it free?",
    a: "The email alerts are free — enter your address above. The full alert history on this page, with every ticker and insider named, is part of Insider Access.",
  },
];

export default function AlertsPage() {
  const { unlocked } = usePremium();
  const locked = !unlocked;
  const { data: status } = useSWR<AlertStatus>(`${API_BASE}/insider-alerts/status`, fetcher, {
    revalidateOnFocus: false,
  });
  const { data, isLoading } = useSWR<TradesResponse>(`${API_BASE}/trades?limit=500`, fetcher, {
    refreshInterval: 2 * 60_000,
    revalidateOnFocus: false,
  });

  const alerts = useMemo(() => {
    return (data?.rows || [])
      .map((t) => ({ t, tags: alertTags(t) }))
      .filter((x) => x.tags.length > 0)
      .sort((a, b) => new Date(b.t.transactionDate).getTime() - new Date(a.t.transactionDate).getTime());
  }, [data]);
  const freeRows = locked ? alerts.slice(0, FREE_ALERTS) : alerts;
  const lockedRows = locked ? alerts.slice(FREE_ALERTS, FREE_ALERTS + 10) : [];
  const sample = alerts[0];
  const live = status?.sendingEnabled === true;

  return (
    <div className="w-full space-y-12">
      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--bg-2)) 0%, var(--bg-2) 60%)",
          border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--border-strong))",
        }}
      >
        <div>
          <div className="flex items-center gap-2 text-mute text-sm mb-2">
            <Bell className="h-4 w-4 text-accent" />
            <span className="font-mono uppercase tracking-wider text-[11px]">Insider Alerts</span>
            {live && <span className="live-dot live-dot-good ml-1 text-faint">live</span>}
          </div>
          <h1 className="text-[30px] sm:text-[40px] font-bold tracking-tight leading-[1.05]">
            Know when a CEO buys their own stock — within hours, not weeks.
          </h1>
          <p className="text-soft text-[15px] sm:text-[16px] mt-4 max-w-xl leading-relaxed">
            Every CEO, CFO and $1M+ open-market purchase, pulled from the SEC filing the moment it lands and
            emailed to you with the company&rsquo;s Insider Score. No digests, no noise — one buy per email.
          </p>
          <div className="mt-6">
            <AlertSignup live={live} />
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-mute">
            <li className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-accent" /> Within hours of the Form 4</li>
            <li className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-accent" /> Straight from SEC EDGAR</li>
            <li className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-accent" /> Free · unsubscribe anytime</li>
          </ul>
          {typeof status?.filingsAlerted === "number" && status.filingsAlerted > 0 && (
            <p className="text-[12px] text-faint mt-3 tabular">
              {status.filingsAlerted.toLocaleString()} alerts sent so far
              {status.lastRunAt ? ` · last check ${formatRelative(status.lastRunAt)}` : ""}
            </p>
          )}
        </div>

        {/* Sample of the real email, built from the latest qualifying buy. */}
        <SampleEmail sample={sample} />
      </section>

      {/* ── WHAT YOU GET ─────────────────────────────────────────── */}
      <section>
        <ToolIntro tagline="The only alert that scores the signal, not just the transaction.">
          Most investors read about insider buying days or weeks later. Each alert arrives with the Insider Score
          — our 0–100 read on how much conviction sits behind the company&rsquo;s buying — so you know in one glance
          whether the purchase is routine or unusual.
        </ToolIntro>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          {[
            { icon: Crown, title: "CEO & CFO buys", text: "Open-market purchases by the two people who know the numbers best." },
            { icon: DollarSign, title: "$1M+ buys", text: "Any insider putting seven figures of their own money in, whatever their title." },
            { icon: CheckCircle2, title: "Scored, not just reported", text: "Each alert carries the company's Insider Score and the signals behind it." },
          ].map((c) => (
            <div key={c.title} className="card p-5">
              <c.icon className="h-5 w-5 text-accent" />
              <div className="font-bold text-[15px] mt-3">{c.title}</div>
              <p className="text-[13.5px] text-mute mt-1 leading-relaxed">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── LIVE FEED (5 open, rest gated) ───────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight">Latest alerts</h2>
            <p className="text-[13px] text-mute">
              {locked
                ? `The ${FREE_ALERTS} most recent qualifying buys are open. The full history is part of Insider Access.`
                : `${alerts.length} qualifying buys in the current feed.`}
            </p>
          </div>
          <span className="text-[12px] text-mute tabular">{alerts.length} alerts</span>
        </div>

        {isLoading && alerts.length === 0 ? (
          <div className="card p-10 text-center text-mute">Loading insider alerts…</div>
        ) : alerts.length === 0 ? (
          <div className="card p-10 text-center text-mute">No alert-worthy buys in the feed yet.</div>
        ) : (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-[var(--border)]">
              {freeRows.map(({ t, tags }) => (
                <li key={t.id}>
                  <Link
                    href={t.ticker ? `/companies/${encodeURIComponent(t.ticker)}` : "#"}
                    className="p-3.5 flex items-center gap-3 hover:bg-[var(--accent-soft)] transition"
                  >
                    <CompanyLogo ticker={t.ticker || ""} name={t.companyName} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[13px] font-bold text-accent">{t.ticker || "—"}</span>
                        {tags.map((tag) => (
                          <Tag key={tag} tag={tag} />
                        ))}
                      </div>
                      <div className="text-[12px] text-soft truncate">
                        <span className="font-semibold">{t.insiderName}</span>
                        <span className="text-mute"> · {t.role} · {t.companyName}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[14px] font-bold tabular text-good">{formatCurrency(Number(t.totalValue))}</div>
                      <div className="text-[11px] text-mute">{formatRelative(t.transactionDate)}</div>
                    </div>
                  </Link>
                </li>
              ))}
              {lockedRows.map(({ t, tags }, i) => {
                const d = DECOYS[i % DECOYS.length];
                return (
                  <li key={`locked-${i}`} className="p-3.5 flex items-center gap-3">
                    <span className="h-9 w-9 rounded-lg flex-shrink-0" style={{ background: "var(--bg-3)" }} />
                    <div className="min-w-0 flex-1">
                      <MaskedCell label="the full alert history" lock>
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[13px] font-bold">{d[0]}</span>
                          {tags.map((tag) => (
                            <Tag key={tag} tag={tag} />
                          ))}
                        </span>
                        <span className="block text-[12px] text-soft truncate">
                          <span className="font-semibold">{d[2]}</span>
                          <span className="text-mute"> · {d[3]} · {d[1]}</span>
                        </span>
                      </MaskedCell>
                    </div>
                    {/* Value and timing stay visible — the reader sees what is behind the wall. */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-[14px] font-bold tabular text-good">{formatCurrency(Number(t.totalValue))}</div>
                      <div className="text-[11px] text-mute">{formatRelative(t.transactionDate)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {locked && alerts.length > FREE_ALERTS && (
              <PremiumRowWall
                label="Insider Alerts"
                total={alerts.length}
                bullets={[
                  "Every qualifying buy in the feed, ticker and insider named",
                  "The Insider Score on each alert and each company",
                  "Top Insider Buys, rankings and every other Insider Access signal",
                ]}
              />
            )}
          </div>
        )}
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-[22px] font-bold tracking-tight mb-3">Questions</h2>
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

      <div className="card p-6 text-center">
        <p className="text-[17px] font-bold">Get the next alert before the market reads the filing.</p>
        <div className="mt-4 max-w-md mx-auto">
          <AlertSignup live={live} compact />
        </div>
        {locked && (
          <p className="text-[12.5px] text-mute mt-4">
            Want the full history and every Insider Score?{" "}
            <Link href={SUBSCRIBE_HREF} className="font-semibold text-accent inline-flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" /> Unlock Insider Access
            </Link>
          </p>
        )}
      </div>

      <ComplianceFooter
        extra={
          <>
            Alerts describe filings, not recommendations.{" "}
            {live
              ? "Email delivery is live."
              : "Email delivery is being set up — signups are stored now and start receiving alerts once it is on."}{" "}
          </>
        }
      />
    </div>
  );
}

function Tag({ tag }: { tag: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
      style={{ background: TAG_STYLE[tag].bg, color: TAG_STYLE[tag].fg }}
    >
      {tag === "EXEC BUY" ? <Crown className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
      {tag}
    </span>
  );
}

/** What the real email looks like, rendered from the latest qualifying buy.
 *  The Insider Score line is the one paygated figure, so it renders through
 *  <PremiumValue> like everywhere else. */
function SampleEmail({ sample }: { sample?: { t: TradeRow; tags: string[] } }) {
  const t = sample?.t;
  return (
    <div className="card overflow-hidden shadow-xl" aria-label="Sample alert email">
      <div className="px-4 py-2.5 text-[11px] text-mute flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-3)" }}>
        <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> alerts@insiderbuying.com</span>
        <span>{t ? formatRelative(t.transactionDate) : "just now"}</span>
      </div>
      <div className="p-5">
        <div className="text-[11px] font-mono uppercase tracking-wider text-accent">Insider buy alert</div>
        <div className="text-[18px] font-bold mt-1">
          {t ? `${t.ticker} — ${t.role} bought ${formatCurrency(Number(t.totalValue))}` : "TICKER — CEO bought $1.2M"}
        </div>
        <div className="text-[13px] text-soft mt-1">
          {t ? `${t.insiderName} · ${t.companyName}` : "Insider name · Company"}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-[13px]">
          <dt className="text-mute">Transaction</dt>
          <dd className="font-semibold text-right">Open-market purchase</dd>
          <dt className="text-mute">Value</dt>
          <dd className="font-semibold text-right tabular">{t ? formatCurrency(Number(t.totalValue)) : "—"}</dd>
          <dt className="text-mute">Insider Score</dt>
          <dd className="font-semibold text-right"><PremiumValue label="Insider Score"><span>{t ? "—" : "—"}</span></PremiumValue></dd>
          <dt className="text-mute">Filed</dt>
          <dd className="font-semibold text-right">{t ? formatRelative(t.transactionDate) : "—"}</dd>
        </dl>
        <div className="mt-4 text-[12.5px] text-accent font-semibold">View the Form 4 → · Company page →</div>
      </div>
    </div>
  );
}

function AlertSignup({ live, compact = false }: { live: boolean; compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "alerts" }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      track("web_alerts_signup", { live });
      setDone(true);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="text-[14px] font-semibold text-good inline-flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" /> You&rsquo;re on the list — your welcome email is on its way, and the next
        qualifying buy will follow.
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1.5">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email address"
          aria-invalid={!!error}
          className="px-3.5 py-2.5 rounded-md text-[14px] flex-1"
          style={{
            background: "var(--bg-1)",
            border: error ? "1px solid var(--bad)" : "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
        <button
          type="submit"
          disabled={busy}
          className="px-5 py-2.5 rounded-md text-[14px] font-bold whitespace-nowrap"
          style={{ background: "var(--gold)", color: "#1a1300" }}
        >
          {busy ? "…" : compact ? "Get alerts" : "Get free insider alerts"}
        </button>
      </div>
      {error && (
        <p className="text-left text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </form>
  );
}

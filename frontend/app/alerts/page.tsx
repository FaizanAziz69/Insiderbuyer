"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, Crown, DollarSign, Users } from "lucide-react";
import {
  API_BASE,
  TradesResponse,
  TradeRow,
  fetcher,
  formatCurrency,
  formatRelative,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";

const BIG_BUY = 1_000_000; // $1M+ counts as a "big buy" alert
type Filter = "all" | "exec" | "big";

// Shared client-side email check: require a local part, a domain, and a TLD.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

/** Classify a trade into the alert types that matter. Returns null if it's
 *  not alert-worthy (keeps the feed high-signal). */
function alertTags(t: TradeRow): string[] {
  if (t.type === "SELL") return [];
  const tags: string[] = [];
  if (["CEO", "CFO", "COO"].includes(t.role)) tags.push("EXEC BUY");
  if (Number(t.totalValue) >= BIG_BUY) tags.push("BIG BUY");
  return tags;
}

const TAG_STYLE: Record<string, { bg: string; fg: string }> = {
  "EXEC BUY": { bg: "color-mix(in srgb, var(--accent) 16%, transparent)", fg: "var(--accent)" },
  "BIG BUY": { bg: "color-mix(in srgb, var(--good) 16%, transparent)", fg: "var(--good)" },
};

export default function AlertsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading } = useSWR<TradesResponse>(
    `${API_BASE}/trades?limit=500`,
    fetcher,
    { refreshInterval: 2 * 60_000, revalidateOnFocus: false },
  );

  const alerts = useMemo(() => {
    const rows = (data?.rows || [])
      .map((t) => ({ t, tags: alertTags(t) }))
      .filter((x) => x.tags.length > 0);
    const byFilter = rows.filter((x) => {
      if (filter === "exec") return x.tags.includes("EXEC BUY");
      if (filter === "big") return x.tags.includes("BIG BUY");
      return true;
    });
    return byFilter.sort(
      (a, b) =>
        new Date(b.t.transactionDate).getTime() - new Date(a.t.transactionDate).getTime(),
    );
  }, [data, filter]);

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Bell className="h-4 w-4 text-accent" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Insider Alerts</span>
        </div>
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight">
          Insider Trade Alerts
        </h1>
        <p className="text-mute text-[14px] mt-2 max-w-3xl leading-relaxed">
          A live, high-signal feed of the insider buys worth knowing about —
          CEO/CFO/COO purchases and large ($1M+) open-market buys, newest first,
          straight from SEC Form 4 filings. Subscribe below to get these by email.
        </p>
      </header>

      {/* Email signup — functional (stored via /subscribers) */}
      <AlertSignup />

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { k: "all", label: "All alerts" },
            { k: "exec", label: "CEO / CFO buys" },
            { k: "big", label: "Big buys ($1M+)" },
          ] as { k: Filter; label: string }[]
        ).map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
            style={{
              background: filter === f.k ? "var(--accent)" : "var(--bg-2)",
              color: filter === f.k ? "#fff" : "var(--text-soft)",
              border: "1px solid var(--border-strong)",
            }}
          >
            {f.label}
          </button>
        ))}
        <span className="text-[12px] text-mute ml-1">{alerts.length} alerts</span>
      </div>

      <AdSlot slot="leaderboard" seed="alerts-top" />

      {isLoading && alerts.length === 0 ? (
        <div className="card p-10 text-center text-mute">Loading insider alerts…</div>
      ) : alerts.length === 0 ? (
        <div className="card p-10 text-center text-mute">No alert-worthy buys in the feed yet.</div>
      ) : (
        <div className="space-y-2.5">
          {alerts.map(({ t, tags }) => (
            <Link
              key={t.id}
              href={t.ticker ? `/companies/${encodeURIComponent(t.ticker)}` : "#"}
              className="card p-3.5 flex items-center gap-3 hover:border-[var(--accent)] transition"
              style={{ borderColor: "var(--border)" }}
            >
              <CompanyLogo ticker={t.ticker || ""} name={t.companyName} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[13px] font-bold text-accent">
                    {t.ticker || "—"}
                  </span>
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: TAG_STYLE[tag].bg, color: TAG_STYLE[tag].fg }}
                    >
                      {tag === "EXEC BUY" ? <Crown className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="text-[12px] text-soft truncate">
                  <span className="font-semibold">{t.insiderName}</span>
                  <span className="text-mute"> · {t.role} · {t.companyName}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[14px] font-bold tabular text-good">
                  {formatCurrency(Number(t.totalValue))}
                </div>
                <div className="text-[11px] text-mute">{formatRelative(t.transactionDate)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-[11px] text-faint">
        Source: live SEC Form 4 open-market purchases. Email/Telegram delivery is
        rolling out — signups are stored now and will receive alerts once delivery
        is live. Informational only, not financial advice.
      </p>
    </div>
  );
}

function AlertSignup() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  function validateEmail() {
    if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address.");
      return false;
    }
    setEmailError(null);
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "alerts" }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setDone(true);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--bg-2)) 0%, var(--bg-2) 100%)",
        border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--border-strong))",
      }}
    >
      <div className="flex items-center gap-2 flex-1">
        <Users className="h-5 w-5 text-accent" />
        <div className="text-[13px]">
          <div className="font-bold">Get these alerts by email</div>
          <div className="text-mute text-[12px]">CEO/CFO &amp; big-buy alerts in your inbox.</div>
        </div>
      </div>
      {done ? (
        <div className="text-[13px] font-semibold text-good">You&rsquo;re subscribed ✓</div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold" style={{ color: "var(--text-soft)" }}>
            Email address <span style={{ color: "var(--bad)" }}>*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={validateEmail}
              placeholder="you@email.com"
              aria-invalid={!!emailError}
              className="px-3 py-2 rounded-md text-[13px] w-52"
              style={{
                background: "var(--bg-1)",
                border: emailError ? "1px solid var(--bad)" : "1px solid var(--border-strong)",
                color: "var(--text)",
              }}
            />
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-md text-[13px] font-bold whitespace-nowrap"
              style={{ background: "var(--gold)", color: "#1a1300" }}
            >
              {busy ? "…" : "Subscribe"}
            </button>
          </div>
          {(emailError || error) && (
            <p className="text-left text-[12px]" style={{ color: "var(--bad)" }}>
              {emailError || error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

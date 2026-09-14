"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { PromoterScoreCell } from "@/components/promoter/PromoterScoreCell";
import { SpendSparkline } from "@/components/promoter/SpendSparkline";

/**
 * Workstream F §2.5 — the per-issuer view: "current IR contracts, spend
 * history sparkline, score".
 *
 * Every figure here links back to the news release it was read from. That is
 * not decoration: §2.5 anticipates that "IR firms will dispute numbers", and
 * the fastest answer to a dispute is the issuer's own disclosure. Rows whose
 * numbers came from a model rather than the pattern parser say so.
 */

interface Contract {
  id: number;
  providerName: string | null;
  startDate: string | null;
  endDate: string | null;
  termMonths: number | null;
  monthlyFee: number | null;
  totalValue: number | null;
  currency: string | null;
  monthlyFeeCad: number | null;
  totalValueCad: number | null;
  optionsGranted: number | null;
  optionStrike: number | null;
  noSecurityCompensation: boolean;
  armsLength: boolean | null;
  status: string;
  kind: string;
  confidence: number;
  reviewed: boolean;
  provenance: Record<string, string>;
  source: { url: string; headline: string; publishedAt: string | null };
  performance: {
    startPrice: number | null;
    priceNow: number | null;
    pct30d: number | null;
    pct90d: number | null;
    pctToDate: number | null;
    note: string | null;
  } | null;
}

interface Payload {
  ticker: string;
  issuer: { name: string | null; exchange: string | null; marketCap: number | null; sector: string | null; fmpSymbol: string | null } | null;
  current: { quarter: string; spend: number; score: number | null; active_contracts: number; spend_per_mcap_bps: number | null; qoq_change: number | null } | null;
  history: Array<{ quarter: string; spend: number; score: number | null; active_contracts: number }>;
  contracts: Contract[];
}

function money(v: number | null, ccy = "CAD"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sym = ccy === "USD" ? "US$" : ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "C$";
  if (v >= 1e6) return `${sym}${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${sym}${(v / 1e3).toFixed(1)}K`;
  return `${sym}${Math.round(v)}`;
}

/** Postgres `date` columns come back as timestamps once they have been
 *  through JSON, so a start date rendered raw reads "2026-06-08T00:00:00.000Z".
 *  UI date chips use the short register here, not the prose house style. */
function day(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** The provenance map keys are column names; a reader should not have to
 *  decode "totalValue" to learn that a figure was arithmetic, not disclosed. */
function derivedLabel(fields: string[]): string {
  const names: Record<string, string> = {
    totalValue: "Contract value",
    monthlyFee: "Monthly fee",
    termMonths: "Term",
  };
  const listed = fields.map((f) => names[f] ?? f);
  const what = listed.length === 1 ? listed[0] : listed.join(" and ");
  return `${what} calculated from the other figures, not stated in the release`;
}

function signed(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
}

/**
 * What the share price did after this contract began.
 *
 * This is the whole editorial position (§2.6). We do not say whether paying
 * for promotion is a good sign or a bad one — we show what happened next and
 * let the reader decide. Where we have no prices for the listing it says so
 * outright, because a dash here would read as a flat return.
 */
function PerformanceRow({ perf }: { perf: Contract["performance"] }) {
  if (!perf) return null;
  const cells: Array<[string, number | null]> = [
    ["30 days", perf.pct30d],
    ["90 days", perf.pct90d],
    ["Since", perf.pctToDate],
  ];
  const any = cells.some(([, v]) => v != null);
  return (
    <div className="mt-2.5 pt-2.5" style={{ borderTop: "1px dashed var(--border)" }}>
      <div className="text-[10.5px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-mute)" }}>
        Share price after this contract began
      </div>
      {any ? (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {cells.map(([label, v]) => (
            <span key={label} className="text-[12.5px]">
              <span style={{ color: "var(--text-mute)" }}>{label} </span>
              <span
                className="tabular font-bold"
                style={{ color: v == null ? "var(--text-mute)" : v > 0 ? "var(--good)" : v < 0 ? "var(--bad)" : "var(--text)" }}
              >
                {signed(v)}
              </span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[12px] m-0" style={{ color: "var(--text-mute)" }}>
          {perf.note || "No price data for this listing."}
        </p>
      )}
    </div>
  );
}

const STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "var(--good)" },
  terminated: { label: "Terminated", color: "var(--bad)" },
  expired: { label: "Expired", color: "var(--text-mute)" },
};

export default function IssuerPromoterPage({ ticker }: { ticker: string }) {
  const { data, isLoading, error } = useSWR<Payload>(`${API_BASE}/promoter/issuer/${ticker}`, fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return <div className="max-w-[980px] mx-auto px-4 py-10 text-[13px] text-mute">Loading disclosed agreements…</div>;
  }
  if (error || !data) {
    return (
      <div className="max-w-[980px] mx-auto px-4 py-10">
        <Link href="/promoter-score" className="text-accent text-[13px] font-semibold hover:underline">
          ← Promoter Score
        </Link>
        <p className="mt-4 text-[14px]" style={{ color: "var(--text-soft)" }}>
          We have no disclosed investor-relations agreements for <strong>{ticker}</strong>. That means none has been
          announced in the releases we read — not that the company has none.
        </p>
      </div>
    );
  }

  const active = data.contracts.filter((c) => c.status === "active");

  return (
    <div className="max-w-[980px] mx-auto px-4 py-6">
      <Link href="/promoter-score" className="inline-flex items-center gap-1.5 text-accent text-[12.5px] font-semibold hover:underline mb-3">
        <ArrowLeft size={14} /> Promoter Score
      </Link>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-extrabold leading-none" style={{ color: "var(--text)" }}>
            {data.ticker}
          </h1>
          {data.issuer?.exchange ? (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-mute)" }}>
              {data.issuer.exchange}
            </span>
          ) : null}
          {data.current ? <PromoterScoreCell score={data.current.score} /> : null}
        </div>
        <p className="text-[14px] mt-1" style={{ color: "var(--text-soft)" }}>
          {data.issuer?.name || "—"}
          {data.issuer?.sector ? <span style={{ color: "var(--text-mute)" }}> · {data.issuer.sector}</span> : null}
        </p>
      </header>

      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Stat label="Spend this quarter" value={money(data.current?.spend ?? null)} sub={data.current?.quarter} />
        <Stat
          label="Spend / market cap"
          value={data.current?.spend_per_mcap_bps == null ? "—" : `${data.current.spend_per_mcap_bps.toFixed(1)} bps`}
          sub={data.issuer?.marketCap ? `cap ${money(data.issuer.marketCap)}` : "no market cap on file"}
        />
        <Stat label="Active providers" value={String(active.length)} sub={`${data.contracts.length} disclosed in total`} />
        <Stat
          label="vs last quarter"
          value={data.current?.qoq_change == null ? "—" : `${data.current.qoq_change > 0 ? "+" : ""}${(data.current.qoq_change * 100).toFixed(0)}%`}
        />
      </div>

      <SpendSparkline history={data.history} />

      <h2 className="text-[16px] font-bold mt-6 mb-2" style={{ color: "var(--text)" }}>
        Disclosed agreements
      </h2>
      <div className="flex flex-col gap-2">
        {data.contracts.map((c) => {
          const st = STATUS[c.status] ?? STATUS.expired;
          const llm = Object.values(c.provenance || {}).some((v) => v === "llm");
          const derived = Object.entries(c.provenance || {}).filter(([, v]) => String(v).startsWith("derived")).map(([k]) => k);
          return (
            <article key={c.id} className="rounded-lg p-3.5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[14.5px] font-bold m-0" style={{ color: "var(--text)" }}>
                  {c.providerName || "Provider not stated"}
                </h3>
                <span className="text-[11px] font-bold" style={{ color: st.color }}>
                  {st.label}
                  {c.kind !== "new" ? <span className="ml-1.5 font-semibold" style={{ color: "var(--text-mute)" }}>({c.kind})</span> : null}
                </span>
              </div>

              <dl className="grid gap-x-5 gap-y-1 mt-2 mb-0" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))" }}>
                <Field label="Monthly fee" value={money(c.monthlyFee, c.currency || "CAD")} />
                <Field label="Contract value" value={money(c.totalValue, c.currency || "CAD")} />
                <Field label="Term" value={c.termMonths ? `${c.termMonths} months` : "—"} />
                <Field label="Start" value={day(c.startDate)} />
                <Field
                  label="Options to provider"
                  value={
                    c.noSecurityCompensation && !c.optionsGranted
                      ? "None — stated"
                      : c.optionsGranted
                        ? `${c.optionsGranted.toLocaleString()}${c.optionStrike ? ` @ $${c.optionStrike}` : ""}`
                        : "—"
                  }
                />
                <Field label="Arm's length" value={c.armsLength == null ? "—" : c.armsLength ? "Yes" : "No"} />
              </dl>

              <PerformanceRow perf={c.performance} />

              <div className="flex flex-wrap items-center gap-2 mt-2.5 text-[11.5px]">
                <a
                  href={c.source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-accent font-semibold hover:underline"
                >
                  Source release <ExternalLink size={11} />
                </a>
                {c.source.publishedAt ? (
                  <span style={{ color: "var(--text-mute)" }}>{day(c.source.publishedAt)}</span>
                ) : null}
                {c.reviewed ? <Tag>Checked by an editor</Tag> : null}
                {llm ? <Tag>Some fields machine-read</Tag> : null}
                {derived.length ? <Tag>{derivedLabel(derived)}</Tag> : null}
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-[11.5px] mt-4 leading-relaxed" style={{ color: "var(--text-mute)" }}>
        Figures are read from the issuer's own news releases disclosed under TSX Venture Policy 3.4 and CSE policy.
        Paying for investor relations is legal, disclosed and ordinary. We do not judge it either way — we show what the
        share price did afterwards and leave the conclusion to you. Returns run from the first trading session on or
        after the contract start date; where a listing is outside our price coverage we say so rather than show a blank.
        Spotted an error?{" "}
        <a href="mailto:devs@insiderbuying.com?subject=Promoter%20Score%20correction" className="text-accent font-semibold hover:underline">
          Tell us
        </a>{" "}
        and we will check it against the release.
      </p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>
        {label}
      </div>
      <div className="text-[19px] font-extrabold tabular leading-tight mt-0.5" style={{ color: "var(--text)" }}>
        {value}
      </div>
      {sub ? <div className="text-[11px] mt-0.5" style={{ color: "var(--text-mute)" }}>{sub}</div> : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>
        {label}
      </dt>
      <dd className="text-[13px] font-semibold tabular m-0" style={{ color: "var(--text)" }}>
        {value}
      </dd>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[10.5px] font-semibold" style={{ background: "var(--bg-3)", border: "1px solid var(--border)", color: "var(--text-mute)" }}>
      {children}
    </span>
  );
}

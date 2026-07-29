"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Landmark } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { PoliticianAvatar } from "@/components/PoliticianAvatar";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
import { DataTable } from "@/components/DataTable";
import { WatchlistButton } from "@/components/WatchlistButton";
import { rankColumn } from "@/components/tableColumns";

interface CongressTrade {
  id: string;
  politicianName: string;
  chamber: "House" | "Senate";
  party: string | null;
  ticker: string;
  companyName: string;
  action: "Buy" | "Sell";
  amountMin: number | null;
  amountMax: number | null;
  transactionDate: string;
  reportedDate: string | null;
  source: string | null;
  photoUrl?: string | null;
}

function amountRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null) {
    return `${formatCurrency(min)} – ${formatCurrency(max)}`;
  }
  return formatCurrency(min ?? max ?? 0);
}

function formatDateShort(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CongressionalPage() {
  const [politician, setPolitician] = useState("");
  const [ticker, setTicker] = useState("");
  const [chamber, setChamber] = useState<"" | "House" | "Senate">("");
  const [action, setAction] = useState<"" | "Buy" | "Sell">("");
  const [days, setDays] = useState<number>(90);

  const qs = new URLSearchParams();
  if (politician) qs.set("politician", politician);
  if (ticker) qs.set("ticker", ticker);
  if (chamber) qs.set("chamber", chamber);
  qs.set("days", String(days));
  qs.set("limit", "200");

  const { data, isLoading } = useSWR<{ rows: CongressTrade[] }>(
    `${API_BASE}/congressional-trades?${qs.toString()}`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const rows = (data?.rows || []).filter((r) =>
    action ? r.action === action : true,
  );

  // Live quotes for the tickers shown in the table.
  const tickerKey = rows
    .map((r) => (r.ticker || "").toUpperCase())
    .filter(Boolean)
    .slice(0, 250)
    .join(",");
  const { data: quoteData } = useSWR<{ rows: { symbol: string; price: number; changePct: number; peRatio?: number | null; dividendYield?: number | null; marketCap?: number | null }[] }>(
    tickerKey ? `${API_BASE}/market-stats/quotes?symbols=${encodeURIComponent(tickerKey)}` : null,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const quoteBySym = new Map<string, { price: number; changePct: number; peRatio?: number | null; dividendYield?: number | null; marketCap?: number | null }>();
  (quoteData?.rows || []).forEach((q) => quoteBySym.set(q.symbol.toUpperCase(), q));

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Landmark className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Congressional Trading
          </span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Congressional & Insider Trading
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          U.S. House and Senate members disclose their equity trades under the STOCK Act
          within 45 days. Below is a live feed of those disclosures with the politician,
          stock, action, and disclosed amount range. Photos are sourced from the public
          Wikipedia API.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="congressional-top" />

      {/* Filters */}
      <div
        className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <FilterInput
          label="Politician"
          placeholder="e.g. Pelosi"
          value={politician}
          onChange={setPolitician}
        />
        <FilterInput
          label="Ticker"
          placeholder="e.g. NVDA"
          value={ticker}
          onChange={(v) => setTicker(v.toUpperCase())}
        />
        <FilterSelect
          label="Chamber"
          value={chamber}
          options={[
            { label: "All", value: "" },
            { label: "House", value: "House" },
            { label: "Senate", value: "Senate" },
          ]}
          onChange={(v) => setChamber(v as any)}
        />
        <FilterSelect
          label="Action"
          value={action}
          options={[
            { label: "All", value: "" },
            { label: "Buy", value: "Buy" },
            { label: "Sell", value: "Sell" },
          ]}
          onChange={(v) => setAction(v as any)}
        />
        <FilterSelect
          label="Days back"
          value={String(days)}
          options={[
            { label: "7 days", value: "7" },
            { label: "30 days", value: "30" },
            { label: "90 days", value: "90" },
            { label: "365 days", value: "365" },
          ]}
          onChange={(v) => setDays(Number(v))}
        />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-10">Loading…</div>
        ) : (
          <DataTable<CongressTrade>
            rows={rows}
            rowKey={(r) => r.id}
            initialSort={{ key: "marketCap", dir: "desc" }}
            empty="No congressional trades match these filters."
            gate={{
              label: "Congress Trading",
              bullets: [
                "Every disclosed trade, not just the preview",
                "Full politician profiles and holdings",
                "Insider Scores on every ticker traded",
                "New STOCK Act filings as they publish",
              ],
            }}
            columns={[
              rankColumn<CongressTrade>(),
              {
                key: "politician",
                label: "Politician",
                filterable: true,
                sortValue: (r) => r.politicianName,
                render: (r) => (
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <PoliticianAvatar
                      name={r.politicianName}
                      photoUrl={r.photoUrl}
                      party={r.party}
                      size={36}
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/politicians/${encodeURIComponent(r.politicianName)}`}
                        className="text-[15px] font-bold truncate block hover:text-accent transition"
                      >
                        {r.politicianName}
                      </Link>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-mute flex items-center gap-1">
                        <span
                          className="px-1.5 py-0.5 rounded"
                          style={{
                            background:
                              r.party === "D"
                                ? "color-mix(in srgb, #1e40af 18%, transparent)"
                                : r.party === "R"
                                ? "color-mix(in srgb, #b91c1c 18%, transparent)"
                                : "var(--bg-3)",
                            color:
                              r.party === "D"
                                ? "#1e40af"
                                : r.party === "R"
                                ? "#b91c1c"
                                : "var(--text-mute)",
                          }}
                        >
                          {r.party || "—"}
                        </span>
                        <span>{r.chamber}</span>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: "ticker",
                label: "Company",
                sortValue: (r) => r.ticker,
                render: (r) => (
                  <span className="inline-flex items-center gap-2">
                    {r.ticker && <WatchlistButton ticker={r.ticker} variant="icon" size="sm" />}
                    <Link
                      href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
                      className="flex items-center gap-2"
                    >
                      <CompanyLogo ticker={r.ticker || ""} name={r.companyName || r.ticker} size={22} />
                      <div className="min-w-0">
                        <div className="font-mono text-[15px] font-bold text-accent hover:underline">
                          {r.ticker || "—"}
                        </div>
                        <div className="text-[13px] font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>
                          {r.companyName || r.ticker}
                        </div>
                      </div>
                    </Link>
                  </span>
                ),
              },
              {
                key: "price",
                label: "Price",
                align: "right",
                sortValue: (r) => quoteBySym.get((r.ticker || "").toUpperCase())?.price ?? null,
                render: (r) => {
                  const q = quoteBySym.get((r.ticker || "").toUpperCase());
                  return <span className="tabular font-bold text-[14px]">{q ? `$${q.price.toFixed(2)}` : "—"}</span>;
                },
              },
              {
                key: "changePct",
                label: "Change %",
                align: "right",
                sortValue: (r) => quoteBySym.get((r.ticker || "").toUpperCase())?.changePct ?? null,
                render: (r) => {
                  const q = quoteBySym.get((r.ticker || "").toUpperCase());
                  if (!q || q.changePct == null) return <span className="text-faint text-[13px]">—</span>;
                  const up = q.changePct >= 0;
                  return <span className="tabular font-bold text-[14px]" style={{ color: up ? "var(--good)" : "var(--bad)" }}>{up ? "+" : ""}{q.changePct.toFixed(2)}%</span>;
                },
              },
              {
                key: "marketCap",
                label: "Market Cap",
                filterable: true,
                filterType: "marketCapPreset",
                filterLabelText: "Market Cap",
                align: "right",
                sortValue: (r) => quoteBySym.get((r.ticker || "").toUpperCase())?.marketCap ?? null,
                render: (r) => {
                  const mc = quoteBySym.get((r.ticker || "").toUpperCase())?.marketCap ?? null;
                  return (
                    <span className="tabular text-mute text-[14px] font-bold">
                      {mc ? formatCurrency(mc) : "—"}
                    </span>
                  );
                },
              },
              {
                key: "peRatio",
                label: "P/E",
                align: "right",
                sortValue: (r) => quoteBySym.get((r.ticker || "").toUpperCase())?.peRatio ?? null,
                render: (r) => {
                  const pe = quoteBySym.get((r.ticker || "").toUpperCase())?.peRatio;
                  return <span className="tabular text-mute text-[13px] font-bold">{pe != null ? pe.toFixed(1) : "—"}</span>;
                },
              },
              {
                key: "dividendYield",
                label: "Div Yield",
                align: "right",
                sortValue: (r) => quoteBySym.get((r.ticker || "").toUpperCase())?.dividendYield ?? null,
                render: (r) => {
                  const dy = quoteBySym.get((r.ticker || "").toUpperCase())?.dividendYield;
                  return <span className="tabular text-mute text-[13px] font-bold">{dy != null ? dy.toFixed(2) + "%" : "—"}</span>;
                },
              },
              {
                key: "action",
                label: "Action",
                filterable: true,
                sortValue: (r) => r.action,
                render: (r) => {
                  const isBuy = r.action === "Buy";
                  return (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
                      style={{
                        background: isBuy
                          ? "color-mix(in srgb, var(--good) 18%, transparent)"
                          : "color-mix(in srgb, var(--bad) 18%, transparent)",
                        color: isBuy ? "var(--good)" : "var(--bad)",
                      }}
                    >
                      {r.action}
                    </span>
                  );
                },
              },
              {
                key: "amount",
                label: "Amount",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.amountMax ?? r.amountMin ?? null,
                render: (r) => (
                  <span className="tabular text-[14px] font-bold">
                    {amountRange(r.amountMin, r.amountMax)}
                  </span>
                ),
              },
              {
                key: "transactionDate",
                label: "Transaction Date",
                filterable: true,
                sortValue: (r) =>
                  r.transactionDate ? new Date(r.transactionDate).getTime() : null,
                render: (r) => (
                  <span className="text-[14px] font-bold tabular text-soft">
                    {formatDateShort(r.transactionDate)}
                  </span>
                ),
              },
              {
                key: "reported",
                label: "Reported",
                filterable: true,
                sortValue: (r) =>
                  r.reportedDate ? new Date(r.reportedDate).getTime() : null,
                render: (r) => (
                  <span className="text-[14px] font-bold tabular text-mute">
                    {formatDateShort(r.reportedDate)}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>

      {!isLoading && rows.length > 9 && (
        <AdSlot slot="inline" seed="congressional-mid" />
      )}
    </div>
  );
}

function FilterInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-mute mb-1">
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md text-[13px] font-medium"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
          color: "var(--text)",
        }}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-mute mb-1">
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-md text-[13px] font-semibold"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
          color: "var(--text)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

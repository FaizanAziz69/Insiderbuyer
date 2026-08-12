"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import Link from "next/link";
import { API_BASE, TradesResponse, fetcher } from "@/lib/api";
import { TradesTable } from "@/components/TradesTable";

type RoleFilter = "" | "CEO" | "CFO" | "COO" | "Director" | "Other";
type ValueRange = "any" | "10k" | "100k" | "1m" | "10m";

const RANGE_MIN: Record<ValueRange, number> = {
  any: 0,
  "10k": 10000,
  "100k": 100000,
  "1m": 1000000,
  "10m": 10000000,
};

export default function ScreenerPage() {
  const [role, setRole] = useState<RoleFilter>("");
  const [value, setValue] = useState<ValueRange>("any");
  const [days, setDays] = useState(30);

  const { data, isLoading } = useSWR<TradesResponse>(
    `${API_BASE}/trades?limit=500`,
    fetcher,
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const since = new Date(Date.now() - days * 86400 * 1000);
    return data.rows.filter((r) => {
      if (role && r.role !== role) return false;
      if (RANGE_MIN[value] && r.totalValue < RANGE_MIN[value]) return false;
      if (new Date(r.transactionDate) < since) return false;
      return true;
    });
  }, [data, role, value, days]);

  return (
    <div className="space-y-6 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Screener</h1>
          <p className="text-mute text-sm mt-1">
            Filter open-market insider buys by role, value, and date.
          </p>
        </div>
        <Link href="/premium" className="btn-secondary self-start sm:self-auto">
          <Lock className="h-3.5 w-3.5" />
          Save filter
        </Link>
      </header>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Date range">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="input-base"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
          </select>
        </Field>
        <Field label="Insider role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as RoleFilter)}
            className="input-base"
          >
            <option value="">Any</option>
            <option value="CEO">CEO</option>
            <option value="CFO">CFO</option>
            <option value="COO">COO</option>
            <option value="Director">Director</option>
            <option value="Other">Other</option>
          </select>
        </Field>
        <Field label="Min trade value">
          <select
            value={value}
            onChange={(e) => setValue(e.target.value as ValueRange)}
            className="input-base"
          >
            <option value="any">Any</option>
            <option value="10k">$10k+</option>
            <option value="100k">$100k+</option>
            <option value="1m">$1M+</option>
            <option value="10m">$10M+</option>
          </select>
        </Field>
        <Field label="Track record">
          {/* Inert control. It used to read "Premium", which promised a filter a
              subscription does not deliver — the filter isn't built yet (client
              free/paid accuracy audit). Labelled for what it is. */}
          <div className="input-base flex items-center gap-2 text-mute cursor-not-allowed">
            <Lock className="h-3.5 w-3.5" />
            Coming soon
          </div>
        </Field>
      </div>

      <div className="text-xs text-mute">
        {isLoading ? "Loading…" : `${filtered.length} match${filtered.length === 1 ? "" : "es"}`}
      </div>

      {isLoading || !data ? (
        <div className="card p-12 text-center text-mute">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-mute">No trades match your filters.</div>
      ) : (
        <TradesTable trades={filtered} total={filtered.length} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-mini block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

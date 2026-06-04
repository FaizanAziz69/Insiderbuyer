"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Lock } from "lucide-react";
import { IqsTooltip } from "@/components/IqsTooltip";

export interface ListFilters {
  country: string;
  sector: string;
  marketCap: string;
  iqs: string;
}

const COUNTRIES = ["USA (NYSE & NASDAQ)"];

const SECTORS = [
  "All Sectors",
  "Technology",
  "Healthcare",
  "Financial Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Industrials",
  "Materials",
  "Real Estate",
  "Utilities",
  "Communication Services",
];

const MARKET_CAPS = [
  "All MarketCaps",
  "Mega Cap (>$200B)",
  "Large Cap ($10B–$200B)",
  "Mid Cap ($2B–$10B)",
  "Small Cap ($300M–$2B)",
  "Micro Cap (<$300M)",
];

interface Props {
  value: ListFilters;
  onChange: (next: ListFilters) => void;
}

function Dropdown({
  label,
  value,
  options,
  onSelect,
  locked = false,
  premiumHref = "/premium",
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  locked?: boolean;
  premiumHref?: string;
}) {
  const [open, setOpen] = useState(false);
  if (locked) {
    return (
      <Link
        href={premiumHref}
        className="flex flex-col gap-1 min-w-[180px] flex-1"
      >
        <div className="text-[10px] uppercase tracking-wider font-bold text-mute flex items-center gap-1">
          {label}
          <Lock className="h-3 w-3 text-accent" />
        </div>
        <div
          className="flex items-center justify-between px-3 py-2 rounded-md text-[13px] font-semibold"
          style={{
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            color: "var(--text-mute)",
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-accent" />
            {value}
          </span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-accent">
            Unlock
          </span>
        </div>
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-1 min-w-[180px] flex-1 relative">
      <div className="text-[10px] uppercase tracking-wider font-bold text-mute">
        {label}
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between px-3 py-2 rounded-md text-[13px] font-semibold"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
          color: "var(--text)",
        }}
      >
        <span>{value}</span>
        <ChevronDown
          className="h-3.5 w-3.5 text-mute transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <ul
            className="absolute top-full left-0 right-0 mt-1 rounded-md z-40 max-h-[280px] overflow-y-auto"
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
            }}
          >
            {options.map((o) => (
              <li key={o}>
                <button
                  onClick={() => {
                    onSelect(o);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--accent-soft)] transition"
                  style={{
                    color: o === value ? "var(--accent)" : "var(--text-soft)",
                    fontWeight: o === value ? 700 : 500,
                  }}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function FilteredListBar({ value, onChange }: Props) {
  return (
    <div
      className="card p-4 flex flex-wrap gap-3"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <Dropdown
        label="Country"
        value={value.country}
        options={COUNTRIES}
        onSelect={(v) => onChange({ ...value, country: v })}
      />
      <Dropdown
        label="Sector"
        value={value.sector}
        options={SECTORS}
        onSelect={(v) => onChange({ ...value, sector: v })}
      />
      <Dropdown
        label="Market Cap"
        value={value.marketCap}
        options={MARKET_CAPS}
        onSelect={(v) => onChange({ ...value, marketCap: v })}
      />
      <div className="flex flex-col gap-1 min-w-[180px] flex-1">
        <div className="text-[10px] uppercase tracking-wider font-bold text-mute flex items-center gap-1">
          <IqsTooltip>
            <span className="underline decoration-dotted underline-offset-2">IQS</span>
          </IqsTooltip>{" "}
          Score
          <Lock className="h-3 w-3 text-accent" />
        </div>
        <Link
          href="/premium"
          className="flex items-center justify-between px-3 py-2 rounded-md text-[13px] font-semibold"
          style={{
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            color: "var(--text-mute)",
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-accent" />
            All Scores
          </span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-accent">
            Unlock
          </span>
        </Link>
      </div>
    </div>
  );
}

export function mapMarketCapToBounds(label: string): {
  min?: number;
  max?: number;
} {
  switch (label) {
    case "Mega Cap (>$200B)":
      return { min: 200e9 };
    case "Large Cap ($10B–$200B)":
      return { min: 10e9, max: 200e9 };
    case "Mid Cap ($2B–$10B)":
      return { min: 2e9, max: 10e9 };
    case "Small Cap ($300M–$2B)":
      return { min: 300e6, max: 2e9 };
    case "Micro Cap (<$300M)":
      return { max: 300e6 };
    default:
      return {};
  }
}

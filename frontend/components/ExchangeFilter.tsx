"use client";

/** Shared "Exchanges" filter — All / U.S. / Canada / Germany. Ranking stays
 *  global; this narrows a table by listing venue. The chosen value is sent to
 *  the API as ?exchange= (backend maps US / CA / DE). Canada covers Canadian
 *  companies whose US listings file SEC Form 4s (tagged by FMP HQ country). */

export type ExchangeValue = "all" | "US" | "CA" | "DE";

const EXCHANGE_OPTIONS: {
  value: ExchangeValue;
  label: string;
  disabled?: boolean;
  hint?: string;
}[] = [
  { value: "all", label: "All" },
  { value: "US", label: "U.S." },
  { value: "CA", label: "Canada" },
  { value: "DE", label: "Germany" },
];

export function ExchangeFilter({
  value,
  onChange,
}: {
  value: ExchangeValue;
  onChange: (v: ExchangeValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="text-[12px] font-bold uppercase tracking-wider"
        style={{ color: "var(--text-mute)" }}
      >
        Exchanges
      </span>
      <div
        className="inline-flex items-center gap-1 rounded-lg p-1"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        {EXCHANGE_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={opt.disabled}
              title={opt.hint}
              onClick={() => !opt.disabled && onChange(opt.value)}
              className="px-3 py-1.5 rounded-md text-[13px] font-semibold transition disabled:cursor-not-allowed"
              style={{
                background: active ? "var(--accent)" : "transparent",
                color: active
                  ? "#fff"
                  : opt.disabled
                    ? "var(--text-mute)"
                    : "var(--text)",
                opacity: opt.disabled ? 0.5 : 1,
              }}
            >
              {opt.label}
              {opt.disabled && opt.hint && (
                <span className="ml-1 text-[10px] font-normal normal-case">
                  ({opt.hint})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

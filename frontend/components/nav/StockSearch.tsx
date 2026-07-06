"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";

interface Result {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
}

/** Navbar ticker/company search (stockanalysis-style): type a symbol or name,
 *  pick a result, and land on that company's profile. */
export function StockSearch({
  className = "",
  dark = true,
  onNavigate,
}: {
  className?: string;
  /** true = translucent-on-navbar styling; false = light panel (mobile menu). */
  dark?: boolean;
  /** Called after navigating to a result (e.g. to close the mobile menu). */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounced search.
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/market-stats/search?q=${encodeURIComponent(query)}`,
          { signal: ctrl.signal },
        );
        const d = await res.json();
        setResults(Array.isArray(d?.rows) ? d.rows : []);
        setActive(0);
      } catch {
        /* aborted or failed — leave prior results */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function go(symbol: string) {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    router.push(`/companies/${encodeURIComponent(sym)}`);
    setOpen(false);
    setQ("");
    setResults([]);
    inputRef.current?.blur();
    onNavigate?.();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Selected result, else first result, else the raw typed ticker.
      if (results[active]) go(results[active].symbol);
      else if (results[0]) go(results[0].symbol);
      else if (q.trim()) go(q);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = open && q.trim().length > 0;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
          style={{ color: dark ? "rgba(255,255,255,0.65)" : "var(--text-mute)" }}
        />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search ticker or company…"
          aria-label="Search stocks"
          spellCheck={false}
          autoComplete="off"
          className="w-full h-9 rounded-md pl-8 pr-8 text-[13px] outline-none"
          style={
            dark
              ? {
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "#fff",
                }
              : {
                  background: "var(--bg-1)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text)",
                }
          }
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setResults([]);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded flex items-center justify-center"
            style={{ color: dark ? "rgba(255,255,255,0.7)" : "var(--text-mute)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 rounded-lg overflow-hidden z-50"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border-strong)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
            minWidth: 280,
          }}
        >
          {results.length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-mute">
              {loading ? "Searching…" : "No matches found."}
            </div>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={`${r.symbol}-${i}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r.symbol)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition"
                    style={{ background: i === active ? "var(--accent-soft)" : "transparent" }}
                  >
                    <CompanyLogo ticker={r.symbol} name={r.name} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold font-mono text-accent leading-tight">
                        {r.symbol}
                      </span>
                      <span className="block text-[12px] text-soft truncate leading-tight">
                        {r.name}
                      </span>
                    </span>
                    {r.exchange && (
                      <span className="text-[10px] uppercase tracking-wider text-mute flex-shrink-0">
                        {r.exchange}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

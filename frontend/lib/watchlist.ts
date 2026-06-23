"use client";
import { useCallback, useEffect, useState } from "react";

/**
 * Local (no-login) watchlist persisted in localStorage. Good enough for
 * testing the feature end-to-end; swap the storage calls for an API later
 * when accounts exist. Fires a `watchlist-change` event so every mounted
 * component (and other tabs, via `storage`) stays in sync.
 */
const KEY = "ib_watchlist";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("watchlist-change"));
}

export function useWatchlist() {
  const [tickers, setTickers] = useState<string[]>([]);

  useEffect(() => {
    setTickers(read());
    const sync = () => setTickers(read());
    window.addEventListener("watchlist-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("watchlist-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((t: string) => {
    const u = t.trim().toUpperCase();
    if (!u) return;
    const cur = read();
    if (!cur.includes(u)) write([...cur, u]);
  }, []);

  const remove = useCallback((t: string) => {
    write(read().filter((x) => x !== t.trim().toUpperCase()));
  }, []);

  const toggle = useCallback((t: string) => {
    const u = t.trim().toUpperCase();
    if (!u) return;
    const cur = read();
    write(cur.includes(u) ? cur.filter((x) => x !== u) : [...cur, u]);
  }, []);

  const has = useCallback(
    (t: string) => tickers.includes(t.trim().toUpperCase()),
    [tickers],
  );

  return { tickers, add, remove, toggle, has };
}

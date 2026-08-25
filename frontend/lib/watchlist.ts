"use client";
import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";

/**
 * Watchlist storage.
 *
 * Signed out, the list lives in localStorage exactly as it always has — no
 * account needed to try the feature. Signed in, the same list is mirrored to
 * the account, because the alert engine has to know who is watching what: a
 * list only the browser can see cannot be alerted on. localStorage stays the
 * render source either way, so the UI never waits on a request.
 *
 * Fires a `watchlist-change` event so every mounted component (and other tabs,
 * via `storage`) stays in sync.
 */
const KEY = "ib_watchlist";
/** Set once the account's list has been merged in, so it happens once a load. */
let syncedForToken: string | null = null;

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

/** Authenticated call to the account's watchlist; silent no-op when signed out. */
async function api(
  path: string,
  init: RequestInit,
): Promise<{ tickers: string[]; alertsEnabled?: boolean } | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/watchlist${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // The local list is still correct — a failed sync must never lose it.
    return null;
  }
}

export function useWatchlist() {
  const [tickers, setTickers] = useState<string[]>([]);
  /** True when this account's plan includes watchlist alerts. */
  const [alertsEnabled, setAlertsEnabled] = useState(false);

  useEffect(() => {
    setTickers(read());
    const sync = () => setTickers(read());
    window.addEventListener("watchlist-change", sync);
    window.addEventListener("storage", sync);

    // On sign-in, merge whatever the browser accumulated into the account and
    // adopt the merged list. Merge only ever adds, so nothing is lost either way.
    const token = getAuthToken();
    if (token && syncedForToken !== token) {
      syncedForToken = token;
      api("/sync", { method: "POST", body: JSON.stringify({ tickers: read() }) }).then((r) => {
        if (!r) return;
        setAlertsEnabled(!!r.alertsEnabled);
        write(r.tickers);
      });
    }
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
    api("", { method: "POST", body: JSON.stringify({ ticker: u }) });
  }, []);

  const remove = useCallback((t: string) => {
    const u = t.trim().toUpperCase();
    write(read().filter((x) => x !== u));
    api(`/${encodeURIComponent(u)}`, { method: "DELETE" });
  }, []);

  const toggle = useCallback(
    (t: string) => {
      const u = t.trim().toUpperCase();
      if (!u) return;
      if (read().includes(u)) remove(u);
      else add(u);
    },
    [add, remove],
  );

  const has = useCallback(
    (t: string) => tickers.includes(t.trim().toUpperCase()),
    [tickers],
  );

  return { tickers, add, remove, toggle, has, alertsEnabled };
}

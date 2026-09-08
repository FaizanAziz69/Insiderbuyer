"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePremium } from "@/components/premium/PremiumContext";

/**
 * Workstream H — site banner / announcement system (Brief v2; required on the
 * press subdomain by Brief v3 §7). Renders at most one top bar and, where a
 * page mounts <PromoCard/>, one in-content card. Fetches after first paint,
 * reserves no layout until a banner exists (so no shift once loaded it sits
 * in normal flow at the top), persists dismissals with the banner's frequency
 * cap, records impressions and clicks, and appends UTM parameters to the CTA.
 */
interface Banner {
  id: string;
  title: string;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  placement: "bar" | "card";
  dismissible: boolean;
  frequencyCapHours: number;
  utmCampaign: string | null;
}
interface ActiveBanners {
  bar: Banner | null;
  card: Banner | null;
}

const DISMISS_KEY = "ib_banner_dismissed";

function dismissedUntil(id: string): number {
  try {
    const m = JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}") as Record<string, number>;
    return m[id] || 0;
  } catch {
    return 0;
  }
}
function dismiss(b: Banner) {
  try {
    const m = JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}") as Record<string, number>;
    m[b.id] = b.frequencyCapHours > 0 ? Date.now() + b.frequencyCapHours * 3_600_000 : Number.MAX_SAFE_INTEGER;
    localStorage.setItem(DISMISS_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable */
  }
}
function withUtm(url: string, b: Banner): string {
  try {
    const u = new URL(url, window.location.origin);
    if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", "insiderbuying");
    if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", `banner-${b.placement}`);
    if (!u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", b.utmCampaign || b.id);
    return u.origin === window.location.origin ? u.pathname + u.search + u.hash : u.toString();
  } catch {
    return url;
  }
}
function event(id: string, type: "impression" | "click") {
  fetch(`${API_BASE}/banners/${id}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
    keepalive: true,
  }).catch(() => undefined);
}

function useActiveBanners(): ActiveBanners {
  const pathname = usePathname();
  const { user } = useAuth();
  const { unlocked } = usePremium();
  const audience = unlocked ? "premium" : user ? "free" : "guest";
  const [data, setData] = useState<ActiveBanners>({ bar: null, card: null });
  useEffect(() => {
    let cancelled = false;
    const path = pathname || "/";
    fetch(`${API_BASE}/banners?path=${encodeURIComponent(path)}&audience=${audience}`)
      .then((r) => (r.ok ? r.json() : { bar: null, card: null }))
      .then((d: ActiveBanners) => {
        if (cancelled) return;
        const now = Date.now();
        setData({
          bar: d.bar && dismissedUntil(d.bar.id) < now ? d.bar : null,
          card: d.card && dismissedUntil(d.card.id) < now ? d.card : null,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname, audience]);
  return data;
}

function useImpression(b: Banner | null) {
  useEffect(() => {
    if (b) event(b.id, "impression");
  }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function SiteBanners() {
  const { bar } = useActiveBanners();
  const [hidden, setHidden] = useState<string | null>(null);
  const b = bar && bar.id !== hidden ? bar : null;
  useImpression(b);
  if (!b) return null;
  return (
    <div className="ibb-bar" role="region" aria-label="Announcement">
      <div className="ibb-bar-in">
        <span className="ibb-bar-title">{b.title}</span>
        {b.body && <span className="ibb-bar-body">{b.body}</span>}
        {b.ctaUrl && b.ctaLabel && (
          <a href={withUtm(b.ctaUrl, b)} className="ibb-bar-cta" onClick={() => event(b.id, "click")}>
            {b.ctaLabel}
          </a>
        )}
        {b.dismissible && (
          <button
            type="button"
            className="ibb-bar-x"
            aria-label="Dismiss announcement"
            onClick={() => {
              dismiss(b);
              setHidden(b.id);
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <style>{CSS}</style>
    </div>
  );
}

/** In-content promo card placement — mount where a page wants the card. */
export function PromoCard({ className = "" }: { className?: string }) {
  const { card } = useActiveBanners();
  const [hidden, setHidden] = useState<string | null>(null);
  const b = useMemo(() => (card && card.id !== hidden ? card : null), [card, hidden]);
  useImpression(b);
  if (!b) return null;
  return (
    <aside className={`ibb-card ${className}`} aria-label="Promotion">
      <div className="ibb-card-in">
        <div className="ibb-card-title">{b.title}</div>
        {b.body && <p className="ibb-card-body">{b.body}</p>}
        {b.ctaUrl && b.ctaLabel && (
          <a href={withUtm(b.ctaUrl, b)} className="ibb-card-cta" onClick={() => event(b.id, "click")}>
            {b.ctaLabel}
          </a>
        )}
      </div>
      {b.dismissible && (
        <button
          type="button"
          className="ibb-card-x"
          aria-label="Dismiss promotion"
          onClick={() => {
            dismiss(b);
            setHidden(b.id);
          }}
        >
          <X size={16} />
        </button>
      )}
      <style>{CSS}</style>
    </aside>
  );
}

const CSS = `
.ibb-bar { background: #0A1E3C; color: #fff; font-size: 14px; }
.ibb-bar-in { max-width: 1460px; margin: 0 auto; padding: 10px 44px 10px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; position: relative; }
.ibb-bar-title { font-weight: 800; }
.ibb-bar-body { color: #C8D3E3; }
.ibb-bar-cta { margin-left: auto; background: #C9A227; color: #0A1E3C; font-weight: 800; padding: 6px 12px; border-radius: 8px; text-decoration: none; white-space: nowrap; }
.ibb-bar-x { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: transparent; border: 0; color: #C8D3E3; cursor: pointer; padding: 6px; }
.ibb-card { position: relative; background: #0A1E3C; color: #fff; border-radius: 16px; padding: 22px 24px; margin: 24px 0; }
.ibb-card-title { font-weight: 800; font-size: 18px; }
.ibb-card-body { color: #C8D3E3; margin: 6px 0 14px; line-height: 1.55; }
.ibb-card-cta { display: inline-block; background: #C9A227; color: #0A1E3C; font-weight: 800; padding: 10px 16px; border-radius: 10px; text-decoration: none; }
.ibb-card-x { position: absolute; right: 10px; top: 10px; background: transparent; border: 0; color: #C8D3E3; cursor: pointer; padding: 6px; }
@media (max-width: 640px) { .ibb-bar-cta { margin-left: 0; } }
`;

"use client";

/**
 * The Insider Bubbles Map — full-screen physics field in the Banter Bubbles
 * style. One bubble = one ticker's qualifying insider buying (open-market
 * Form 4 code P, ≥ $250K per insider per day) in the selected window; size is
 * area-proportional to dollars bought, color answers "does the stock still
 * trade below what the insiders paid?" (90-day average vs VWAIP).
 *
 * Data is the pre-composed /api/bubbles payload — one read, no request-path
 * fan-out — polled every 60s; buy events that appear between polls pulse gold.
 * State (window, selected ticker) lives in the URL so any view is shareable.
 *
 * Rendering is canvas (DOM/SVG cannot hold 250 physics bodies at 60fps) with
 * a thin DOM overlay for the tooltip and profile panel. The page root carries
 * an inverse of the site-wide body{zoom:1.1} so canvas math, pointer events
 * and fixed positioning all agree in visual pixels (the tooltip trap).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Archivo, IBM_Plex_Mono, Nunito_Sans } from "next/font/google";
import { Lock } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { usePremium } from "@/components/premium/PremiumContext";
import { effectiveZoom } from "@/lib/zoom";

const archivo = Archivo({ subsets: ["latin"], weight: ["600", "800", "900"], variable: "--bm-head" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--bm-mono" });
const nunito = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--bm-sans" });

/* ---------------------------------------------------------------- types */

interface ApiBuy {
  id: string;
  who: string;
  role: string;
  title: string | null;
  d: string;
  sh: number;
  px: number;
  val: number;
  filing: string | null;
}

interface ApiBubble {
  t: string;
  name: string;
  exch: string | null;
  sector: string | null;
  price: number | null;
  chg: number | null;
  mcap: number | null;
  avg90: number | null;
  about: string | null;
  rev: number | null;
  ni: number | null;
  iq: number | null;
  target: number | null;
  total: number;
  vwaip: number;
  sold: number;
  buys: ApiBuy[];
}

interface ApiPayload {
  window: string;
  generatedAt: string | null;
  count: number;
  shown?: number;
  bubbles: ApiBubble[];
}

/** A live physics body on the field. */
interface Body {
  t: string;
  data: ApiBubble;
  gap: number;
  above: boolean;
  hasRef: boolean; // false = no avg90/price, render neutral
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  targetR: number;
  expanded: boolean;
  expandT: number;
  seed: number;
}

interface Satellite {
  buy: ApiBuy;
  parent: Body;
  x: number;
  y: number;
  r: number;
}

const WINDOWS: Array<[string, string]> = [
  ["1d", "1D"],
  ["1w", "1W"],
  ["30d", "30D"],
  ["3m", "3M"],
  ["6m", "6M"],
  ["9m", "9M"],
  ["1y", "1Y"],
];
const VALID_WINDOWS = new Set(WINDOWS.map(([v]) => v));
const HEADER_CLEAR = 64; // px kept free under the top bar

/* ------------------------------------------------------------- helpers */

function fmtM(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  return `${sign}$${Math.round(a / 1e3)}K`;
}

function daysAgo(d: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(`${d}T00:00:00Z`)) / 86_400_000));
}

function agoLabel(d: string): string {
  const n = daysAgo(d);
  return n === 0 ? "today" : `${n}d ago`;
}

function roleTag(role: string, title?: string | null): string {
  const s = `${role} ${title || ""}`.toLowerCase();
  if (s.includes("ceo") || s.includes("chief executive")) return "CEO";
  if (s.includes("cfo") || s.includes("chief financial")) return "CFO";
  if (s.includes("coo")) return "COO";
  if (s.includes("chair")) return "CHR";
  if (s.includes("10%")) return "10%";
  if (role === "Director") return "DIR";
  return "INS";
}

/** Canvas palettes for the two site themes (data-theme on <html>). */
const PALETTES = {
  dark: {
    text: "245,247,250",
    bgIn: "#12263f",
    bgOut: "#081525",
    sat: "11,27,47",
    badge: "#0B1B2F",
    neutral: "120,138,160",
  },
  light: {
    text: "14,31,53",
    bgIn: "#fdfeff",
    bgOut: "#e4ebf3",
    sat: "255,255,255",
    badge: "#ffffff",
    neutral: "130,145,165",
  },
} as const;
type ThemeName = keyof typeof PALETTES;

/** Color ramp: green above insider cost, red below, saturation by gap size. */
function bubbleColor(b: Body, alpha: number, neutral = "120,138,160"): string {
  if (!b.hasRef) return `rgba(${neutral},${alpha})`;
  const g = Math.abs(b.gap);
  const sat = g < 0.05 ? 0.45 : g < 0.15 ? 0.72 : 1;
  if (b.above) {
    return `rgba(${Math.round(62 * sat + 30 * (1 - sat))},${Math.round(155 * sat + 60 * (1 - sat))},${Math.round(95 * sat + 55 * (1 - sat))},${alpha})`;
  }
  return `rgba(${Math.round(194 * sat + 70 * (1 - sat))},${Math.round(80 * sat + 50 * (1 - sat))},${Math.round(74 * sat + 55 * (1 - sat))},${alpha})`;
}

function satellitesFor(b: Body): Satellite[] {
  const out: Satellite[] = [];
  const dist = b.r + 40;
  const buys = b.data.buys;
  for (let i = 0; i < buys.length; i++) {
    const ang = -Math.PI / 2 + (i / buys.length) * Math.PI * 2;
    const sr = Math.max(13, Math.min(7 + Math.sqrt(buys[i].val / 1e5) * 3.4, 26)) * b.expandT;
    out.push({
      buy: buys[i],
      parent: b,
      x: b.x + Math.cos(ang) * dist * b.expandT,
      y: b.y + Math.sin(ang) * dist * b.expandT,
      r: sr,
    });
  }
  return out;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

/* ---------------------------------------------------------------- page */

export default function BubblesPage() {
  const { unlocked } = usePremium();
  const [win, setWin] = useState("30d");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [invZoom, setInvZoom] = useState(1);
  const [booted, setBooted] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("dark");
  const [mobileMenu, setMobileMenu] = useState(false);
  const themeRef = useRef<ThemeName>("dark");
  themeRef.current = theme;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const bodiesRef = useRef<Body[]>([]);
  const pulsesRef = useRef<Array<{ t: string; age: number }>>([]);
  const selectedRef = useRef<string | null>(null);
  const queryRef = useRef("");
  const focusIdxRef = useRef(-1);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const lastWinRef = useRef(win);
  const imgCacheRef = useRef(new Map<string, { img: HTMLImageElement; ok: boolean; tried: number }>());
  const reduceMotionRef = useRef(false);
  const openPanelRef = useRef<(t: string | null) => void>(() => {});

  selectedRef.current = selected;
  queryRef.current = query.trim().toUpperCase();

  const { data, error, isLoading } = useSWR<ApiPayload>(
    `${API_BASE}/bubbles?window=${win}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true },
  );

  /* URL state: read once on mount, write on every change. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const w = (params.get("window") || "").toLowerCase();
    if (VALID_WINDOWS.has(w)) setWin(w);
    const t = (params.get("ticker") || "").toUpperCase();
    if (t) setSelected(t);
    setBooted(true);
  }, []);

  useEffect(() => {
    if (!booted) return;
    const qs = `?window=${win}${selected ? `&ticker=${encodeURIComponent(selected)}` : ""}`;
    window.history.replaceState(null, "", `/bubbles${qs}`);
  }, [win, selected, booted]);

  /* Full-screen takeover: stop the site behind from scrolling, and cancel the
     site-wide body zoom so canvas math runs in visual pixels. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const apply = () => setInvZoom(1 / effectiveZoom());
    apply();
    window.addEventListener("resize", apply);
    reduceMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Follow the site's theme (data-theme on <html>, ThemeToggle writes it).
    const readTheme = () =>
      setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    readTheme();
    const mo = new MutationObserver(readTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("resize", apply);
      mo.disconnect();
    };
  }, []);

  const openPanel = useCallback((t: string | null) => {
    setSelected(t);
  }, []);
  openPanelRef.current = openPanel;

  /* ------------------------------------------------ data → bodies sync */
  useEffect(() => {
    if (!data?.bubbles) return;
    const W = window.innerWidth;
    const H = window.innerHeight;

    // Small screens get the top of the tape, not all of it — 250 bodies on a
    // phone is unreadable and melts the battery. Payload is sorted by total.
    const cap = W < 640 ? 55 : W < 1024 ? 130 : 250;
    const shown = data.bubbles.slice(0, cap);

    // Fit factor: keep the summed bubble area a sane share of the viewport so
    // a heavy 1Y window shrinks to fit and a quiet 1W window fills the screen.
    let areaSum = 0;
    const rawR = new Map<string, number>();
    for (const b of shown) {
      const r = Math.min(Math.max(13 * Math.sqrt(b.total / 1e6) + 16, 22), 95);
      rawR.set(b.t, r);
      areaSum += Math.PI * r * r;
    }
    const budget = W * (H - HEADER_CLEAR) * 0.58;
    const k = areaSum > 0 ? Math.min(Math.max(Math.sqrt(budget / areaSum), 0.3), 1.35) : 1;

    const windowChanged = lastWinRef.current !== data.window;
    lastWinRef.current = data.window;

    const prevBodies = new Map(bodiesRef.current.map((b) => [b.t, b]));
    const next: Body[] = [];
    for (const api of shown) {
      const ref = api.avg90 ?? api.price;
      const gap = ref != null && api.vwaip > 0 ? (ref - api.vwaip) / api.vwaip : 0;
      const prev = prevBodies.get(api.t);
      const body: Body =
        prev ||
        ({
          t: api.t,
          x: W * (0.12 + 0.76 * Math.random()),
          y: HEADER_CLEAR + (H - HEADER_CLEAR) * (0.15 + 0.7 * Math.random()),
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          r: 1,
          expanded: false,
          expandT: 0,
          seed: Math.random() * 1000,
        } as Body);
      body.data = api;
      body.gap = gap;
      body.above = gap >= 0;
      body.hasRef = ref != null && api.vwaip > 0;
      body.targetR = Math.min(Math.max((rawR.get(api.t) || 24) * k, 15), Math.min(W, H) * 0.16);
      next.push(body);

      // Lazy logo load, one attempt per CDN.
      const cache = imgCacheRef.current;
      if (!cache.has(api.t)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const entry = { img, ok: false, tried: 0 };
        img.onload = () => {
          entry.ok = img.naturalWidth > 0;
        };
        img.onerror = () => {
          if (entry.tried === 0) {
            entry.tried = 1;
            img.src = `https://eodhd.com/img/logos/US/${encodeURIComponent(api.t)}.png`;
          }
        };
        img.src = `https://financialmodelingprep.com/image-stock/${encodeURIComponent(api.t)}.png`;
        cache.set(api.t, entry);
      }
    }
    bodiesRef.current = next;

    // Live-tape pulses: only for buy events that appear on a refetch of the
    // SAME window — a window switch is navigation, not news.
    const ids = new Set<string>();
    for (const b of shown) for (const buy of b.buys) ids.add(buy.id);
    if (seenIdsRef.current && !windowChanged) {
      const fresh = new Set<string>();
      for (const b of shown)
        for (const buy of b.buys) if (!seenIdsRef.current.has(buy.id)) fresh.add(b.t);
      for (const t of fresh) pulsesRef.current.push({ t, age: 0 });
    }
    seenIdsRef.current = ids;

    if (selectedRef.current && !next.find((b) => b.t === selectedRef.current)) {
      setSelected(null);
    }
  }, [data]);

  /* --------------------------------------------------- engine (mount) */
  useEffect(() => {
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !tooltip) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas font strings can't resolve CSS custom properties — read the
    // next/font family off the computed style once instead.
    const monoFam =
      getComputedStyle(canvas).getPropertyValue("--bm-mono").trim() ||
      '"IBM Plex Mono", monospace';

    let W = 0;
    let H = 0;
    let DPR = 1;
    let raf = 0;
    let last = performance.now();
    let dragTarget: Body | null = null;
    let dragMoved = 0;
    let lastPointer = { x: 0, y: 0 };
    let hover: Body | null = null;
    let bgGrad: CanvasGradient | null = null;
    let bgTheme = "";

    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      bgGrad = null;
    };
    resize();
    window.addEventListener("resize", resize);

    const collisionR = (b: Body) => (b.expanded ? b.r + 46 * b.expandT : b.r);

    const tick = (dt: number, time: number) => {
      const bodies = bodiesRef.current;
      const reduce = reduceMotionRef.current;
      for (const b of bodies) {
        b.r += (b.targetR - b.r) * 0.08;
        b.expandT += ((b.expanded ? 1 : 0) - b.expandT) * 0.12;
        if (b === dragTarget) continue;
        if (!reduce) {
          b.vy -= 0.0016 * dt;
          b.vx += Math.sin(time * 0.00035 + b.seed) * 0.0011 * dt;
          b.vy += Math.cos(time * 0.0004 + b.seed * 2) * 0.0011 * dt;
        }
        b.vx *= 0.985;
        b.vy *= 0.985;
        b.x += b.vx * dt * 0.06;
        b.y += b.vy * dt * 0.06;
      }
      const n = bodies.length;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const a = bodies[i];
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const min = collisionR(a) + collisionR(b) + 4;
          if (dist < min) {
            const push = ((min - dist) / dist) * 0.5;
            const px = dx * push;
            const py = dy * push;
            if (a !== dragTarget) {
              a.x -= px * 0.5;
              a.y -= py * 0.5;
              a.vx -= px * 0.03;
              a.vy -= py * 0.03;
            }
            if (b !== dragTarget) {
              b.x += px * 0.5;
              b.y += py * 0.5;
              b.vx += px * 0.03;
              b.vy += py * 0.03;
            }
          }
        }
      for (const b of bodies) {
        const cr = collisionR(b) + 6;
        if (b.x < cr) {
          b.x = cr;
          b.vx = Math.abs(b.vx) * 0.55;
        }
        if (b.x > W - cr) {
          b.x = W - cr;
          b.vx = -Math.abs(b.vx) * 0.55;
        }
        if (b.y < HEADER_CLEAR + cr) {
          b.y = HEADER_CLEAR + cr;
          b.vy = Math.abs(b.vy) * 0.55;
        }
        if (b.y > H - cr) {
          b.y = H - cr;
          b.vy = -Math.abs(b.vy) * 0.55;
        }
      }
      pulsesRef.current = pulsesRef.current.filter((p) => (p.age += dt) < 1600);
    };

    const dimFor = (b: Body) => {
      const q = queryRef.current;
      if (!q) return 1;
      return b.t.includes(q) || b.data.name.toUpperCase().includes(q) ? 1 : 0.14;
    };

    // ── Sprite cache ─────────────────────────────────────────────────
    // Painting hundreds of radial gradients + text runs per frame is what
    // makes canvas stutter. A bubble's body/ring/labels/badge only change
    // when its data or settled size changes, so each is pre-rendered once
    // to an offscreen sprite keyed by settled radius, and blitted per frame
    // (scaled by r/targetR while the size is still easing in).
    const sprites = new Map<string, HTMLCanvasElement>();
    const SPRITE_PAD = 16;

    const spriteFor = (b: Body): { cv: HTMLCanvasElement; base: number } | null => {
      const pal = PALETTES[themeRef.current];
      const base = Math.max(8, Math.round(b.targetR));
      const entry = imgCacheRef.current.get(b.t);
      const logoOk = !!entry?.ok && base >= 30;
      const key = `${b.t}|${themeRef.current}|${base}|${bubbleColor(b, 1, pal.neutral)}|${logoOk ? 1 : 0}|${b.data.buys.length}|${b.data.total}`;
      let cv = sprites.get(key);
      if (!cv) {
        if (sprites.size > 500) sprites.clear();
        const size = (base + SPRITE_PAD) * 2;
        cv = document.createElement("canvas");
        cv.width = size * DPR;
        cv.height = size * DPR;
        const c = cv.getContext("2d");
        if (!c) return null;
        c.setTransform(DPR, 0, 0, DPR, 0, 0);
        const cx = size / 2;
        const cy = size / 2;
        const r = base;
        const grad = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
        grad.addColorStop(0, bubbleColor(b, 0.42, pal.neutral));
        grad.addColorStop(1, bubbleColor(b, 0.1, pal.neutral));
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fillStyle = grad;
        c.fill();
        c.lineWidth = 1.6;
        c.strokeStyle = bubbleColor(b, 0.95, pal.neutral);
        c.stroke();
        if (logoOk && entry) {
          const logoR = r * 0.3;
          c.save();
          c.globalAlpha = 0.95;
          c.beginPath();
          c.arc(cx, cy - r * 0.42, logoR, 0, Math.PI * 2);
          c.clip();
          c.drawImage(entry.img, cx - logoR, cy - r * 0.42 - logoR, logoR * 2, logoR * 2);
          c.restore();
        }
        c.fillStyle = `rgba(${pal.text},0.96)`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        const fs = Math.max(10, r * 0.34);
        c.font = `600 ${fs}px ${monoFam}`;
        const tickY = logoOk ? cy + r * 0.12 : cy - (r > 34 ? fs * 0.35 : 0);
        c.fillText(b.t, cx, tickY);
        if (r > 32) {
          c.font = `400 ${Math.max(9, r * 0.2)}px ${monoFam}`;
          c.fillStyle = `rgba(${pal.text},0.6)`;
          c.fillText(fmtM(b.data.total), cx, tickY + fs * 0.95);
        }
        if (b.data.buys.length > 1) {
          const bx = cx + r * 0.72;
          const by = cy - r * 0.72;
          c.beginPath();
          c.arc(bx, by, 10.5, 0, Math.PI * 2);
          c.fillStyle = pal.badge;
          c.fill();
          c.strokeStyle = bubbleColor(b, 1, pal.neutral);
          c.lineWidth = 1.4;
          c.stroke();
          c.fillStyle = `rgba(${pal.text},0.95)`;
          c.font = `600 9.5px ${monoFam}`;
          c.fillText(`×${b.data.buys.length}`, bx, by + 0.5);
        }
        sprites.set(key, cv);
      }
      return { cv, base };
    };

    const draw = () => {
      const bodies = bodiesRef.current;
      const pal = PALETTES[themeRef.current];
      if (!bgGrad || bgTheme !== themeRef.current) {
        bgTheme = themeRef.current;
        bgGrad = ctx.createRadialGradient(W / 2, H * 0.42, 80, W / 2, H * 0.42, Math.max(W, H) * 0.75);
        bgGrad.addColorStop(0, pal.bgIn);
        bgGrad.addColorStop(1, pal.bgOut);
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      for (const p of pulsesRef.current) {
        const t = p.age / 1600;
        const b = bodies.find((x) => x.t === p.t);
        if (!b) continue;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 6 + t * 60, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(232,181,77,${0.75 * (1 - t)})`;
        ctx.lineWidth = 2.5 * (1 - t);
        ctx.stroke();
      }

      const focusT = focusIdxRef.current >= 0 ? bodies[focusIdxRef.current]?.t : null;

      for (const b of bodies) {
        const dim = dimFor(b);
        if (b.expandT > 0.02) {
          for (const s of satellitesFor(b)) {
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(s.x, s.y);
            ctx.strokeStyle = `rgba(${pal.neutral},${0.45 * b.expandT * dim})`;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${pal.sat},${0.92 * b.expandT * dim})`;
            ctx.fill();
            ctx.fillStyle = bubbleColor(b, 0.16 * b.expandT * dim, pal.neutral);
            ctx.fill();
            ctx.strokeStyle = bubbleColor(b, 0.95 * b.expandT * dim, pal.neutral);
            ctx.lineWidth = 1.5;
            ctx.stroke();
            if (s.r > 8) {
              ctx.fillStyle = `rgba(${pal.text},${b.expandT * dim})`;
              ctx.font = `500 ${Math.max(8, s.r * 0.55)}px ${monoFam}`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(roleTag(s.buy.role, s.buy.title), s.x, s.y);
            }
          }
        }

        const spr = spriteFor(b);
        if (spr) {
          const k = b.r / spr.base;
          const half = (spr.base + SPRITE_PAD) * k;
          if (dim < 1) ctx.globalAlpha = dim;
          ctx.drawImage(spr.cv, b.x - half, b.y - half, half * 2, half * 2);
          if (dim < 1) ctx.globalAlpha = 1;
        }
        const isSel = b.t === selectedRef.current;
        if (isSel || b === hover || b.t === focusT) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + (isSel ? 1 : 3.5), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${pal.text},${(isSel ? 0.95 : 0.35) * dim})`;
          ctx.lineWidth = isSel ? 2.5 : 1;
          ctx.stroke();
        }
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(now - last, 40);
      last = now;
      tick(dt, now);
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    /* pointer interaction */
    const hitTest = (x: number, y: number): { bubble?: Body; sat?: Satellite } | null => {
      const bodies = bodiesRef.current;
      for (const b of bodies)
        if (b.expandT > 0.5)
          for (const s of satellitesFor(b)) if (Math.hypot(x - s.x, y - s.y) < s.r + 4) return { sat: s };
      for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i];
        if (Math.hypot(x - b.x, y - b.y) < b.r) return { bubble: b };
      }
      return null;
    };

    const showTooltip = (x: number, y: number, html: string) => {
      tooltip.innerHTML = html;
      tooltip.style.display = "block";
      tooltip.style.left = `${Math.min(x + 16, W - 266)}px`;
      tooltip.style.top = `${Math.min(y + 14, H - 120)}px`;
    };
    const hideTooltip = () => {
      tooltip.style.display = "none";
    };

    const onMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      if (dragTarget) {
        dragMoved += Math.hypot(x - lastPointer.x, y - lastPointer.y);
        dragTarget.vx = (x - lastPointer.x) * 0.9;
        dragTarget.vy = (y - lastPointer.y) * 0.9;
        dragTarget.x = x;
        dragTarget.y = y;
        lastPointer = { x, y };
        return;
      }
      const hit = hitTest(x, y);
      hover = hit?.bubble || null;
      canvas.style.cursor = hit ? "pointer" : "grab";
      if (hit?.sat) {
        const s = hit.sat;
        showTooltip(
          x,
          y,
          `<div class="bm-tt-head">${s.buy.who}</div>` +
            `${s.buy.title || s.buy.role} &middot; bought ${fmtM(s.buy.val)}<br>` +
            `${Math.round(s.buy.sh).toLocaleString()} sh @ $${s.buy.px.toFixed(2)}` +
            `<br><span class="bm-tt-faint">Filed ${agoLabel(s.buy.d)}</span>`,
        );
      } else if (hit?.bubble) {
        const b = hit.bubble;
        showTooltip(
          x,
          y,
          `<div class="bm-tt-head">${b.data.name} (${b.t})</div>` +
            `${b.data.buys.length} insider${b.data.buys.length > 1 ? "s" : ""} bought ${fmtM(b.data.total)}` +
            ` &middot; avg $${b.data.vwaip.toFixed(2)}` +
            `<br><span class="bm-tt-faint">Click for profile${b.data.buys.length > 1 ? " &amp; cluster" : ""}</span>`,
        );
      } else hideTooltip();
    };

    const onDown = (e: PointerEvent) => {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit?.bubble) {
        dragTarget = hit.bubble;
        dragMoved = 0;
        lastPointer = { x: e.clientX, y: e.clientY };
        canvas.classList.add("bm-dragging");
        canvas.setPointerCapture(e.pointerId);
      } else if (!hit) {
        openPanelRef.current(null);
        for (const b of bodiesRef.current) b.expanded = false;
      }
    };

    const onUp = () => {
      canvas.classList.remove("bm-dragging");
      if (dragTarget && dragMoved < 6) {
        const b = dragTarget;
        if (b.data.buys.length > 1) b.expanded = !b.expanded;
        openPanelRef.current(b.t);
      }
      dragTarget = null;
    };

    const onLeave = () => {
      hideTooltip();
      hover = null;
    };

    const onKey = (e: KeyboardEvent) => {
      const bodies = bodiesRef.current;
      if (e.key === "Escape") {
        openPanelRef.current(null);
        for (const b of bodies) b.expanded = false;
        focusIdxRef.current = -1;
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (!bodies.length) return;
        const dir = e.key === "ArrowRight" ? 1 : -1;
        focusIdxRef.current = (focusIdxRef.current + dir + bodies.length) % bodies.length;
      }
      if (e.key === "Enter" && focusIdxRef.current >= 0) {
        const b = bodies[focusIdxRef.current];
        if (b) {
          if (b.data.buys.length > 1) b.expanded = !b.expanded;
          openPanelRef.current(b.t);
        }
      }
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("keydown", onKey);
    };
  }, []);

  /* Search → jump: Enter opens the best match. */
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const q = query.trim().toUpperCase();
    if (!q) return;
    const b =
      bodiesRef.current.find((x) => x.t === q) ||
      bodiesRef.current.find((x) => x.t.startsWith(q)) ||
      bodiesRef.current.find((x) => x.data.name.toUpperCase().includes(q));
    if (b) setSelected(b.t);
  };

  const current = useMemo(
    () => (selected && data?.bubbles ? data.bubbles.find((b) => b.t === selected) || null : null),
    [selected, data],
  );

  const totals = useMemo(() => {
    if (!data?.bubbles?.length) return null;
    const total = data.bubbles.reduce((s, b) => s + b.total, 0);
    const clusters = data.bubbles.filter((b) => b.buys.length >= 3).length;
    return { n: data.bubbles.length, total, clusters };
  }, [data]);

  const updatedAgo = useMemo(() => {
    if (!data?.generatedAt) return null;
    const m = Math.max(0, Math.round((Date.now() - Date.parse(data.generatedAt)) / 60_000));
    return m === 0 ? "just now" : `${m}m ago`;
  }, [data]);

  const empty = booted && !isLoading && data && data.bubbles.length === 0;

  return (
    <div
      className={`bm-root ${theme === "light" ? "bm-light" : ""} ${archivo.variable} ${plexMono.variable} ${nunito.variable}`}
      style={{ zoom: invZoom } as React.CSSProperties}
    >
      <canvas
        ref={canvasRef}
        className="bm-field"
        tabIndex={0}
        aria-label="Insider buying bubble map. Bubbles represent insider purchases of $250,000 or more; click a bubble for company details. Use arrow keys to cycle bubbles, Enter to open one."
      />

      <header className="bm-top">
        <Link href="/" className="bm-back" aria-label="Back to InsiderBuying.com">
          &larr; InsiderBuying.com
        </Link>
        <div className="bm-brand">
          <h1>
            INSIDER BUBBLES<span className="bm-dot">.</span>
          </h1>
          <span className="bm-tag">Insider buys &ge; $250K</span>
        </div>
        <nav className="bm-windows" aria-label="Time window">
          {WINDOWS.map(([value, label]) => (
            <button
              key={value}
              className={value === win ? "bm-active" : ""}
              onClick={() => {
                setWin(value);
                for (const b of bodiesRef.current) b.expanded = false;
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <input
          className="bm-search"
          type="search"
          placeholder="Search ticker…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          aria-label="Search tickers on the map"
        />
        <div className="bm-live">
          <span className="bm-live-dot" /> LIVE{updatedAgo ? ` · ${updatedAgo}` : ""}
        </div>
        <button
          className="bm-mmenu-btn"
          aria-label="Time window and search"
          aria-expanded={mobileMenu}
          onClick={() => setMobileMenu((v) => !v)}
        >
          {WINDOWS.find(([v]) => v === win)?.[1] || win} ▾
        </button>
        {mobileMenu && (
          <div className="bm-mmenu">
            <input
              className="bm-search bm-mmenu-search"
              type="search"
              placeholder="Search ticker…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                onSearchKey(e);
                if (e.key === "Enter") setMobileMenu(false);
              }}
              aria-label="Search tickers on the map"
            />
            <div className="bm-mmenu-windows">
              {WINDOWS.map(([value, label]) => (
                <button
                  key={value}
                  className={value === win ? "bm-active" : ""}
                  onClick={() => {
                    setWin(value);
                    setMobileMenu(false);
                    for (const b of bodiesRef.current) b.expanded = false;
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="bm-legend">
        <div>
          <span className="bm-sw" style={{ background: "#3E9B5F" }} />
          Trading above insider cost basis
        </div>
        <div>
          <span className="bm-sw" style={{ background: "#C2504A" }} />
          Below insider cost — cheaper than the insiders paid
        </div>
        <div>
          <span className="bm-sw" style={{ background: "#E8B54D" }} />
          New filing on the tape
        </div>
        <div className="bm-note">
          Bubble size = total $ bought · &times;N badge = cluster buy · click to expand
        </div>
      </div>

      {totals && (
        <div className="bm-stats">
          {totals.n} stocks &middot; {fmtM(totals.total)} bought
          <br />
          {totals.clusters} cluster{totals.clusters === 1 ? "" : "s"} &middot; SEC Form 4 data
          <br />
          <span className="bm-stats-faint">Not financial advice</span>
        </div>
      )}

      {isLoading && !data && (
        <div className="bm-center-msg">
          <div className="bm-spin" />
          Loading the tape…
        </div>
      )}
      {error && !data && <div className="bm-center-msg">Couldn&apos;t load the map. Retrying…</div>}
      {empty && (
        <div className="bm-center-msg">
          <b>Quiet tape.</b>
          <span>
            No open-market insider buys of $250K+ {win === "1d" ? "filed today" : "in this window"} yet.
          </span>
          {win !== "30d" && (
            <button className="bm-widen" onClick={() => setWin("30d")}>
              Show the last 30 days
            </button>
          )}
        </div>
      )}

      <div ref={tooltipRef} className="bm-tooltip" role="tooltip" />

      <ProfilePanel
        bubble={current}
        win={win}
        unlocked={unlocked}
        onClose={() => {
          setSelected(null);
          for (const b of bodiesRef.current) b.expanded = false;
        }}
      />

      <style>{CSS_TEXT}</style>
    </div>
  );
}

/* ------------------------------------------------------- profile panel */

function ProfilePanel({
  bubble,
  win,
  unlocked,
  onClose,
}: {
  bubble: ApiBubble | null;
  win: string;
  unlocked: boolean;
  onClose: () => void;
}) {
  // Keep the last bubble while the close animation plays.
  const lastRef = useRef<ApiBubble | null>(null);
  if (bubble) lastRef.current = bubble;
  const c = bubble || lastRef.current;
  if (!c) return <aside className="bm-panel" aria-hidden="true" />;

  const winLabel = WINDOWS.find(([v]) => v === win)?.[1] || win.toUpperCase();
  const upside = c.target != null && c.price ? ((c.target - c.price) / c.price) * 100 : null;
  const net = c.total - c.sold;
  const buyPct = c.total + c.sold === 0 ? 50 : (c.total / (c.total + c.sold)) * 100;
  const ref = c.avg90 ?? c.price;
  const gap = ref != null && c.vwaip > 0 ? (ref - c.vwaip) / c.vwaip : null;
  const above = (gap ?? 0) >= 0;

  return (
    <aside className={`bm-panel ${bubble ? "bm-open" : ""}`} aria-label="Company profile">
      <button className="bm-panel-close" onClick={onClose} aria-label="Close profile">
        &#10005;
      </button>
      <div className="bm-panel-scroll">
        <div className="bm-p-tick">
          {c.t}
          {c.exch ? ` · ${c.exch}` : ""}
          {c.sector ? ` · ${c.sector}` : ""}
        </div>
        <div className="bm-p-name">{c.name}</div>
        <div className="bm-p-price-row">
          <span className="bm-p-price">{c.price != null ? `$${c.price.toFixed(2)}` : "—"}</span>
          {c.chg != null && (
            <span className="bm-p-chg" style={{ color: c.chg >= 0 ? "#3E9B5F" : "#C2504A" }}>
              {c.chg >= 0 ? "+" : ""}
              {c.chg.toFixed(2)}% today
            </span>
          )}
        </div>

        {gap != null && (
          <div className={`bm-p-basis ${above ? "bm-above" : "bm-below"}`}>
            {above ? (
              <>
                Trading <b>{(gap * 100).toFixed(1)}% above</b> insider cost.
              </>
            ) : (
              <>
                <b>{Math.abs(gap * 100).toFixed(1)}% below</b> insider cost — cheaper than the
                insiders paid.
              </>
            )}{" "}
            Insider avg <b>${c.vwaip.toFixed(2)}</b> vs {c.avg90 != null ? "90-day avg" : "current price"}{" "}
            <b>${(ref as number).toFixed(2)}</b>
          </div>
        )}

        {c.about && <div className="bm-p-about">{c.about}</div>}

        <div className="bm-p-grid">
          <div className="bm-p-cell">
            <div className="bm-lbl">Revenue (TTM)</div>
            <div className="bm-val">{c.rev != null ? fmtM(c.rev) : "—"}</div>
          </div>
          <div className="bm-p-cell">
            <div className="bm-lbl">Net income (TTM)</div>
            <div className="bm-val">{c.ni != null ? fmtM(c.ni) : "—"}</div>
          </div>
          <div className="bm-p-cell">
            <div className="bm-lbl">Insider Score</div>
            {unlocked ? (
              <div className="bm-val" style={{ color: (c.iq ?? 0) >= 80 ? "#3E9B5F" : undefined }}>
                {c.iq != null ? Math.round(c.iq) : "—"}
                {c.iq != null && <span className="bm-val-sub">/100</span>}
              </div>
            ) : (
              <Link href="/premium" className="bm-val bm-locked" aria-label="Unlock Insider Score">
                <span className="bm-blur">88</span>
                <Lock size={13} strokeWidth={2.5} />
              </Link>
            )}
          </div>
          <div className="bm-p-cell">
            <div className="bm-lbl">Analyst target</div>
            <div className="bm-val">{c.target != null ? `$${c.target.toFixed(0)}` : "—"}</div>
            {upside != null && (
              <div className="bm-sub" style={{ color: upside >= 0 ? "#3E9B5F" : "#C2504A" }}>
                {upside >= 0 ? "+" : ""}
                {upside.toFixed(0)}% upside
              </div>
            )}
          </div>
        </div>

        <div className="bm-p-section">Net insider flow · {winLabel}</div>
        <div className="bm-flowbar">
          <div className="bm-buyside" style={{ width: `${buyPct.toFixed(0)}%` }} />
        </div>
        <div className="bm-flow-lbls">
          <span style={{ color: "#3E9B5F" }}>{fmtM(c.total)} bought</span>
          <span>
            net {net >= 0 ? "+" : "−"}
            {fmtM(Math.abs(net))}
          </span>
          <span style={{ color: "#C2504A" }}>{fmtM(c.sold)} sold</span>
        </div>

        <div className="bm-p-section">Who bought ({c.buys.length})</div>
        {c.buys.map((x) => (
          <div className="bm-buyer" key={x.id}>
            <div className="bm-who">
              <b>{x.who}</b>
              <span>
                {x.title || x.role} · filed {agoLabel(x.d)}
              </span>
            </div>
            <div className="bm-amt">
              <b>{fmtM(x.val)}</b>
              <span>
                {Math.round(x.sh).toLocaleString()} sh @ ${x.px.toFixed(2)}
              </span>
            </div>
          </div>
        ))}

        <div className="bm-p-ctas">
          <Link className="bm-cta-main" href={`/companies/${encodeURIComponent(c.t)}`}>
            View the full {c.t} stock page &rarr;
          </Link>
        </div>
        <div className="bm-p-disclaimer">
          All figures trace to SEC Form 4 filings and licensed market data. Not financial advice.
        </div>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------- styles */

const CSS_TEXT = `
.bm-root {
  --bm-field: #0E1F35; --bm-ink: #F5F7FA; --bm-ink-dim: #9DB0C7; --bm-ink-faint: #5D7189;
  --bm-green: #3E9B5F; --bm-red: #C2504A; --bm-gold: #E8B54D;
  --bm-panel: #0B1B2F; --bm-line: rgba(157,176,199,0.14);
  --bm-mono-family: var(--bm-mono);
  position: fixed; inset: 0; z-index: 100; overflow: hidden;
  background: var(--bm-field); color: var(--bm-ink);
  font-family: var(--bm-sans), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.bm-field { position: absolute; inset: 0; display: block; cursor: grab; outline: none; touch-action: none; }
.bm-field.bm-dragging { cursor: grabbing; }

.bm-top {
  position: absolute; top: 0; left: 0; right: 0; z-index: 30;
  display: flex; align-items: center; gap: 14px; padding: 12px 20px;
  background: linear-gradient(180deg, rgba(8,21,37,0.94) 0%, rgba(8,21,37,0.65) 70%, rgba(8,21,37,0) 100%);
  pointer-events: none; flex-wrap: wrap;
}
.bm-top > * { pointer-events: auto; }
.bm-back {
  font-family: var(--bm-mono), monospace; font-size: 11px; letter-spacing: 0.5px;
  color: var(--bm-ink-faint); text-decoration: none; white-space: nowrap;
}
.bm-back:hover { color: var(--bm-ink); }
.bm-brand { display: flex; align-items: baseline; gap: 10px; }
.bm-brand h1 {
  font-family: var(--bm-head), sans-serif !important; font-weight: 900; font-size: 18px;
  letter-spacing: 0.2px; white-space: nowrap; margin: 0; color: var(--bm-ink);
}
.bm-dot { color: var(--bm-green); }
.bm-tag {
  font-family: var(--bm-mono), monospace; font-size: 10.5px; color: var(--bm-ink-faint);
  letter-spacing: 1.4px; text-transform: uppercase; white-space: nowrap;
}
.bm-windows {
  display: flex; gap: 2px; background: rgba(11,27,47,0.85);
  border: 1px solid var(--bm-line); border-radius: 9px; padding: 3px;
}
.bm-windows button {
  font-family: var(--bm-mono), monospace; font-size: 12px; font-weight: 500;
  color: var(--bm-ink-dim); background: transparent; border: 0; border-radius: 6px;
  padding: 6px 10px; cursor: pointer; transition: background 0.15s, color 0.15s;
}
.bm-windows button:hover { color: var(--bm-ink); }
.bm-windows button.bm-active { background: var(--bm-green); color: #06131f; font-weight: 600; }
.bm-windows button:focus-visible, .bm-panel-close:focus-visible, .bm-search:focus-visible {
  outline: 2px solid var(--bm-gold); outline-offset: 2px;
}
.bm-search {
  font-family: var(--bm-mono), monospace; font-size: 12px; color: var(--bm-ink);
  background: rgba(11,27,47,0.85); border: 1px solid var(--bm-line); border-radius: 9px;
  padding: 8px 12px; width: 150px; outline: none;
}
.bm-search::placeholder { color: var(--bm-ink-faint); }
.bm-live {
  margin-left: auto; font-family: var(--bm-mono), monospace; font-size: 11px;
  color: var(--bm-gold); white-space: nowrap; display: flex; align-items: center; gap: 6px;
}
.bm-live-dot {
  width: 7px; height: 7px; border-radius: 50%; background: var(--bm-gold);
  animation: bm-blink 2.4s ease-in-out infinite;
}
.bm-mmenu-btn {
  display: none; font-family: var(--bm-mono), monospace; font-size: 12px; font-weight: 600;
  color: var(--bm-ink); background: rgba(11,27,47,0.85); border: 1px solid var(--bm-line);
  border-radius: 9px; padding: 8px 12px; cursor: pointer; align-items: center; gap: 4px;
  white-space: nowrap;
}
.bm-root.bm-light .bm-mmenu-btn { background: rgba(255,255,255,0.92); }
.bm-mmenu {
  display: none; position: absolute; top: 52px; right: 10px; z-index: 60;
  background: var(--bm-panel); border: 1px solid var(--bm-line); border-radius: 12px;
  padding: 12px; width: 232px; box-shadow: 0 12px 40px rgba(0,0,0,0.45);
}
.bm-root.bm-light .bm-mmenu { box-shadow: 0 12px 40px rgba(14,31,53,0.2); }
.bm-mmenu-search { width: 100%; margin-bottom: 10px; }
.bm-mmenu-windows { display: flex; flex-wrap: wrap; gap: 6px; }
.bm-mmenu-windows button {
  font-family: var(--bm-mono), monospace; font-size: 12px; font-weight: 500;
  color: var(--bm-ink-dim); background: transparent; border: 1px solid var(--bm-line);
  border-radius: 7px; padding: 8px 4px; cursor: pointer; flex: 1 1 28%;
}
.bm-mmenu-windows button.bm-active {
  background: var(--bm-green); color: #06131f; border-color: var(--bm-green); font-weight: 600;
}
@keyframes bm-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }

.bm-legend {
  position: absolute; left: 20px; bottom: 16px; z-index: 20;
  font-size: 12px; color: var(--bm-ink-dim); line-height: 1.9;
  background: rgba(8,21,37,0.6); border-radius: 10px; padding: 10px 14px;
  backdrop-filter: blur(4px); pointer-events: none;
}
.bm-sw { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 7px; vertical-align: -1px; }
.bm-note { color: var(--bm-ink-faint); font-size: 11px; }
.bm-stats {
  position: absolute; right: 20px; bottom: 16px; z-index: 20;
  font-family: var(--bm-mono), monospace; font-size: 11px; color: var(--bm-ink-faint);
  text-align: right; line-height: 1.8; pointer-events: none;
}
.bm-stats-faint { opacity: 0.7; }

.bm-center-msg {
  position: absolute; inset: 0; z-index: 15; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; text-align: center;
  color: var(--bm-ink-dim); font-size: 14px; pointer-events: none; padding: 0 24px;
}
.bm-center-msg b { color: var(--bm-ink); font-family: var(--bm-head), sans-serif; font-size: 17px; }
.bm-widen {
  pointer-events: auto; margin-top: 6px; font-family: var(--bm-mono), monospace; font-size: 12px;
  color: var(--bm-ink); background: rgba(62,155,95,0.16); border: 1px solid rgba(62,155,95,0.5);
  border-radius: 8px; padding: 8px 14px; cursor: pointer;
}
.bm-spin {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--bm-line); border-top-color: var(--bm-green);
  animation: bm-rot 0.9s linear infinite;
}
@keyframes bm-rot { to { transform: rotate(360deg); } }

.bm-tooltip {
  position: absolute; z-index: 40; display: none; pointer-events: none;
  background: rgba(11,27,47,0.96); border: 1px solid var(--bm-line);
  border-radius: 9px; padding: 9px 12px; max-width: 250px;
  font-size: 12px; line-height: 1.55; color: var(--bm-ink-dim);
  box-shadow: 0 8px 28px rgba(0,0,0,0.45);
}
.bm-tt-head { font-family: var(--bm-mono), monospace; color: var(--bm-ink); font-weight: 600; }
.bm-tt-faint { color: var(--bm-ink-faint); }

.bm-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 392px; max-width: 94vw; z-index: 50;
  background: var(--bm-panel); border-left: 1px solid var(--bm-line);
  transform: translateX(102%); transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  display: flex; flex-direction: column;
  box-shadow: -24px 0 60px rgba(0,0,0,0.5);
}
.bm-panel.bm-open { transform: translateX(0); }
.bm-panel-scroll { overflow-y: auto; padding: 22px 24px 28px; flex: 1; }
.bm-panel-close {
  position: absolute; top: 14px; right: 16px; z-index: 2;
  background: rgba(157,176,199,0.1); border: 0; color: var(--bm-ink-dim);
  width: 30px; height: 30px; border-radius: 8px; font-size: 15px; cursor: pointer;
}
.bm-panel-close:hover { color: var(--bm-ink); background: rgba(157,176,199,0.2); }
.bm-p-tick { font-family: var(--bm-mono), monospace; font-size: 12px; color: var(--bm-ink-faint); letter-spacing: 1px; margin-bottom: 4px; }
.bm-p-name { font-family: var(--bm-head), sans-serif; font-weight: 800; font-size: 23px; line-height: 1.15; padding-right: 36px; }
.bm-p-price-row { display: flex; align-items: baseline; gap: 10px; margin: 10px 0 2px; font-family: var(--bm-mono), monospace; }
.bm-p-price { font-size: 26px; font-weight: 600; }
.bm-p-chg { font-size: 13px; font-weight: 500; }
.bm-p-basis { margin: 12px 0 16px; padding: 10px 13px; border-radius: 9px; font-size: 12.5px; line-height: 1.6; }
.bm-p-basis.bm-above { background: rgba(62,155,95,0.12); border: 1px solid rgba(62,155,95,0.35); }
.bm-p-basis.bm-below { background: rgba(194,80,74,0.12); border: 1px solid rgba(194,80,74,0.4); }
.bm-p-basis b { font-family: var(--bm-mono), monospace; font-weight: 600; }
.bm-p-about { font-size: 13.5px; color: var(--bm-ink-dim); line-height: 1.65; margin-bottom: 18px; }
.bm-p-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
.bm-p-cell { background: rgba(157,176,199,0.06); border-radius: 9px; padding: 10px 12px; }
.bm-lbl { font-size: 10.5px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--bm-ink-faint); margin-bottom: 4px; }
.bm-val { font-family: var(--bm-mono), monospace; font-size: 16px; font-weight: 600; color: var(--bm-ink); }
.bm-val-sub { font-size: 11px; color: var(--bm-ink-faint); }
.bm-sub { font-size: 11px; margin-top: 2px; }
.bm-locked { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--bm-ink-dim); }
.bm-blur { filter: blur(6px); user-select: none; }
.bm-p-section { font-family: var(--bm-head), sans-serif; font-weight: 800; font-size: 12px; letter-spacing: 1.6px; text-transform: uppercase; color: var(--bm-ink-dim); margin: 20px 0 10px; }
.bm-flowbar { height: 10px; border-radius: 5px; background: rgba(194,80,74,0.65); overflow: hidden; margin: 8px 0 6px; }
.bm-buyside { height: 100%; background: var(--bm-green); }
.bm-flow-lbls { display: flex; justify-content: space-between; font-family: var(--bm-mono), monospace; font-size: 11.5px; color: var(--bm-ink-dim); }
.bm-buyer { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--bm-line); font-size: 12.5px; }
.bm-buyer:last-of-type { border-bottom: 0; }
.bm-who b { display: block; color: var(--bm-ink); font-weight: 700; }
.bm-who span { color: var(--bm-ink-faint); font-size: 11.5px; }
.bm-amt { font-family: var(--bm-mono), monospace; text-align: right; white-space: nowrap; }
.bm-amt b { display: block; font-weight: 600; }
.bm-amt span { color: var(--bm-ink-faint); font-size: 11px; }
.bm-p-ctas { display: grid; gap: 9px; margin-top: 20px; }
.bm-p-ctas a {
  display: block; text-align: center; text-decoration: none; border-radius: 9px;
  font-family: var(--bm-head), sans-serif; font-weight: 800; font-size: 13.5px;
  letter-spacing: 0.4px; padding: 12px;
}
.bm-cta-main { background: var(--bm-green); color: #06131f; }
.bm-cta-main:hover { filter: brightness(1.08); }
.bm-cta-sub { border: 1px solid var(--bm-line); color: var(--bm-ink-dim); }
.bm-cta-sub:hover { color: var(--bm-ink); border-color: var(--bm-ink-faint); }
.bm-cta-quiet { color: var(--bm-ink-faint); font-weight: 600 !important; font-size: 12px !important; padding: 4px !important; }
.bm-cta-quiet:hover { color: var(--bm-ink); }
.bm-p-disclaimer { font-size: 10.5px; color: var(--bm-ink-faint); margin-top: 14px; line-height: 1.6; }

/* ── Light theme (follows the site's data-theme="light") ── */
.bm-root.bm-light {
  --bm-field: #F5F7FA; --bm-ink: #0E1F35; --bm-ink-dim: #4A5D75; --bm-ink-faint: #7C90A8;
  --bm-panel: #FFFFFF; --bm-line: rgba(14,31,53,0.14);
}
.bm-root.bm-light .bm-top { background: linear-gradient(180deg, rgba(245,247,250,0.96) 0%, rgba(245,247,250,0.72) 70%, rgba(245,247,250,0) 100%); }
.bm-root.bm-light .bm-windows, .bm-root.bm-light .bm-search { background: rgba(255,255,255,0.92); }
.bm-root.bm-light .bm-legend { background: rgba(255,255,255,0.72); }
.bm-root.bm-light .bm-tooltip { background: rgba(255,255,255,0.97); box-shadow: 0 8px 28px rgba(14,31,53,0.18); }
.bm-root.bm-light .bm-panel { box-shadow: -24px 0 60px rgba(14,31,53,0.16); }
.bm-root.bm-light .bm-p-cell { background: rgba(14,31,53,0.05); }
.bm-root.bm-light .bm-panel-close { background: rgba(14,31,53,0.07); }
.bm-root.bm-light .bm-live { color: #9A7118; }
.bm-root.bm-light .bm-live-dot { background: #C99525; }

@media (max-width: 640px) {
  .bm-panel {
    top: auto; left: 0; right: 0; width: 100%; max-width: none; height: 68vh;
    border-left: 0; border-top: 1px solid var(--bm-line);
    border-radius: 16px 16px 0 0; transform: translateY(104%);
  }
  .bm-panel.bm-open { transform: translateY(0); }
  .bm-top { gap: 8px; padding: 10px 12px; }
  .bm-tag, .bm-back { display: none; }
  .bm-windows, .bm-top > .bm-search, .bm-live { display: none; }
  .bm-mmenu-btn { display: inline-flex; margin-left: auto; }
  .bm-mmenu { display: block; }
  .bm-legend, .bm-stats { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .bm-panel { transition: none; }
  .bm-live-dot { animation: none; }
}
`;

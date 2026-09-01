"use client";

/**
 * CONGRESS BUBBLES — Developer Project Brief (Aug 24 2026), Workstream C §5.3.
 *
 *  "Same engine, new dataset: congressional Periodic Transaction Reports
 *   (House + Senate), refreshed daily. Each bubble displays the politician's
 *   face — circular-cropped official portrait rendered inside the bubble
 *   (unitedstates/images, keyed by bioguide ID). Bubble size: total reported
 *   trade volume in the selected period. Color: net buying (green) vs. net
 *   selling (red). Filters: chamber (House/Senate), party, time period (30/90
 *   days). Click panel: politician name, party/state, total buys, total
 *   sells, most-traded tickers, days-to-disclosure average, link to their
 *   profile page. PTR amounts are ranges — use range midpoints for sizing and
 *   state this in the methodology note."
 *
 * The engine is lib/bubbles-physics (shared with /bubbles). Rendering is
 * canvas with a per-body sprite cache — the portrait is clipped to a circle
 * once per (member, radius, theme) and blitted per frame, which is what keeps
 * a mid-range phone at 60fps (acceptance §10 C). Data is the pre-aggregated
 * /congressional-trades/bubbles payload; every dollar figure is a PTR range
 * midpoint, computed server-side and stated in the panel and on /methodology.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Archivo, IBM_Plex_Mono, Nunito_Sans } from "next/font/google";
import { API_BASE } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { effectiveZoom } from "@/lib/zoom";
import { stepPhysics, radiusForDollars, fitFactor, type PhysBody } from "@/lib/bubbles-physics";

const archivo = Archivo({ subsets: ["latin"], weight: ["600", "800", "900"], variable: "--bm-head" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--bm-mono" });
const nunito = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--bm-sans" });

/* ---------------------------------------------------------------- types */

interface ApiMember {
  name: string;
  chamber: "House" | "Senate";
  party: string | null;
  state: string | null;
  photo: string | null;
  buys: number;
  sells: number;
  buyCount: number;
  sellCount: number;
  volume: number;
  net: number;
  trades: number;
  lastTrade: string | null;
  avgDaysToDisclosure: number | null;
  topTickers: Array<{ ticker: string; name: string; volume: number; trades: number }>;
}

interface ApiPayload {
  period: string;
  generatedAt: string;
  method: string;
  count: number;
  bubbles: ApiMember[];
}

interface Body extends PhysBody {
  key: string;
  data: ApiMember;
}

type ThemeName = "dark" | "light";
type Chamber = "" | "House" | "Senate";
type Party = "" | "D" | "R" | "I";

const PERIODS: Array<[string, string]> = [
  ["30d", "30D"],
  ["90d", "90D"],
];
const CHAMBERS: Array<[Chamber, string]> = [
  ["", "Both"],
  ["House", "House"],
  ["Senate", "Senate"],
];
const PARTIES: Array<[Party, string]> = [
  ["", "All"],
  ["D", "Dem"],
  ["R", "Rep"],
  ["I", "Ind"],
];
const HEADER_CLEAR = 64;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ------------------------------------------------------------- helpers */

function fmtK(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

function partyName(p: string | null): string {
  return p === "D" ? "Democrat" : p === "R" ? "Republican" : p === "I" ? "Independent" : "—";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

const PALETTES = {
  dark: { text: "245,247,250", neutral: "120,138,160", badgeInk: "#06131f" },
  light: { text: "14,31,53", neutral: "120,138,160", badgeInk: "#ffffff" },
};

/** Net buying → green, net selling → red (brief §5.3). */
function tone(b: Body): string {
  return b.data.net >= 0 ? "62,155,95" : "194,80,74";
}

/* ---------------------------------------------------------------- page */

export default function CongressBubblesPage() {
  const [period, setPeriod] = useState("30d");
  const [chamber, setChamber] = useState<Chamber>("");
  const [party, setParty] = useState<Party>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [invZoom, setInvZoom] = useState(1);
  const [booted, setBooted] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("dark");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mapH, setMapH] = useState(600);
  const themeRef = useRef<ThemeName>("dark");
  themeRef.current = theme;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const bodiesRef = useRef<Body[]>([]);
  const selectedRef = useRef<string | null>(null);
  const queryRef = useRef("");
  const focusIdxRef = useRef(-1);
  const imgCacheRef = useRef(new Map<string, { img: HTMLImageElement; ok: boolean }>());
  const reduceMotionRef = useRef(false);
  const openPanelRef = useRef<(k: string | null) => void>(() => {});
  selectedRef.current = selected;
  queryRef.current = query.trim().toUpperCase();

  const qs = `period=${period}${chamber ? `&chamber=${chamber}` : ""}${party ? `&party=${party}` : ""}`;
  const { data, error, isLoading } = useSWR<ApiPayload>(
    `${API_BASE}/congressional-trades/bubbles?${qs}`,
    fetcher,
    { refreshInterval: 5 * 60_000, keepPreviousData: true },
  );

  /* URL state */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const per = (p.get("period") || "").toLowerCase();
    if (per === "30d" || per === "90d") setPeriod(per);
    const ch = p.get("chamber");
    if (ch === "House" || ch === "Senate") setChamber(ch);
    const pt = p.get("party");
    if (pt === "D" || pt === "R" || pt === "I") setParty(pt);
    const m = p.get("member");
    if (m) setSelected(m.toLowerCase());
    setBooted(true);
  }, []);
  useEffect(() => {
    if (!booted) return;
    const q =
      `?period=${period}` +
      (chamber ? `&chamber=${chamber}` : "") +
      (party ? `&party=${party}` : "") +
      (selected ? `&member=${encodeURIComponent(selected)}` : "");
    window.history.replaceState(null, "", `/congress-bubbles${q}`);
  }, [period, chamber, party, selected, booted]);

  useEffect(() => {
    const apply = () => {
      setInvZoom(1 / effectiveZoom());
      const hd = document.querySelector<HTMLElement>("[data-app-sticky]");
      setMapH(Math.max(380, window.innerHeight - (hd?.getBoundingClientRect().height || 0)));
    };
    apply();
    window.addEventListener("resize", apply);
    reduceMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const readTheme = () =>
      setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    readTheme();
    const mo = new MutationObserver(readTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("resize", apply);
      mo.disconnect();
    };
  }, []);

  const openPanel = useCallback((k: string | null) => setSelected(k), []);
  openPanelRef.current = openPanel;

  /* ------------------------------------------------ data → bodies sync */
  useEffect(() => {
    if (!data?.bubbles) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cap = W < 640 ? 40 : W < 1024 ? 90 : 160;
    const shown = data.bubbles.slice(0, cap);
    const rawR = new Map<string, number>();
    // Congressional trades are smaller than insider clusters — scale the
    // dollar axis so a $50K member is still a legible bubble.
    for (const m of shown) rawR.set(m.name.toLowerCase(), radiusForDollars(m.volume * 40));
    const k = fitFactor(Array.from(rawR.values()), W, H, HEADER_CLEAR);

    const prev = new Map(bodiesRef.current.map((b) => [b.key, b]));
    const next: Body[] = [];
    for (const m of shown) {
      const key = m.name.toLowerCase();
      const body: Body =
        prev.get(key) ||
        ({
          key,
          x: W * (0.12 + 0.76 * Math.random()),
          y: HEADER_CLEAR + (H - HEADER_CLEAR) * (0.15 + 0.7 * Math.random()),
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          r: 1,
          expanded: false,
          expandT: 0,
          seed: Math.random() * 1000,
        } as Body);
      body.data = m;
      body.targetR = Math.min(Math.max((rawR.get(key) || 24) * k, 18), Math.min(W, H) * 0.16);
      next.push(body);

      // Official portrait (public domain, unitedstates/images by bioguide ID),
      // loaded once per member. crossOrigin so the canvas stays untainted.
      const cache = imgCacheRef.current;
      if (m.photo && !cache.has(key)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const entry = { img, ok: false };
        img.onload = () => {
          entry.ok = img.naturalWidth > 0;
        };
        img.src = m.photo;
        cache.set(key, entry);
      }
    }
    bodiesRef.current = next;
    if (selectedRef.current && !next.find((b) => b.key === selectedRef.current)) setSelected(null);
  }, [data]);

  /* --------------------------------------------------- engine (mount) */
  useEffect(() => {
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !tooltip) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const monoFam =
      getComputedStyle(canvas).getPropertyValue("--bm-mono").trim() || '"IBM Plex Mono", monospace';
    const headFam =
      getComputedStyle(canvas).getPropertyValue("--bm-head").trim() || "Archivo, sans-serif";

    let W = 0;
    let H = 0;
    let DPR = 1;
    let raf = 0;
    let last = performance.now();
    let dragTarget: Body | null = null;
    let dragMoved = 0;
    let hover: Body | null = null;
    let bgGrad: CanvasGradient | null = null;
    let bgTheme = "";

    const holder = canvas.parentElement as HTMLElement;
    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = holder.clientWidth || window.innerWidth;
      H = holder.clientHeight || window.innerHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      bgGrad = null;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(holder);

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hit = (x: number, y: number): Body | null => {
      const bodies = bodiesRef.current;
      for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i];
        if (Math.hypot(x - b.x, y - b.y) <= b.r) return b;
      }
      return null;
    };
    const dimFor = (b: Body) => {
      const q = queryRef.current;
      if (!q) return 1;
      return b.data.name.toUpperCase().includes(q) || b.data.topTickers.some((t) => t.ticker.includes(q))
        ? 1
        : 0.14;
    };

    // ── Sprite cache: body + clipped portrait + labels, keyed by settled
    //    radius, so the per-frame cost is a drawImage per bubble.
    const sprites = new Map<string, HTMLCanvasElement>();
    const PAD = 14;
    const spriteFor = (b: Body): { cv: HTMLCanvasElement; base: number } | null => {
      const pal = PALETTES[themeRef.current];
      const base = Math.max(8, Math.round(b.targetR));
      const entry = imgCacheRef.current.get(b.key);
      const faceOk = !!entry?.ok && base >= 22;
      const key = `${b.key}|${themeRef.current}|${base}|${tone(b)}|${faceOk ? 1 : 0}|${b.data.volume}`;
      let cv = sprites.get(key);
      if (!cv) {
        if (sprites.size > 400) sprites.clear();
        const size = (base + PAD) * 2;
        cv = document.createElement("canvas");
        cv.width = size * DPR;
        cv.height = size * DPR;
        const c = cv.getContext("2d");
        if (!c) return null;
        c.setTransform(DPR, 0, 0, DPR, 0, 0);
        const cx = size / 2;
        const cy = size / 2;
        const r = base;
        const rgb = tone(b);
        // body
        const grad = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
        grad.addColorStop(0, `rgba(${rgb},0.55)`);
        grad.addColorStop(1, `rgba(${rgb},0.18)`);
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fillStyle = grad;
        c.fill();
        // face — circular crop filling most of the bubble (brief §5.3)
        const faceR = r * (r > 40 ? 0.74 : 0.8);
        if (faceOk && entry) {
          c.save();
          c.beginPath();
          c.arc(cx, cy, faceR, 0, Math.PI * 2);
          c.clip();
          // official portraits are 450x550 with the face in the upper 60% —
          // cover-fit and bias upward.
          const iw = entry.img.naturalWidth;
          const ih = entry.img.naturalHeight;
          const scale = (faceR * 2) / Math.min(iw, ih);
          const dw = iw * scale;
          const dh = ih * scale;
          c.drawImage(entry.img, cx - dw / 2, cy - faceR - (dh - faceR * 2) * 0.18, dw, dh);
          c.restore();
        } else {
          c.beginPath();
          c.arc(cx, cy, faceR, 0, Math.PI * 2);
          c.fillStyle = `rgba(${rgb},0.35)`;
          c.fill();
          c.fillStyle = `rgba(${pal.text},0.9)`;
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.font = `800 ${Math.max(11, faceR * 0.7)}px ${headFam}`;
          c.fillText(initials(b.data.name), cx, cy);
        }
        // ring
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.lineWidth = 2.2;
        c.strokeStyle = `rgba(${rgb},0.95)`;
        c.stroke();
        // party badge (top-left) and volume (bottom) for larger bubbles
        if (r >= 26) {
          const p = b.data.party || "";
          if (p) {
            const bx = cx - r * 0.7;
            const by = cy - r * 0.7;
            c.beginPath();
            c.arc(bx, by, 10, 0, Math.PI * 2);
            c.fillStyle = p === "D" ? "#3B7DD8" : p === "R" ? "#D9534F" : "#8A8F98";
            c.fill();
            c.fillStyle = "#fff";
            c.font = `700 11px ${monoFam}`;
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.fillText(p, bx, by + 0.5);
          }
          const label = fmtK(b.data.volume);
          c.font = `600 ${Math.max(10, r * 0.26)}px ${monoFam}`;
          const tw = c.measureText(label).width + 12;
          const ly = cy + r * 0.78;
          c.fillStyle = themeRef.current === "dark" ? "rgba(6,19,31,0.85)" : "rgba(255,255,255,0.92)";
          c.beginPath();
          c.roundRect(cx - tw / 2, ly - 9, tw, 18, 9);
          c.fill();
          c.fillStyle = `rgba(${pal.text},0.95)`;
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText(label, cx, ly + 0.5);
        }
        sprites.set(key, cv);
      }
      return { cv, base };
    };

    const draw = () => {
      const pal = PALETTES[themeRef.current];
      if (!bgGrad || bgTheme !== themeRef.current) {
        bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.3, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
        if (themeRef.current === "dark") {
          bgGrad.addColorStop(0, "#132741");
          bgGrad.addColorStop(1, "#0B1728");
        } else {
          bgGrad.addColorStop(0, "#FFFFFF");
          bgGrad.addColorStop(1, "#EAF0F7");
        }
        bgTheme = themeRef.current;
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
      const sel = selectedRef.current;
      for (const b of bodiesRef.current) {
        const sp = spriteFor(b);
        if (!sp) continue;
        const scale = b.r / sp.base;
        const half = (sp.cv.width / DPR / 2) * scale;
        ctx.globalAlpha = dimFor(b) * (sel && sel !== b.key ? 0.55 : 1);
        ctx.drawImage(sp.cv, b.x - half, b.y - half, half * 2, half * 2);
        if (sel === b.key || hover === b) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#E8B54D";
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      // name under the hovered / selected bubble
      const focus = hover || bodiesRef.current.find((b) => b.key === sel) || null;
      if (focus) {
        ctx.font = `700 12px ${monoFam}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const label = focus.data.name;
        const tw = ctx.measureText(label).width + 14;
        const y = focus.y + focus.r + 8;
        ctx.fillStyle = themeRef.current === "dark" ? "rgba(6,19,31,0.9)" : "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.roundRect(focus.x - tw / 2, y, tw, 20, 6);
        ctx.fill();
        ctx.fillStyle = `rgba(${pal.text},0.95)`;
        ctx.fillText(label, focus.x, y + 4);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      stepPhysics(bodiesRef.current, dt, now, {
        width: W,
        height: H,
        headerClear: HEADER_CLEAR,
        dragTarget,
        reduceMotion: reduceMotionRef.current,
        expandRadius: 0,
      });
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ── pointer
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      dragTarget = hit(p.x, p.y);
      dragMoved = 0;
      if (dragTarget) canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (dragTarget) {
        dragMoved += Math.hypot(e.movementX, e.movementY);
        dragTarget.x = p.x;
        dragTarget.y = p.y;
        dragTarget.vx = 0;
        dragTarget.vy = 0;
        return;
      }
      hover = hit(p.x, p.y);
      canvas.style.cursor = hover ? "pointer" : "default";
      if (hover) {
        const m = hover.data;
        tooltip.innerHTML =
          `<div class="bm-tt-head">${m.name}</div>` +
          `${partyName(m.party)}${m.state ? ` · ${m.state}` : ""} · ${m.chamber}<br>` +
          `${m.trades} trade${m.trades === 1 ? "" : "s"} · ${fmtK(m.volume)} reported` +
          `<br><span class="bm-tt-faint">Click for profile</span>`;
        tooltip.style.opacity = "1";
        tooltip.style.transform = `translate(${Math.min(p.x + 14, W - 240)}px, ${Math.max(HEADER_CLEAR, p.y - 10)}px)`;
      } else {
        tooltip.style.opacity = "0";
      }
    };
    const onUp = (e: PointerEvent) => {
      if (dragTarget && dragMoved < 6) openPanelRef.current(dragTarget.key);
      if (dragTarget) canvas.releasePointerCapture(e.pointerId);
      dragTarget = null;
    };
    const onLeave = () => {
      hover = null;
      tooltip.style.opacity = "0";
    };
    // ── keyboard: arrows cycle, Enter opens, Escape closes (acceptance §10)
    const onKey = (e: KeyboardEvent) => {
      const bodies = bodiesRef.current;
      if (!bodies.length) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        focusIdxRef.current = (focusIdxRef.current + 1) % bodies.length;
        hover = bodies[focusIdxRef.current];
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        focusIdxRef.current = (focusIdxRef.current - 1 + bodies.length) % bodies.length;
        hover = bodies[focusIdxRef.current];
        e.preventDefault();
      } else if (e.key === "Enter" && hover) {
        openPanelRef.current(hover.key);
      } else if (e.key === "Escape") {
        openPanelRef.current(null);
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("keydown", onKey);
    };
  }, []);

  const current = useMemo(
    () => (selected && data?.bubbles ? data.bubbles.find((m) => m.name.toLowerCase() === selected) || null : null),
    [selected, data],
  );
  const totals = useMemo(() => {
    if (!data?.bubbles?.length) return null;
    const vol = data.bubbles.reduce((s, m) => s + m.volume, 0);
    const buys = data.bubbles.reduce((s, m) => s + m.buys, 0);
    const sells = data.bubbles.reduce((s, m) => s + m.sells, 0);
    return { n: data.bubbles.length, vol, buys, sells };
  }, [data]);
  const empty = booted && !isLoading && data && data.bubbles.length === 0;

  return (
    <div
      className={`bm-root ${theme === "light" ? "bm-light" : ""} ${archivo.variable} ${plexMono.variable} ${nunito.variable}`}
      style={{ zoom: invZoom, height: mapH } as React.CSSProperties}
    >
      <canvas
        ref={canvasRef}
        className="bm-field"
        tabIndex={0}
        aria-label="Congress bubbles map. Each bubble is a member of Congress sized by reported trade volume in the period; click a bubble for details. Use arrow keys to cycle members, Enter to open one."
      />

      <header className="bm-top">
        <div className="bm-brand">
          <h1>
            CONGRESS BUBBLES<span className="bm-dot">.</span>
          </h1>
          <span className="bm-tag">House + Senate PTRs</span>
        </div>
        <nav className="bm-windows bm-period" aria-label="Time period">
          {PERIODS.map(([v, l]) => (
            <button key={v} className={v === period ? "bm-active" : ""} onClick={() => setPeriod(v)}>
              {l}
            </button>
          ))}
        </nav>
        <nav className="bm-windows bm-desk" aria-label="Chamber">
          {CHAMBERS.map(([v, l]) => (
            <button key={v || "both"} className={v === chamber ? "bm-active" : ""} onClick={() => setChamber(v)}>
              {l}
            </button>
          ))}
        </nav>
        <nav className="bm-windows bm-desk" aria-label="Party">
          {PARTIES.map(([v, l]) => (
            <button key={v || "all"} className={v === party ? "bm-active" : ""} onClick={() => setParty(v)}>
              {l}
            </button>
          ))}
        </nav>
        <input
          className="bm-search bm-desk"
          type="search"
          placeholder="Search member or ticker…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search members on the map"
        />
        <Link href="/bubbles" className="bm-switch bm-desk" title="Switch to Insider Bubbles">
          &larr; Insiders
        </Link>
        <div className="bm-live">
          <span className="bm-live-dot" /> DAILY
        </div>
        <span className="bm-theme">
          <ThemeToggle />
        </span>
        <button
          className="bm-mmenu-btn"
          aria-label="Filters"
          aria-expanded={mobileMenu}
          onClick={() => setMobileMenu((v) => !v)}
        >
          Filters ▾
        </button>
        {mobileMenu && (
          <div className="bm-mmenu">
            <input
              className="bm-search bm-mmenu-search"
              type="search"
              placeholder="Search member or ticker…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search members on the map"
            />
            <div className="bm-mmenu-lbl">Period</div>
            <div className="bm-mmenu-windows">
              {PERIODS.map(([v, l]) => (
                <button key={v} className={v === period ? "bm-active" : ""} onClick={() => setPeriod(v)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="bm-mmenu-lbl">Chamber</div>
            <div className="bm-mmenu-windows">
              {CHAMBERS.map(([v, l]) => (
                <button key={v || "both"} className={v === chamber ? "bm-active" : ""} onClick={() => setChamber(v)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="bm-mmenu-lbl">Party</div>
            <div className="bm-mmenu-windows">
              {PARTIES.map(([v, l]) => (
                <button key={v || "all"} className={v === party ? "bm-active" : ""} onClick={() => setParty(v)}>
                  {l}
                </button>
              ))}
            </div>
            <Link href="/bubbles" className="bm-mmenu-link">
              &larr; Insider Bubbles
            </Link>
          </div>
        )}
      </header>

      <div className="bm-legend">
        <div>
          <span className="bm-sw" style={{ background: "#3E9B5F" }} />
          Net buying in the period
        </div>
        <div>
          <span className="bm-sw" style={{ background: "#C2504A" }} />
          Net selling in the period
        </div>
        <div className="bm-note">
          Bubble size = total reported trade volume (PTR range midpoints) · D/R badge = party ·{" "}
          <Link href="/methodology#congress-bubbles" className="bm-method">
            methodology
          </Link>
        </div>
      </div>

      {totals && (
        <div className="bm-stats">
          {totals.n} member{totals.n === 1 ? "" : "s"} &middot; {fmtK(totals.vol)} reported
          <br />
          <span style={{ color: "#3E9B5F" }}>{fmtK(totals.buys)} bought</span> &middot;{" "}
          <span style={{ color: "#C2504A" }}>{fmtK(totals.sells)} sold</span>
          <br />
          <span className="bm-stats-faint">Range midpoints · Not financial advice</span>
        </div>
      )}

      {isLoading && !data && (
        <div className="bm-center-msg">
          <div className="bm-spin" />
          Loading disclosures…
        </div>
      )}
      {error && !data && <div className="bm-center-msg">Couldn&apos;t load the map. Retrying…</div>}
      {empty && (
        <div className="bm-center-msg">
          <b>No disclosures.</b>
          <span>No Periodic Transaction Reports match these filters in the last {period === "90d" ? 90 : 30} days.</span>
          {(chamber || party || period === "30d") && (
            <button
              className="bm-widen"
              onClick={() => {
                setChamber("");
                setParty("");
                setPeriod("90d");
              }}
            >
              Show everything, last 90 days
            </button>
          )}
        </div>
      )}

      <div ref={tooltipRef} className="bm-tooltip" role="tooltip" />

      <MemberPanel member={current} period={period} method={data?.method} onClose={() => setSelected(null)} />

      <style>{CSS_TEXT}</style>
    </div>
  );
}

/* -------------------------------------------------------- member panel */

function MemberPanel({
  member,
  period,
  method,
  onClose,
}: {
  member: ApiMember | null;
  period: string;
  method?: string;
  onClose: () => void;
}) {
  const lastRef = useRef<ApiMember | null>(null);
  if (member) lastRef.current = member;
  const m = member || lastRef.current;
  if (!m) return <aside className="bm-panel" aria-hidden="true" />;
  const buyPct = m.buys + m.sells === 0 ? 50 : (m.buys / (m.buys + m.sells)) * 100;
  const days = period === "90d" ? 90 : 30;

  return (
    <aside className={`bm-panel ${member ? "bm-open" : ""}`} aria-label="Member profile">
      <button className="bm-panel-close" onClick={onClose} aria-label="Close profile">
        &#10005;
      </button>
      <div className="bm-panel-scroll">
        {/* Brief §5.3 click panel: name, party/state, total buys, total sells,
            most-traded tickers, days-to-disclosure average, link to profile. */}
        <div className="bm-p-head">
          {m.photo ? (
            <img className="bm-p-face" src={m.photo} alt="" width={56} height={56} />
          ) : (
            <div className="bm-p-face bm-p-face-txt">{initials(m.name)}</div>
          )}
          <div>
            <div className="bm-p-name">{m.name}</div>
            <div className="bm-p-tick">
              {partyName(m.party)}
              {m.state ? ` · ${m.state}` : ""} · {m.chamber}
            </div>
          </div>
        </div>

        {/* Client request 2026-08-28: who this person is — party, committees,
            and the policy areas they are most influential on. Grounded on the
            public legislators roster; cached server-side for 30 days. */}
        <MemberAbout name={m.name} />

        <div className="bm-p-grid">
          <div className="bm-p-cell">
            <div className="bm-lbl">Total buys · {days}d</div>
            <div className="bm-val" style={{ color: "#3E9B5F" }}>
              {fmtK(m.buys)}
            </div>
            <div className="bm-sub">{m.buyCount} purchase{m.buyCount === 1 ? "" : "s"}</div>
          </div>
          <div className="bm-p-cell">
            <div className="bm-lbl">Total sells · {days}d</div>
            <div className="bm-val" style={{ color: "#C2504A" }}>
              {fmtK(m.sells)}
            </div>
            <div className="bm-sub">{m.sellCount} sale{m.sellCount === 1 ? "" : "s"}</div>
          </div>
          <div className="bm-p-cell">
            <div className="bm-lbl">Days to disclosure</div>
            <div className="bm-val">{m.avgDaysToDisclosure != null ? m.avgDaysToDisclosure : "—"}</div>
            <div className="bm-sub">average, trade → PTR filed</div>
          </div>
          <div className="bm-p-cell">
            <div className="bm-lbl">Last trade</div>
            <div className="bm-val">{m.lastTrade ?? "—"}</div>
            <div className="bm-sub">{m.trades} trade{m.trades === 1 ? "" : "s"} in period</div>
          </div>
        </div>

        <div className="bm-p-section">Net flow · {days}d</div>
        <div className="bm-flowbar">
          <div className="bm-buyside" style={{ width: `${buyPct.toFixed(0)}%` }} />
        </div>
        <div className="bm-flow-lbls">
          <span style={{ color: "#3E9B5F" }}>{fmtK(m.buys)} bought</span>
          <span>
            net {m.net >= 0 ? "+" : "−"}
            {fmtK(Math.abs(m.net))}
          </span>
          <span style={{ color: "#C2504A" }}>{fmtK(m.sells)} sold</span>
        </div>

        <div className="bm-p-section">Most-traded tickers</div>
        {m.topTickers.map((t) => (
          <div className="bm-buyer" key={t.ticker}>
            <div className="bm-who">
              <b>
                <Link href={`/companies/${encodeURIComponent(t.ticker)}`}>{t.ticker}</Link>
              </b>
              <span>{t.name}</span>
            </div>
            <div className="bm-amt">
              <b>{fmtK(t.volume)}</b>
              <span>
                {t.trades} trade{t.trades === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        ))}

        <div className="bm-p-ctas">
          <Link className="bm-cta-main" href={`/politicians/${encodeURIComponent(m.name)}`}>
            View {m.name}&rsquo;s full profile &rarr;
          </Link>
        </div>
        <div className="bm-p-disclaimer">
          {method ??
            "Periodic Transaction Reports disclose amounts as ranges; every dollar figure here is the range midpoint."}{" "}
          Source: House and Senate disclosures. Not financial advice.{" "}
          <Link href="/methodology#congress-bubbles">Methodology</Link>
        </div>
      </div>
    </aside>
  );
}

/* --------------------------------------------------------- about blurb */

interface MemberBio {
  summary: string;
  influence: string[];
  committees: string[];
  source: string;
}

function MemberAbout({ name }: { name: string }) {
  const { data, isLoading } = useSWR<{ bio: MemberBio | null }>(
    `${API_BASE}/congressional-trades/member-bio?name=${encodeURIComponent(name)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 },
  );
  const bio = data?.bio ?? null;
  if (!bio && !isLoading) return null;
  return (
    <div className="bm-about" aria-live="polite">
      <div className="bm-p-section">About</div>
      {isLoading && !bio ? (
        <div className="bm-about-skel">
          <span /><span /><span style={{ width: "60%" }} />
        </div>
      ) : bio ? (
        <>
          <p className="bm-about-txt">{bio.summary}</p>
          {bio.influence.length > 0 && (
            <div className="bm-about-row">
              <span className="bm-lbl">Most influential on</span>
              <div className="bm-chips">
                {bio.influence.map((t) => (
                  <span className="bm-chip" key={t}>{t}</span>
                ))}
              </div>
            </div>
          )}
          {bio.committees.length > 0 && (
            <div className="bm-about-row">
              <span className="bm-lbl">Committees</span>
              <div className="bm-about-coms">{bio.committees.join(" · ")}</div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- styles */

const CSS_TEXT = `
.bm-root {
  --bm-field: #0E1F35; --bm-ink: #F5F7FA; --bm-ink-dim: #9DB0C7; --bm-ink-faint: #5D7189;
  --bm-green: #3E9B5F; --bm-red: #C2504A; --bm-gold: #E8B54D;
  --bm-panel: #0B1B2F; --bm-line: rgba(157,176,199,0.14);
  position: relative; width: 100%; overflow: hidden;
  background: var(--bm-field); color: var(--bm-ink);
  font-family: var(--bm-sans), system-ui, sans-serif;
}
.bm-root.bm-light {
  --bm-field: #F3F6FA; --bm-ink: #0E1F35; --bm-ink-dim: #4A5D75; --bm-ink-faint: #7C90A8;
  --bm-panel: #FFFFFF; --bm-line: rgba(14,31,53,0.12);
}
.bm-about { margin: 4px 0 2px; }
.bm-about-txt { font-size: 13px; line-height: 1.55; color: var(--bm-ink); margin: 0 0 8px; }
.bm-about-row { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.bm-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.bm-chip { font-size: 11px; line-height: 1; padding: 5px 8px; border-radius: 999px; border: 1px solid var(--bm-gold); color: var(--bm-gold); background: rgba(232,181,77,0.10); text-transform: lowercase; }
.bm-about-coms { font-size: 11.5px; line-height: 1.45; color: var(--bm-ink-dim); }
.bm-about-skel { display: flex; flex-direction: column; gap: 6px; }
.bm-about-skel span { display: block; height: 11px; border-radius: 4px; background: var(--bm-line); animation: bm-pulse 1.2s ease-in-out infinite; }
@keyframes bm-pulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .bm-about-skel span { animation: none; } }
.bm-field { position: absolute; inset: 0; width: 100%; height: 100%; display: block; outline: none; touch-action: none; }
.bm-field:focus-visible { box-shadow: inset 0 0 0 3px var(--bm-gold); }
.bm-top {
  position: absolute; top: 0; left: 0; right: 0; height: ${HEADER_CLEAR}px; display: flex; align-items: center; gap: 10px;
  padding: 0 16px; pointer-events: none; z-index: 5;
}
.bm-top > * { pointer-events: auto; }
.bm-brand { display: flex; align-items: baseline; gap: 10px; }
.bm-brand h1 {
  font-family: var(--bm-head), sans-serif !important; font-weight: 900; font-size: 18px;
  letter-spacing: 0.2px; white-space: nowrap; margin: 0; color: var(--bm-ink);
}
.bm-dot { color: var(--bm-green); }
.bm-tag { font-family: var(--bm-mono), monospace; font-size: 10.5px; color: var(--bm-ink-faint); white-space: nowrap; }
.bm-windows { display: flex; gap: 2px; background: rgba(11,27,47,0.85); border: 1px solid var(--bm-line); border-radius: 9px; padding: 3px; }
.bm-root.bm-light .bm-windows { background: rgba(255,255,255,0.92); }
.bm-windows button {
  font-family: var(--bm-mono), monospace; font-size: 12px; font-weight: 500; color: var(--bm-ink-dim);
  background: transparent; border: 0; border-radius: 6px; padding: 5px 9px; cursor: pointer; white-space: nowrap;
}
.bm-windows button:hover { color: var(--bm-ink); }
.bm-windows button.bm-active { background: var(--bm-green); color: #06131f; font-weight: 600; }
.bm-windows button:focus-visible, .bm-panel-close:focus-visible, .bm-search:focus-visible, .bm-switch:focus-visible {
  outline: 2px solid var(--bm-gold); outline-offset: 2px;
}
.bm-search {
  font-family: var(--bm-mono), monospace; font-size: 12px; color: var(--bm-ink);
  background: rgba(11,27,47,0.85); border: 1px solid var(--bm-line); border-radius: 9px; padding: 7px 10px; width: 200px;
}
.bm-root.bm-light .bm-search { background: rgba(255,255,255,0.92); }
.bm-search::placeholder { color: var(--bm-ink-faint); }
.bm-switch, .bm-mmenu-link {
  font-family: var(--bm-mono), monospace; font-size: 11px; font-weight: 600; color: var(--bm-gold);
  text-decoration: none; white-space: nowrap; border: 1px solid var(--bm-line); border-radius: 9px; padding: 6px 10px;
}
.bm-switch:hover, .bm-mmenu-link:hover { border-color: var(--bm-gold); }
.bm-mmenu-link { display: inline-block; margin-top: 10px; }
.bm-live {
  margin-left: auto; font-family: var(--bm-mono), monospace; font-size: 11px; color: var(--bm-gold);
  white-space: nowrap; display: flex; align-items: center; gap: 6px;
}
.bm-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bm-gold); box-shadow: 0 0 8px var(--bm-gold); }
.bm-theme svg { color: var(--bm-ink) !important; height: 14px !important; width: 14px !important; }
.bm-mmenu-btn {
  display: none; font-family: var(--bm-mono), monospace; font-size: 12px; font-weight: 600; color: var(--bm-ink);
  background: rgba(11,27,47,0.85); border: 1px solid var(--bm-line); border-radius: 9px; padding: 6px 10px; cursor: pointer;
}
.bm-root.bm-light .bm-mmenu-btn { background: rgba(255,255,255,0.92); }
.bm-mmenu {
  position: absolute; top: ${HEADER_CLEAR}px; left: 12px; right: 12px; padding: 12px;
  background: var(--bm-panel); border: 1px solid var(--bm-line); border-radius: 12px; z-index: 6;
}
.bm-mmenu-search { width: 100%; margin-bottom: 10px; }
.bm-mmenu-windows { display: flex; flex-wrap: wrap; gap: 6px; }
.bm-mmenu-windows button {
  font-family: var(--bm-mono), monospace; font-size: 12px; font-weight: 500; color: var(--bm-ink-dim);
  background: transparent; border: 1px solid var(--bm-line); border-radius: 8px; padding: 6px 10px; cursor: pointer;
}
.bm-mmenu-windows button.bm-active { background: var(--bm-green); color: #06131f; border-color: var(--bm-green); font-weight: 600; }
.bm-mmenu-lbl {
  font-family: var(--bm-mono), monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--bm-ink-faint); margin: 12px 0 6px;
}
.bm-legend {
  position: absolute; left: 16px; bottom: 14px; font-size: 12px; color: var(--bm-ink-dim); line-height: 1.9; pointer-events: none; z-index: 4;
}
.bm-legend a { pointer-events: auto; }
.bm-sw { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; vertical-align: -1px; }
.bm-note { color: var(--bm-ink-faint); font-size: 11px; }
.bm-method { color: var(--bm-gold); text-decoration: none; }
.bm-method:hover { text-decoration: underline; }
.bm-stats {
  position: absolute; right: 16px; bottom: 14px; text-align: right; font-family: var(--bm-mono), monospace;
  font-size: 11px; color: var(--bm-ink-faint); line-height: 1.7; pointer-events: none; z-index: 4;
}
.bm-stats-faint { opacity: 0.7; }
.bm-center-msg {
  position: absolute; inset: ${HEADER_CLEAR}px 0 0 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; text-align: center; color: var(--bm-ink-dim); font-size: 14px; pointer-events: none; padding: 0 24px; z-index: 3;
}
.bm-center-msg b { color: var(--bm-ink); font-family: var(--bm-head), sans-serif; font-size: 17px; }
.bm-widen {
  pointer-events: auto; margin-top: 6px; font-family: var(--bm-mono), monospace; font-size: 12px; color: var(--bm-gold);
  background: transparent; border: 1px solid var(--bm-gold); border-radius: 8px; padding: 7px 12px; cursor: pointer;
}
.bm-spin { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--bm-line); border-top-color: var(--bm-gold); animation: bm-spin 0.9s linear infinite; }
@keyframes bm-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .bm-spin { animation: none; } }
.bm-tooltip {
  position: absolute; top: 0; left: 0; max-width: 230px; padding: 8px 10px; font-size: 12px; line-height: 1.45;
  background: var(--bm-panel); color: var(--bm-ink); border: 1px solid var(--bm-line); border-radius: 8px;
  pointer-events: none; opacity: 0; transition: opacity .12s; z-index: 6;
}
.bm-tt-head { font-weight: 700; margin-bottom: 2px; }
.bm-tt-faint { color: var(--bm-ink-faint); font-size: 11px; }
.bm-panel {
  position: absolute; top: ${HEADER_CLEAR}px; right: 0; bottom: 0; width: 360px; max-width: 100%;
  background: var(--bm-panel); border-left: 1px solid var(--bm-line); transform: translateX(105%);
  transition: transform .28s cubic-bezier(.2,.8,.2,1); z-index: 7;
}
.bm-panel.bm-open { transform: translateX(0); }
@media (prefers-reduced-motion: reduce) { .bm-panel { transition: none; } }
.bm-panel-close {
  position: absolute; top: 10px; right: 12px; width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--bm-line);
  background: transparent; color: var(--bm-ink); cursor: pointer; z-index: 2;
}
.bm-panel-scroll { position: absolute; inset: 0; overflow-y: auto; padding: 18px 18px 22px; }
.bm-p-head { display: flex; gap: 12px; align-items: center; padding-right: 36px; }
.bm-p-face { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; object-position: top; border: 2px solid var(--bm-gold); flex: 0 0 auto; background: var(--bm-field); }
.bm-p-face-txt { display: grid; place-items: center; font-family: var(--bm-head), sans-serif; font-weight: 800; color: var(--bm-ink); }
.bm-p-name { font-family: var(--bm-head), sans-serif; font-weight: 800; font-size: 18px; line-height: 1.15; }
.bm-p-tick { font-family: var(--bm-mono), monospace; font-size: 11.5px; color: var(--bm-ink-dim); margin-top: 3px; }
.bm-p-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; }
.bm-p-cell { border: 1px solid var(--bm-line); border-radius: 10px; padding: 9px 11px; }
.bm-lbl { font-family: var(--bm-mono), monospace; font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--bm-ink-faint); }
.bm-val { font-family: var(--bm-head), sans-serif; font-weight: 800; font-size: 17px; margin-top: 3px; color: var(--bm-ink); }
.bm-sub { font-size: 11px; color: var(--bm-ink-faint); margin-top: 2px; }
.bm-p-section { font-family: var(--bm-mono), monospace; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--bm-ink-faint); margin: 18px 0 8px; }
.bm-flowbar { height: 8px; border-radius: 4px; background: rgba(194,80,74,0.35); overflow: hidden; }
.bm-buyside { height: 100%; background: var(--bm-green); }
.bm-flow-lbls { display: flex; justify-content: space-between; font-family: var(--bm-mono), monospace; font-size: 11px; color: var(--bm-ink-dim); margin-top: 6px; }
.bm-buyer { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-top: 1px solid var(--bm-line); }
.bm-who b { display: block; font-size: 13px; } .bm-who b a { color: var(--bm-ink); text-decoration: none; }
.bm-who span { display: block; font-size: 11.5px; color: var(--bm-ink-faint); }
.bm-amt { text-align: right; } .bm-amt b { display: block; font-family: var(--bm-mono), monospace; font-size: 13px; } .bm-amt span { font-size: 11px; color: var(--bm-ink-faint); }
.bm-p-ctas { margin-top: 18px; }
.bm-cta-main { display: block; text-align: center; background: var(--bm-green); color: #06131f; font-weight: 700; font-size: 13.5px; border-radius: 10px; padding: 11px 14px; text-decoration: none; }
.bm-p-disclaimer { font-size: 11px; color: var(--bm-ink-faint); line-height: 1.5; margin-top: 14px; }
.bm-p-disclaimer a { color: var(--bm-ink-dim); }
@media (max-width: 1100px) { .bm-desk { display: none !important; } .bm-mmenu-btn { display: inline-block; } .bm-tag { display: none; } }
@media (max-width: 640px) {
  .bm-top { gap: 8px; padding: 0 10px; }
  .bm-brand h1 { font-size: 15px; }
  .bm-period, .bm-live { display: none; }
  .bm-theme { margin-left: auto; }
  .bm-mmenu-btn { display: inline-flex; }
  .bm-panel {
    top: auto; left: 0; right: 0; width: 100%; max-width: none; height: 74%;
    border-left: 0; border-top: 1px solid var(--bm-line); border-radius: 16px 16px 0 0; transform: translateY(104%);
  }
  .bm-panel.bm-open { transform: translateY(0); }
  .bm-legend, .bm-stats { display: none; }
}
`;

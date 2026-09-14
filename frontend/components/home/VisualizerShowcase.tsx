"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight, Orbit } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import {
  stepPhysics,
  radiusForDollars,
  fitFactor,
  PhysBody,
} from "@/lib/bubbles-physics";

/**
 * The homepage visualizer showcase — replaces the Market Heat Map section.
 *
 * George 2026-09-14: "i want to replace the market heat map section on the
 * homepage with all of our visualizers … start with showing the Insider
 * Bubble then able to click into it and switch visualizers from there".
 *
 * A LIVE Insider Bubbles field (the real engine both bubble maps use) with
 * the rest of the suite beside it. The whole field is one link into /bubbles,
 * and every page it opens carries the VisualizerSwitcher.
 *
 * Four bugs George reported on the first cut, and what each actually was:
 *
 *  • "name should be on every bubble" — the first version invented its own
 *    radius curve (14 + sqrt(total/max) * 34) and only labelled bubbles over
 *    r=19. One $91M bubble dominated the field, so the median radius was 17
 *    and 33 of 44 bubbles were never labelled. It now uses the SHARED
 *    `radiusForDollars` + `fitFactor` the real map uses — a floor of 22 and
 *    an area budget for the field it is actually drawn in.
 *  • "name should not go out from bubble" — the label is now measured and
 *    shrunk to fit inside its circle, and dropped rather than overflowed.
 *  • "first time i cant see, after i go back and back then i see" — the frame
 *    loop only attached when the canvas already existed, and the canvas was
 *    rendered conditionally on data having arrived. On a cold load the effect
 *    ran against a null canvas and never re-ran, so nothing ever drew; on a
 *    back-navigation SWR replayed from cache and the canvas was there on the
 *    first render. The canvas is unconditional now and the loop owns its
 *    state through refs.
 *  • "loading so slow, as page loads they should be there" — the section sat
 *    inside <LazyMount> and its data was client-only. It now mounts with the
 *    page and the preview is seeded server-side.
 *
 * Motion: the shared engine applies a constant upward drift, which is the
 * lava-lamp look on a full-height map but piles every bubble against the top
 * edge of a 380px band (exactly what George's screenshot shows). The preview
 * runs the engine in reduceMotion, which keeps collision relaxation — so the
 * field packs evenly and stays put — and adds a small per-bubble bob at DRAW
 * time, which cannot accumulate into drift.
 */

interface PreviewBubble {
  t: string;
  name: string | null;
  total: number;
  chg: number | null;
  ind: string | null;
  iq: number | null;
  buyers: number;
}

const OTHERS = [
  {
    href: "/visualizers/prediction-markets",
    name: "Prediction Markets",
    blurb: "Event contracts sized by dollars traded",
    live: true,
  },
  {
    href: "/visualizers/government-contracts",
    name: "Government Contracts",
    blurb: "Federal awards, and who bought after the win",
  },
  {
    href: "/visualizers/goldminer",
    name: "Goldminer AI",
    blurb: "Every major gold project, sized by its economics",
  },
  {
    href: "/visualizers/biotech",
    name: "Biotech Catalysts",
    blurb: "FDA decisions and readouts inside ninety days",
  },
];

interface Body extends PhysBody {
  t: string;
  label: string;
  total: number;
  up: boolean;
}

const HEIGHT = 380;
/** Below this the ticker cannot be drawn legibly, so the bubble goes bare. */
const MIN_LABEL_R = 15;

export function VisualizerShowcase() {
  const { data } = useSWR<{ bubbles: PreviewBubble[]; count: number }>(
    `${API_BASE}/bubbles/preview?window=30d&limit=44`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const bubbles = useMemo(() => data?.bubbles ?? [], [data]);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodiesRef = useRef<Body[]>([]);
  const hoverRef = useRef<Body | null>(null);
  const widthRef = useRef(0);
  const [hoverInfo, setHoverInfo] = useState<{
    t: string;
    label: string;
    total: number;
  } | null>(null);

  /** (Re)build the field for a given width. Keeps a body's position when the
   *  ticker is already on screen, so a data refresh doesn't reshuffle it. */
  const seed = useCallback(
    (w: number) => {
      if (!w || !bubbles.length) return;
      const raw = bubbles.map((b) => radiusForDollars(b.total));
      // Scale the whole field to the band we actually draw in — without this
      // 44 bubbles overflow a 380px strip and jam into the corners.
      const k = fitFactor(raw, w, HEIGHT, 0);
      const prev = new Map(bodiesRef.current.map((b) => [b.t, b]));
      bodiesRef.current = bubbles.map((b, i) => {
        const r = Math.max(8, raw[i] * k);
        const old = prev.get(b.t);
        if (old) {
          old.targetR = r;
          old.total = b.total;
          old.up = (b.chg ?? 0) >= 0;
          old.label = b.name || b.t;
          return old;
        }
        return {
          t: b.t,
          label: b.name || b.t,
          total: b.total,
          up: (b.chg ?? 0) >= 0,
          // Spread across the whole band, not along one line: a seed that
          // shares a row leaves the relaxation nothing to push apart.
          x: w * (0.06 + 0.88 * Math.random()),
          y: HEIGHT * (0.1 + 0.8 * Math.random()),
          vx: 0,
          vy: 0,
          r: Math.max(4, r * 0.35),
          targetR: r,
          expanded: false,
          expandT: 0,
          seed: Math.random() * 1000,
        };
      });
    },
    [bubbles],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const w = el.clientWidth;
    widthRef.current = w;
    seed(w);
  }, [seed]);

  // One frame loop for the life of the component. It reads everything it
  // needs from refs, so it never has to be torn down and rebuilt — the bug
  // that left a cold load with no bubbles at all.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
      rootMargin: "160px",
    });
    io.observe(wrap);

    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      if (!w || Math.abs(w - widthRef.current) < 2) return;
      widthRef.current = w;
      seed(w);
    });
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - last, 48);
      last = now;
      if (!visible) return;

      const w = widthRef.current || wrap.clientWidth;
      if (!w) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(HEIGHT * dpr);
      }
      const c = canvas.getContext("2d");
      if (!c) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, HEIGHT);

      const bodies = bodiesRef.current;
      if (!bodies.length) return;

      // reduceMotion: collisions still resolve, so the field relaxes into an
      // even packing and then holds. The engine's upward drift would pile
      // every bubble against the top of a band this short.
      stepPhysics(bodies as PhysBody[], dt, now, {
        width: w,
        height: HEIGHT,
        headerClear: 0,
        reduceMotion: true,
      });

      const css = getComputedStyle(document.documentElement);
      const good = css.getPropertyValue("--good").trim() || "#16a34a";
      const bad = css.getPropertyValue("--bad").trim() || "#dc2626";
      const ink = css.getPropertyValue("--text").trim() || "#1d1e1f";
      const hovered = hoverRef.current;

      for (const b of bodies) {
        // Visual-only bob: it never feeds back into the body's position, so
        // it cannot accumulate the way an acceleration would.
        const bob = reduce ? 0 : Math.sin(now * 0.0009 + b.seed) * 2.2;
        const cx = b.x;
        const cy = b.y + bob;
        const on = b === hovered;

        c.beginPath();
        c.arc(cx, cy, b.r, 0, Math.PI * 2);
        c.fillStyle = `color-mix(in srgb, ${b.up ? good : bad} ${on ? 32 : 16}%, transparent)`;
        c.fill();
        c.lineWidth = on ? 2 : 1.25;
        c.strokeStyle = `color-mix(in srgb, ${b.up ? good : bad} ${on ? 95 : 60}%, transparent)`;
        c.stroke();

        if (b.r < MIN_LABEL_R) continue;
        // Fit the ticker inside the circle: start at a size proportional to
        // the radius and shrink until it fits the chord, then give up rather
        // than let it spill over the edge.
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = ink;
        const room = b.r * 1.65;
        let fs = Math.max(9, Math.min(15, b.r * 0.46));
        for (; fs >= 8; fs -= 0.5) {
          c.font = `700 ${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
          if (c.measureText(b.t).width <= room) break;
        }
        if (c.measureText(b.t).width <= room) c.fillText(b.t, cx, cy);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [seed]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let hit: Body | null = null;
    for (const b of bodiesRef.current) {
      if ((b.x - x) ** 2 + (b.y - y) ** 2 <= b.r * b.r) hit = b;
    }
    hoverRef.current = hit;
    setHoverInfo(
      hit ? { t: hit.t, label: hit.label, total: hit.total } : null,
    );
  };

  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        <h3 className="text-[13px] font-bold uppercase tracking-wider truncate inline-flex items-center gap-2">
          <Orbit className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          Insider Bubbles
          <span
            className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
            style={{ background: "var(--bad-soft)", color: "var(--bad)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--bad)" }}
              aria-hidden
            />
            Live
          </span>
        </h3>
        {/* In the header, not floating over the field — it used to sit on top
            of the bubbles (George's screenshot). */}
        <span className="hidden sm:block text-[11px] text-mute whitespace-nowrap ml-auto mr-3">
          Sized by insider dollars · last 30 days
        </span>
        <Link
          href="/visualizers"
          className="text-[10px] font-mono text-accent uppercase tracking-wider inline-flex items-center gap-1 hover:underline whitespace-nowrap"
        >
          All visualizers <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Link
          href="/bubbles"
          className="relative block"
          title="Open the live Insider Bubbles map"
          onMouseLeave={() => {
            hoverRef.current = null;
            setHoverInfo(null);
          }}
        >
          {/* The wrapper is what gets measured; the canvas is ALWAYS mounted
              so the frame loop has something to attach to on a cold load. */}
          <div ref={wrapRef} style={{ width: "100%", height: HEIGHT }}>
            <canvas
              ref={canvasRef}
              onMouseMove={onMove}
              style={{ display: "block", width: "100%", height: HEIGHT }}
            />
          </div>

          {!bubbles.length && (
            <span
              className="absolute inset-0 flex items-center justify-center text-[12.5px] text-mute"
              aria-hidden
            >
              Loading insider bubbles…
            </span>
          )}

          {hoverInfo && (
            <span
              className="absolute left-3 bottom-3 rounded-lg px-3 py-2 pointer-events-none"
              style={{
                background: "var(--bg-1)",
                border: "1px solid var(--border-strong)",
                boxShadow: "0 6px 20px rgba(0,0,0,0.16)",
              }}
            >
              <span className="block text-[13px] font-bold">{hoverInfo.t}</span>
              <span className="block text-[11px] text-mute truncate max-w-[220px]">
                {hoverInfo.label}
              </span>
              <span className="block text-[12px] font-bold tabular mt-0.5">
                {formatCurrency(hoverInfo.total)} bought
              </span>
            </span>
          )}
        </Link>

        <div
          className="border-t lg:border-t-0 lg:border-l p-3 space-y-2"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-mute px-1">
            Switch visualizer
          </p>
          {OTHERS.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className="block rounded-lg px-3 py-2 transition hover:bg-[var(--accent-soft)] group"
              style={{ border: "1px solid var(--border)" }}
            >
              <span className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold group-hover:text-accent transition">
                  {o.name}
                </span>
                {o.live && (
                  <span
                    className="text-[8px] uppercase tracking-wider font-bold px-1 py-0.5 rounded"
                    style={{ background: "var(--bad-soft)", color: "var(--bad)" }}
                  >
                    Live
                  </span>
                )}
              </span>
              <span className="block text-[11px] text-mute leading-snug mt-0.5">
                {o.blurb}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight, Orbit } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { stepPhysics, PhysBody } from "@/lib/bubbles-physics";

/**
 * The homepage visualizer showcase — replaces the Market Heat Map section.
 *
 * George 2026-09-14: "i want to replace the market heat map section on the
 * homepage with all of our visualizers … start with showing the Insider
 * Bubble then able to click into it and switch visualizers from there" and
 * "the homepage section will show a preview of insider bubbles".
 *
 * So: a LIVE Insider Bubbles field (the real physics engine both bubble maps
 * use, not a picture), with the rest of the suite as a rail beside it. The
 * whole field is one link into /bubbles, and every page it opens carries the
 * VisualizerSwitcher, which is the "switch visualizers from there" half.
 *
 * It is fed by /bubbles/preview, not /bubbles. The full payload is 172 KB —
 * it carries every Form 4 behind every bubble — and this section exists on a
 * page that was cut down two days ago over a speed complaint. The preview is
 * ~6 KB and carries only what gets drawn.
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

/** The other four, in the hub's order. */
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
  total: number;
  up: boolean;
  label: string;
}

const HEIGHT = 380;

export function VisualizerShowcase() {
  const { data } = useSWR<{ bubbles: PreviewBubble[]; count: number }>(
    `${API_BASE}/bubbles/preview?window=30d&limit=44`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );

  const bubbles = useMemo(() => data?.bubbles ?? [], [data]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bodiesRef = useRef<Body[]>([]);
  const rafRef = useRef<number | null>(null);
  const [hover, setHover] = useState<Body | null>(null);

  // Build bodies whenever the data changes. Radius is by purchase dollars on
  // a square-root scale, so area — not radius — tracks the money.
  useEffect(() => {
    if (!bubbles.length) return;
    const el = wrapRef.current;
    const w = el?.clientWidth || 800;
    const max = Math.max(...bubbles.map((b) => b.total || 0), 1);
    bodiesRef.current = bubbles.map((b, i) => {
      const scale = Math.sqrt((b.total || 0) / max);
      const r = 14 + scale * 34;
      return {
        t: b.t,
        total: b.total || 0,
        up: (b.chg ?? 0) >= 0,
        label: b.name || b.t,
        x: (w / (bubbles.length + 1)) * (i + 1),
        y: HEIGHT * (0.25 + 0.5 * ((i * 37) % 100) / 100),
        vx: 0,
        vy: 0,
        r,
        targetR: r,
        expanded: false,
        expandT: 0,
        seed: (i * 1.618) % (Math.PI * 2),
      };
    });
  }, [bubbles]);

  // One frame loop, paused when the section is off-screen so a homepage that
  // is scrolled past costs nothing.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    let visible = true;
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { rootMargin: "120px" },
    );
    io.observe(wrap);

    let last = performance.now();
    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const dt = Math.min(now - last, 48);
      last = now;
      if (!visible) return;

      const w = wrap.clientWidth || 800;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(HEIGHT * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${HEIGHT}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, HEIGHT);

      const bodies = bodiesRef.current;
      stepPhysics(bodies as PhysBody[], dt, now, {
        width: w,
        height: HEIGHT,
        headerClear: 0,
        reduceMotion: reduce,
      });

      const css = getComputedStyle(document.documentElement);
      const good = css.getPropertyValue("--good").trim() || "#16a34a";
      const bad = css.getPropertyValue("--bad").trim() || "#dc2626";
      const text = css.getPropertyValue("--text").trim() || "#111";

      for (const b of bodies) {
        const tint = b.up ? good : bad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `color-mix(in srgb, ${tint} ${b === hover ? 34 : 18}%, transparent)`;
        ctx.fill();
        ctx.lineWidth = b === hover ? 2 : 1.25;
        ctx.strokeStyle = `color-mix(in srgb, ${tint} ${b === hover ? 95 : 62}%, transparent)`;
        ctx.stroke();
        if (b.r > 19) {
          ctx.fillStyle = text;
          ctx.font = `700 ${Math.min(13, Math.max(9, b.r * 0.42))}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(b.t, b.x, b.y);
        }
      }
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      io.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [hover]);

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let hit: Body | null = null;
    for (const b of bodiesRef.current) {
      if ((b.x - x) ** 2 + (b.y - y) ** 2 <= b.r * b.r) hit = b;
    }
    setHover(hit);
  }

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
        <Link
          href="/visualizers"
          className="text-[10px] font-mono text-accent uppercase tracking-wider inline-flex items-center gap-1 hover:underline whitespace-nowrap"
        >
          All visualizers <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* The field. One link — clicking anywhere opens the real map. */}
        <Link
          href="/bubbles"
          ref={wrapRef as never}
          className="relative block"
          title="Open the live Insider Bubbles map"
          onMouseLeave={() => setHover(null)}
        >
          {bubbles.length ? (
            <canvas
              ref={canvasRef}
              onMouseMove={onMove}
              style={{ display: "block", width: "100%", height: HEIGHT }}
            />
          ) : (
            <div className="shimmer" style={{ height: HEIGHT }} />
          )}

          {hover && (
            <span
              className="absolute left-3 bottom-3 rounded-lg px-3 py-2 pointer-events-none"
              style={{
                background: "var(--bg-1)",
                border: "1px solid var(--border-strong)",
                boxShadow: "0 6px 20px rgba(0,0,0,0.16)",
              }}
            >
              <span className="block text-[13px] font-bold">{hover.t}</span>
              <span className="block text-[11px] text-mute truncate max-w-[220px]">
                {hover.label}
              </span>
              <span className="block text-[12px] font-bold tabular mt-0.5">
                {formatCurrency(hover.total)} bought
              </span>
            </span>
          )}

          <span
            className="absolute right-3 top-3 text-[11px] text-mute pointer-events-none"
            style={{ textShadow: "0 1px 2px var(--bg-2)" }}
          >
            Sized by insider dollars · last 30 days
          </span>
        </Link>

        {/* The rest of the suite. */}
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

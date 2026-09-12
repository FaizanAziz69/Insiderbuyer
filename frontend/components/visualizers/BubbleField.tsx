"use client";

/**
 * §3.1 Bubble Engine — the canvas renderer for field mode.
 *
 * Bound to `BubbleEngine`, which owns the node model and the physics; this file
 * owns pixels, pointers and nothing else, which is what keeps the engine
 * render-agnostic (§9.2). Canvas rather than DOM because the suite's fields run
 * to 150 bodies and the site's existing bubble pages already proved DOM cannot
 * hold that at 60fps.
 *
 * Everything is drawn with transforms and gradients on one layer — no per-frame
 * DOM writes at all, so there is zero layout thrash however fast prices move.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BubbleEngine, type EngineNode } from "@/lib/visualizers/engine";

export interface BubbleFieldProps<T extends { id: string }> {
  engine: BubbleEngine<T>;
  /** Bumped by the page whenever the dataset identity changes. */
  version: number;
  selectedId?: string | null;
  onSelect?: (node: EngineNode<T> | null) => void;
  /** Tooltip HTML for a hovered node. Return null for no tooltip. */
  tooltip?: (node: EngineNode<T>) => string | null;
  /** Big bubbles print a second line — a dollar figure, usually. */
  valueLabel?: (node: EngineNode<T>) => string | null;
  motion?: boolean;
  /** Space kept clear at the top of the arena for the page's own controls. */
  headerClear?: number;
  className?: string;
  /** Dashed outline instead of a solid ring — §6.1 private awardees. */
  dashed?: (node: EngineNode<T>) => boolean;
  /** §5.3 catalyst mode: a slow pulse ring around qualifying bubbles. */
  pulse?: (node: EngineNode<T>) => boolean;
  ariaLabel?: string;
}

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function BubbleField<T extends { id: string }>({
  engine,
  version,
  selectedId,
  onSelect,
  tooltip,
  valueLabel,
  motion = true,
  headerClear = 0,
  className,
  dashed,
  pulse,
  ariaLabel = "Bubble field",
}: BubbleFieldProps<T>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(selectedId ?? null);
  const [reduce, setReduce] = useState(false);

  // Every prop the loop reads goes through a ref. The render loop used to list
  // these in its effect deps, so a data poll or a click — which changes
  // `version` and rebuilds `onSelect` — tore down the rAF loop and the
  // ResizeObserver and started them again. That is what the visible hitch was.
  selectedRef.current = selectedId ?? null;
  const tooltipRef = useRef(tooltip);
  const onSelectRef = useRef(onSelect);
  const valueLabelRef = useRef(valueLabel);
  const dashedRef = useRef(dashed);
  const pulseRef = useRef(pulse);
  const headerClearRef = useRef(headerClear);
  tooltipRef.current = tooltip;
  onSelectRef.current = onSelect;
  valueLabelRef.current = valueLabel;
  dashedRef.current = dashed;
  pulseRef.current = pulse;
  headerClearRef.current = headerClear;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduce(mq.matches);
      engine.setReduceMotion(mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [engine]);

  useEffect(() => {
    engine.setMotion(motion);
  }, [engine, motion]);

  const draw = useRef((ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);
      const sel = selectedRef.current;
      const hov = hoverRef.current;
      const mono =
        getComputedStyle(ctx.canvas).getPropertyValue("--viz-mono").trim() ||
        "ui-monospace, monospace";

      for (const n of engine.nodes) {
        if (n.r < 1.5) continue;
        const isSel = n.id === sel;
        const isHov = n.id === hov;
        const alpha = Math.min(1, Math.max(0, n.alpha));

        ctx.save();
        ctx.globalAlpha = alpha;

        // §5.3 pulse: a breathing halo for bubbles with a near catalyst.
        if (pulseRef.current?.(n)) {
          const t = (Math.sin(performance.now() / 620 + n.seed) + 1) / 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 4 + t * 9, 0, Math.PI * 2);
          ctx.strokeStyle = withAlpha(n.color, 0.16 + t * 0.3);
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Body: a lit sphere — highlight offset up-left, deep edge bottom-right.
        // Built once per colour and radius bucket into an offscreen sprite: a
        // fresh radial gradient per bubble per frame is the single most
        // expensive thing on a 150-bubble field, and it is the same pixels
        // every time.
        const sprite = bodySprite(n.color, n.r);
        ctx.drawImage(sprite, n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);

        // Ring. Dashed = §6.1 private/unlisted entity.
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (dashedRef.current?.(n)) ctx.setLineDash([5, 4]);
        ctx.strokeStyle = withAlpha(n.color, isSel || isHov ? 1 : 0.75);
        ctx.lineWidth = isSel ? 2.5 : 1.4;
        ctx.stroke();
        ctx.setLineDash([]);

        // §9.2 flash on a price move, decaying over ~0.9s.
        if (n.flash > 0) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 3 + (1 - n.flash) * 10, 0, Math.PI * 2);
          ctx.strokeStyle =
            n.flashDir > 0
              ? `rgba(27,180,113,${n.flash * 0.85})`
              : `rgba(232,75,86,${n.flash * 0.85})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        if (isSel) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(32,208,255,0.55)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Labels. The headline value comes first and is the only thing most
        // bubbles carry — the brief's own spec is "dollar amount displayed
        // inside larger bubbles", and a field of wrapped questions read as
        // noise. The name lives in the hover tooltip and the panel.
        if (n.r >= 15) {
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "rgba(8,18,32,0.55)";
          ctx.shadowBlur = 3;
          const vl = valueLabelRef.current?.(n) ?? null;
          const vSize = Math.max(9, Math.min(22, n.r * 0.42));
          // Only the biggest bubbles have room for a name under the figure.
          const showName = n.r >= 62 && !!n.label;
          if (vl) {
            ctx.font = `700 ${vSize}px ${mono}`;
            ctx.fillStyle = "rgba(255,255,255,0.98)";
            ctx.fillText(vl, n.x, showName ? n.y - vSize * 0.42 : n.y);
          }
          if (showName) {
            const nSize = Math.max(8.5, Math.min(12, n.r * 0.155));
            ctx.font = `600 ${nSize}px ${mono}`;
            ctx.fillStyle = "rgba(255,255,255,0.8)";
            const lines = wrap(ctx, n.label, n.r * 1.6, 2);
            let y = n.y + vSize * 0.55;
            for (const line of lines) {
              ctx.fillText(line, n.x, y);
              y += nSize * 1.15;
            }
          }
          if (!vl && !showName && n.label) {
            ctx.font = `600 ${Math.max(9, Math.min(13, n.r * 0.3))}px ${mono}`;
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.fillText(n.label, n.x, n.y);
          }
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const tip = tipRef.current;
    if (!canvas || !tip) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const holder = canvas.parentElement as HTMLElement;
    let raf = 0;
    let W = 0;
    let H = 0;

    const resize = () => {
      const rect = holder.getBoundingClientRect();
      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(320, rect.width);
      H = Math.max(320, rect.height);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      engine.setSize(W, H, headerClearRef.current);
      if (reduce) engine.relax();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(holder);

    const frame = (now: number) => {
      engine.step(now);
      draw.current(ctx, W, H);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onMove = (e: PointerEvent) => {
      const { x, y } = local(e);
      const hit = engine.hitTest(x, y);
      hoverRef.current = hit?.id ?? null;
      canvas.style.cursor = hit ? "pointer" : "default";
      const html = hit ? tooltipRef.current?.(hit) ?? null : null;
      if (html) {
        tip.innerHTML = html;
        tip.style.opacity = "1";
        // Keep the tooltip inside the arena on both edges.
        const tw = tip.offsetWidth || 200;
        const th = tip.offsetHeight || 60;
        tip.style.left = `${Math.min(Math.max(8, x - tw / 2), W - tw - 8)}px`;
        tip.style.top = `${y - th - 16 < 8 ? y + 20 : y - th - 14}px`;
      } else {
        tip.style.opacity = "0";
      }
    };
    const onLeave = () => {
      hoverRef.current = null;
      tip.style.opacity = "0";
    };
    const onDown = (e: PointerEvent) => {
      const { x, y } = local(e);
      const hit = engine.hitTest(x, y);
      onSelectRef.current?.(hit);
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
    };
    // Deps are the two things that genuinely need a fresh loop: a different
    // engine, and the reduced-motion switch (which changes how it is stepped).
    // `version` deliberately does NOT appear — data changes flow through the
    // engine, not through remounting the renderer.
  }, [engine, reduce]);

  return (
    <>
      <canvas ref={canvasRef} className={className} role="img" aria-label={ariaLabel} />
      <div ref={tipRef} className="viz-tip" aria-hidden />
    </>
  );
}

/**
 * Offscreen sphere sprites, keyed by colour and a radius bucket. Radii ease
 * continuously, so bucketing to 2px keeps the cache small while the difference
 * stays invisible; the sprite is drawn scaled to the exact radius.
 */
const SPRITES = new Map<string, HTMLCanvasElement>();
function bodySprite(color: string, r: number): HTMLCanvasElement {
  const bucket = Math.max(8, Math.round(r / 2) * 2);
  const key = `${color}|${bucket}`;
  const hit = SPRITES.get(key);
  if (hit) return hit;
  const size = bucket * 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g2 = c.getContext("2d")!;
  const grad = g2.createRadialGradient(
    bucket - bucket * 0.36,
    bucket - bucket * 0.42,
    bucket * 0.08,
    bucket,
    bucket,
    bucket,
  );
  // Opacity has to carry white label text on a light background too, so the
  // core stays near-solid and only the rim falls away.
  grad.addColorStop(0, withAlpha(color, 1));
  grad.addColorStop(0.55, withAlpha(color, 0.82));
  grad.addColorStop(1, withAlpha(color, 0.46));
  g2.beginPath();
  g2.arc(bucket, bucket, bucket, 0, Math.PI * 2);
  g2.fillStyle = grad;
  g2.fill();
  // The cache is bounded: a field cycling colours continuously (prediction
  // markets recolour on every price move) would otherwise grow without limit.
  if (SPRITES.size > 900) SPRITES.clear();
  SPRITES.set(key, c);
  return c;
}

/** rgb(a,b,c) → rgba(a,b,c,alpha). The engine's scales emit rgb() only. */
function withAlpha(rgb: string, a: number): string {
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgb;
  const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
  return `rgba(${r},${g},${b},${a})`;
}

/** Greedy word wrap inside a bubble, capped at `maxLines` with an ellipsis. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    const consumed = lines.join(" ").length;
    if (consumed < text.length - 1) {
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

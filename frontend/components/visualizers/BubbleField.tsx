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
  const motionRef = useRef(motion);
  const [reduce, setReduce] = useState(false);

  selectedRef.current = selectedId ?? null;
  motionRef.current = motion;

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

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
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
        const alpha = n.dim ? Math.max(0, n.r / Math.max(1, n.targetR || 1)) : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        // §5.3 pulse: a breathing halo for bubbles with a near catalyst.
        if (pulse?.(n)) {
          const t = (Math.sin(performance.now() / 620 + n.seed) + 1) / 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 4 + t * 9, 0, Math.PI * 2);
          ctx.strokeStyle = withAlpha(n.color, 0.16 + t * 0.3);
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Body: a lit sphere — highlight offset up-left, deep edge bottom-right.
        const g = ctx.createRadialGradient(
          n.x - n.r * 0.36,
          n.y - n.r * 0.42,
          n.r * 0.08,
          n.x,
          n.y,
          n.r,
        );
        // Opacity has to carry white label text on a light background too,
        // so the core stays near-solid and only the rim falls away.
        g.addColorStop(0, withAlpha(n.color, 1));
        g.addColorStop(0.55, withAlpha(n.color, 0.82));
        g.addColorStop(1, withAlpha(n.color, 0.46));
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        // Ring. Dashed = §6.1 private/unlisted entity.
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (dashed?.(n)) ctx.setLineDash([5, 4]);
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

        // Labels. Only when the bubble can actually hold them.
        if (n.r >= 26) {
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const size = Math.max(9, Math.min(13, n.r * 0.2));
          ctx.font = `600 ${size}px ${mono}`;
          ctx.fillStyle = "rgba(255,255,255,0.98)";
          // One soft drop shadow keeps the label legible over the lighter rim
          // of a pale bubble without darkening the bubble itself.
          ctx.shadowColor = "rgba(8,18,32,0.55)";
          ctx.shadowBlur = 3;
          const vl = n.r >= 40 ? valueLabel?.(n) ?? null : null;
          const lines = wrap(ctx, n.label, n.r * 1.62, vl ? 2 : 3);
          const lh = size * 1.16;
          const total = lines.length * lh + (vl ? lh * 0.98 : 0);
          let y = n.y - total / 2 + lh / 2;
          for (const line of lines) {
            ctx.fillText(line, n.x, y);
            y += lh;
          }
          if (vl) {
            ctx.font = `700 ${Math.max(10, size * 1.05)}px ${mono}`;
            ctx.fillStyle = "rgba(255,255,255,0.86)";
            ctx.fillText(vl, n.x, y + lh * 0.06);
          }
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
    },
    [engine, dashed, pulse, valueLabel],
  );

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
      engine.setSize(W, H, headerClear);
      if (reduce) engine.relax();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(holder);

    const frame = (now: number) => {
      engine.step(now);
      draw(ctx, W, H);
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
      const html = hit ? tooltip?.(hit) ?? null : null;
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
      onSelect?.(hit);
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
    // `version` re-runs the loop when the page swaps datasets wholesale.
  }, [engine, draw, tooltip, onSelect, headerClear, reduce, version]);

  return (
    <>
      <canvas ref={canvasRef} className={className} role="img" aria-label={ariaLabel} />
      <div ref={tipRef} className="viz-tip" aria-hidden />
    </>
  );
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

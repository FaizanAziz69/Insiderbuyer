/**
 * §3.1 Bubble Engine — the reusable visualization core, field mode.
 *
 * Render-agnostic by construction (§9.2): this module owns the node model, the
 * scales, the physics step, hit-testing and the filter/patch API, and knows
 * nothing about canvas, DOM or React. `BubbleField` is the canvas renderer that
 * happens to ship first; a DOM or deck.gl renderer binds to the same nodes.
 *
 * Motion is the site's existing bubble physics (lib/bubbles-physics.ts) — the
 * loop already running on /bubbles and /congress-bubbles at 250 bodies — so the
 * suite inherits a tuned, production-proven jitter → damping → clamp → bounce →
 * overlap-resolution step instead of a second implementation of the same thing.
 */

import { stepPhysics, fitFactor, type PhysBody } from '@/lib/bubbles-physics';

export interface EngineNode<T> extends PhysBody {
  id: string;
  value: number;
  label: string;
  sublabel: string | null;
  color: string;
  /** Filtered out: leaves the physics sim and shrinks away (§9.2). */
  dim: boolean;
  /** 1 → 0 decay after a patch; the renderer draws a ring while it burns. */
  flash: number;
  flashDir: number;
  /** Base radius before the container fit factor. */
  baseR: number;
  data: T;
}

export interface EngineOptions<T> {
  valueOf: (d: T) => number;
  labelOf: (d: T) => string;
  sublabelOf?: (d: T) => string | null;
  colorOf: (d: T) => string;
  /** r = clamp(base + sqrt(value / maxValue) * k) — §9.2. */
  base?: number;
  k?: number;
  min?: number;
  max?: number;
  /** Keep the summed bubble area a sane share of the arena. */
  fit?: boolean;
}

const idOf = (d: unknown): string => (d as { id: string }).id;

export class BubbleEngine<T extends { id: string }> {
  nodes: EngineNode<T>[] = [];
  private byId = new Map<string, EngineNode<T>>();
  private o: Required<Omit<EngineOptions<T>, 'sublabelOf'>> & {
    sublabelOf?: (d: T) => string | null;
  };
  private w = 0;
  private h = 0;
  private headerClear = 0;
  private maxValue = 1;
  private predicate: ((d: T) => boolean) | null = null;
  private motion = true;
  private reduce = false;
  private lastTime = 0;
  /** Set true whenever a value changes so radii recompute on the next step. */
  private scaleDirty = true;

  constructor(opts: EngineOptions<T>) {
    this.o = {
      base: 18,
      k: 58,
      min: 20,
      max: 96,
      fit: true,
      ...opts,
    } as typeof this.o;
  }

  setSize(w: number, h: number, headerClear = 0): void {
    if (w === this.w && h === this.h && headerClear === this.headerClear) return;
    const firstLayout = this.w === 0;
    // §9.2: radius must be recomputed on container resize.
    const sx = this.w ? w / this.w : 1;
    const sy = this.h ? h / this.h : 1;
    this.w = w;
    this.h = h;
    this.headerClear = headerClear;
    this.scaleDirty = true;
    if (!firstLayout) {
      for (const n of this.nodes) {
        n.x *= sx;
        n.y *= sy;
      }
    }
  }

  /** Replace the dataset. Existing ids keep their position and velocity, so a
   *  filter change or a poll never re-scatters the field. */
  setData(items: T[]): void {
    const next: EngineNode<T>[] = [];
    const seen = new Set<string>();
    for (const d of items) {
      const id = idOf(d);
      seen.add(id);
      const value = Math.max(0, this.o.valueOf(d) || 0);
      const existing = this.byId.get(id);
      if (existing) {
        existing.value = value;
        existing.data = d;
        existing.label = this.o.labelOf(d);
        existing.sublabel = this.o.sublabelOf?.(d) ?? null;
        existing.color = this.o.colorOf(d);
        next.push(existing);
      } else {
        const node: EngineNode<T> = {
          id,
          value,
          label: this.o.labelOf(d),
          sublabel: this.o.sublabelOf?.(d) ?? null,
          color: this.o.colorOf(d),
          dim: false,
          flash: 0,
          flashDir: 0,
          baseR: this.o.min,
          data: d,
          // Seed inside the arena with a little spread; the sim settles it.
          x: this.w ? this.w * (0.15 + Math.random() * 0.7) : Math.random() * 800,
          y: this.headerClear + (this.h - this.headerClear) * (0.15 + Math.random() * 0.7),
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          r: 1,
          targetR: this.o.min,
          expanded: false,
          expandT: 0,
          seed: Math.random() * Math.PI * 2,
        };
        next.push(node);
      }
    }
    this.nodes = next;
    this.byId = new Map(next.map((n) => [n.id, n]));
    for (const id of [...this.byId.keys()]) if (!seen.has(id)) this.byId.delete(id);
    this.scaleDirty = true;
    this.applyPredicate();
  }

  /** §9.2 update API: re-paint one bubble without a relayout. */
  patch(id: string, data: T, dir = 0): void {
    const n = this.byId.get(id);
    if (!n) return;
    n.data = data;
    const value = Math.max(0, this.o.valueOf(data) || 0);
    if (value !== n.value) {
      n.value = value;
      this.scaleDirty = true;
    }
    n.label = this.o.labelOf(data);
    n.sublabel = this.o.sublabelOf?.(data) ?? null;
    n.color = this.o.colorOf(data);
    if (dir !== 0) {
      n.flash = 1;
      n.flashDir = dir;
    }
  }

  get(id: string): EngineNode<T> | undefined {
    return this.byId.get(id);
  }

  /** §9.2 filter API. A dimmed node leaves the sim and shrinks out. */
  setPredicate(fn: ((d: T) => boolean) | null): void {
    this.predicate = fn;
    this.applyPredicate();
  }

  private applyPredicate(): void {
    for (const n of this.nodes) n.dim = this.predicate ? !this.predicate(n.data) : false;
    this.scaleDirty = true;
  }

  setMotion(on: boolean): void {
    this.motion = on;
  }

  setReduceMotion(on: boolean): void {
    this.reduce = on;
  }

  /** Recompute target radii. The fit factor keeps a heavy field from filling
   *  the arena solid and a light one from looking empty. */
  private rescale(): void {
    const active = this.nodes.filter((n) => !n.dim);
    this.maxValue = Math.max(1, ...active.map((n) => n.value));
    for (const n of this.nodes) {
      const raw = this.o.base + Math.sqrt(n.value / this.maxValue) * this.o.k;
      n.baseR = Math.min(Math.max(raw, this.o.min), this.o.max);
    }
    let f = 1;
    if (this.o.fit && this.w > 0 && active.length) {
      f = fitFactor(
        active.map((n) => n.baseR),
        this.w,
        this.h,
        this.headerClear,
      );
    }
    for (const n of this.nodes) n.targetR = n.dim ? 0 : n.baseR * f;
    this.scaleDirty = false;
  }

  /** Advance the sim. `now` is a rAF timestamp in ms. */
  step(now: number): void {
    if (this.scaleDirty) this.rescale();
    const dt = this.lastTime ? Math.min(now - this.lastTime, 48) : 16;
    this.lastTime = now;
    for (const n of this.nodes) if (n.flash > 0) n.flash = Math.max(0, n.flash - dt / 900);
    const bodies = this.nodes.filter((n) => !n.dim);
    stepPhysics(bodies, this.motion && !this.reduce ? dt : 0, now, {
      width: this.w,
      height: this.h,
      headerClear: this.headerClear,
      reduceMotion: !this.motion || this.reduce,
      expandRadius: 0,
    });
    // Dimmed nodes still ease their radius to zero so they fade rather than pop.
    for (const n of this.nodes) if (n.dim) n.r += (0 - n.r) * 0.14;
  }

  /**
   * §9.2 prefers-reduced-motion: run the relaxation once and freeze, so the
   * field is a packed static layout instead of a moving one.
   */
  relax(ticks = 200): void {
    if (this.scaleDirty) this.rescale();
    for (const n of this.nodes) n.r = n.targetR;
    const bodies = this.nodes.filter((n) => !n.dim);
    for (let i = 0; i < ticks; i++) {
      stepPhysics(bodies, 16, i * 16, {
        width: this.w,
        height: this.h,
        headerClear: this.headerClear,
        reduceMotion: true,
        expandRadius: 0,
      });
    }
  }

  /** Topmost bubble under a point, or null. */
  hitTest(x: number, y: number): EngineNode<T> | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (n.dim || n.r < 4) continue;
      if (Math.hypot(n.x - x, n.y - y) <= n.r) return n;
    }
    return null;
  }
}

/**
 * §7.1 colour scale for prediction markets: green at or above an even-money
 * YES, red below, intensity scaling with conviction. Returned as an rgb()
 * string so the renderer can tint it without re-parsing.
 */
export function leanColor(yes: number | null): string {
  if (yes == null || !Number.isFinite(yes)) return 'rgb(120,134,158)';
  const conviction = Math.min(1, Math.abs(yes - 0.5) / 0.45);
  if (yes >= 0.5) {
    // #1bb471 at full conviction, muted teal-grey at a coin flip.
    const t = 0.35 + conviction * 0.65;
    return `rgb(${Math.round(70 - 43 * t)},${Math.round(140 + 40 * t)},${Math.round(130 - 17 * t)})`;
  }
  const t = 0.35 + conviction * 0.65;
  return `rgb(${Math.round(150 + 82 * t)},${Math.round(105 - 30 * t)},${Math.round(115 - 29 * t)})`;
}

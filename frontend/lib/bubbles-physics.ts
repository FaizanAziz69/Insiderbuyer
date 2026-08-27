/**
 * The one physics engine behind both bubble maps (Developer Project Brief,
 * Workstream C: "Two pages sharing one physics-based bubbles engine").
 *
 * Soft-body "Banter Bubbles" motion: a gentle upward drift with a per-body
 * wander, pairwise circle repulsion, and viewport walls with damped bounce.
 * Pure functions over plain objects — the pages own rendering, hit-testing
 * and data; this module owns nothing but motion, so it has no DOM, React or
 * data dependencies and either page can call it inside its own frame loop.
 */

export interface PhysBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Current (eased) radius and the radius it is easing towards. */
  r: number;
  targetR: number;
  /** Expanded bodies (open cluster) take up extra room in collisions. */
  expanded: boolean;
  expandT: number;
  /** Per-body phase so the wander is not synchronised across the field. */
  seed: number;
}

export interface PhysicsOptions {
  /** Field size in CSS px. */
  width: number;
  height: number;
  /** Top band kept clear (the page's own header). */
  headerClear: number;
  /** A body being dragged is moved by the pointer, not by the sim. */
  dragTarget?: PhysBody | null;
  /** prefers-reduced-motion: no drift or wander, collisions still resolve
   *  so nothing overlaps after a resize. */
  reduceMotion?: boolean;
  /** Extra collision radius for an expanded body (insider clusters). */
  expandRadius?: number;
}

export const collisionRadius = (b: PhysBody, expandRadius = 46) =>
  b.expanded ? b.r + expandRadius * b.expandT : b.r;

/** Advance every body by `dt` ms at absolute time `time` ms. */
export function stepPhysics(bodies: PhysBody[], dt: number, time: number, o: PhysicsOptions): void {
  const drag = o.dragTarget ?? null;
  const expandRadius = o.expandRadius ?? 46;
  for (const b of bodies) {
    b.r += (b.targetR - b.r) * 0.08;
    b.expandT += ((b.expanded ? 1 : 0) - b.expandT) * 0.12;
    if (b === drag) continue;
    if (!o.reduceMotion) {
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
      const min = collisionRadius(a, expandRadius) + collisionRadius(b, expandRadius) + 4;
      if (dist < min) {
        const push = ((min - dist) / dist) * 0.5;
        const px = dx * push;
        const py = dy * push;
        if (a !== drag) {
          a.x -= px * 0.5;
          a.y -= py * 0.5;
          a.vx -= px * 0.03;
          a.vy -= py * 0.03;
        }
        if (b !== drag) {
          b.x += px * 0.5;
          b.y += py * 0.5;
          b.vx += px * 0.03;
          b.vy += py * 0.03;
        }
      }
    }
  for (const b of bodies) {
    const cr = collisionRadius(b, expandRadius) + 6;
    if (b.x < cr) {
      b.x = cr;
      b.vx = Math.abs(b.vx) * 0.55;
    }
    if (b.x > o.width - cr) {
      b.x = o.width - cr;
      b.vx = -Math.abs(b.vx) * 0.55;
    }
    if (b.y < o.headerClear + cr) {
      b.y = o.headerClear + cr;
      b.vy = Math.abs(b.vy) * 0.55;
    }
    if (b.y > o.height - cr) {
      b.y = o.height - cr;
      b.vy = -Math.abs(b.vy) * 0.55;
    }
  }
}

/** Radius from a dollar figure — the same curve on both maps so a $10M
 *  insider cluster and a $10M congressional trade read the same size. */
export function radiusForDollars(value: number): number {
  return Math.min(Math.max(13 * Math.sqrt(value / 1e6) + 16, 22), 95);
}

/** Scale factor that keeps the summed bubble area a sane share of the field
 *  (heavy windows shrink to fit, quiet windows fill the screen). */
export function fitFactor(radii: number[], width: number, height: number, headerClear: number): number {
  let areaSum = 0;
  for (const r of radii) areaSum += Math.PI * r * r;
  const budget = width * (height - headerClear) * 0.58;
  return areaSum > 0 ? Math.min(Math.max(Math.sqrt(budget / areaSum), 0.3), 1.35) : 1;
}

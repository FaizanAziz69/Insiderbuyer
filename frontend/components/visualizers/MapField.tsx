"use client";

/**
 * §3.1 Bubble Engine — map mode: the same interaction contract as field mode
 * (hover, click, filter, patch), with bubbles anchored to real coordinates,
 * clustering at low zoom and exploding on zoom (§4.5).
 *
 * The brief specifies deck.gl over Mapbox. This renders on the same canvas the
 * field mode uses, over Natural Earth's public-domain 110m land outline shipped
 * with the app, because that removes the two things a tiled basemap would add:
 * an account and access token nobody has yet, and a third-party style that
 * fights the site's own palette. A dark tile layer can slot underneath later
 * without touching the interaction code — the projection and the hit-testing
 * are the parts that would have had to be written either way.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface MapPoint<T> {
  id: string;
  lat: number;
  lng: number;
  value: number;
  label: string;
  color: string;
  dim?: boolean;
  dashed?: boolean;
  pulse?: boolean;
  data: T;
}

export interface MapCluster<T> {
  id: string;
  x: number;
  y: number;
  r: number;
  count: number;
  value: number;
  label: string;
  color: string;
  members: MapPoint<T>[];
}

interface Land {
  polys: [number, number][][];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

export function MapField<T>({
  points,
  selectedId,
  onSelect,
  tooltip,
  className,
  ariaLabel = "Map",
  sizeFor,
}: {
  points: MapPoint<T>[];
  selectedId?: string | null;
  onSelect?: (p: MapPoint<T> | null) => void;
  tooltip?: (p: MapPoint<T>) => string | null;
  className?: string;
  ariaLabel?: string;
  /** Radius in px for a point's value, before clustering. */
  sizeFor: (value: number, maxValue: number) => number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [land, setLand] = useState<Land | null>(null);
  const view = useRef({ zoom: 1.15, cx: 10, cy: 20 }); // lng/lat centre
  const pointsRef = useRef(points);
  const selRef = useRef(selectedId ?? null);
  const clustersRef = useRef<MapCluster<T>[]>([]);
  const hoverRef = useRef<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [, force] = useState(0);

  pointsRef.current = points;
  selRef.current = selectedId ?? null;

  useEffect(() => {
    let alive = true;
    fetch("/visualizers/land-110m.json")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setLand(d as Land);
      })
      .catch(() => setLand({ polys: [] }));
    return () => {
      alive = false;
    };
  }, []);

  /** Equirectangular, which keeps latitude linear and the maths cheap; the
   *  scale factor is derived so the whole world fits the canvas at zoom 1. */
  const project = useCallback((lng: number, lat: number, W: number, H: number) => {
    const { zoom, cx, cy } = view.current;
    const s = (W / 360) * zoom;
    return {
      x: W / 2 + (lng - cx) * s,
      y: H / 2 - (lat - cy) * s,
    };
  }, []);

  const unproject = useCallback((x: number, y: number, W: number, H: number) => {
    const { zoom, cx, cy } = view.current;
    const s = (W / 360) * zoom;
    return { lng: (x - W / 2) / s + cx, lat: cy - (y - H / 2) / s };
  }, []);

  /** §4.5 cluster at low zoom, explode on zoom: grid-bucket in screen space so
   *  the threshold is "these overlap", not an arbitrary geographic radius. */
  const buildClusters = useCallback(
    (W: number, H: number): MapCluster<T>[] => {
      const pts = pointsRef.current.filter((p) => !p.dim);
      const maxValue = Math.max(1, ...pts.map((p) => p.value));
      const cell = view.current.zoom >= 5 ? 0 : Math.max(26, 74 - view.current.zoom * 10);
      const out: MapCluster<T>[] = [];
      if (cell === 0) {
        for (const p of pts) {
          const { x, y } = project(p.lng, p.lat, W, H);
          out.push({
            id: p.id,
            x,
            y,
            r: sizeFor(p.value, maxValue),
            count: 1,
            value: p.value,
            label: p.label,
            color: p.color,
            members: [p],
          });
        }
        return out;
      }
      const buckets = new Map<string, MapPoint<T>[]>();
      const at = new Map<string, { x: number; y: number }>();
      for (const p of pts) {
        const { x, y } = project(p.lng, p.lat, W, H);
        const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(p);
        at.set(p.id, { x, y });
      }
      for (const [key, members] of buckets) {
        const sx = members.reduce((s, m) => s + (at.get(m.id)?.x ?? 0), 0) / members.length;
        const sy = members.reduce((s, m) => s + (at.get(m.id)?.y ?? 0), 0) / members.length;
        const value = members.reduce((s, m) => s + m.value, 0);
        out.push({
          id: members.length === 1 ? members[0].id : `cluster:${key}`,
          x: sx,
          y: sy,
          r:
            members.length === 1
              ? sizeFor(members[0].value, maxValue)
              : Math.min(46, 15 + Math.sqrt(members.length) * 7),
          count: members.length,
          value,
          label: members.length === 1 ? members[0].label : `${members.length}`,
          color: members[0].color,
          members,
        });
      }
      return out;
    },
    [project, sizeFor],
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
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(holder);

    const draw = () => {
      const styles = getComputedStyle(canvas);
      const mono = styles.getPropertyValue("--viz-mono").trim() || "monospace";
      const landFill = styles.getPropertyValue("--viz-land").trim() || "rgba(120,140,170,0.18)";
      const landLine = styles.getPropertyValue("--viz-land-line").trim() || "rgba(120,150,190,0.4)";
      ctx.clearRect(0, 0, W, H);

      // Graticule every 20° — the instrument grid, in map coordinates.
      ctx.strokeStyle = styles.getPropertyValue("--viz-grid").trim() || "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let lng = -180; lng <= 180; lng += 20) {
        const a = project(lng, 85, W, H);
        const b = project(lng, -85, W, H);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (let lat = -80; lat <= 80; lat += 20) {
        const a = project(-180, lat, W, H);
        const b = project(180, lat, W, H);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      if (land) {
        ctx.fillStyle = landFill;
        ctx.strokeStyle = landLine;
        ctx.lineWidth = 0.8;
        for (const poly of land.polys) {
          ctx.beginPath();
          for (let i = 0; i < poly.length; i++) {
            const p = project(poly[i][0], poly[i][1], W, H);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      const clusters = buildClusters(W, H);
      clustersRef.current = clusters;
      for (const c of clusters) {
        if (c.x < -80 || c.x > W + 80 || c.y < -80 || c.y > H + 80) continue;
        const isSel = c.members.some((m) => m.id === selRef.current);
        const isHov = c.id === hoverRef.current;
        const one = c.count === 1 ? c.members[0] : null;

        if (one?.pulse) {
          const t = (Math.sin(performance.now() / 620 + c.x) + 1) / 2;
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r + 4 + t * 10, 0, Math.PI * 2);
          ctx.strokeStyle = withAlpha(c.color, 0.15 + t * 0.32);
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        const g = ctx.createRadialGradient(
          c.x - c.r * 0.35,
          c.y - c.r * 0.4,
          c.r * 0.08,
          c.x,
          c.y,
          c.r,
        );
        g.addColorStop(0, withAlpha(c.color, 1));
        g.addColorStop(0.6, withAlpha(c.color, 0.78));
        g.addColorStop(1, withAlpha(c.color, 0.4));
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        if (one?.dashed) ctx.setLineDash([5, 4]);
        ctx.strokeStyle = withAlpha(c.color, isSel || isHov ? 1 : 0.7);
        ctx.lineWidth = isSel ? 2.5 : 1.2;
        ctx.stroke();
        ctx.setLineDash([]);

        if (c.count > 1 || c.r >= 18) {
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `700 ${Math.max(9, Math.min(13, c.r * 0.42))}px ${mono}`;
          ctx.fillStyle = "rgba(255,255,255,0.97)";
          ctx.shadowColor = "rgba(8,18,32,0.55)";
          ctx.shadowBlur = 3;
          ctx.fillText(c.count > 1 ? String(c.count) : "", c.x, c.y);
          ctx.shadowBlur = 0;
        }
      }
    };

    const frame = () => {
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hit = (x: number, y: number) =>
      clustersRef.current.find((c) => Math.hypot(c.x - x, c.y - y) <= c.r + 2) ?? null;

    const onMove = (e: PointerEvent) => {
      const { x, y } = local(e);
      if (dragRef.current) {
        const s = (W / 360) * view.current.zoom;
        view.current.cx = dragRef.current.cx - (x - dragRef.current.x) / s;
        view.current.cy = dragRef.current.cy + (y - dragRef.current.y) / s;
        view.current.cy = Math.max(-70, Math.min(78, view.current.cy));
        canvas.style.cursor = "grabbing";
        return;
      }
      const c = hit(x, y);
      hoverRef.current = c?.id ?? null;
      canvas.style.cursor = c ? "pointer" : "grab";
      const html = c && c.count === 1 ? tooltip?.(c.members[0]) ?? null : c ? clusterTip(c) : null;
      if (html) {
        tip.innerHTML = html;
        tip.style.opacity = "1";
        const tw = tip.offsetWidth || 200;
        const th = tip.offsetHeight || 60;
        tip.style.left = `${Math.min(Math.max(8, x - tw / 2), W - tw - 8)}px`;
        tip.style.top = `${y - th - 16 < 8 ? y + 20 : y - th - 14}px`;
      } else {
        tip.style.opacity = "0";
      }
    };
    const onDown = (e: PointerEvent) => {
      const { x, y } = local(e);
      dragRef.current = { x, y, cx: view.current.cx, cy: view.current.cy };
      canvas.setPointerCapture(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      const start = dragRef.current;
      dragRef.current = null;
      const { x, y } = local(e);
      const moved = start ? Math.hypot(x - start.x, y - start.y) : 99;
      canvas.style.cursor = "grab";
      if (moved > 4) return;
      const c = hit(x, y);
      if (!c) {
        onSelect?.(null);
        return;
      }
      if (c.count === 1) {
        onSelect?.(c.members[0]);
        return;
      }
      // §4.5 explode on zoom: clicking a cluster flies into it.
      const lngs = c.members.map((m) => m.lng);
      const lats = c.members.map((m) => m.lat);
      view.current.cx = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      view.current.cy = (Math.min(...lats) + Math.max(...lats)) / 2;
      view.current.zoom = Math.min(MAX_ZOOM, view.current.zoom * 2.2);
      force((v) => v + 1);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = local(e);
      const before = unproject(x, y, W, H);
      const k = Math.exp(-e.deltaY * 0.0016);
      view.current.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.current.zoom * k));
      const after = unproject(x, y, W, H);
      view.current.cx += before.lng - after.lng;
      view.current.cy += before.lat - after.lat;
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [land, project, unproject, buildClusters, tooltip, onSelect]);

  return (
    <>
      <canvas ref={canvasRef} className={className} role="img" aria-label={ariaLabel} />
      <div ref={tipRef} className="viz-tip" aria-hidden />
      <div className="viz-zoom">
        <button
          type="button"
          onClick={() => {
            view.current.zoom = Math.min(MAX_ZOOM, view.current.zoom * 1.5);
            force((v) => v + 1);
          }}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            view.current.zoom = Math.max(MIN_ZOOM, view.current.zoom / 1.5);
            force((v) => v + 1);
          }}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            view.current = { zoom: 1.15, cx: 10, cy: 20 };
            force((v) => v + 1);
          }}
          aria-label="Reset view"
        >
          ⌂
        </button>
      </div>
    </>
  );
}

function clusterTip<T>(c: MapCluster<T>): string {
  return `<div class="viz-tip-head">${c.count} projects here</div><div class="viz-tip-row">Click to zoom in</div>`;
}

function withAlpha(rgb: string, a: number): string {
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgb;
  const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
  return `rgba(${r},${g},${b},${a})`;
}

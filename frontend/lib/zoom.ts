/**
 * globals.css applies `body { zoom: 1.10 }` on desktop for readability. CSS
 * zoom changes the coordinate space of everything inside body — including
 * position:fixed portals — while getBoundingClientRect / window.innerWidth
 * keep reporting VISUAL pixels. Any code that measures with rects and then
 * writes style top/left must divide the written values by this factor, or
 * everything lands ~10% right/down of where the math intended (which is how
 * viewport-clamped tooltips were still clipping off the right edge).
 */
export function effectiveZoom(): number {
  if (typeof document === "undefined" || !document.body) return 1;
  const z = parseFloat(getComputedStyle(document.body).zoom as string);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

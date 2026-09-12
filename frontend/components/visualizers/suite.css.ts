/**
 * §9.1 the suite's token system and shell styling, in one place.
 *
 * George had no mockups to hand over, so the visual spec here is the site's own
 * design system pushed one step further: the existing navy/cyan/green/gold
 * tokens from globals.css, Archivo + Nunito Sans + IBM Plex Mono exactly as the
 * brief names them (§3.2), and a console-like chrome — hairline grid, mesh
 * glow, scan sheen, monospaced data — so the four products read as instruments
 * on one dashboard rather than four pages that happen to share a palette.
 *
 * Everything is expressed against the site tokens, so light mode and dark mode
 * both work and a theme change anywhere on the site carries into the suite.
 */
export const SUITE_CSS = `
.viz-root {
  --viz-ink: var(--text);
  --viz-soft: var(--text-soft);
  --viz-mute: var(--text-mute);
  --viz-line: var(--border);
  --viz-accent: var(--accent);
  --viz-good: var(--good);
  --viz-bad: var(--bad);
  --viz-gold: var(--gold);
  --viz-surface: var(--bg-elevated);
  --viz-grid: rgba(0, 88, 130, 0.07);
  --viz-land: rgba(20, 70, 105, 0.13);
  --viz-land-line: rgba(20, 80, 120, 0.34);
  --viz-arena: radial-gradient(1100px 600px at 16% -8%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 62%),
               radial-gradient(900px 520px at 94% 6%, color-mix(in srgb, var(--accent-2) 8%, transparent), transparent 58%),
               linear-gradient(180deg, var(--bg-3), var(--bg-1) 55%, var(--bg-3));
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--viz-arena);
  color: var(--viz-ink);
  font-family: var(--viz-sans), system-ui, sans-serif;
}

:root[data-theme="dark"] .viz-root,
html[data-theme="dark"] .viz-root {
  --viz-grid: rgba(255, 255, 255, 0.05);
  --viz-land: rgba(120, 165, 210, 0.13);
  --viz-land-line: rgba(140, 190, 235, 0.32);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .viz-root {
    --viz-grid: rgba(255, 255, 255, 0.05);
    --viz-land: rgba(120, 165, 210, 0.13);
    --viz-land-line: rgba(140, 190, 235, 0.32);
  }
}

/* ------------------------------------------------------------- chrome */

.viz-head {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--viz-line);
  background: color-mix(in srgb, var(--bg-1) 78%, transparent);
  backdrop-filter: blur(10px);
}
.viz-brand { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.viz-brand h1 {
  margin: 0;
  font-family: var(--viz-head), system-ui, sans-serif;
  font-weight: 900;
  font-size: 19px;
  letter-spacing: -0.02em;
  white-space: nowrap;
}
.viz-brand .viz-kicker {
  font-family: var(--viz-mono), monospace;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--viz-accent);
}
.viz-sub {
  flex: 1 1 320px;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--viz-mute);
}

.viz-tabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.viz-tabs::-webkit-scrollbar { display: none; }
.viz-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border-radius: 999px;
  border: 1px solid var(--viz-line);
  background: transparent;
  color: var(--viz-soft);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  text-decoration: none;
  transition: border-color .15s, color .15s, background .15s;
}
.viz-tab:hover { color: var(--viz-ink); border-color: var(--border-strong); }
.viz-tab[data-on="1"] {
  color: var(--viz-accent);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: var(--accent-soft);
  box-shadow: inset 0 0 18px color-mix(in srgb, var(--accent) 12%, transparent);
}
.viz-tab .viz-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .8; }
.viz-tab[data-soon="1"] { opacity: .55; cursor: default; }

/* -------------------------------------------------------- controls bar */

.viz-controls {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 20px;
  border-bottom: 1px solid var(--viz-line);
  background: color-mix(in srgb, var(--bg-1) 62%, transparent);
  backdrop-filter: blur(8px);
}
.viz-chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--viz-line);
  background: transparent;
  color: var(--viz-soft);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all .14s;
  font-family: inherit;
}
.viz-chip:hover { color: var(--viz-ink); border-color: var(--border-strong); }
.viz-chip[data-on="1"] {
  color: var(--on-accent);
  background: var(--viz-accent);
  border-color: var(--viz-accent);
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 35%, transparent);
}
.viz-chip .viz-count {
  margin-left: 6px;
  font-family: var(--viz-mono), monospace;
  font-size: 10.5px;
  opacity: .7;
}
.viz-spacer { flex: 1 1 auto; }

.viz-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 8px;
  border-radius: 999px;
  border: 1px solid var(--viz-line);
  background: transparent;
  color: var(--viz-soft);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.viz-toggle:hover { border-color: var(--border-strong); color: var(--viz-ink); }
.viz-switch {
  width: 28px; height: 16px; border-radius: 999px;
  background: var(--bg-3); border: 1px solid var(--viz-line);
  position: relative; transition: background .16s;
}
.viz-switch::after {
  content: ""; position: absolute; top: 1px; left: 1px;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--viz-mute); transition: transform .16s, background .16s;
}
.viz-toggle[data-on="1"] .viz-switch { background: color-mix(in srgb, var(--accent) 30%, transparent); border-color: var(--viz-accent); }
.viz-toggle[data-on="1"] .viz-switch::after { transform: translateX(12px); background: var(--viz-accent); }

.viz-live {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 11px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--good) 45%, transparent);
  background: var(--good-soft);
  font-family: var(--viz-mono), monospace;
  font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--viz-good);
}
.viz-live[data-stale="1"] { border-color: color-mix(in srgb, var(--gold) 45%, transparent); background: var(--gold-soft); color: var(--gold); }
.viz-live .viz-pulse {
  width: 7px; height: 7px; border-radius: 50%; background: currentColor;
  animation: viz-pulse 1.8s ease-in-out infinite;
}
@keyframes viz-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.8); } }
@media (prefers-reduced-motion: reduce) { .viz-live .viz-pulse { animation: none; } }

.viz-search {
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--viz-line); background: var(--bg-2);
  color: var(--viz-ink); font-size: 12.5px; font-family: inherit;
  min-width: 170px;
}
.viz-search::placeholder { color: var(--text-faint); }
.viz-search:focus { outline: none; border-color: var(--viz-accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.viz-select {
  padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--viz-line); background: var(--bg-2);
  color: var(--viz-ink); font-size: 12.5px; font-family: inherit; cursor: pointer;
}

/* --------------------------------------------------------------- arena */

.viz-arena {
  position: relative;
  flex: 1 1 auto;
  min-height: 420px;
  overflow: hidden;
  /* The grid is the "instrument" cue — it must never draw attention. */
  background-image:
    linear-gradient(var(--viz-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--viz-grid) 1px, transparent 1px);
  background-size: 64px 64px, 64px 64px;
}
.viz-arena canvas { display: block; touch-action: manipulation; }
.viz-arena::after {
  /* Vignette so bubbles near the edge stay readable over the grid. */
  content: "";
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(120% 90% at 50% 45%, transparent 55%, color-mix(in srgb, var(--bg-1) 70%, transparent));
}

.viz-tip {
  position: absolute; z-index: 5; pointer-events: none;
  opacity: 0; transition: opacity .12s;
  max-width: 280px;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid var(--viz-line);
  background: color-mix(in srgb, var(--bg-elevated) 94%, transparent);
  box-shadow: var(--shadow-lg);
  font-size: 12px; line-height: 1.4; color: var(--viz-soft);
}
.viz-tip b { color: var(--viz-ink); }
.viz-tip .viz-tip-head {
  font-family: var(--viz-head), system-ui, sans-serif;
  font-weight: 700; font-size: 12.5px; color: var(--viz-ink);
  margin-bottom: 3px;
}
.viz-tip .viz-tip-row { font-family: var(--viz-mono), monospace; font-size: 11px; }

.viz-legend {
  position: absolute; left: 16px; bottom: 14px; z-index: 4;
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--viz-line);
  background: color-mix(in srgb, var(--bg-1) 72%, transparent);
  backdrop-filter: blur(8px);
  font-size: 11px; color: var(--viz-mute);
  max-width: 230px;
}
.viz-legend .viz-legend-t {
  font-family: var(--viz-mono), monospace; font-size: 9.5px;
  letter-spacing: .14em; text-transform: uppercase; color: var(--text-faint);
}
.viz-legend-row { display: flex; align-items: center; gap: 7px; }
.viz-swatch { width: 10px; height: 10px; border-radius: 50%; flex: none; }

.viz-empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
  text-align: center; padding: 30px; color: var(--viz-mute); font-size: 13.5px;
  pointer-events: none;
}
.viz-empty > * { max-width: 560px; pointer-events: auto; }
.viz-empty b { display: block; color: var(--viz-ink); font-size: 16px; font-family: var(--viz-head), system-ui, sans-serif; }

.viz-zoom {
  position: absolute; right: 16px; bottom: 16px; z-index: 4;
  display: flex; flex-direction: column; gap: 5px;
}
.viz-zoom button {
  width: 30px; height: 30px; border-radius: 8px;
  border: 1px solid var(--viz-line);
  background: color-mix(in srgb, var(--bg-1) 78%, transparent);
  backdrop-filter: blur(8px);
  color: var(--viz-soft); font-size: 15px; line-height: 1; cursor: pointer;
}
.viz-zoom button:hover { color: var(--viz-ink); border-color: var(--border-strong); }

/* --------------------------------------------------------------- panel */

.viz-panel {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 6;
  width: min(430px, 100%);
  display: flex; flex-direction: column;
  border-left: 1px solid var(--viz-line);
  background: color-mix(in srgb, var(--bg-elevated) 96%, transparent);
  backdrop-filter: blur(14px);
  box-shadow: -18px 0 44px rgba(0,0,0,.28);
  transform: translateX(100%);
  transition: transform .3s cubic-bezier(.22,.61,.36,1);
  will-change: transform;
}
.viz-panel[data-open="1"] { transform: translateX(0); }
.viz-panel::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 1px;
  background: linear-gradient(180deg, transparent, var(--viz-accent), transparent);
  opacity: .55;
}
@media (prefers-reduced-motion: reduce) { .viz-panel { transition: none; } }

.viz-panel-head {
  padding: 16px 18px 13px; border-bottom: 1px solid var(--viz-line);
  display: flex; gap: 12px; align-items: flex-start;
}
.viz-panel-head h2 {
  margin: 0 0 6px; font-family: var(--viz-head), system-ui, sans-serif;
  font-size: 16.5px; font-weight: 800; line-height: 1.28; letter-spacing: -.01em;
}
.viz-badges { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.viz-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 6px;
  border: 1px solid var(--viz-line);
  font-family: var(--viz-mono), monospace; font-size: 10.5px;
  letter-spacing: .06em; color: var(--viz-soft);
}
.viz-badge[data-kind="ticker"] { color: var(--viz-accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: var(--accent-soft); }
.viz-badge[data-kind="private"] { color: var(--viz-mute); border-style: dashed; }
.viz-badge[data-kind="client"] { color: var(--viz-gold); border-color: color-mix(in srgb, var(--gold) 50%, transparent); background: var(--gold-soft); }
.viz-badge[data-kind="source"] { color: var(--viz-mute); }
.viz-badge[data-kind="good"] { color: var(--viz-good); border-color: color-mix(in srgb, var(--good) 45%, transparent); background: var(--good-soft); }
.viz-badge[data-kind="bad"] { color: var(--viz-bad); border-color: color-mix(in srgb, var(--bad) 45%, transparent); background: var(--bad-soft); }

.viz-close {
  margin-left: auto; flex: none;
  width: 30px; height: 30px; border-radius: 8px;
  display: grid; place-items: center;
  border: 1px solid var(--viz-line); background: transparent;
  color: var(--viz-mute); cursor: pointer;
}
.viz-close:hover { color: var(--viz-ink); border-color: var(--border-strong); }

.viz-panel-body { flex: 1 1 auto; overflow-y: auto; padding: 4px 18px 18px; }
.viz-panel-body::-webkit-scrollbar { width: 8px; }
.viz-panel-body::-webkit-scrollbar-thumb { background: var(--viz-line); border-radius: 4px; }

.viz-sec { padding: 14px 0; border-bottom: 1px solid var(--viz-line); }
.viz-sec:last-child { border-bottom: 0; }
.viz-sec-t {
  font-family: var(--viz-mono), monospace; font-size: 9.5px;
  letter-spacing: .16em; text-transform: uppercase; color: var(--text-faint);
  margin-bottom: 9px; display: flex; align-items: center; gap: 8px;
}
.viz-sec-t::after { content: ""; flex: 1; height: 1px; background: var(--viz-line); }
.viz-about { font-size: 12.8px; line-height: 1.55; color: var(--viz-soft); margin: 0; }

.viz-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.viz-grid[data-cols="3"] { grid-template-columns: repeat(3, 1fr); }
.viz-cell {
  padding: 9px 10px; border-radius: 9px;
  border: 1px solid var(--viz-line); background: var(--bg-2);
}
.viz-lbl { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 3px; }
.viz-val { font-family: var(--viz-mono), monospace; font-size: 14px; font-weight: 600; color: var(--viz-ink); }
.viz-val-sub { font-size: 10.5px; color: var(--viz-mute); font-weight: 400; margin-left: 3px; }

.viz-rows { display: flex; flex-direction: column; gap: 8px; }
.viz-row {
  display: flex; justify-content: space-between; gap: 10px;
  font-size: 12.3px; line-height: 1.4;
}
.viz-row .viz-k { color: var(--viz-mute); }
.viz-row .viz-v { font-family: var(--viz-mono), monospace; color: var(--viz-ink); text-align: right; }

.viz-cta {
  display: flex; gap: 8px; padding: 13px 0 4px;
}
.viz-cta a {
  flex: 1; text-align: center; padding: 9px 12px; border-radius: 9px;
  font-size: 12.5px; font-weight: 700; text-decoration: none;
  border: 1px solid var(--viz-line); color: var(--viz-soft);
}
.viz-cta a[data-primary="1"] {
  background: var(--viz-accent); border-color: var(--viz-accent); color: var(--on-accent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 30%, transparent);
}
.viz-cta a:hover { border-color: var(--border-strong); }

.viz-disc {
  font-size: 10.5px; line-height: 1.5; color: var(--text-faint);
  padding: 12px 0 4px; border-top: 1px solid var(--viz-line);
}
.viz-src { font-size: 10.5px; color: var(--text-faint); margin-top: 8px; }
.viz-src a { color: var(--viz-mute); }

@media (max-width: 720px) {
  /* §9.3 mobile: the panel is a bottom sheet, not a side rail. */
  .viz-panel {
    top: auto; left: 0; right: 0; bottom: 0;
    width: 100%; height: 76%;
    border-left: 0; border-top: 1px solid var(--viz-line);
    border-radius: 16px 16px 0 0;
    transform: translateY(100%);
    box-shadow: 0 -18px 44px rgba(0,0,0,.34);
  }
  .viz-panel[data-open="1"] { transform: translateY(0); }
  .viz-panel::before { left: 0; right: 0; top: 0; bottom: auto; width: auto; height: 1px;
    background: linear-gradient(90deg, transparent, var(--viz-accent), transparent); }
  .viz-legend { display: none; }
  .viz-head { padding: 12px 14px 10px; }
  .viz-controls { padding: 9px 14px; }
}
`;

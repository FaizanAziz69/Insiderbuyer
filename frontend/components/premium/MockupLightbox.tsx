"use client";

/**
 * PRODUCT MOCKUP SLOTS + LIGHTBOX — Developer Project Brief (Aug 24 2026), §6.2.
 *
 * "Replace current screenshots with larger, more pronounced custom product
 *  mockups. Requirements: minimum 4 mockups (IQS screener, insider report
 *  page, SMS alert on a phone frame, Bubbles map), rendered at 2x for retina,
 *  displayed at full content-column width or larger with generous whitespace,
 *  browser/device frames, real product UI with realistic sample data … the
 *  design team will supply final compositions; dev provides the layout slots
 *  and lightbox behavior."  Acceptance (§10 D): "screenshots load lazily and
 *  open in lightbox."
 *
 * So this file is the SLOT + LIGHTBOX machinery. Each slot is a device frame
 * (browser chrome or phone) around an <img> with a 1x/2x srcSet; the design
 * team drops final compositions in at the paths declared by the host page,
 * and the frame, lazy-load and lightbox behave identically for whatever image
 * is inside. Light/dark captures follow the site theme like the rest of the
 * subscribe page (`-dark` suffix convention).
 *
 * Accessibility per §10: slots are real <button>s (keyboard-openable), the
 * lightbox is role=dialog with aria-modal, Escape / backdrop / close button
 * dismiss it, focus returns to the slot that opened it, ←/→ move between
 * mockups, and the open animation is disabled under prefers-reduced-motion.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Mockup {
  /** Slot key — also used for the lightbox caption id. */
  id: string;
  /** Title over the frame. */
  title: string;
  /** One-line blurb under the title. */
  blurb: string;
  /** 1x image (light theme). The 2x asset is derived: foo.jpg → foo@2x.jpg. */
  src: string;
  /** Alt text for the image itself. */
  alt: string;
  /** Device frame. "browser" = desktop chrome; "phone" = handset. */
  frame: "browser" | "phone";
  /** Where the real feature lives — the caption links there. */
  href: string;
  /** Faux address-bar text for the browser frame. */
  url?: string;
}

/** foo.jpg → foo@2x.jpg (the 2x retina asset, brief §6.2). */
export const retina = (src: string) => src.replace(/(\.[a-z]+)$/i, "@2x$1");
/** foo.jpg → foo-dark.jpg (theme capture; same convention as the old bento). */
export const themed = (src: string, theme: "light" | "dark") =>
  theme === "dark" ? src.replace(/(\.[a-z]+)$/i, "-dark$1") : src;

function DeviceFrame({ m, theme, children }: { m: Mockup; theme: "light" | "dark"; children: React.ReactNode }) {
  if (m.frame === "phone") {
    return (
      <div className={`mk-phone mk-${theme}`}>
        <div className="mk-phone-notch" aria-hidden="true" />
        <div className="mk-phone-screen">{children}</div>
      </div>
    );
  }
  return (
    <div className={`mk-browser mk-${theme}`}>
      <div className="mk-browser-bar" aria-hidden="true">
        <span className="mk-dot" /><span className="mk-dot" /><span className="mk-dot" />
        <span className="mk-url">{m.url ?? "insiderbuying.com"}</span>
      </div>
      <div className="mk-browser-screen">{children}</div>
    </div>
  );
}

export function MockupGallery({ mockups, theme }: { mockups: Mockup[]; theme: "light" | "dark" }) {
  const [open, setOpen] = useState<number | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    // Focus goes back to the slot that opened the lightbox.
    openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % mockups.length));
      else if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + mockups.length) % mockups.length));
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close, mockups.length]);

  const current = open === null ? null : mockups[open];

  return (
    <>
      <div className="mk-grid">
        {mockups.map((m, i) => {
          const src = themed(m.src, theme);
          return (
            <figure className={`mk-slot mk-slot-${m.frame}`} key={m.id}>
              <figcaption className="mk-cap">
                <h3>{m.title}</h3>
                <p>{m.blurb}</p>
                <a href={m.href} className="mk-link">Open the {m.title} →</a>
              </figcaption>
              <button
                type="button"
                className="mk-open"
                aria-label={`Enlarge: ${m.title}`}
                onClick={(e) => {
                  openerRef.current = e.currentTarget;
                  setOpen(i);
                }}
              >
                <DeviceFrame m={m} theme={theme}>
                  <img
                    src={src}
                    srcSet={`${src} 1x, ${retina(src)} 2x`}
                    alt={m.alt}
                    loading="lazy"
                    decoding="async"
                  />
                </DeviceFrame>
                <span className="mk-zoom" aria-hidden="true">⤢</span>
              </button>
            </figure>
          );
        })}
      </div>

      {current && (
        <div
          className="mk-lb"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`mk-lb-title-${current.id}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="mk-lb-inner">
            <div className="mk-lb-head">
              <b id={`mk-lb-title-${current.id}`}>{current.title}</b>
              <span className="mk-lb-count">{(open as number) + 1} / {mockups.length}</span>
              <button ref={closeRef} type="button" className="mk-lb-close" onClick={close} aria-label="Close">
                ×
              </button>
            </div>
            <div className="mk-lb-stage">
              <button
                type="button"
                className="mk-lb-nav mk-lb-prev"
                aria-label="Previous mockup"
                onClick={() => setOpen((i) => (i === null ? i : (i - 1 + mockups.length) % mockups.length))}
              >
                ‹
              </button>
              <img
                src={themed(current.src, theme)}
                srcSet={`${themed(current.src, theme)} 1x, ${retina(themed(current.src, theme))} 2x`}
                alt={current.alt}
                className={`mk-lb-img mk-lb-img-${current.frame}`}
              />
              <button
                type="button"
                className="mk-lb-nav mk-lb-next"
                aria-label="Next mockup"
                onClick={() => setOpen((i) => (i === null ? i : (i + 1) % mockups.length))}
              >
                ›
              </button>
            </div>
            <p className="mk-lb-blurb">{current.blurb}</p>
          </div>
        </div>
      )}
    </>
  );
}

export const MOCKUP_CSS = `
/* Slots: one per row at full content-column width — "visually dominant",
   "generous whitespace" (brief §6.2). */
/* §6.2: "displayed at full content-column width or larger with generous
   whitespace" — one mockup per row, caption above, frame spanning the column. */
.mk-grid { display: grid; grid-template-columns: 1fr; gap: 112px; margin-top: 56px; }
.mk-slot { margin: 0; display: grid; grid-template-columns: 1fr; gap: 28px; }
.mk-cap { max-width: 720px; }
.mk-cap h3 { font-size: 28px; font-weight: 800; margin: 0 0 10px; color: var(--ink); line-height: 1.15; }
.mk-cap p { font-size: 16px; line-height: 1.6; color: var(--dim); margin: 0 0 14px; }
.mk-link { color: var(--brand); font-weight: 700; text-decoration: none; font-size: 14.5px; }
.mk-link:hover { text-decoration: underline; }
.mk-open {
  position: relative; display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in;
  font: inherit; color: inherit; text-align: left; border-radius: 18px;
}
.mk-open:focus-visible { outline: 3px solid var(--brand); outline-offset: 6px; }
.mk-zoom {
  position: absolute; right: 14px; bottom: 14px; width: 34px; height: 34px; border-radius: 9px;
  display: grid; place-items: center; background: rgba(10,18,32,0.72); color: #fff; font-size: 16px;
  border: 1px solid rgba(255,255,255,0.18); opacity: 0; transition: opacity .15s;
}
.mk-open:hover .mk-zoom, .mk-open:focus-visible .mk-zoom { opacity: 1; }
.mk-slot-phone .mk-zoom { right: calc(50% - 90px); }

/* Browser frame */
.mk-browser {
  border-radius: 14px; overflow: hidden; border: 1px solid var(--line);
  box-shadow: 0 34px 90px rgba(3,10,22,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset;
  background: #0E1A2E;
}
.mk-light.mk-browser { background: #FFFFFF; box-shadow: 0 34px 90px rgba(14,31,53,0.18); }
.mk-browser-bar { display: flex; align-items: center; gap: 7px; padding: 10px 14px; background: #152540; border-bottom: 1px solid rgba(255,255,255,0.06); }
.mk-light .mk-browser-bar { background: #EEF2F7; border-bottom-color: rgba(14,31,53,0.08); }
.mk-dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.18); }
.mk-light .mk-dot { background: rgba(14,31,53,0.18); }
.mk-url {
  margin-left: 10px; flex: 1; font-family: var(--font-mono); font-size: 11.5px; color: rgba(245,247,250,0.55);
  background: rgba(255,255,255,0.06); border-radius: 6px; padding: 4px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mk-light .mk-url { color: rgba(14,31,53,0.6); background: rgba(14,31,53,0.06); }
.mk-browser-screen img, .mk-phone-screen img { display: block; width: 100%; height: auto; }

/* Phone frame */
.mk-phone {
  position: relative; width: 340px; max-width: 100%; margin: 0 auto; border-radius: 42px; padding: 12px;
  background: #0B1424; border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 34px 90px rgba(3,10,22,0.55), inset 0 0 0 2px rgba(255,255,255,0.05);
}
.mk-phone-notch { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); width: 92px; height: 26px; border-radius: 16px; background: #0B1424; z-index: 2; }
.mk-phone-screen { border-radius: 32px; overflow: hidden; background: #0E1A2E; aspect-ratio: 9 / 19.5; }
.mk-light .mk-phone-screen { background: #fff; }
.mk-phone-screen img { width: 100%; height: 100%; object-fit: cover; object-position: top; }

/* Lightbox */
.mk-lb {
  position: fixed; inset: 0; z-index: 1000; background: rgba(3,8,18,0.86); backdrop-filter: blur(6px);
  display: grid; place-items: center; padding: 24px; animation: mk-fade .18s ease-out;
}
@keyframes mk-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .mk-lb { animation: none; } .mk-zoom { transition: none; } }
.mk-lb-inner { width: min(1400px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: 12px; color: #F5F7FA; }
.mk-lb-head { display: flex; align-items: center; gap: 14px; }
.mk-lb-head b { font-size: 18px; }
.mk-lb-count { font-family: var(--font-mono); font-size: 12px; color: rgba(245,247,250,0.6); }
.mk-lb-close {
  margin-left: auto; width: 40px; height: 40px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.06); color: #fff; font-size: 26px; line-height: 1; cursor: pointer;
}
.mk-lb-close:hover, .mk-lb-nav:hover { background: rgba(255,255,255,0.14); }
.mk-lb-close:focus-visible, .mk-lb-nav:focus-visible { outline: 3px solid #20d0ff; outline-offset: 2px; }
.mk-lb-stage { position: relative; display: grid; place-items: center; min-height: 0; }
.mk-lb-img { max-width: 100%; max-height: min(78vh, 900px); border-radius: 12px; box-shadow: 0 30px 80px rgba(0,0,0,0.6); object-fit: contain; }
.mk-lb-img-phone { max-height: 78vh; width: auto; }
.mk-lb-nav {
  position: absolute; top: 50%; transform: translateY(-50%); width: 46px; height: 46px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.18); background: rgba(10,18,32,0.7); color: #fff; font-size: 30px; line-height: 1; cursor: pointer;
}
.mk-lb-prev { left: 8px; } .mk-lb-next { right: 8px; }
.mk-lb-blurb { margin: 0; font-size: 14px; color: rgba(245,247,250,0.7); text-align: center; }

@media (max-width: 960px) {
  .mk-grid { gap: 64px; margin-top: 40px; }
  .mk-slot { gap: 18px; }
  .mk-cap h3 { font-size: 22px; }
  .mk-slot-phone .mk-zoom { right: calc(50% - 130px); }
}
@media (max-width: 640px) {
  .mk-phone { width: 240px; border-radius: 34px; padding: 9px; }
  .mk-phone-screen { border-radius: 26px; }
  .mk-lb { padding: 12px; }
  .mk-lb-nav { width: 38px; height: 38px; font-size: 24px; }
  .mk-slot-phone .mk-zoom { right: calc(50% - 100px); }
}
`;

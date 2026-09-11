"use client";

/**
 * §9.1 the suite shell: header, product tabs, controls bar, arena container.
 *
 * Every visualizer mounts inside this, which is what makes the four products
 * read as one instrument panel. It also owns two pieces of page plumbing the
 * bubble pages already learned the hard way: the inverse of the site-wide
 * `body { zoom: 1.1 }` (so canvas math, pointer coordinates and fixed
 * positioning agree in visual pixels) and a height that fills the viewport
 * below the site nav.
 */

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Archivo, IBM_Plex_Mono, Nunito_Sans } from "next/font/google";
import { effectiveZoom } from "@/lib/zoom";
import { SUITE_CSS } from "./suite.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["600", "800", "900"], variable: "--viz-head" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--viz-mono" });
const nunito = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--viz-sans" });

export interface SuiteTab {
  key: string;
  label: string;
  href: string;
  live?: boolean;
  soon?: boolean;
}

/** §10 the phasing plan, as navigation. */
export const SUITE_TABS: SuiteTab[] = [
  { key: "prediction", label: "Prediction Markets", href: "/visualizers/prediction-markets", live: true },
  { key: "contracts", label: "Government Contracts", href: "/visualizers/government-contracts" },
  { key: "mining", label: "Goldminer AI", href: "/visualizers/goldminer" },
  { key: "biotech", label: "Biotech", href: "/visualizers/biotech" },
];

export function SuiteShell({
  active,
  title,
  kicker,
  subtitle,
  controls,
  children,
}: {
  active: string;
  title: string;
  kicker: string;
  subtitle: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [invZoom, setInvZoom] = useState(1);
  const [shellH, setShellH] = useState<number | null>(null);
  useEffect(() => {
    // The arena is an instrument, not an article: it fills the viewport under
    // the site's sticky header so the field never runs off the fold and the
    // page itself does not scroll.
    const apply = () => {
      const z = effectiveZoom();
      setInvZoom(1 / z);
      // Measure where the shell actually starts rather than trusting a
      // header selector: this page sits under a ticker strip AND the nav, and
      // guessing left the arena taller than the fold.
      const top = ref.current?.getBoundingClientRect().top ?? 0;
      setShellH(Math.max(520, (window.innerHeight - top) * z));
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  return (
    <div
      ref={ref}
      className={`viz-root ${archivo.variable} ${plex.variable} ${nunito.variable}`}
      style={
        { zoom: invZoom, height: shellH ?? "calc(100vh - 150px)" } as React.CSSProperties
      }
    >
      <style>{SUITE_CSS}</style>

      <header className="viz-head">
        <div className="viz-brand">
          <span className="viz-kicker">{kicker}</span>
          <h1>{title}</h1>
        </div>
        <p className="viz-sub">{subtitle}</p>
        <nav className="viz-tabs" aria-label="Visualizer suite">
          {SUITE_TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className="viz-tab"
              data-on={t.key === active ? "1" : "0"}
            >
              {t.live && <span className="viz-dot" />}
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      {controls && <div className="viz-controls">{controls}</div>}
      {children}
    </div>
  );
}

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
import { useEffect, useState, type ReactNode } from "react";
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
  const [invZoom, setInvZoom] = useState(1);
  useEffect(() => {
    const apply = () => setInvZoom(1 / effectiveZoom());
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  return (
    <div
      className={`viz-root ${archivo.variable} ${plex.variable} ${nunito.variable}`}
      style={{ zoom: invZoom, minHeight: "calc(100vh - 64px)" } as React.CSSProperties}
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

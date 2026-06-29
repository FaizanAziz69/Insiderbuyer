"use client";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** `theme` follows var(--text), `light` forces white (for use on dark headers/footers) */
  tone?: "theme" | "light";
}

const SIZES = {
  sm: { fs: 22, gap: 0 },
  md: { fs: 30, gap: 0 },
  lg: { fs: 46, gap: 0 },
} as const;

export function Logo({ size = "md", className = "", tone = "theme" }: Props) {
  const s = SIZES[size];
  const light = tone === "light";
  const primary = light ? "#ffffff" : "var(--text)";
  const secondary = light ? "rgba(255,255,255,0.82)" : "var(--accent-2)";
  return (
    <span
      className={`inline-flex items-baseline select-none ${className}`}
      style={{ gap: "0.32em" }}
      aria-label="Insider Buying"
    >
      <span
        style={{
          color: primary,
          fontSize: s.fs,
          fontWeight: 900,
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        Insider
      </span>
      <span
        style={{
          color: secondary,
          fontSize: s.fs,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        Buying
      </span>
    </span>
  );
}

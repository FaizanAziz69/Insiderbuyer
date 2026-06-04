"use client";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** `theme` follows var(--text), `light` forces white (for use on dark headers/footers) */
  tone?: "theme" | "light";
}

const SIZES = {
  sm: { fs: 26, gap: 8 },
  md: { fs: 40, gap: 14 },
  lg: { fs: 64, gap: 20 },
} as const;

export function Logo({ size = "md", className = "", tone = "theme" }: Props) {
  const s = SIZES[size];
  const color = tone === "light" ? "#ffffff" : "var(--text)";
  return (
    <span
      className={`inline-flex items-baseline select-none ${className}`}
      style={{
        color,
        gap: s.gap,
        fontWeight: 900,
        fontStretch: "75%",
        letterSpacing: "-0.04em",
      }}
      aria-label="Insider Buying"
    >
      <span style={{ fontSize: s.fs, lineHeight: 1 }}>INSIDER</span>
      <span style={{ fontSize: s.fs, lineHeight: 1 }}>BUYING</span>
    </span>
  );
}

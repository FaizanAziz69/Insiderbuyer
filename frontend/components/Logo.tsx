"use client";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { fs: 16, gap: 6 },
  md: { fs: 28, gap: 10 },
  lg: { fs: 48, gap: 16 },
} as const;

export function Logo({ size = "md", className = "" }: Props) {
  const s = SIZES[size];
  return (
    <span
      className={`inline-flex items-baseline select-none ${className}`}
      style={{
        color: "var(--text)",
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

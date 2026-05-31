"use client";

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const HEIGHTS = { sm: 28, md: 40, lg: 72 } as const;

export function Logo({ size = "md", className = "" }: Props) {
  const h = HEIGHTS[size];
  const w = Math.round(h * 4.5);
  return (
    <span
      className={`logo-wrap relative inline-block ${className}`}
      style={{ height: h, width: w }}
      aria-label="Insider Buying"
    >
      <img
        src="/assets/insiderbuying_light.png"
        alt="Insider Buying"
        width={w}
        height={h}
        className="logo-light absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      <img
        src="/assets/insiderbuying_dark.png"
        alt=""
        width={w}
        height={h}
        className="logo-dark absolute inset-0 h-full w-full object-contain"
        draggable={false}
        aria-hidden
      />
    </span>
  );
}

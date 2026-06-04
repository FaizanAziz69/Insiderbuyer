"use client";
import { NewsCategory } from "@/lib/api";

interface Props {
  category: NewsCategory;
  seed: number;
  className?: string;
}

const CATEGORY_THEME: Record<NewsCategory, { from: string; to: string; accent: string }> = {
  Regulatory: { from: "#1e3a8a", to: "#3b82f6", accent: "#fbbf24" },
  Economy: { from: "#065f46", to: "#10b981", accent: "#fbbf24" },
  Funds: { from: "#6d28d9", to: "#a855f7", accent: "#22d3ee" },
  Market: { from: "#0c4a6e", to: "#0891b2", accent: "#10b981" },
};

export function NewsImage({ category, seed, className }: Props) {
  const theme = CATEGORY_THEME[category];
  const gradientId = `news-grad-${category}-${seed}`;
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className || ""}`}
      style={{
        background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)`,
      }}
    >
      <svg
        viewBox="0 0 320 160"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={theme.accent} stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        {category === "Regulatory" && <RegulatorySVG theme={theme} gradId={gradientId} />}
        {category === "Economy" && <EconomySVG theme={theme} gradId={gradientId} seed={seed} />}
        {category === "Funds" && <FundsSVG theme={theme} gradId={gradientId} seed={seed} />}
        {category === "Market" && <MarketSVG theme={theme} gradId={gradientId} seed={seed} />}
      </svg>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, transparent 45%, rgba(0,0,0,0.45) 100%)",
        }}
      />
    </div>
  );
}

function RegulatorySVG({ theme, gradId }: { theme: any; gradId: string }) {
  const cols = [60, 100, 140, 180, 220];
  return (
    <g>
      {/* Base ground */}
      <rect x="40" y="120" width="240" height="6" fill="rgba(255,255,255,0.25)" />
      {/* Pediment */}
      <polygon
        points="40,52 160,18 280,52"
        fill="rgba(255,255,255,0.16)"
        stroke="rgba(255,255,255,0.32)"
        strokeWidth="1.5"
      />
      <rect x="40" y="52" width="240" height="8" fill="rgba(255,255,255,0.28)" />
      {/* Columns */}
      {cols.map((x, i) => (
        <g key={i}>
          <rect x={x - 8} y="60" width="16" height="58" fill="rgba(255,255,255,0.85)" rx="1" />
          <rect x={x - 12} y="60" width="24" height="4" fill="rgba(255,255,255,0.95)" rx="1" />
          <rect x={x - 12} y="114" width="24" height="4" fill="rgba(255,255,255,0.95)" rx="1" />
          <line x1={x} x2={x} y1="62" y2="116" stroke={theme.from} strokeWidth="0.5" opacity="0.3" />
        </g>
      ))}
      {/* Star */}
      <g transform="translate(160 38)">
        <path
          d="M 0 -10 L 3 -3 L 10 -2 L 5 3 L 6 10 L 0 7 L -6 10 L -5 3 L -10 -2 L -3 -3 Z"
          fill={theme.accent}
        />
      </g>
      <text
        x="160"
        y="148"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        letterSpacing="3"
        fill="rgba(255,255,255,0.55)"
        fontFamily="ui-monospace, monospace"
      >
        REGULATORY
      </text>
    </g>
  );
}

function EconomySVG({ theme, gradId, seed }: { theme: any; gradId: string; seed: number }) {
  // Deterministic integer-based pseudorandom (no Math.sin → no SSR/CSR FP drift)
  const rand = (n: number) => {
    let s = ((seed | 0) + (n + 1) * 2654435761) | 0;
    s = (s ^ (s >>> 13)) >>> 0;
    s = Math.imul(s, 1597334677) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 0xffffffff;
  };
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const points: number[] = [];
  let y = 120;
  for (let i = 0; i < 8; i++) {
    points.push(round2(y));
    y -= 8 + rand(i) * 10;
  }
  const xStep = round2(240 / 7);
  const pts = points.map((p, i) => [round2(40 + i * xStep), p]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const area = `${path} L ${pts[pts.length - 1][0]} 140 L ${pts[0][0]} 140 Z`;
  return (
    <g>
      {/* Grid lines */}
      {[40, 70, 100, 130].map((y) => (
        <line
          key={y}
          x1="30"
          x2="290"
          y1={y}
          y2={y}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="0.8"
          strokeDasharray="2 3"
        />
      ))}
      {/* Area */}
      <path d={area} fill={`url(#${gradId})`} opacity="0.35" />
      {/* Line */}
      <path d={path} stroke="white" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      {/* Points */}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="white" stroke={theme.from} strokeWidth="1.5" />
      ))}
      {/* Arrow up at end */}
      <g transform={`translate(${pts[pts.length - 1][0] + 6} ${pts[pts.length - 1][1] - 4})`}>
        <path d="M 0 4 L 4 -3 L 8 4 Z" fill={theme.accent} />
      </g>
      <text
        x="160"
        y="20"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        letterSpacing="3"
        fill="rgba(255,255,255,0.55)"
        fontFamily="ui-monospace, monospace"
      >
        ECONOMY
      </text>
      <text
        x="40"
        y="148"
        fontSize="9"
        fontWeight="600"
        fill="rgba(255,255,255,0.65)"
        fontFamily="ui-monospace, monospace"
      >
        %
      </text>
      <text
        x="270"
        y="148"
        fontSize="9"
        fontWeight="600"
        fill="rgba(255,255,255,0.65)"
        fontFamily="ui-monospace, monospace"
      >
        $
      </text>
    </g>
  );
}

function FundsSVG({ theme, gradId, seed }: { theme: any; gradId: string; seed: number }) {
  // Deterministic integer-based pseudorandom (no Math.sin → no SSR/CSR FP drift)
  const rand = (n: number) => {
    let s = ((seed | 0) + (n + 1) * 2246822519) | 0;
    s = (s ^ (s >>> 13)) >>> 0;
    s = Math.imul(s, 3266489917) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 0xffffffff;
  };
  const round2 = (n: number) => Math.round(n * 100) / 100;
  // Pie chart segments with deterministic angles
  const raw = [40, 28, 20, 12].map((v) => round2(v + rand(v) * 6));
  const total = raw.reduce((a, b) => a + b, 0);
  const segs = raw.map((v) => round2((v / total) * 360));
  const cx = 110;
  const cy = 78;
  const r = 50;
  let start = -90;
  const colors = [theme.accent, "white", "rgba(255,255,255,0.6)", "rgba(255,255,255,0.35)"];

  const arcs = segs.map((sweep, i) => {
    const a1 = (start * Math.PI) / 180;
    const a2 = ((start + sweep) * Math.PI) / 180;
    const x1 = round2(cx + r * Math.cos(a1));
    const y1 = round2(cy + r * Math.sin(a1));
    const x2 = round2(cx + r * Math.cos(a2));
    const y2 = round2(cy + r * Math.sin(a2));
    const largeArc = sweep > 180 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    start += sweep;
    return { d, color: colors[i] };
  });

  return (
    <g>
      {arcs.map((a, i) => (
        <path key={i} d={a.d} fill={a.color} stroke={theme.from} strokeWidth="1.5" />
      ))}
      {/* Center hole */}
      <circle cx={cx} cy={cy} r="18" fill={theme.from} opacity="0.9" />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill={theme.accent}
        fontFamily="ui-monospace, monospace"
      >
        ETF
      </text>
      {/* Side bars */}
      {[0, 1, 2, 3, 4].map((i) => {
        const h = 22 + rand(i) * 28;
        return (
          <g key={i}>
            <rect
              x={200 + i * 18}
              y={120 - h}
              width="12"
              height={h}
              fill={`url(#${gradId})`}
              opacity={0.7 + rand(i + 10) * 0.3}
              rx="1"
            />
          </g>
        );
      })}
      <text
        x="160"
        y="20"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        letterSpacing="3"
        fill="rgba(255,255,255,0.55)"
        fontFamily="ui-monospace, monospace"
      >
        FUNDS
      </text>
    </g>
  );
}

function MarketSVG({ theme, gradId, seed }: { theme: any; gradId: string; seed: number }) {
  // Deterministic integer-based pseudorandom (no Math.sin → no SSR/CSR FP drift)
  const rand = (n: number) => {
    let s = ((seed | 0) + (n + 1) * 374761393) | 0;
    s = (s ^ (s >>> 13)) >>> 0;
    s = Math.imul(s, 1274126177) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 0xffffffff;
  };
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const candles = Array.from({ length: 16 }, (_, i) => {
    const center = round2(80 + (rand(i + 100) - 0.5) * 50);
    const range = round2(8 + rand(i) * 24);
    const bodyH = round2(4 + rand(i + 5) * 18);
    const up = rand(i + 10) > 0.4;
    const top = round2(center - range / 2);
    const bot = round2(center + range / 2);
    const bodyTop = round2(center - bodyH / 2);
    return { x: 30 + i * 16, top, bot, bodyTop, bodyH, up };
  });
  return (
    <g>
      {/* Grid */}
      {[40, 70, 100, 130].map((y) => (
        <line
          key={y}
          x1="20"
          x2="300"
          y1={y}
          y2={y}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.6"
          strokeDasharray="2 3"
        />
      ))}
      {candles.map((c, i) => (
        <g key={i}>
          <line
            x1={c.x + 5}
            x2={c.x + 5}
            y1={c.top}
            y2={c.bot}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1"
          />
          <rect
            x={c.x}
            y={c.bodyTop}
            width="10"
            height={c.bodyH}
            fill={c.up ? theme.accent : "#fda4af"}
            stroke="white"
            strokeWidth="0.5"
            rx="1"
          />
        </g>
      ))}
      <text
        x="160"
        y="20"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        letterSpacing="3"
        fill="rgba(255,255,255,0.55)"
        fontFamily="ui-monospace, monospace"
      >
        MARKET
      </text>
    </g>
  );
}

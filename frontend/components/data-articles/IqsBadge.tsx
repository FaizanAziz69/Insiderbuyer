/**
 * IQS badge — Developer Project Brief (Aug 24 2026), §2.1 component library:
 * "IQS badge (green ≥75, gold 50–74)". Below 50 the badge is muted; null
 * (no score yet) renders nothing so a bar never carries an empty pill.
 */
export function IqsBadge({ iqs, size = "sm" }: { iqs: number | null | undefined; size?: "sm" | "md" }) {
  if (iqs === null || iqs === undefined || !Number.isFinite(iqs)) return null;
  const tier = iqs >= 75 ? "green" : iqs >= 50 ? "gold" : "mute";
  const bg = tier === "green" ? "var(--good)" : tier === "gold" ? "#C9A227" : "var(--bg-2)";
  const fg = tier === "mute" ? "var(--text-mute)" : "#fff";
  const border = tier === "mute" ? "1px solid var(--border)" : "1px solid transparent";
  const pad = size === "md" ? "3px 9px" : "1px 7px";
  const fs = size === "md" ? 12 : 11;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full font-mono font-semibold tabular-nums shrink-0"
      style={{ background: bg, color: fg, border, padding: pad, fontSize: fs, lineHeight: 1.4, letterSpacing: 0.2 }}
      title={`Insider Score ${Math.round(iqs)} / 100`}
      aria-label={`Insider Score ${Math.round(iqs)} out of 100`}
    >
      IQS {Math.round(iqs)}
    </span>
  );
}

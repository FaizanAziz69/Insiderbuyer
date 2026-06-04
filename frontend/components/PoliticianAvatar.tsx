"use client";
import { useState } from "react";

interface Props {
  name: string;
  photoUrl?: string | null;
  party?: string | null;
  size?: number;
}

export function PoliticianAvatar({ name, photoUrl, party, size = 36 }: Props) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("");
  const partyColor =
    party === "D"
      ? "#1e40af"
      : party === "R"
      ? "#b91c1c"
      : party === "I"
      ? "#7c3aed"
      : "#475569";

  if (!photoUrl || photoUrl === ":initials:" || failed) {
    return (
      <span
        className="inline-flex items-center justify-center font-bold flex-shrink-0 text-white"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: partyColor,
          fontSize: Math.max(11, Math.round(size * 0.38)),
        }}
        aria-label={name}
      >
        {initials}
      </span>
    );
  }
  return (
    <img
      src={photoUrl}
      alt={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="flex-shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        border: `2px solid ${partyColor}`,
        background: "var(--bg-3)",
      }}
      loading="lazy"
    />
  );
}

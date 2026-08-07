"use client";
/** Blurred-face "mystery insider" avatar (client revision item 12):
 *  a suit with a pixel-blurred face — flag backdrop for politicians, plain
 *  backdrop for corporate insiders, with man/woman variants inferred from
 *  the first name (defaults to man when unknown). Pure inline SVG — no
 *  image assets, no real person depicted. */

const FEMALE_NAMES = new Set([
  "mary","patricia","jennifer","linda","elizabeth","barbara","susan","jessica",
  "sarah","karen","nancy","lisa","betty","margaret","sandra","ashley","kimberly",
  "emily","donna","michelle","carol","amanda","dorothy","melissa","deborah",
  "stephanie","rebecca","sharon","laura","cynthia","kathleen","amy","angela",
  "shirley","anna","ruth","brenda","pamela","nicole","katherine","catherine",
  "christine","samantha","janet","debra","carolyn","rachel","heather","maria",
  "diane","julie","joyce","victoria","kelly","christina","joan","evelyn","judith",
  "megan","andrea","cheryl","hannah","jacqueline","martha","gloria","teresa",
  "ann","anne","sara","madison","frances","kathryn","janice","jean","alice",
  "abigail","julia","judy","sophia","grace","denise","amber","doris","marilyn",
  "danielle","beverly","isabella","theresa","diana","natalie","brittany",
  "charlotte","marie","kayla","alexis","lori","wendy","priya","fatima","aisha",
  "wei","mei","yan","olga","elena","irina","svetlana","carla","claudia","monica",
]);

export function guessWoman(fullName: string): boolean {
  const first = (fullName || "").trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
  return !!first && FEMALE_NAMES.has(first);
}

/** Entity filers (funds, LLCs, LPs, trusts) are not people — they get the
 *  firm mark, never a gendered human face. */
const ENTITY_RE =
  /\b(L\.?P\.?|L\.?L\.?C\.?|Inc\.?|Corp\.?|Ltd\.?|Capital|Partners?|Management|Advisors?|Advisers?|Fund|Funds|Holdings?|Ventures?|Asset|Investments?|Group|Trust|Securities|Associates)\b/i;
export function isEntityName(fullName: string): boolean {
  return ENTITY_RE.test(fullName || "");
}

export function InsiderAvatar({
  name,
  kind = "insider",
  size = 36,
}: {
  name: string;
  kind?: "insider" | "politician";
  size?: number;
}) {
  // Funds / LLCs / LPs are entities, not people — show the firm mark.
  if (isEntityName(name)) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="Institutional filer"
        style={{ borderRadius: "50%", display: "block" }}
      >
        <circle cx="32" cy="32" r="32" fill="#2b3648" />
        {/* office building */}
        <rect x="20" y="16" width="24" height="34" rx="2" fill="#8fa3c0" />
        <rect x="26" y="50" width="12" height="6" fill="#8fa3c0" />
        {[22, 30, 38].map((y) =>
          [24, 31, 38].map((x) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" fill="#1d2534" />
          )),
        )}
      </svg>
    );
  }
  const woman = guessWoman(name);
  const uid = `${kind}-${woman ? "w" : "m"}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={kind === "politician" ? "Politician (identity hidden)" : "Insider (identity hidden)"}
      style={{ borderRadius: "50%", display: "block" }}
    >
      <defs>
        <clipPath id={`clip-${uid}`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
        <filter id={`blur-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>
      <g clipPath={`url(#clip-${uid})`}>
        {/* Backdrop: flag for politicians, studio grey for insiders */}
        {kind === "politician" ? (
          <>
            <rect width="64" height="64" fill="#233a63" />
            <g opacity="0.85">
              <rect y="8" width="64" height="5" fill="#b22234" />
              <rect y="18" width="64" height="5" fill="#b22234" />
              <rect y="28" width="64" height="5" fill="#b22234" />
              <rect y="13" width="64" height="5" fill="#eee" />
              <rect y="23" width="64" height="5" fill="#eee" />
              <rect width="26" height="26" fill="#233a63" />
              {[6, 14, 22].flatMap((x) =>
                [5, 12, 19].map((y) => (
                  <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="#fff" />
                )),
              )}
            </g>
          </>
        ) : (
          <>
            <rect width="64" height="64" fill="#3a4353" />
            <rect width="64" height="64" fill="url(#none)" opacity="0" />
          </>
        )}

        {/* Suit + shirt + tie */}
        <path d="M8 64 L14 46 Q20 40 32 40 Q44 40 50 46 L56 64 Z" fill="#1b2330" />
        <path d="M27 42 L32 52 L37 42 Q34.5 40.5 32 40.5 Q29.5 40.5 27 42 Z" fill="#f1f2f4" />
        <path d="M31 44 L33 44 L34.5 52 L32 56 L29.5 52 Z" fill="#7a1f2b" />

        {/* Head — blurred beyond recognition */}
        <g filter={`url(#blur-${uid})`}>
          {woman ? (
            <>
              {/* hair falls around the face */}
              <path d="M18 30 Q18 12 32 12 Q46 12 46 30 L46 42 Q40 46 32 46 Q24 46 18 42 Z" fill="#4a3423" />
              <ellipse cx="32" cy="27" rx="10.5" ry="12" fill="#caa284" />
            </>
          ) : (
            <>
              <path d="M21 20 Q23 12 32 12 Q41 12 43 20 L43 24 L21 24 Z" fill="#3c2f24" />
              <ellipse cx="32" cy="26" rx="11" ry="12.5" fill="#c99f7f" />
            </>
          )}
          {/* pixel-ish patches to suggest censorship */}
          <rect x="24" y="21" width="7" height="5" fill="#b58e6f" />
          <rect x="33" y="25" width="7" height="5" fill="#d3ac89" />
          <rect x="27" y="30" width="8" height="4" fill="#bf9878" />
        </g>
        {/* faint scanline overlay to read as "redacted" */}
        <g opacity="0.12">
          {[16, 22, 28, 34].map((y) => (
            <rect key={y} x="18" y={y} width="28" height="1.4" fill="#000" />
          ))}
        </g>
      </g>
    </svg>
  );
}

"use client";

/**
 * Brief v5 §5, the corrections channel: a report is "resolved through a logged
 * correction workflow (fix + dated correction note on the page)".
 *
 * The log already exists behind the admin token. This is the second half of
 * that sentence — the part the person the row is about, and the reader who
 * reported it, can actually see. A correction that only a database knows about
 * is not a correction anyone can point to, and §5 calls fast documented
 * corrections "the defamation defense that matters".
 *
 * Deliberately never hidden behind a toggle: a row that has been changed says
 * so on its face.
 */

export interface Correction {
  /** ISO timestamp of the change. */
  at: string;
  /** Which field moved, in the row's own vocabulary. */
  field?: string | null;
  /** What was corrected, in a sentence. */
  note?: string | null;
  /** 'agent' when re-verification corrected it, otherwise the editor. */
  actor?: string | null;
}

/** §5's house date style, spelled out so a correction cannot be misread as a
 *  US/UK ambiguous numeric date. */
function longDate(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Turn a logged change into the sentence a reader sees. The field names are
 * column names, and nobody should have to decode `award_value` to learn that
 * a contract figure was updated.
 */
function sentence(c: Correction): string {
  if (c.note) return c.note;
  const FIELD: Record<string, string> = {
    award_value: "the award value was updated to match the USAspending record",
    award_date: "the award date was updated to match the USAspending record",
    agency: "the awarding agency was updated to match the USAspending record",
    trade_date: "the transaction date was updated to match the amended filing",
    trade_value: "the disclosed amount was updated to match the amended filing",
  };
  const field = c.field ? FIELD[c.field] : null;
  return field ?? "this entry was updated to match its primary source";
}

export function CorrectionNote({ corrections }: { corrections?: Correction[] | null }) {
  const list = (corrections || []).filter((c) => c && c.at);
  if (!list.length) return null;

  // Newest first: the most recent change is the one a reader returning to a
  // page they have seen before is looking for.
  const ordered = [...list].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <div
      className="rounded-lg p-3 mt-2.5"
      style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
    >
      <div
        className="text-[10.5px] font-bold uppercase tracking-wide mb-1"
        style={{ color: "var(--text-mute)" }}
      >
        {ordered.length === 1 ? "Correction" : "Corrections"}
      </div>
      <ul className="list-none p-0 m-0 flex flex-col gap-1">
        {ordered.map((c, i) => (
          <li key={i} className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-soft)" }}>
            <span style={{ color: "var(--text)" }}>Corrected {longDate(c.at)}:</span> {sentence(c)}
            {c.actor === "agent" ? (
              <span style={{ color: "var(--text-mute)" }}> (applied automatically from the primary source)</span>
            ) : c.actor ? (
              <span style={{ color: "var(--text-mute)" }}> (reviewed by an editor)</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

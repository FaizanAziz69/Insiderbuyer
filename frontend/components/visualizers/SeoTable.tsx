import Link from "next/link";

/**
 * §9.8 "SEO (static snapshots for crawlers)".
 *
 * A canvas is invisible to a crawler and to anyone with JavaScript off, so each
 * visualizer ships a server-rendered table of its headline rows underneath the
 * arena. It is not a hidden SEO device: it is the same data, readable, and
 * useful to a person who wants the list rather than the picture.
 */
export function SeoTable({
  title,
  intro,
  columns,
  rows,
  note,
}: {
  title: string;
  intro: string;
  columns: string[];
  rows: { href?: string; cells: (string | number)[] }[];
  note?: React.ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <section style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 20px 52px" }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "-0.01em",
          margin: "0 0 6px",
        }}
      >
        {title}
      </h2>
      <p style={{ color: "var(--text-mute)", fontSize: 14, margin: "0 0 18px" }}>{intro}</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-mute)", fontSize: 11.5 }}>
              {columns.map((c, i) => (
                <th
                  key={c}
                  style={{ padding: "8px 10px", textAlign: i === 0 ? "left" : "right" }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} style={{ borderTop: "1px solid var(--border)" }}>
                {r.cells.map((cell, i) => (
                  <td
                    key={i}
                    style={{
                      padding: "10px",
                      textAlign: i === 0 ? "left" : "right",
                      fontFamily: i === 0 ? undefined : "var(--font-mono)",
                    }}
                  >
                    {i === 0 && r.href ? (
                      <Link href={r.href} style={{ color: "inherit", textDecoration: "none" }}>
                        {cell}
                      </Link>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && (
        <p style={{ color: "var(--text-faint)", fontSize: 11.5, marginTop: 14, lineHeight: 1.6 }}>
          {note}
        </p>
      )}
    </section>
  );
}

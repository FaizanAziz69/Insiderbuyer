import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { PitService } from './pit.service';
import { QuantService } from './quant.service';

/**
 * The InsiderBuying Conviction Index (IBCX) — Brief v6 §1 and §6.
 *
 * "the published index reconstitutes on the quarterly schedule with rules
 * only; the executed portfolio may lag entries per the tranche logic. Both
 * share the same rankings."
 *
 * So the index is deliberately simpler than the fund: no tranches, no
 * liquidity caps, no drawdown protocol. It is the rules expressed cleanly,
 * which is what makes it publishable as a data product under §10.
 */

const DAY = 86_400_000;

@Injectable()
export class IndexService {
  private readonly log = new Logger(IndexService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly pit: PitService,
    private readonly quant: QuantService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  /** Quarter starts, which is the reconstitution schedule. */
  private isReconstitutionDate(d: Date): boolean {
    return d.getUTCDate() <= 7 && [0, 3, 6, 9].includes(d.getUTCMonth());
  }

  /**
   * Rebuild the index level series from the stored rankings. The level is
   * rebased to 1000 at the first reconstitution, in the way a published index
   * conventionally is.
   */
  async rebuild(opts: { from?: string; to?: string } = {}): Promise<any> {
    await this.quant.ensureTables();
    const snaps = await this.q<any[]>(
      `SELECT id, to_char(as_of,'YYYY-MM-DD') AS as_of, target FROM quant_snapshots
       WHERE ($1::date IS NULL OR as_of >= $1) AND ($2::date IS NULL OR as_of <= $2)
       ORDER BY as_of ASC`,
      [opts.from || null, opts.to || null],
    );
    if (!snaps.length) return { ok: false, reason: 'No rankings stored yet; run the ranking engine first.' };

    let level = 1000;
    let held: Array<{ symbol: string; weight: number }> = [];
    let prevMs: number | null = null;
    const written: string[] = [];

    for (const s of snaps) {
      const asOfMs = new Date(`${s.as_of}T00:00:00Z`).getTime();
      if (prevMs != null && held.length) {
        let ret = 0;
        for (const h of held) {
          const pts = await this.pit.priceSeries(h.symbol);
          const p0 = this.closeAt(pts, prevMs);
          const p1 = this.closeAt(pts, asOfMs);
          // A constituent that stops pricing goes to zero rather than
          // vanishing, so the index cannot be flattered by delistings.
          ret += h.weight * (p0 && p0 > 0 ? (p1 && p1 > 0 ? p1 / p0 - 1 : -1) : 0);
        }
        level *= 1 + ret;
      }
      const positions: Array<{ symbol: string; weight: number; sector: string | null; sleeves: string[] }> =
        (s.target?.positions || []).map((p: any) => ({ symbol: p.symbol, weight: p.weight, sector: p.sector, sleeves: p.sleeves }));
      // Index weights are the target weights renormalised to fully invested:
      // the index holds no cash buffer, the fund does.
      const total = positions.reduce((a, b) => a + b.weight, 0) || 1;
      const constituents = positions.map((p) => ({ ...p, weight: Math.round((p.weight / total) * 1e6) / 1e6 }));
      held = constituents.map((c) => ({ symbol: c.symbol, weight: c.weight }));
      prevMs = asOfMs;

      await this.q(
        `INSERT INTO quant_index (index_id, as_of, level, constituents, reconstituted)
         VALUES ('IBCX', $1::date, $2, $3::jsonb, $4)
         ON CONFLICT (index_id, as_of) DO UPDATE SET level = EXCLUDED.level, constituents = EXCLUDED.constituents, reconstituted = EXCLUDED.reconstituted`,
        [s.as_of, Math.round(level * 100) / 100, JSON.stringify(constituents), this.isReconstitutionDate(new Date(asOfMs))],
      );
      written.push(s.as_of);
    }
    this.log.log(`IBCX rebuilt across ${written.length} dates, level ${Math.round(level)}`);
    return { ok: true, dates: written.length, level: Math.round(level * 100) / 100, from: written[0], to: written[written.length - 1] };
  }

  private closeAt(points: Array<[number, number, number]> | null, ms: number): number | null {
    if (!points?.length) return null;
    let best: number | null = null;
    for (const [t, c] of points) {
      if (t <= ms) best = c;
      else break;
    }
    return best;
  }

  /**
   * Payload for the index page.
   *
   * WHO IS ALLOWED TO SEE WHAT. The index LEVEL, its history, its sector and
   * sleeve mix and its weights are the public data product §10 describes, and
   * they stay public. The NAMES are the product itself — the client, 2026-09-30:
   * "put Request Access on this page and blur the stock names and tickers only.
   * Make sure there's not other back door to that data."
   *
   * "No back door" is why the stripping is here and not in the page. A blur in
   * CSS is a decoration over a value the browser already has, readable in
   * view-source by anyone who thinks to look; the repo learnt that on
   * /politicians, where the teaser row was a real row at opacity 0.28. So an
   * ungranted caller never receives a symbol at all. The field is DELETED
   * rather than nulled, for the same reason the premium stripper deletes:
   * nothing downstream can mistake a mask for a value.
   *
   * The page is SSR-seeded from this endpoint with no token, so the guest HTML
   * carries the withheld shape too — which is the only version of this that
   * actually holds.
   */
  async publicView(granted = false): Promise<any> {
    await this.quant.ensureTables();
    const series = await this.q<any[]>(
      `SELECT to_char(as_of,'YYYY-MM-DD') AS as_of, level, reconstituted FROM quant_index WHERE index_id = 'IBCX' ORDER BY as_of ASC`,
    );
    const [latest] = await this.q<any[]>(
      `SELECT to_char(as_of,'YYYY-MM-DD') AS as_of, level, constituents FROM quant_index WHERE index_id = 'IBCX' ORDER BY as_of DESC LIMIT 1`,
    );
    const first = series[0];
    const level = latest ? Number(latest.level) : null;
    // Anything dated well before the snapshot that produced it is a
    // reconstruction: the rules applied after the fact to point-in-time data,
    // not a level we published at the time. §10 requires that distinction to
    // be explicit and such figures labelled hypothetical pending counsel, so
    // the payload carries the boundary rather than leaving the page to infer it.
    const liveRows = await this.q<Array<{ d: string | null }>>(
      `SELECT to_char(min(as_of),'YYYY-MM-DD') AS d FROM quant_snapshots
       WHERE created_at <= (as_of + interval '3 days')`,
    );
    const liveFrom: string | null = liveRows[0]?.d || null;
    return {
      indexId: 'IBCX',
      name: 'InsiderBuying Conviction Index',
      level,
      inception: first?.as_of || null,
      sinceInception: first && level ? Math.round((level / Number(first.level) - 1) * 1e4) / 1e4 : null,
      liveFrom,
      reconstructed: !liveFrom || (first ? first.as_of < liveFrom : true),
      hypotheticalNote:
        'Levels dated before this index began publishing are a reconstruction: the same rules applied after the fact to point-in-time data — the filings and statements that were public on each date, and the universe as it was listed then, including companies later delisted. No allowance is made for trading costs, and no money was managed to these levels. Treat reconstructed figures as hypothetical.',
      series: series.map((r) => ({ date: r.as_of, level: Number(r.level), reconstituted: r.reconstituted })),
      constituents: this.shapeConstituents(latest?.constituents || [], granted),
      // The page needs the count for its tile and for the number of rows to
      // draw under the wall, and a count identifies nobody.
      constituentCount: (latest?.constituents || []).length,
      constituentsWithheld: !granted,
      asOf: latest?.as_of || null,
      // §10: the index is information, not advice, and says so wherever it appears.
      disclaimer:
        'The InsiderBuying Conviction Index is published as information, not investment advice, and is not an offer of any fund or managed product. It is built only from public disclosures — SEC Form 4 and SEDI filings, and as-reported financial statements — using rules applied to point-in-time data. Current InsiderBuying agency and IR clients are excluded from the index by rule, and for six months after an engagement ends.',
    };
  }

  /**
   * Constituents as the caller is entitled to see them.
   *
   * Withheld rows keep their position, weight, sector and sleeves and lose the
   * symbol. Position matters: the table is ordered by weight, so a reader can
   * still see the shape of the index — how concentrated it is, which sectors
   * carry it — which is the part that makes the gate worth passing.
   *
   * `sector` survives deliberately. A sector is not a name: the largest sleeve
   * holds dozens of companies, and nothing in the row narrows it to one. If
   * that ever stops being true — a one-company sector, an index small enough
   * to enumerate — this is the line to revisit.
   */
  private shapeConstituents(rows: any[], granted: boolean): any[] {
    if (granted) return rows;
    return rows.map((c: any, i: number) => ({
      rank: i + 1,
      weight: c.weight,
      sector: c.sector ?? null,
      sleeves: c.sleeves ?? [],
    }));
  }
}

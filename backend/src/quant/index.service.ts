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

  /** Public payload for the index page. */
  async publicView(): Promise<any> {
    await this.quant.ensureTables();
    const series = await this.q<any[]>(
      `SELECT to_char(as_of,'YYYY-MM-DD') AS as_of, level, reconstituted FROM quant_index WHERE index_id = 'IBCX' ORDER BY as_of ASC`,
    );
    const [latest] = await this.q<any[]>(
      `SELECT to_char(as_of,'YYYY-MM-DD') AS as_of, level, constituents FROM quant_index WHERE index_id = 'IBCX' ORDER BY as_of DESC LIMIT 1`,
    );
    const first = series[0];
    const level = latest ? Number(latest.level) : null;
    return {
      indexId: 'IBCX',
      name: 'InsiderBuying Conviction Index',
      level,
      inception: first?.as_of || null,
      sinceInception: first && level ? Math.round((level / Number(first.level) - 1) * 1e4) / 1e4 : null,
      series: series.map((r) => ({ date: r.as_of, level: Number(r.level), reconstituted: r.reconstituted })),
      constituents: latest?.constituents || [],
      asOf: latest?.as_of || null,
      // §10: the index is information, not advice, and says so wherever it appears.
      disclaimer:
        'The InsiderBuying Conviction Index is published as information, not investment advice, and is not an offer of any fund or managed product. It is built only from public disclosures — SEC Form 4 and SEDI filings, and as-reported financial statements — using rules applied to point-in-time data. Current InsiderBuying agency and IR clients are excluded from the index by rule, and for six months after an engagement ends.',
    };
  }
}

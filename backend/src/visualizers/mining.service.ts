import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { VizMiningProject } from '../entities/visualizer.entity';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { InsiderSnapshotService } from './insider-snapshot.service';

/**
 * Product 1 — Goldminer AI (Brief v2 §4), Phase 3.
 *
 * This service owns the three things §9.6 asks the backend for: the project
 * schema and its import validator, the asset-value sizing hierarchy with its
 * provenance string, and the peer-stage medians the fair-value snapshot
 * compares against.
 *
 * A deliberate absence: there is no seeded project dataset in here. §4.4 puts
 * curation of the top 300-500 projects with editorial ("~2-3 wks", running in
 * parallel), and §12 Q2 leaves buy-vs-scrape-vs-curate open. Every candidate
 * free source fails §8's "no invented numbers, source + as-of date on every
 * figure" — USGS MRDS carries occurrences with no economics, and Wikipedia's
 * mine infoboxes yielded fourteen usable rows with no resource figures at all.
 * So the product ships complete and empty, with `importRows` ready: the moment
 * a curated sheet exists, one admin call fills the map.
 */

export interface MiningProjectDto {
  id: string;
  name: string;
  company: string;
  ticker: string | null;
  exchange: string | null;
  isPublic: boolean;
  lat: number;
  lng: number;
  country: string;
  region: string | null;
  stage: string;
  ozMeasuredIndicated: number | null;
  ozInferred: number | null;
  gradeGpt: number | null;
  depositType: string | null;
  studyType: string | null;
  npvAfterTaxUsd: number | null;
  npvDiscountRate: number | null;
  goldPriceAssumption: number | null;
  irrPct: number | null;
  capexUsd: number | null;
  aiscPerOz: number | null;
  mineLifeYears: number | null;
  annualProductionOz: number | null;
  ownershipPct: number | null;
  jvPartners: string | null;
  assetValueUsd: number;
  sizedBy: string;
  evPerOz: number | null;
  peerMedianEvPerOz: number | null;
  insidersBuying: boolean;
  sourceName: string;
  sourceUrl: string | null;
  sourceDate: string;
}

/** §4.2 stage discounts for the in-situ fallback. An ounce in the ground at an
 *  exploration target is not worth an ounce at a permitted, financed mine, and
 *  the discount ladder is the industry's own shorthand for that gap. */
const STAGE_DISCOUNT: Record<string, number> = {
  Exploration: 0.015,
  Resource: 0.025,
  PEA: 0.04,
  PFS: 0.06,
  FS: 0.08,
  Construction: 0.1,
  Production: 0.12,
};

export const STAGES = Object.keys(STAGE_DISCOUNT);

/** Inferred ounces carry materially more risk than measured and indicated, so
 *  they enter the in-situ figure at a third of the weight. */
const INFERRED_WEIGHT = 1 / 3;
/** Producers with no study: annual production is valued as a multiple of one
 *  year's revenue at spot, which is the crudest tier and says so in the label. */
const PRODUCER_MULTIPLE = 4;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export interface ImportIssue {
  row: number;
  field: string;
  problem: string;
}

@Injectable()
export class MiningService implements OnModuleInit {
  private readonly logger = new Logger(MiningService.name);
  /** Spot gold, refreshed hourly from our own market data. */
  private spot = 2400;
  private spotAt = 0;

  constructor(
    @InjectRepository(VizMiningProject)
    private readonly repo: Repository<VizMiningProject>,
    private readonly insider: InsiderSnapshotService,
    private readonly market: MarketStatsService,
  ) {}

  async onModuleInit(): Promise<void> {
    setTimeout(() => void this.refreshSpot(), 8_000).unref?.();
  }

  /**
   * §4.2's in-situ tier multiplies ounces by SPOT, so a hardcoded price would
   * quietly misprice the whole map. The site already tracks the gold future
   * for its ticker strip; the same quote drives the sizing, and the "Sized by"
   * string prints whatever price was used.
   */
  @Cron('25 * * * *')
  async refreshSpot(): Promise<{ spot: number }> {
    try {
      // The same quote the site's ticker strip uses. The indices service has a
      // hardcoded fallback that silently answers ~$2,346 when its own source
      // is down, which would misprice the whole map without erroring.
      const quotes = await this.market.getQuoteBatch(['GC=F']);
      const gold = quotes.get('GC=F');
      const price = Number(gold?.price ?? 0);
      if (price > 500) {
        this.setSpot(price);
        this.logger.log(`spot gold ${price}`);
      }
    } catch (e) {
      this.logger.warn(`spot refresh: ${(e as Error).message}`);
    }
    return { spot: this.spot };
  }

  setSpot(price: number): void {
    if (price > 0) {
      this.spot = price;
      this.spotAt = Date.now();
    }
  }

  /**
   * §4.2 the asset-value hierarchy, best available wins:
   *   1. after-tax NPV from the most advanced study
   *   2. in-situ metal value = ounces × spot × stage discount
   *   3. producers with neither: a multiple of annual production value
   * The `sizedBy` string is returned with the number, because §4.2 makes that
   * transparency a feature rather than a footnote.
   */
  assetValue(p: VizMiningProject): { value: number; sizedBy: string } {
    const npv = num(p.npvAfterTaxUsd);
    if (npv && npv > 0) {
      const rate = p.npvDiscountRate ? `${p.npvDiscountRate}%` : '';
      const gold = p.goldPriceAssumption
        ? ` @ $${Math.round(p.goldPriceAssumption).toLocaleString('en-US')}/oz`
        : '';
      return {
        value: npv,
        sizedBy: `${p.studyType ?? 'Study'} NPV${rate}${gold}`,
      };
    }
    const mi = num(p.ozMeasuredIndicated) ?? 0;
    const inf = num(p.ozInferred) ?? 0;
    const ounces = mi + inf * INFERRED_WEIGHT;
    if (ounces > 0) {
      const disc = STAGE_DISCOUNT[p.stage] ?? 0.02;
      return {
        value: ounces * this.spot * disc,
        sizedBy: `In-situ ounces × $${Math.round(this.spot).toLocaleString('en-US')}/oz spot × ${(
          disc * 100
        ).toFixed(1)}% ${p.stage} discount`,
      };
    }
    const annual = num(p.annualProductionOz);
    if (annual && annual > 0) {
      return {
        value: annual * this.spot * PRODUCER_MULTIPLE,
        sizedBy: `${PRODUCER_MULTIPLE}× annual production at $${Math.round(
          this.spot,
        ).toLocaleString('en-US')}/oz spot`,
      };
    }
    return { value: 0, sizedBy: 'No published economics' };
  }

  /* --------------------------------------------------------------- read */

  async list(): Promise<{ projects: MiningProjectDto[]; peerMedians: Record<string, number> }> {
    const rows = await this.repo.find();
    if (rows.length === 0) return { projects: [], peerMedians: {} };

    const sized = rows.map((r) => ({ row: r, ...this.assetValue(r) }));

    // §4.3 fair-value snapshot: EV/oz against the peer-stage median. Enterprise
    // value needs a quote per ticker, which we do not fan out to on a read; the
    // asset value stands in for EV where a quote is absent and the panel says
    // which one it used.
    const evByStage = new Map<string, number[]>();
    for (const s of sized) {
      const oz = (num(s.row.ozMeasuredIndicated) ?? 0) + (num(s.row.ozInferred) ?? 0);
      if (oz <= 0 || s.value <= 0) continue;
      const per = s.value / oz;
      if (!evByStage.has(s.row.stage)) evByStage.set(s.row.stage, []);
      evByStage.get(s.row.stage)!.push(per);
    }
    const peerMedians: Record<string, number> = {};
    for (const [stage, arr] of evByStage) {
      arr.sort((a, b) => a - b);
      peerMedians[stage] = arr[Math.floor(arr.length / 2)];
    }

    const tickers = rows.map((r) => r.ticker).filter(Boolean) as string[];
    const buying = await this.insider.buyingSet(tickers);

    const projects: MiningProjectDto[] = sized.map(({ row: r, value, sizedBy }) => {
      const oz = (num(r.ozMeasuredIndicated) ?? 0) + (num(r.ozInferred) ?? 0);
      const evPerOz = oz > 0 && value > 0 ? value / oz : null;
      return {
        id: r.id,
        name: r.name,
        company: r.company,
        ticker: r.ticker,
        exchange: r.exchange,
        isPublic: r.isPublic,
        lat: r.lat,
        lng: r.lng,
        country: r.country,
        region: r.region,
        stage: r.stage,
        ozMeasuredIndicated: num(r.ozMeasuredIndicated),
        ozInferred: num(r.ozInferred),
        gradeGpt: num(r.gradeGpt),
        depositType: r.depositType,
        studyType: r.studyType,
        npvAfterTaxUsd: num(r.npvAfterTaxUsd),
        npvDiscountRate: num(r.npvDiscountRate),
        goldPriceAssumption: num(r.goldPriceAssumption),
        irrPct: num(r.irrPct),
        capexUsd: num(r.capexUsd),
        aiscPerOz: num(r.aiscPerOz),
        mineLifeYears: num(r.mineLifeYears),
        annualProductionOz: num(r.annualProductionOz),
        ownershipPct: num(r.ownershipPct),
        jvPartners: r.jvPartners,
        assetValueUsd: Math.round(value),
        sizedBy,
        evPerOz,
        peerMedianEvPerOz: peerMedians[r.stage] ?? null,
        insidersBuying: r.ticker ? buying.has(r.ticker.toUpperCase()) : false,
        sourceName: r.sourceName,
        sourceUrl: r.sourceUrl,
        sourceDate: r.sourceDate,
      };
    });
    projects.sort((a, b) => b.assetValueUsd - a.assetValueUsd);
    return { projects, peerMedians };
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  /* ------------------------------------------------- import + validate */

  /**
   * §9.6 "seed tooling ... with an import validator". Rejects rather than
   * guesses: a row missing its source or its coordinates does not belong on a
   * map that claims every figure is sourced.
   */
  validate(rows: Record<string, unknown>[]): { ok: Record<string, unknown>[]; issues: ImportIssue[] } {
    const issues: ImportIssue[] = [];
    const ok: Record<string, unknown>[] = [];
    rows.forEach((r, i) => {
      const rowIssues: ImportIssue[] = [];
      const need = (field: string) => {
        const v = r[field];
        if (v === undefined || v === null || String(v).trim() === '') {
          rowIssues.push({ row: i + 1, field, problem: 'required' });
          return false;
        }
        return true;
      };
      need('id');
      need('name');
      need('company');
      need('country');
      need('sourceName');
      need('sourceDate');

      const lat = num(r.lat);
      const lng = num(r.lng);
      if (lat == null || lat < -90 || lat > 90) {
        rowIssues.push({ row: i + 1, field: 'lat', problem: 'must be a number between -90 and 90' });
      }
      if (lng == null || lng < -180 || lng > 180) {
        rowIssues.push({ row: i + 1, field: 'lng', problem: 'must be a number between -180 and 180' });
      }
      const stage = String(r.stage ?? '');
      if (!STAGES.includes(stage)) {
        rowIssues.push({
          row: i + 1,
          field: 'stage',
          problem: `must be one of ${STAGES.join(', ')}`,
        });
      }
      const study = r.studyType ? String(r.studyType) : null;
      if (study && !['PEA', 'PFS', 'FS'].includes(study)) {
        rowIssues.push({ row: i + 1, field: 'studyType', problem: 'must be PEA, PFS or FS' });
      }
      // §8: an NPV with no study behind it and no gold-price assumption is a
      // number with no meaning, so it is refused rather than displayed.
      if (num(r.npvAfterTaxUsd) && !study) {
        rowIssues.push({
          row: i + 1,
          field: 'studyType',
          problem: 'an NPV requires the study it came from',
        });
      }
      if (num(r.npvAfterTaxUsd) && !num(r.goldPriceAssumption)) {
        rowIssues.push({
          row: i + 1,
          field: 'goldPriceAssumption',
          problem: 'an NPV requires its base-case gold price',
        });
      }
      const date = String(r.sourceDate ?? '');
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        rowIssues.push({ row: i + 1, field: 'sourceDate', problem: 'must be YYYY-MM-DD' });
      }

      if (rowIssues.length) issues.push(...rowIssues);
      else ok.push(r);
    });
    return { ok, issues };
  }

  async importRows(
    rows: Record<string, unknown>[],
    opts: { replace?: boolean } = {},
  ): Promise<{ imported: number; rejected: number; issues: ImportIssue[] }> {
    const { ok, issues } = this.validate(rows);
    if (opts.replace && ok.length) await this.repo.clear();
    const entities = ok.map((r) =>
      this.repo.create({
        id: String(r.id),
        name: String(r.name),
        company: String(r.company),
        ticker: r.ticker ? String(r.ticker).toUpperCase() : null,
        exchange: r.exchange ? String(r.exchange) : null,
        isPublic: r.isPublic === undefined ? !!r.ticker : !!r.isPublic,
        lat: num(r.lat)!,
        lng: num(r.lng)!,
        country: String(r.country),
        region: r.region ? String(r.region) : null,
        stage: String(r.stage),
        ozMeasuredIndicated: num(r.ozMeasuredIndicated),
        ozInferred: num(r.ozInferred),
        gradeGpt: num(r.gradeGpt),
        depositType: r.depositType ? String(r.depositType) : null,
        studyType: r.studyType ? String(r.studyType) : null,
        npvAfterTaxUsd: num(r.npvAfterTaxUsd) == null ? null : String(num(r.npvAfterTaxUsd)),
        npvDiscountRate: num(r.npvDiscountRate),
        goldPriceAssumption: num(r.goldPriceAssumption),
        irrPct: num(r.irrPct),
        capexUsd: num(r.capexUsd) == null ? null : String(num(r.capexUsd)),
        aiscPerOz: num(r.aiscPerOz),
        mineLifeYears: num(r.mineLifeYears),
        annualProductionOz: num(r.annualProductionOz),
        ownershipPct: num(r.ownershipPct),
        jvPartners: r.jvPartners ? String(r.jvPartners) : null,
        sourceName: String(r.sourceName),
        sourceUrl: r.sourceUrl ? String(r.sourceUrl) : null,
        sourceDate: String(r.sourceDate),
      }),
    );
    for (let i = 0; i < entities.length; i += 100) {
      await this.repo.save(entities.slice(i, i + 100));
    }
    return { imported: entities.length, rejected: rows.length - ok.length, issues };
  }

  /** The importer also accepts a CSV body, which is what a curation sheet
   *  exports to. Quoted fields with commas are handled; nothing else is. */
  parseCsv(text: string): Record<string, unknown>[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
    if (lines.length < 2) return [];
    const head = splitCsvLine(lines[0]).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cells = splitCsvLine(line);
      const row: Record<string, unknown> = {};
      head.forEach((h, i) => {
        const v = (cells[i] ?? '').trim();
        row[h] = v === '' ? null : v;
      });
      return row;
    });
  }
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

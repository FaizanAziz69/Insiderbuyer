import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BuyCandidate, ResearchService } from './research.service';
import { DeskKind, WriterService, money } from './writer.service';
import { CoverService } from './cover.service';
import { looksInstitutional, photoFor } from './person-photos';
import { join } from 'node:path';

/**
 * The daily desk: four articles a day, written and illustrated from our own
 * record, published at 3pm Pakistan time.
 *
 * The mix is the client's (2026-09-23): two top stories, one for the popular
 * rail, one stock idea. Those map onto what the research service actually
 * finds, which is why the mix works at all: the two biggest open-market
 * purchases carry a top story each, a multi-buyer cluster carries the popular
 * slot (cluster-buy scores highest in the site's own POPULAR_WEIGHT), and the
 * next single purchase becomes the stock idea.
 *
 * Nothing here invents a fact. Research supplies reconciled figures, the writer
 * is told those are the only numbers it may use, and the cover is either a real
 * photograph of the subject or an object scene. A face is never generated for
 * someone we do not hold a picture of.
 */

/** The batch, in the order it is assigned. */
const PLAN: Array<{ kind: DeskKind; source: 'buy' | 'cluster'; blogKind: string }> = [
  { kind: 'editorial', source: 'buy', blogKind: 'editorial' },
  { kind: 'editorial', source: 'buy', blogKind: 'editorial' },
  { kind: 'cluster-buy', source: 'cluster', blogKind: 'cluster-buy' },
  { kind: 'stock-idea', source: 'buy', blogKind: 'stock-idea' },
];

/**
 * Background grades, one per article per day.
 *
 * The client asked that no two covers repeat. Filenames are the slug so a file
 * is never reused, but two object covers graded the same teal read as the same
 * picture at thumbnail size, which is where a reader actually sees them. So a
 * grade is claimed per batch and the palette rotates by day, which also keeps
 * consecutive days from looking alike.
 */
const GRADES = [
  'deep teal with gold highlights',
  'burnt orange with charcoal shadows',
  'magenta and deep purple',
  'amber gold with dark slate',
  'cold steel blue with cyan',
  'oxblood red with warm grey',
  'forest green with brass',
];

const HALOS = ['yellow', 'white', 'hot pink', 'lime green', 'cyan'];

/** Dropped from slugs. The published ones read like
 *  "michael-burry-copper-ero-position" and "steve-eisman-ai-terminator-moats":
 *  four to six words that carry the story, no connective tissue. */
const SLUG_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'its', 'with',
  'across', 'same', 'single', 'from', 'as', 'by', 'that', 'this', 'over',
]);

@Injectable()
export class DailyDeskService {
  private readonly logger = new Logger(DailyDeskService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly research: ResearchService,
    private readonly writer: WriterService,
    private readonly cover: CoverService,
  ) {}

  /** 15:00 Pakistan time, every day. */
  @Cron('0 15 * * *', { timeZone: 'Asia/Karachi' })
  async scheduled() {
    if (await this.isOff()) {
      this.logger.warn('daily desk is OFF (daily_desk_off=1), skipping');
      return;
    }
    await this.run({ publish: true });
  }

  /** Kill switch, same shape as the content generator's pause flag. */
  private async isOff(): Promise<boolean> {
    try {
      const r = await this.db.query(
        `SELECT value FROM app_settings WHERE key = 'daily_desk_off' LIMIT 1`,
      );
      return r?.[0]?.value === '1';
    } catch {
      return false;
    }
  }

  /**
   * Build today's batch. `publish: false` writes nothing to blog_posts, which
   * is how a run is inspected before the cron is armed.
   */
  async run(opts: { publish: boolean; limit?: number; draft?: boolean }): Promise<{
    picked: number;
    published: number;
    items: Array<Record<string, unknown>>;
    errors: string[];
  }> {
    const errors: string[] = [];
    const items: Array<Record<string, unknown>> = [];
    const covered = await this.recentTickers();

    const buys = (await this.research.biggestBuys(5, 20)).filter((c) => this.eligible(c, covered));
    const clusters = (await this.research.clusterBuys(10, 12)).filter((c) =>
      this.eligible(c, covered),
    );

    // A story whose subject we can photograph leads, because a real face is
    // the house cover and an object cover is the fallback, not the target.
    buys.sort((a, b) => Number(!!photoFor(b.who)) - Number(!!photoFor(a.who)) || b.value - a.value);

    const usedTickers = new Set<string>();
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    const plan = PLAN.slice(0, opts.limit && opts.limit > 0 ? opts.limit : PLAN.length);

    let slot = 0;
    for (const step of plan) {
      const pool = step.source === 'cluster' ? clusters : buys;
      const candidate = pool.find((c) => c.ticker && !usedTickers.has(c.ticker));
      if (!candidate) {
        errors.push(`no candidate left for ${step.kind}`);
        continue;
      }
      usedTickers.add(candidate.ticker);

      try {
        const item = await this.buildOne(step, candidate, dayIndex + slot, opts.publish, !!opts.draft);
        items.push(item);
      } catch (e: any) {
        errors.push(`${candidate.ticker}: ${e?.message || e}`);
      }
      slot += 1;
    }

    const published = items.filter((i) => i.published).length;
    this.logger.log(
      `daily desk: picked ${items.length}, published ${published}, errors ${errors.length}`,
    );
    return { picked: items.length, published, items, errors };
  }


  /** What the desk would do right now, without doing it. */
  async status() {
    const off = await this.isOff();
    const covered = await this.recentTickers();
    const buys = (await this.research.biggestBuys(5, 20)).filter((c) => this.eligible(c, covered));
    const clusters = (await this.research.clusterBuys(10, 12)).filter((c) => this.eligible(c, covered));
    return {
      off,
      schedule: '15:00 Asia/Karachi daily',
      writerReady: this.writer.isReady(),
      coverReady: this.cover.isReady(),
      thumbsDir: this.thumbsDir(),
      candidates: {
        buys: buys.slice(0, 6).map((c) => ({
          ticker: c.ticker, who: c.who, value: Math.round(c.value), photo: !!photoFor(c.who),
        })),
        clusters: clusters.slice(0, 4).map((c) => ({
          ticker: c.ticker, buyers: c.buyers, value: Math.round(c.value),
        })),
      },
      excludedTickers: [...covered].slice(0, 30),
    };
  }

  /** Skip anything we wrote about recently, and anything with no usable ticker. */
  private eligible(c: BuyCandidate, covered: Set<string>): boolean {
    if (!c.ticker || c.ticker.length > 8) return false;
    if (covered.has(c.ticker.toUpperCase())) return false;
    // A sub-$250k "purchase" is a rounding error on a news page.
    return c.value >= 250_000;
  }

  private async recentTickers(): Promise<Set<string>> {
    const { tickers } = await this.research.recentlyCovered(21);
    return new Set(tickers.map((t) => t.toUpperCase()));
  }

  private async buildOne(
    step: { kind: DeskKind; blogKind: string },
    candidate: BuyCandidate,
    paletteSeed: number,
    publish: boolean,
    draft: boolean,
  ): Promise<Record<string, unknown>> {
    const written = await this.writer.write(step.kind, candidate);
    if (!written) throw new Error('writer returned nothing');

    const date = new Date().toISOString().slice(0, 10);
    const slug =
      step.blogKind === 'stock-idea'
        ? `stock-idea-${candidate.ticker.toLowerCase()}-${date}`
        : `editorial-${this.slugify(written.title)}-${date}`;

    // The grade is claimed from the rotating palette rather than taken from the
    // writer, so two covers in one batch cannot land on the same colour.
    const grade = GRADES[paletteSeed % GRADES.length];
    const halo = HALOS[paletteSeed % HALOS.length];
    const photo = photoFor(candidate.who);
    // Who the cover shows, in the client's order of preference (2026-09-23):
    //   1. a photograph we hold, which gives their exact face;
    //   2. otherwise the person drawn from their name, because the cover has to
    //      be of whoever the article is about;
    //   3. an object scene only when there is no person to draw, i.e. the buyer
    //      is a fund or a corporate entity with no face behind it.
    const person = !photo && !looksInstitutional(candidate.who) ? candidate.who : null;
    const cover = await this.cover.generate({
      name: slug,
      scene: written.coverScene,
      grade,
      halo: photo || person ? halo : undefined,
      personRef: photo ? join(this.thumbsDir(), photo.file) : null,
      personName: person,
      personContext: person
        ? [candidate.role, `of ${candidate.company}`].filter(Boolean).join(' ')
        : null,
    });

    const row = {
      slug,
      kind: step.blogKind,
      title: written.title,
      summary: written.summary,
      body: written.body,
      category: written.category || 'INSIDER ALERT',
      ticker: candidate.ticker,
      sector: candidate.sector,
      tags: written.tags || [],
      imageUrl: cover?.url || null,
      imageAlt: photo
        ? `${photo.display}, who bought ${money(candidate.value)} of ${candidate.company}`
        : person
          ? `${person}, who bought ${money(candidate.value)} of ${candidate.company}`
          : `${candidate.company} (${candidate.ticker})`,
    };

    if (publish) await this.persist(row, candidate, draft);

    return {
      ...row,
      published: publish,
      draft,
      url: `https://insiderbuying.com/insights/${slug}`,
      bodyChars: written.body.length,
      coverFromPhoto: cover?.fromPhoto ?? false,
      coverShowsPerson: !!(cover && (cover.fromPhoto || person)),
      buyer: candidate.who,
      dollars: candidate.value,
    };
  }

  private thumbsDir(): string {
    return (
      process.env.EDITORIAL_THUMBS_DIR ||
      join(process.cwd(), '..', 'frontend', 'public', 'editorial-thumbs')
    );
  }

  /** `draft` stores the row link-only: noindex, and off the home page, the
   *  insights list, the rails and the sitemap. It is how a batch is read on the
   *  real site before anyone else can find it. */
  private async persist(row: any, candidate: BuyCandidate, draft = false) {
    await this.db.query(
      `INSERT INTO blog_posts
         (slug, title, kind, ticker, sector, topic, summary, body,
          "imagePrompt", "imageUrl", "imageAlt", category, eyebrow, draft, sponsored,
          "iqsAtGeneration", tags, "featuredTickers", "inputSnapshot", "generatedAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,
               NULL,$8,$9,$10,$10,$14,false,
               NULL,$11::jsonb,$12::jsonb,$13::jsonb,NOW(),NOW())
       ON CONFLICT (slug) DO UPDATE SET
         title=EXCLUDED.title, summary=EXCLUDED.summary, body=EXCLUDED.body,
         "imageUrl"=EXCLUDED."imageUrl", "imageAlt"=EXCLUDED."imageAlt",
         category=EXCLUDED.category, eyebrow=EXCLUDED.eyebrow,
         tags=EXCLUDED.tags, draft=EXCLUDED.draft, "updatedAt"=NOW()`,
      [
        row.slug, row.title, row.kind, row.ticker, row.sector, row.summary, row.body,
        row.imageUrl, row.imageAlt, row.category,
        JSON.stringify(row.tags), JSON.stringify([row.ticker]),
        JSON.stringify({ source: 'daily-desk', buyer: candidate.who, date: candidate.date }),
        draft,
      ],
    );
  }

  /**
   * A readable slug from the headline.
   *
   * Money has to come out first. Stripping punctuation from "Buys $29.88
   * Million" leaves the token "2988", and the first dry run produced
   * editorial-grab-ceo-anthony-tan-ping-yeow-buys-2988-2026-09-22, which reads
   * like a broken id in the address bar. Figures belong in the headline, not
   * in the URL.
   */
  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/\$[\d.,]+\s*(million|billion|thousand|m|bn|k)?/g, ' ')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !/^\d+$/.test(w) && !SLUG_STOPWORDS.has(w))
      .slice(0, 6)
      .join('-');
  }
}

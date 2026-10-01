import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BuyCandidate, ResearchService } from './research.service';
import { DeskKind, WriterService, money } from './writer.service';
import { CoverService } from './cover.service';
import { looksInstitutional, photoFor } from './person-photos';
import { SubjectLookupService, SubjectMaterial } from './subject-lookup.service';
import { existsSync } from 'node:fs';
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
 * Nothing here invents a fact, and since 2026-09-30 that includes the face on
 * the cover. Research supplies reconciled figures and the writer is told those
 * are the only numbers it may use; the cover is built from a real photograph of
 * the subject — one of ours, or one SubjectLookupService finds — or, when there
 * is none, from a censored subject whose eyes are covered. A likeness is never
 * invented for a named person.
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
export const GRADES = [
  'deep teal with gold highlights',
  'burnt orange with charcoal shadows',
  'magenta and deep purple',
  'amber gold with dark slate',
  'cold steel blue with cyan',
  'oxblood red with warm grey',
  'forest green with brass',
];

export const HALOS = ['yellow', 'white', 'hot pink', 'lime green', 'cyan'];

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
    private readonly subjects: SubjectLookupService,
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
    const [coveredLong, coveredShort] = await Promise.all([
      this.recentTickers(21),
      this.recentTickers(7),
    ]);

    // Deeper pools than the four articles need, because the pool is now ranked
    // by whether we can photograph the buyer and a shallow pool has nobody to
    // promote: on 2026-10-01 the top four by dollars were an unlisted biotech
    // director, two funds and a private bank, and all four covers were redacted.
    const buys = (await this.research.biggestBuys(5, 40))
      .map((c) => this.primaryTicker(c))
      .filter((c) => this.eligible(c));
    const clusters = (await this.research.clusterBuys(10, 24))
      .map((c) => this.primaryTicker(c))
      .filter((c) => this.eligible(c));

    // A story whose subject we can photograph leads — and since 2026-10-01 that
    // is the client's standing instruction rather than a tie-break: "har roz
    // priority yehi honi chaiye … top stories mein hamesha popular people ka
    // ho". Both pools are ranked, because the cluster slot publishes under the
    // same cover rules as the rest. Ranking happens BEFORE the recency filter
    // because how long a stock has to rest now depends on who is buying it.
    const [buyRank, clusterRank] = await Promise.all([
      this.rankByPortrait(buys),
      this.rankByPortrait(clusters),
    ]);
    const fresh = (pool: BuyCandidate[], rank: Map<string, number>) =>
      pool.filter((c) => this.notRecentlyCovered(c, rank, coveredLong, coveredShort));
    const buysFresh = fresh(buys, buyRank);
    const clustersFresh = fresh(clusters, clusterRank);

    const usedTickers = new Set<string>();
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    const plan = PLAN.slice(0, opts.limit && opts.limit > 0 ? opts.limit : PLAN.length);

    let slot = 0;
    for (const step of plan) {
      const pool = step.source === 'cluster' ? clustersFresh : buysFresh;
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


  /**
   * Re-render the covers of articles that are already published.
   *
   * The client's instruction of 2026-09-30 was not only "do it this way from
   * now on" — it was "humne editorial thumbs ko edit karna hai", the ones
   * already on the site. Those articles are indexed, shared and linked, so the
   * words and the URL do not move; only the picture does.
   *
   * TWO THINGS THIS HAS TO GET RIGHT.
   *
   * The filename MUST change. nginx serves /editorial-thumbs off disk with
   * `expires 30d`, so a file replaced in place keeps serving the old bytes to
   * everyone who has seen the page — the client and George both watched stale
   * covers for hours before that was understood. A re-done cover is therefore a
   * NEW file (`<slug>-v2`, `-v3`…) and the row is pointed at it.
   *
   * The buyer comes from `inputSnapshot`, not from the headline. The desk
   * stored the filer's name exactly as the filing spells it, which is the
   * string SubjectLookupService knows how to resolve; parsing "GoldenTree Asset
   * Management Buys $1.15 Million of QVC Group Stock" back into a buyer would
   * be guessing at the one input that decides whose face appears.
   */
  async redoCovers(opts: {
    slugs?: string[];
    /** Re-do every desk cover that has no real face in it. */
    censoredOnly?: boolean;
    limit?: number;
    /** Resolve and report, render nothing, write nothing. */
    dryRun?: boolean;
  }): Promise<{ done: number; items: Array<Record<string, unknown>>; errors: string[] }> {
    const errors: string[] = [];
    const items: Array<Record<string, unknown>> = [];
    const limit = Math.min(20, Math.max(1, opts.limit ?? 10));

    const rows: any[] = opts.slugs?.length
      ? await this.db.query(
          `SELECT slug, title, summary, ticker, sector, "imageUrl", "inputSnapshot"
             FROM blog_posts WHERE slug = ANY($1::text[])`,
          [opts.slugs],
        )
      : await this.db.query(
          `SELECT slug, title, summary, ticker, sector, "imageUrl", "inputSnapshot"
             FROM blog_posts
            WHERE "inputSnapshot"->>'source' = 'daily-desk'
            ORDER BY "generatedAt" DESC
            LIMIT $1`,
          [limit],
        );

    for (const r of rows.slice(0, limit)) {
      try {
        const buyer = String(r.inputSnapshot?.buyer || '').trim();
        if (!buyer) {
          errors.push(`${r.slug}: no buyer in inputSnapshot`);
          continue;
        }

        const held = photoFor(buyer);
        const found = held
          ? null
          : await this.subjects.lookup(buyer, { institutional: looksInstitutional(buyer) });
        const personRef = held ? join(this.thumbsDir(), held.file) : found?.person?.path || null;
        const shownPerson = held?.display || found?.person?.display || null;

        // `censoredOnly` used to mean "fix the covers with nobody real in them"
        // and skipped a buyer the lookup still could not place, because
        // re-rendering one censored cover into another spent a generation to
        // move a file. Since 2026-10-01 that is no longer true: a desk cover
        // with no photograph is re-rendered WITHOUT the bar, which is a
        // different picture and the whole point of the re-do. Nothing is
        // skipped here any more.

        if (opts.dryRun) {
          items.push({
            slug: r.slug,
            buyer,
            wouldShow: shownPerson,
            role: found?.person?.role ?? null,
            logo: found?.logo?.firm ?? null,
          });
          continue;
        }

        const scene = await this.writer.coverSceneFor({
          title: r.title,
          summary: r.summary,
          company: r.ticker,
          sector: r.sector,
        });
        const seed = Math.abs([...r.slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
        const name = this.nextCoverName(r.slug, r.imageUrl);

        const cover = await this.cover.generate({
          name,
          scene,
          grade: GRADES[seed % GRADES.length],
          halo: HALOS[seed % HALOS.length],
          personRef,
          personName: null,
          personContext: null,
          logoRef: found?.logo?.path || null,
        });
        if (!cover) {
          errors.push(`${r.slug}: cover generation failed`);
          continue;
        }

        const imageAlt = !cover.fromPhoto
          ? `${r.ticker || r.title}`.slice(0, 300)
          : found?.person?.role
            ? `${shownPerson}, ${found.person.role}`.slice(0, 300)
            : `${shownPerson}`.slice(0, 300);

        await this.db.query(
          `UPDATE blog_posts
              SET "imageUrl"=$2, "imageAlt"=$3, "imageCredit"=$4, "updatedAt"=NOW()
            WHERE slug=$1`,
          [r.slug, cover.url, imageAlt, this.creditLine(found, cover)],
        );

        items.push({
          slug: r.slug,
          buyer,
          cover: cover.url,
          subject: cover.fromPhoto ? shownPerson : null,
          role: found?.person?.role ?? null,
          logo: cover.logoPrinted ? found?.logo?.firm ?? true : false,
          censored: cover.censored,
        });
      } catch (e: any) {
        errors.push(`${r.slug}: ${e?.message || e}`);
      }
    }

    this.logger.log(`redoCovers: ${items.length} handled, ${errors.length} errors`);
    return { done: items.filter((i) => i.cover).length, items, errors };
  }

  /** The next free cover filename for a slug. Never the one already live —
   *  see the 30-day cache note on redoCovers. */
  private nextCoverName(slug: string, currentUrl: string | null): string {
    const current = (currentUrl || '').split('/').pop()?.replace(/\.jpg$/i, '') || '';
    for (let v = 2; v < 20; v += 1) {
      const name = `${slug}-v${v}`;
      if (name === current) continue;
      if (!existsSync(join(this.thumbsDir(), `${name}.jpg`))) return name;
    }
    return `${slug}-v${Date.now().toString(36)}`;
  }

  /** What the desk would do right now, without doing it. */
  async status() {
    const off = await this.isOff();
    const [coveredLong, coveredShort] = await Promise.all([
      this.recentTickers(21),
      this.recentTickers(7),
    ]);
    const buys = (await this.research.biggestBuys(5, 40))
      .map((c) => this.primaryTicker(c))
      .filter((c) => this.eligible(c));
    const clusters = (await this.research.clusterBuys(10, 24))
      .map((c) => this.primaryTicker(c))
      .filter((c) => this.eligible(c));
    // `status` resolves the same way a real run would, so what it reports is
    // the order the desk would actually publish in — including the portrait
    // rank, which is the whole point of reading it.
    const buyRank = await this.rankByPortrait(buys);
    const clusterRank = await this.rankByPortrait(clusters);
    const buysFresh = buys.filter((c) =>
      this.notRecentlyCovered(c, buyRank, coveredLong, coveredShort),
    );
    const clustersFresh = clusters.filter((c) =>
      this.notRecentlyCovered(c, clusterRank, coveredLong, coveredShort),
    );
    return {
      off,
      schedule: '15:00 Asia/Karachi daily',
      writerReady: this.writer.isReady(),
      coverReady: this.cover.isReady(),
      thumbsDir: this.thumbsDir(),
      candidates: {
        buys: buysFresh.slice(0, 8).map((c) => ({
          ticker: c.ticker,
          who: c.who,
          value: Math.round(c.value),
          // 2 = our own photograph, 1 = a creditable one we can fetch, 0 = the
          // stripe. Reading this is how you tell a thin day from a broken one.
          portrait: buyRank.get(c.who) ?? 0,
        })),
        clusters: clustersFresh.slice(0, 4).map((c) => ({
          ticker: c.ticker, buyers: c.buyers, value: Math.round(c.value),
          portrait: clusterRank.get(c.who) ?? 0,
        })),
      },
      excludedTickers: [...coveredLong].slice(0, 30),
    };
  }

  /**
   * Worth writing about at all: a real ticker and real money. Coverage recency
   * is NOT decided here — see `notRecentlyCovered`, which needs the portrait
   * rank and therefore has to run after it.
   */
  private eligible(c: BuyCandidate): boolean {
    if (!c.ticker || c.ticker.length > 8) return false;
    // A sub-$250k "purchase" is a rounding error on a news page.
    return c.value >= 250_000;
  }

  /**
   * Collapse a multi-class ticker to the class we write about.
   *
   * `companies.ticker` carries every listed class of a dual-class issuer in one
   * string — Lennar is "LEN,LEN.B" — and the 8-character sanity check in
   * `eligible` then threw the row away. On 2026-10-01 that silently discarded
   * BERKSHIRE HATHAWAY INC buying $146.6m of it: the largest buy of the week,
   * by the one filer whose photograph the site already holds, dropped before
   * anything had a chance to rank it. The first class listed is the primary
   * one, and it is the one the site's own company pages are keyed on.
   */
  private primaryTicker(c: BuyCandidate): BuyCandidate {
    if (!c.ticker?.includes(',')) return c;
    return { ...c, ticker: c.ticker.split(',')[0].trim() };
  }

  /**
   * The same stock is not covered twice in three weeks — unless the buyer is
   * somebody readers know.
   *
   * The flat 21-day bar cost 2026-10-01 its second real face: Ryan Cohen bought
   * $10.6m of GME on 09-29 and the desk refused the story because GME had been
   * written up on 09-11, twenty days earlier, one day inside the window. A new
   * Form 4 from a named buyer we can photograph is a different story about the
   * same stock, not a repeat, and the client's instruction is that those are
   * the ones to lead with. So a buyer with a real portrait only has to clear a
   * week; everyone else still clears three.
   */
  private notRecentlyCovered(
    c: BuyCandidate,
    rank: Map<string, number>,
    coveredLong: Set<string>,
    coveredShort: Set<string>,
  ): boolean {
    const t = (c.ticker || '').toUpperCase();
    return (rank.get(c.who) ?? 0) > 0 ? !coveredShort.has(t) : !coveredLong.has(t);
  }

  /**
   * Sort a candidate pool so the buyers we can put a REAL face to come first.
   *
   * WHY THIS COSTS A NETWORK CALL AND IS WORTH IT. The old sort consulted only
   * the curated registry in person-photos.ts, on the reasoning that the
   * Wikidata lookup is a call per candidate and most of the pool is discarded.
   * That reasoning produced 2026-10-01: three of the day's four covers were
   * redacted strangers, because the registry holds a few dozen names and the
   * biggest buyer on any given day is usually not one of them. The lookup is
   * what knows that GoldenTree is Steven Tananbaum.
   *
   * It is affordable because SubjectLookupService caches BOTH ways on disk, and
   * a miss is believed for 30 days. The desk asks about the same handful of
   * funds every morning, so after the first run this is a directory read. The
   * cap is what bounds the first run: PROBE_DEPTH candidates, not the pool.
   *
   * Sorted, never filtered. A day on which nobody is photographable still gets
   * four articles — with the stripe, which is exactly what the fallback is for.
   */
  private async rankByPortrait(pool: BuyCandidate[]): Promise<Map<string, number>> {
    /** How deep to probe. The plan takes four candidates; this is deep enough
     *  that the eligible ones below them get a look without turning a batch
     *  into forty lookups. */
    const PROBE_DEPTH = 24;
    /** Wikimedia is not to be hammered; the cache makes this moot after day
     *  one, and on day one four at a time is polite and still quick. */
    const CONCURRENCY = 4;

    const probed = pool.slice(0, PROBE_DEPTH);
    const rank = new Map<string, number>();

    let next = 0;
    const worker = async () => {
      for (let i = next++; i < probed.length; i = next++) {
        const c = probed[i];
        if (rank.has(c.who)) continue;
        // 2 = our own photograph of them; 1 = a real one we can fetch and
        // credit; 0 = a redacted stranger. Ranked rather than boolean so a
        // client-supplied face still outranks a Wikidata one.
        if (photoFor(c.who)) {
          rank.set(c.who, 2);
          continue;
        }
        const found = await this.subjects.lookup(c.who, {
          institutional: looksInstitutional(c.who),
        });
        rank.set(c.who, found.person ? 1 : 0);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    pool.sort((a, b) => (rank.get(b.who) ?? 0) - (rank.get(a.who) ?? 0) || b.value - a.value);

    const withFace = [...rank.values()].filter((v) => v > 0).length;
    this.logger.log(
      `portrait ranking: ${withFace}/${probed.length} probed candidates have a real face`,
    );
    return rank;
  }

  private async recentTickers(days: number): Promise<Set<string>> {
    const { tickers } = await this.research.recentlyCovered(days);
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
    // Who the cover shows, in the client's order of preference.
    //
    // Revised 2026-09-30. The client, on the GoldenTree/QVC cover: "these
    // images thumbnails created are too fake. We need to keep real photos of
    // insiders on here, for these ones that include the hedge fund name, we
    // need to find their logo and work it into a photo of the real insider, and
    // if you can't find their face just cover the eyes with a black line …
    // anonymous insiders, but make it real."
    //
    //   1. a photograph we already hold (person-photos.ts) — their exact face,
    //      client-supplied, no attribution owed;
    //   2. a real, freely licensed photograph found for them, or for the person
    //      the buying firm belongs to — SubjectLookupService resolves
    //      "GoldenTree Asset Management LP" to Steven Tananbaum, who founded it,
    //      because a fund is not faceless;
    //   3. otherwise an UNNAMED SUBJECT: a real-looking press photograph of an
    //      executive who is nobody in particular, un-redacted.
    //
    // STEP 3 IS NOW A FAILURE MODE, NOT A DESIGN. Client, 2026-10-01, looking at
    // three covers that all reached it — the ADARx director, Baker Bros.
    // Advisors and Brown Brothers Harriman: *"market mein dekho hot topics, top
    // stories jin ke image find ho wo publish kardo inke jagha … har roz
    // priority yehi honi chaiye … top stories mein hamesha popular people ka
    // ho."* The answer to a cover we cannot photograph is to run a different
    // story, so the fix is in `rankByPortrait` above, not here. The bar stays as
    // the fallback for the day the pool has nobody — "in case koi nai milta
    // phir laga dena" — and it is a slim stripe now, not the slab that shipped.
    //
    // The desk still does NOT name an unphotographed subject to the model. A
    // name buys a real likeness only for someone widely photographed, and the
    // filers that reach step 3 are by definition the ones Wikidata has never
    // heard of; "George Simeon" matches an anthropologist and an English
    // politician there, neither of whom filed this Form 4. An invented face
    // under a real person's name is the thing the client called too fake.
    const held = photoFor(candidate.who);
    const found = held
      ? null
      : await this.subjects.lookup(candidate.who, {
          institutional: looksInstitutional(candidate.who),
        });

    const personRef = held ? join(this.thumbsDir(), held.file) : found?.person?.path || null;
    const shownPerson = held?.display || found?.person?.display || null;
    const logoRef = found?.logo?.path || null;

    const cover = await this.cover.generate({
      name: slug,
      scene: written.coverScene,
      grade,
      // Every cover has a cut-out subject, censored or not, so every cover gets
      // the tabloid halo that outlines it.
      halo,
      personRef,
      personName: null,
      personContext: null,
      logoRef,
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
      // Alt text has to describe the picture that actually shipped, which is
      // why it is built from `cover`, not from what we hoped to find. A
      // censored cover naming the buyer would be a caption for a face that is
      // not in the frame; a cover of the firm's founder has to say that he is
      // the firm's founder, not that he did the buying.
      imageAlt: !cover?.fromPhoto
        ? `${candidate.company} (${candidate.ticker})`
        : found?.person?.role
          ? `${shownPerson}, ${found.person.role}, which bought ` +
            `${money(candidate.value)} of ${candidate.company}`
          : `${shownPerson}, who bought ${money(candidate.value)} of ${candidate.company}`,
      // Most Commons photographs are CC BY: usable, and only usable WITH the
      // credit. Generating from one makes a derivative, so the obligation
      // travels with the cover — which is why this is a stored column and not a
      // note in a log nobody reads.
      imageCredit: this.creditLine(found, cover),
    };

    if (publish) await this.persist(row, candidate, draft);

    return {
      ...row,
      published: publish,
      draft,
      url: `https://insiderbuying.com/insights/${slug}`,
      bodyChars: written.body.length,
      coverFromPhoto: cover?.fromPhoto ?? false,
      coverShowsPerson: cover?.fromPhoto ?? false,
      coverCensored: cover?.censored ?? false,
      coverLogo: cover?.logoPrinted ? found?.logo?.firm || true : false,
      coverSubject: cover?.fromPhoto ? shownPerson : null,
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

  /**
   * The line printed under the cover when a fetched picture is in it.
   *
   * Only the material that actually reached the image is credited: a logo we
   * downloaded but could not print earns no line, and a photograph the model
   * never saw earns none either. Nothing is credited for the covers built from
   * our own thumbs, which are client-supplied, or for a censored subject, which
   * is drawn from nothing.
   *
   * Returns null rather than an empty string so the column stays genuinely
   * null and the frontend's `&&` renders no empty element.
   */
  private creditLine(
    found: SubjectMaterial | null,
    cover: { fromPhoto: boolean; logoPrinted: boolean } | null,
  ): string | null {
    if (!found || !cover) return null;
    const parts: string[] = [];
    const cite = (r: { credit: string | null; license: string | null }, what: string) =>
      [what, r.credit, r.license].filter(Boolean).join(' · ');

    if (cover.fromPhoto && found.person?.source === 'wikidata') {
      parts.push(cite(found.person, `Photograph of ${found.person.display}`));
    }
    if (cover.logoPrinted && found.logo) {
      parts.push(cite(found.logo, `${found.logo.firm} logo`));
    }
    if (!parts.length) return null;
    return `${parts.join(' — ')}. Cover illustration by InsiderBuying.com.`.slice(0, 300);
  }

  /** `draft` stores the row link-only: noindex, and off the home page, the
   *  insights list, the rails and the sitemap. It is how a batch is read on the
   *  real site before anyone else can find it. */
  private async persist(row: any, candidate: BuyCandidate, draft = false) {
    await this.db.query(
      `INSERT INTO blog_posts
         (slug, title, kind, ticker, sector, topic, summary, body,
          "imagePrompt", "imageUrl", "imageAlt", "imageCredit", category, eyebrow, draft, sponsored,
          "iqsAtGeneration", tags, "featuredTickers", "inputSnapshot", "generatedAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,
               NULL,$8,$9,$15,$10,$10,$14,false,
               NULL,$11::jsonb,$12::jsonb,$13::jsonb,NOW(),NOW())
       ON CONFLICT (slug) DO UPDATE SET
         title=EXCLUDED.title, summary=EXCLUDED.summary, body=EXCLUDED.body,
         "imageUrl"=EXCLUDED."imageUrl", "imageAlt"=EXCLUDED."imageAlt",
         "imageCredit"=EXCLUDED."imageCredit",
         category=EXCLUDED.category, eyebrow=EXCLUDED.eyebrow,
         tags=EXCLUDED.tags, draft=EXCLUDED.draft, "updatedAt"=NOW()`,
      [
        row.slug, row.title, row.kind, row.ticker, row.sector, row.summary, row.body,
        row.imageUrl, row.imageAlt, row.category,
        JSON.stringify(row.tags), JSON.stringify([row.ticker]),
        JSON.stringify({ source: 'daily-desk', buyer: candidate.who, date: candidate.date }),
        draft, row.imageCredit ?? null,
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

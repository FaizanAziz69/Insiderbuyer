import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { StoryPitch } from '../entities/story-pitch.entity';
import { AppSetting } from '../entities/app-setting.entity';
import { IqsService } from '../iqs/iqs.service';
import { NewsService } from '../news/news.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { ContentGeneratorService } from './content-generator.service';

/**
 * Editorial Playbook v2 §2 — AI-assisted story discovery.
 *
 * Three layers, exactly as the manual describes them:
 *   Layer 1  three data feeds, cross-referenced into a priority list;
 *   Layer 2  a model call per candidate producing a structured pitch;
 *   Layer 3  a human decision — which is the Editorial Desk page, not code.
 *
 * WHY THIS IS NOT n8n. The manual says "built by the developer in n8n or
 * Make.com". Two of the three feeds are already inside this backend (our own
 * Form 4 ingest and the movers table), the Insider Score band comes from the
 * scoring engine, and the pitches have to be stored somewhere the site can
 * read. Routing all of that out to a third-party workflow tool and back would
 * add a vendor, a second set of credentials and a second failure mode for no
 * capability we do not already have. The cadence, the cross-reference rule and
 * the prompt are the manual's; only the host differs.
 *
 * Runs at 07:00 and 13:00 America/New_York on weekdays, per the manual. The
 * switch is a database row, not an env var, so a run can be stopped in seconds
 * without SSH — the same lesson the alert switch encodes.
 */

/** §2 Layer 1 — a Form 4 purchase qualifies for the feed above this value. */
const MIN_FILING_USD = 100_000;
/** §2 Layer 1 — a mover qualifies above this absolute day move. */
const MIN_MOVE_PCT = 5;
/** Filed-in-the-last-24-hours window. */
const LOOKBACK_HOURS = 24;
/** Cost ceiling per run. Priority 1 first, then 2, then the sector row. */
const MAX_PITCHES = { p1: 6, p2: 4, p3: 1 };
/** app_settings key holding the run switch. */
const RUNS_KEY = 'story_desk_runs';

interface Form4Signal {
  ticker: string;
  companyName: string;
  totalValue: number;
  buyers: Array<{ name: string; role: string; value: number; date: string }>;
  iqs: number | null;
}

interface MoverSignal {
  ticker: string;
  name: string;
  changePct: number;
  direction: 'gainer' | 'loser';
}

interface Candidate {
  priority: number;
  ticker: string | null;
  companyName: string;
  signals: string[];
  facts: Record<string, unknown>;
  scoreBand: string | null;
}

@Injectable()
export class StoryDeskService implements OnModuleInit {
  private readonly log = new Logger(StoryDeskService.name);
  /** Runs are ON unless the switch row says otherwise — the sweep is
   *  read-only and cheap, and a silent stop is worse than a wasted run. */
  private runsEnabled = true;

  constructor(
    @InjectRepository(StoryPitch) private readonly pitches: Repository<StoryPitch>,
    @InjectRepository(InsiderTransaction)
    private readonly txRepo: Repository<InsiderTransaction>,
    @InjectRepository(AppSetting) private readonly settings: Repository<AppSetting>,
    private readonly iqs: IqsService,
    private readonly news: NewsService,
    private readonly market: MarketStatsService,
    private readonly generator: ContentGeneratorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadSwitch();
  }

  private async loadSwitch(): Promise<void> {
    try {
      const row = await this.settings.findOne({ where: { key: RUNS_KEY } });
      if (row) this.runsEnabled = row.value === '1';
    } catch (e: any) {
      this.log.warn(`Story Desk switch read failed: ${e?.message || e}`);
    }
  }

  async setRuns(on: boolean): Promise<{ runsEnabled: boolean }> {
    await this.settings.save(this.settings.create({ key: RUNS_KEY, value: on ? '1' : '0' }));
    this.runsEnabled = on;
    this.log.log(`Story Desk discovery runs turned ${on ? 'ON' : 'OFF'}.`);
    return { runsEnabled: on };
  }

  /** 07:00 ET — the manual's morning run, feeding the 07:30 briefing. */
  @Cron('0 7 * * 1-5', { timeZone: 'America/New_York' })
  async morningRun() {
    await this.scheduled('07:00 ET');
  }

  /** 13:00 ET — the manual's midday run. */
  @Cron('0 13 * * 1-5', { timeZone: 'America/New_York' })
  async middayRun() {
    await this.scheduled('13:00 ET');
  }

  private async scheduled(label: string) {
    await this.loadSwitch();
    if (!this.runsEnabled) {
      this.log.log(`Story Desk ${label} run skipped — switch is off.`);
      return;
    }
    await this.run().catch((e) => this.log.error(`Story Desk ${label}: ${e?.message || e}`));
  }

  // ── Layer 1 — the three feeds ───────────────────────────────────────────

  /** Feed 1: our own Form 4 ingest — open-market purchases filed in the last
   *  24 hours above $100K, grouped per company and sorted by dollar amount.
   *  The manual points at the EDGAR browse page; we read the same filings out
   *  of our own ingest, which is where they land minutes after EDGAR has them
   *  and which already carries the role and the company name. */
  private async form4Feed(): Promise<Form4Signal[]> {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000);
    const rows = await this.txRepo.find({
      where: { transactionCode: 'P', createdAt: MoreThanOrEqual(since) },
      relations: ['company'],
      order: { createdAt: 'DESC' },
      take: 500,
    });

    const byCompany = new Map<string, Form4Signal>();
    for (const t of rows) {
      const ticker = t.company?.ticker?.toUpperCase();
      if (!ticker) continue;
      const value = Number(t.totalValue) || 0;
      if (!Number.isFinite(value) || value <= 0) continue;
      const cur =
        byCompany.get(ticker) ||
        ({
          ticker,
          companyName: t.company?.name || ticker,
          totalValue: 0,
          buyers: [],
          iqs: null,
        } as Form4Signal);
      cur.totalValue += value;
      const date = new Date(t.transactionDate).toISOString().slice(0, 10);
      const existing = cur.buyers.find((b) => b.name === t.insiderName);
      if (existing) existing.value += value;
      else cur.buyers.push({ name: t.insiderName, role: t.role, value, date });
      byCompany.set(ticker, cur);
    }

    return Array.from(byCompany.values())
      .filter((c) => c.totalValue >= MIN_FILING_USD)
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 25);
  }

  /** Feed 2: top gainers and losers, 5%+ absolute move. */
  private async moversFeed(): Promise<MoverSignal[]> {
    const [gainers, losers] = await Promise.all([
      this.market.getTopGainers(20).catch(() => []),
      this.market.getTopLosers(20).catch(() => []),
    ]);
    const map = (
      rows: Array<{ symbol: string; name?: string; changePct: number }>,
      direction: 'gainer' | 'loser',
    ): MoverSignal[] =>
      rows
        .filter((r) => Math.abs(Number(r.changePct) || 0) >= MIN_MOVE_PCT)
        .map((r) => ({
          ticker: r.symbol.toUpperCase(),
          name: r.name || r.symbol,
          changePct: Number(r.changePct),
          direction,
        }));
    return [...map(gainers as any, 'gainer'), ...map(losers as any, 'loser')];
  }

  /** Feed 3: what financial media is covering right now. The manual names
   *  NewsAPI/Bing; this site already fetches the same wire feeds (Reuters, CNBC,
   *  SEC and the rest) through NewsService, so it reads those rather than adding
   *  a paid dependency for the same headlines. */
  private async newsFeed(): Promise<Array<{ title: string; source: string }>> {
    const items = await this.news.getLatest().catch(() => []);
    const cutoff = Date.now() - LOOKBACK_HOURS * 3600_000;
    return items
      .filter((i) => {
        const t = Date.parse(i.pubDate);
        return !Number.isFinite(t) || t >= cutoff;
      })
      .map((i) => ({ title: i.title, source: i.source }));
  }

  /** Does this company appear in the news feed? Match on ticker as a cashtag
   *  or standalone word, and on the distinctive part of the company name —
   *  "Moderna" out of "Moderna, Inc." — so "Inc" alone never matches. */
  private newsHits(
    ticker: string,
    companyName: string,
    news: Array<{ title: string; source: string }>,
  ): Array<{ title: string; source: string }> {
    const stem = companyName
      .replace(/\b(inc|corp|corporation|company|co|ltd|plc|holdings|group|the|&)\b\.?/gi, ' ')
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .trim()
      .split(/\s+/)[0];
    const tickerRe = new RegExp(`(^|[^A-Za-z])\\$?${ticker}([^A-Za-z]|$)`);
    const stemRe = stem && stem.length >= 4 ? new RegExp(`\\b${stem}`, 'i') : null;
    return news.filter((n) => tickerRe.test(n.title) || (stemRe && stemRe.test(n.title)));
  }

  // ── Layer 1 — the cross-reference ───────────────────────────────────────

  /**
   * The manual's rule, verbatim: "any ticker appearing in BOTH the EDGAR feed
   * AND either the movers list or news feed is flagged as a Priority 1 story
   * candidate. Any ticker appearing in only one feed is flagged as Priority 2."
   *
   * Plus the Priority 3 row its own sample briefing shows — no single-ticker
   * signal, but sector-level conviction worth a story.
   */
  private async buildCandidates(): Promise<Candidate[]> {
    const [form4, movers, news] = await Promise.all([
      this.form4Feed(),
      this.moversFeed(),
      this.newsFeed(),
    ]);
    const moverBy = new Map(movers.map((m) => [m.ticker, m]));
    const out: Candidate[] = [];

    for (const f of form4) {
      const mover = moverBy.get(f.ticker) || null;
      const hits = this.newsHits(f.ticker, f.companyName, news);
      const signals: string[] = [];

      const top = [...f.buyers].sort((a, b) => b.value - a.value)[0];
      signals.push(
        `${top.role} ${top.name} filed a ${usd(top.value)} open-market purchase dated ${top.date}` +
          (f.buyers.length > 1
            ? ` — one of ${f.buyers.length} insiders buying, ${usd(f.totalValue)} in total`
            : ''),
      );
      if (mover) {
        signals.push(
          `Stock ${mover.changePct >= 0 ? 'up' : 'down'} ${Math.abs(mover.changePct).toFixed(1)}% on the day`,
        );
      }
      if (hits.length) {
        signals.push(
          `Appearing in financial media right now: ${hits
            .slice(0, 3)
            .map((h) => `"${h.title}" (${h.source})`)
            .join('; ')}`,
        );
      }

      const iqs = await this.safeScore(f.ticker);
      out.push({
        priority: mover || hits.length ? 1 : 2,
        ticker: f.ticker,
        companyName: f.companyName,
        signals,
        facts: {
          buyers: f.buyers,
          totalValue: f.totalValue,
          mover: mover ?? null,
          newsHeadlines: hits.slice(0, 5),
        },
        scoreBand: iqs == null ? null : this.generator.scoreBand(iqs),
      });
    }

    // A big mover that is also in the news, with no insider filing, is still a
    // single-feed candidate under the rule — and the ABSENCE of Form 4 buying
    // is exactly the Moderna-shaped story the manual holds up as the model.
    const filed = new Set(form4.map((f) => f.ticker));
    for (const m of movers) {
      if (filed.has(m.ticker)) continue;
      const hits = this.newsHits(m.ticker, m.name, news);
      if (!hits.length) continue;
      const iqs = await this.safeScore(m.ticker);
      out.push({
        priority: 2,
        ticker: m.ticker,
        companyName: m.name,
        signals: [
          `Stock ${m.changePct >= 0 ? 'up' : 'down'} ${Math.abs(m.changePct).toFixed(1)}% on the day`,
          `Appearing in financial media right now: ${hits
            .slice(0, 3)
            .map((h) => `"${h.title}" (${h.source})`)
            .join('; ')}`,
          `NO open-market purchases filed in the last ${LOOKBACK_HOURS} hours — the absence may itself be the story`,
        ],
        facts: { mover: m, newsHeadlines: hits.slice(0, 5), form4Last24h: 'none' },
        scoreBand: iqs == null ? null : this.generator.scoreBand(iqs),
      });
    }

    // Priority 3 — the sector row.
    const conviction = await this.iqs.getSectorConviction(30).catch(() => null);
    const lead = conviction?.sectors
      ?.filter((s) => s.clusterBuys > 0 && s.yoyChangePct != null)
      .sort((a, b) => (b.yoyChangePct ?? 0) - (a.yoyChangePct ?? 0))[0];
    if (lead) {
      out.push({
        priority: 3,
        ticker: null,
        companyName: `${lead.sector} sector`,
        signals: [
          `No single insider signal — but ${lead.sector} shows ${lead.clusterBuys} cluster-buy companies in the last 30 days`,
          `Aggregate open-market buy value in ${lead.sector} is ${lead.yoyChangePct! >= 0 ? 'up' : 'down'} ${Math.abs(lead.yoyChangePct!).toFixed(0)}% year-over-year`,
        ],
        facts: { sector: lead },
        scoreBand: null,
      });
    }

    return out.sort((a, b) => a.priority - b.priority);
  }

  private async safeScore(ticker: string): Promise<number | null> {
    try {
      return await this.iqs.getLatestInsiderScore(ticker);
    } catch {
      return null;
    }
  }

  // ── Layer 2 — the pitches ───────────────────────────────────────────────

  /** Run discovery now and store the briefing. Idempotent per call: each run
   *  writes its own `runAt` group rather than replacing the last one. */
  async run(): Promise<{ runAt: string; pitches: number; skipped: number }> {
    if (!this.generator.isReady()) {
      this.log.warn('Story Desk run skipped — ANTHROPIC_API_KEY not set.');
      return { runAt: new Date().toISOString(), pitches: 0, skipped: 0 };
    }
    const runAt = new Date();
    const candidates = await this.buildCandidates();

    const caps: Record<number, number> = { 1: MAX_PITCHES.p1, 2: MAX_PITCHES.p2, 3: MAX_PITCHES.p3 };
    const taken: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    const selected = candidates.filter((c) => {
      const cap = caps[c.priority] ?? 0;
      if (taken[c.priority] >= cap) return false;
      taken[c.priority] += 1;
      return true;
    });
    const skipped = candidates.length - selected.length;
    if (skipped > 0) {
      // Never let a cap read as "that was everything".
      this.log.log(
        `Story Desk: ${candidates.length} candidates, pitching ${selected.length} (per-priority caps dropped ${skipped}).`,
      );
    }

    let written = 0;
    for (const c of selected) {
      const pitch = await this.generator.generateStoryPitch({
        companyName: c.companyName,
        ticker: c.ticker,
        signals: c.signals,
        scoreBand: c.scoreBand,
      });
      if (!pitch) continue;
      await this.pitches.save(
        this.pitches.create({
          runAt,
          priority: c.priority,
          ticker: c.ticker,
          companyName: c.companyName,
          signals: c.signals,
          headline: pitch.headline,
          lede: pitch.lede,
          insiderAngle: pitch.insiderAngle,
          watchFor: pitch.watchFor,
          suggestedViz: pitch.suggestedViz,
          category: pitch.category,
          facts: c.facts,
          status: 'open',
          publishedSlug: null,
        }),
      );
      written += 1;
    }

    this.log.log(`Story Desk briefing ${runAt.toISOString()}: ${written} pitch(es).`);
    return { runAt: runAt.toISOString(), pitches: written, skipped };
  }

  // ── Layer 3 — what the human reads and decides ──────────────────────────

  /** The latest briefing, or the briefings from the last `days` days. */
  async briefing(days = 3) {
    const since = new Date(Date.now() - days * 86400_000);
    const rows = await this.pitches.find({
      where: { runAt: MoreThanOrEqual(since) },
      order: { runAt: 'DESC', priority: 'ASC' },
      take: 100,
    });
    // Group by run so the UI renders one briefing per sweep.
    const runs = new Map<string, StoryPitch[]>();
    for (const r of rows) {
      const key = r.runAt.toISOString();
      const list = runs.get(key) || [];
      list.push(r);
      runs.set(key, list);
    }
    return {
      runsEnabled: this.runsEnabled,
      generatorReady: this.generator.isReady(),
      runs: Array.from(runs.entries()).map(([runAt, pitches]) => ({ runAt, pitches })),
    };
  }

  /** Writer's disposition on a pitch — taken, published, or passed. */
  async setStatus(
    id: string,
    status: StoryPitch['status'],
    publishedSlug?: string | null,
  ): Promise<{ id: string; status: string }> {
    await this.pitches.update({ id }, { status, publishedSlug: publishedSlug ?? null });
    return { id, status };
  }
}

/** $2.1M / $450,000 — the manual's own convention: figures always, and no
 *  "$450K" abbreviation below a million. */
function usd(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`;
  }
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { IrDiscoveryService } from './ir-discovery.service';
import { ContractPerformanceService } from './contract-performance.service';
import {
  cleanIssuerName,
  isIrDisclosure,
  parseDisclosure,
  ParsedAgreement,
  ParsedDisclosure,
  REVIEW_THRESHOLD,
} from './ir-parser';
import { DEFAULT_WEIGHTS, PromoterWeights, WEIGHT_KEYS, normalizeWeights } from './scoring';

/**
 * Workstream F — IR Budget / Promoter Score.
 *
 * Developer Project Brief v2 (Sept 1 2026) §2. Three things live here:
 *
 *   §2.3 the pipeline    discover → parse → entity-resolve → store
 *   §2.4 the score       per issuer per quarter, percentile-ranked in sector
 *   §2.5 the surfaces' data (ranking, per-issuer module, B2B feed, admin queue)
 *
 * Storage follows the house pattern for derived datasets on this stack —
 * raw-SQL tables created on demand, no TypeORM entity, so there is no
 * duplicate-index boot trap (which this repo has hit before).
 *
 *   ir_disclosures   one row per release we read. Raw text kept, per §2.3.
 *   ir_agreements    one row per issuer↔provider contract. A release can
 *                    produce several (AXCAP disclosed seven in one).
 *   ir_firms         canonical provider table — "this table itself becomes the
 *                    B2B lead list" (§2.3).
 *   ir_issuers       ticker → FMP symbol, market cap, sector. Our own, because
 *                    TSXV/CSE venture names are not in the US companies table.
 *   promoter_scores  §2.4 metrics + composite, per issuer per quarter.
 *   ir_audit         every admin correction, per §2.5 "audit trail, since IR
 *                    firms will dispute numbers".
 *   promoter_config  scoring weights, editable without a deploy.
 *
 * EDITORIAL FIREWALL (§2.6): nothing in this file reads agency-client status.
 * There is no join to the press/B2B tables and no client flag in any query —
 * the brief requires that "agency client status must have zero effect on
 * scores, rankings, or inclusion", and the way to make that provable is for
 * the data not to be reachable from here at all.
 */

const DAY = 86_400_000;

/** Ceiling on Google News round-trips in one pass. Resolution is two requests
 *  per item, so an unbounded run over a 300-item feed is 600 calls. */
const MAX_RESOLVES = 220;

export interface ReviewRow {
  id: number;
  ticker: string | null;
  issuerName: string | null;
  providerName: string | null;
  headline: string;
  sourceUrl: string;
  publishedAt: string | null;
  confidence: number;
  notes: string[];
  provenance: Record<string, string>;
  fields: Record<string, unknown>;
}

@Injectable()
export class PromoterService implements OnModuleInit {
  private readonly log = new Logger(PromoterService.name);
  private tablesReady = false;
  private anthropic: Anthropic | null | undefined;
  private ingesting = false;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
    private readonly discovery: IrDiscoveryService,
    private readonly perf: ContractPerformanceService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureTables();
    } catch (e: any) {
      this.log.error(`table setup failed: ${e?.message || e}`);
    }
  }

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  private async ensureTables(): Promise<void> {
    if (this.tablesReady) return;
    await this.q(`CREATE TABLE IF NOT EXISTS ir_disclosures (
      id            bigserial PRIMARY KEY,
      source_url    text UNIQUE NOT NULL,
      host          varchar(120),
      headline      text NOT NULL,
      published_at  timestamptz,
      raw_text      text NOT NULL,
      ticker        varchar(16),
      exchange      varchar(8),
      issuer_name   text,
      kind          varchar(16) NOT NULL DEFAULT 'new',
      status        varchar(16) NOT NULL DEFAULT 'parsed',
      confidence    real NOT NULL DEFAULT 0,
      notes         jsonb NOT NULL DEFAULT '[]'::jsonb,
      fetched_at    timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS ir_disclosures_ticker_idx ON ir_disclosures (ticker)`);
    await this.q(`CREATE INDEX IF NOT EXISTS ir_disclosures_status_idx ON ir_disclosures (status)`);

    await this.q(`CREATE TABLE IF NOT EXISTS ir_agreements (
      id             bigserial PRIMARY KEY,
      disclosure_id  bigint NOT NULL REFERENCES ir_disclosures(id) ON DELETE CASCADE,
      ticker         varchar(16),
      exchange       varchar(8),
      issuer_name    text,
      provider_slug  varchar(96),
      provider_name  text,
      provider_short varchar(64),
      kind           varchar(16) NOT NULL DEFAULT 'new',
      start_date     date,
      end_date       date,
      term_months    int,
      monthly_fee    numeric(14,2),
      total_value    numeric(16,2),
      currency       varchar(3),
      monthly_fee_cad numeric(14,2),
      total_value_cad numeric(16,2),
      options_granted bigint,
      option_strike  numeric(12,4),
      shares_granted bigint,
      no_security_compensation boolean NOT NULL DEFAULT false,
      arms_length    boolean,
      status         varchar(16) NOT NULL DEFAULT 'active',
      confidence     real NOT NULL DEFAULT 0,
      provenance     jsonb NOT NULL DEFAULT '{}'::jsonb,
      notes          jsonb NOT NULL DEFAULT '[]'::jsonb,
      reviewed_by    varchar(64),
      reviewed_at    timestamptz,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS ir_agreements_ticker_idx ON ir_agreements (ticker)`);
    await this.q(`CREATE INDEX IF NOT EXISTS ir_agreements_provider_idx ON ir_agreements (provider_slug)`);
    await this.q(`CREATE INDEX IF NOT EXISTS ir_agreements_disclosure_idx ON ir_agreements (disclosure_id)`);
    // One provider can only have one contract starting on one day at one
    // issuer. This is what makes re-reading the same release (it goes out on
    // several wires) idempotent.
    await this.q(`CREATE UNIQUE INDEX IF NOT EXISTS ir_agreements_uniq
      ON ir_agreements (ticker, provider_slug, COALESCE(start_date, '1900-01-01'::date))
      WHERE ticker IS NOT NULL AND provider_slug IS NOT NULL`);

    await this.q(`CREATE TABLE IF NOT EXISTS ir_firms (
      slug          varchar(96) PRIMARY KEY,
      name          text NOT NULL,
      aliases       jsonb NOT NULL DEFAULT '[]'::jsonb,
      country       varchar(2),
      website       text,
      first_seen    date,
      last_seen     date,
      updated_at    timestamptz NOT NULL DEFAULT now()
    )`);

    await this.q(`CREATE TABLE IF NOT EXISTS ir_issuers (
      ticker        varchar(16) PRIMARY KEY,
      exchange      varchar(8),
      name          text,
      fmp_symbol    varchar(24),
      market_cap    numeric(20,2),
      currency      varchar(3),
      sector        varchar(64),
      industry      varchar(96),
      resolved_at   timestamptz,
      updated_at    timestamptz NOT NULL DEFAULT now()
    )`);

    await this.q(`CREATE TABLE IF NOT EXISTS promoter_scores (
      ticker            varchar(16) NOT NULL,
      quarter           varchar(7) NOT NULL,
      spend_cad         numeric(16,2) NOT NULL DEFAULT 0,
      prior_spend_cad   numeric(16,2),
      qoq_change        real,
      spend_per_mcap_bps real,
      options_notional_cad numeric(16,2),
      active_contracts  int NOT NULL DEFAULT 0,
      new_contracts     int NOT NULL DEFAULT 0,
      ended_contracts   int NOT NULL DEFAULT 0,
      sector            varchar(64),
      score             real,
      components        jsonb NOT NULL DEFAULT '{}'::jsonb,
      computed_at       timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (ticker, quarter)
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS promoter_scores_quarter_idx ON promoter_scores (quarter)`);

    await this.q(`CREATE TABLE IF NOT EXISTS ir_audit (
      id          bigserial PRIMARY KEY,
      agreement_id bigint,
      actor       varchar(64) NOT NULL,
      action      varchar(24) NOT NULL,
      before      jsonb,
      after       jsonb,
      reason      text,
      at          timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS ir_audit_agreement_idx ON ir_audit (agreement_id)`);

    // Created here as well as in ContractPerformanceService: the issuer read
    // LEFT JOINs it, so the table has to exist even on an instance that has
    // never refreshed prices.
    await this.q(`CREATE TABLE IF NOT EXISTS ir_contract_perf (
      agreement_id  bigint PRIMARY KEY,
      fmp_symbol    varchar(24),
      start_date    date,
      start_price   numeric(14,4),
      price_30d     numeric(14,4),
      price_90d     numeric(14,4),
      price_now     numeric(14,4),
      perf_30d      real,
      perf_90d      real,
      perf_now      real,
      currency      varchar(3),
      note          text,
      computed_at   timestamptz NOT NULL DEFAULT now()
    )`);

    await this.q(`CREATE TABLE IF NOT EXISTS promoter_config (
      key     varchar(48) PRIMARY KEY,
      value   jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    this.tablesReady = true;
  }

  // ── Config ─────────────────────────────────────────────────────────────

  /**
   * §2.4 says "exact weights supplied by George before phase 2 build". They
   * were not supplied, and waiting would have blocked the whole workstream, so
   * the weights are DATA rather than code: the defaults below ship, and
   * `PUT /promoter/admin/weights` changes them without a deploy. The
   * methodology copy reads them from here too, so the published explanation
   * can never drift from the arithmetic.
   */
  async getWeights(): Promise<PromoterWeights> {
    await this.ensureTables();
    const row = (await this.q(`SELECT value FROM promoter_config WHERE key = 'weights'`))?.[0];
    return normalizeWeights(row?.value ?? DEFAULT_WEIGHTS);
  }

  async setWeights(next: Partial<PromoterWeights>, actor: string): Promise<PromoterWeights> {
    const before = await this.getWeights();
    // A value that is out of range is IGNORED, leaving the current weight in
    // place. Merging it first and normalising afterwards looks equivalent and
    // is not: a single typo would silently snap that weight back to the
    // shipped default, changing a published score for a reason nobody asked
    // for. Reject the field, keep the rest.
    const clean: Partial<PromoterWeights> = {};
    const ignored: string[] = [];
    for (const [k, v] of Object.entries(next ?? {})) {
      if (!WEIGHT_KEYS.includes(k as keyof PromoterWeights)) continue;
      const n = Number(v);
      if (isFinite(n) && n >= 0 && n <= 1000) (clean as any)[k] = n;
      else ignored.push(k);
    }
    if (ignored.length) this.log.warn(`ignored out-of-range weights: ${ignored.join(', ')}`);
    const merged = normalizeWeights({ ...before, ...clean });
    await this.q(
      `INSERT INTO promoter_config (key, value, updated_at) VALUES ('weights', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(merged)],
    );
    await this.q(
      `INSERT INTO ir_audit (agreement_id, actor, action, before, after, reason)
       VALUES (NULL, $1, 'weights', $2::jsonb, $3::jsonb, 'scoring weights changed')`,
      [actor, JSON.stringify(before), JSON.stringify(merged)],
    );
    await this.rescore();
    return merged;
  }

  // ── Ingestion (§2.3) ───────────────────────────────────────────────────

  /** Nightly. TSXV requires the news release "promptly"; §6 wants a parsed row
   *  within 24h, so once a day with a generous look-back clears the bar. */
  @Cron('20 5 * * *')
  async nightly() {
    try {
      await this.ingest();
    } catch (e: any) {
      this.log.error(`nightly ingest failed: ${e?.message || e}`);
    }
  }

  /**
   * Kick the pipeline off and return immediately.
   *
   * A full pass is minutes, not seconds: newsfilecorp.com is paced at one
   * request every nine seconds to stay under its WAF, so eighty items is a
   * quarter of an hour. An admin POST that waits for that dies at the nginx
   * proxy timeout and leaves the caller unable to tell a slow run from a
   * failed one. Poll `/promoter/status` instead.
   */
  startIngest(limit = 80): { started: boolean; alreadyRunning: boolean } {
    if (this.ingesting) return { started: false, alreadyRunning: true };
    void this.ingest(limit).catch((e) => this.log.error(`ingest failed: ${e?.message || e}`));
    return { started: true, alreadyRunning: false };
  }

  get running(): boolean {
    return this.ingesting;
  }

  async ingest(limit = 80): Promise<{ discovered: number; fetched: number; agreements: number; review: number }> {
    if (this.ingesting) return { discovered: 0, fetched: 0, agreements: 0, review: 0 };
    this.ingesting = true;
    await this.ensureTables();
    let fetched = 0;
    let agreements = 0;
    let review = 0;
    try {
      const items = this.discovery.prioritise(await this.discovery.discover());
      this.log.log(`discovery returned ${items.length} items`);
      let resolves = 0;
      for (const item of items) {
        // `limit` caps RELEASES READ, not items examined. It used to slice the
        // item list, and the first pass on production read nothing at all: the
        // discovery feed is dominated by aggregators that republish these
        // releases, so the first sixty items were almost entirely hosts we
        // skip on purpose and the one wire among them was mid-WAF-challenge.
        if (fetched >= limit) break;
        if (resolves >= MAX_RESOLVES) {
          this.log.warn(`stopped after ${MAX_RESOLVES} url resolutions`);
          break;
        }
        resolves++;
        const url = await this.discovery.resolveUrl(item.guid);
        if (!url || !this.discovery.isFullTextHost(url)) continue;
        const already = (await this.q(`SELECT id FROM ir_disclosures WHERE source_url = $1`, [url]))?.[0];
        if (already) continue;

        const text = await this.discovery.fetchRelease(url);
        if (!text) continue;
        if (!isIrDisclosure(item.title, text)) continue;
        fetched++;

        let parsed = parseDisclosure(item.title, text);
        // §2.3's "flag low-confidence parses for manual review" — but first
        // give the model a chance to read what the patterns could not. It only
        // runs on the hard minority, so the cost is a handful of calls a day.
        if (parsed.confidence < REVIEW_THRESHOLD) {
          const better = await this.llmParse(item.title, text, parsed);
          if (better) parsed = better;
        }
        const res = await this.store(url, item, text, parsed);
        agreements += res.agreements;
        if (res.needsReview) review++;
      }
      this.log.log(`ingest read ${fetched} releases, wrote ${agreements} agreements, ${review} held for review`);
      await this.resolveIssuers();
      await this.rescore();
      await this.perf.refresh();
    } finally {
      this.ingesting = false;
    }
    return { discovered: fetched, fetched, agreements, review };
  }

  private async store(
    url: string,
    item: { title: string; publishedAt: string | null },
    text: string,
    parsed: ParsedDisclosure,
  ): Promise<{ agreements: number; needsReview: boolean }> {
    const needsReview = parsed.confidence < REVIEW_THRESHOLD;
    const host = safeHost(url);
    const ins = await this.q(
      `INSERT INTO ir_disclosures
         (source_url, host, headline, published_at, raw_text, ticker, exchange, issuer_name, kind, status, confidence, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       ON CONFLICT (source_url) DO UPDATE SET
         confidence = EXCLUDED.confidence, status = EXCLUDED.status, notes = EXCLUDED.notes,
         -- Issuer-level fields are re-read too. Without this a parser fix can
         -- never reach a stored row: the first re-parse on production left
         -- Nord Precious Metals as "June 30'26 TheNewswire - Nord Prec…"
         -- because the upsert only ever refreshed the money columns.
         ticker = EXCLUDED.ticker, exchange = EXCLUDED.exchange,
         issuer_name = COALESCE(EXCLUDED.issuer_name, ir_disclosures.issuer_name),
         kind = EXCLUDED.kind
       RETURNING id`,
      [
        url,
        host,
        item.title,
        item.publishedAt,
        text.slice(0, 200_000),
        parsed.ticker,
        parsed.exchange,
        parsed.issuerName,
        parsed.kind,
        needsReview ? 'needs_review' : 'parsed',
        parsed.confidence,
        JSON.stringify(parsed.notes),
      ],
    );
    const disclosureId = ins?.[0]?.id;
    if (!disclosureId) return { agreements: 0, needsReview };

    let n = 0;
    for (const a of parsed.agreements) {
      if (!a.providerName || !parsed.ticker) continue;
      const slug = firmSlug(a.providerName);
      await this.upsertFirm(slug, a.providerName, parsed.kind, a.startDate ?? item.publishedAt);
      const rate = fxToCad(a.currency);
      await this.q(
        `INSERT INTO ir_agreements
           (disclosure_id, ticker, exchange, issuer_name, provider_slug, provider_name, provider_short,
            kind, start_date, end_date, term_months, monthly_fee, total_value, currency,
            monthly_fee_cad, total_value_cad, options_granted, option_strike, shares_granted,
            no_security_compensation, arms_length, status, confidence, provenance, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25::jsonb)
         ON CONFLICT (ticker, provider_slug, COALESCE(start_date, '1900-01-01'::date))
           WHERE ticker IS NOT NULL AND provider_slug IS NOT NULL
         DO UPDATE SET
           -- A hand-reviewed row is the record of truth; a later re-read of
           -- the same release must never silently overwrite a correction.
           monthly_fee = CASE WHEN ir_agreements.reviewed_at IS NULL THEN EXCLUDED.monthly_fee ELSE ir_agreements.monthly_fee END,
           total_value = CASE WHEN ir_agreements.reviewed_at IS NULL THEN EXCLUDED.total_value ELSE ir_agreements.total_value END,
           monthly_fee_cad = CASE WHEN ir_agreements.reviewed_at IS NULL THEN EXCLUDED.monthly_fee_cad ELSE ir_agreements.monthly_fee_cad END,
           total_value_cad = CASE WHEN ir_agreements.reviewed_at IS NULL THEN EXCLUDED.total_value_cad ELSE ir_agreements.total_value_cad END,
           term_months = CASE WHEN ir_agreements.reviewed_at IS NULL THEN EXCLUDED.term_months ELSE ir_agreements.term_months END,
           issuer_name = CASE WHEN ir_agreements.reviewed_at IS NULL THEN COALESCE(EXCLUDED.issuer_name, ir_agreements.issuer_name) ELSE ir_agreements.issuer_name END,
           exchange    = COALESCE(EXCLUDED.exchange, ir_agreements.exchange),
           provider_name = CASE WHEN ir_agreements.reviewed_at IS NULL THEN COALESCE(EXCLUDED.provider_name, ir_agreements.provider_name) ELSE ir_agreements.provider_name END,
           confidence  = GREATEST(ir_agreements.confidence, EXCLUDED.confidence),
           updated_at  = now()`,
        [
          disclosureId,
          parsed.ticker,
          parsed.exchange,
          parsed.issuerName,
          slug,
          a.providerName,
          a.providerShort,
          parsed.kind,
          a.startDate,
          a.endDate,
          a.termMonths,
          a.monthlyFee,
          a.totalValue,
          a.currency,
          a.monthlyFee != null ? Math.round(a.monthlyFee * rate * 100) / 100 : null,
          a.totalValue != null ? Math.round(a.totalValue * rate * 100) / 100 : null,
          a.optionsGranted,
          a.optionStrike,
          a.sharesGranted,
          a.noSecurityCompensation,
          a.armsLength,
          statusFor(parsed.kind),
          a.confidence,
          JSON.stringify(a.provenance),
          JSON.stringify(a.notes),
        ],
      );
      n++;
    }
    // An in-scope release we could not read is exactly the case §2.3 wants a
    // human to look at — but with no provider there is no agreement row, and
    // without a row it would never appear in the queue and would be lost in
    // silence. Write a placeholder so the reviewer gets it; it carries no
    // provider_slug, which is what keeps it out of every public surface and
    // out of the scores until someone fills it in.
    if (n === 0 && parsed.ticker) {
      const existing = (
        await this.q(`SELECT id FROM ir_agreements WHERE disclosure_id = $1 LIMIT 1`, [disclosureId])
      )?.[0];
      if (!existing) {
        const a = parsed.agreements[0];
        await this.q(
          `INSERT INTO ir_agreements
             (disclosure_id, ticker, exchange, issuer_name, kind, start_date, term_months,
              monthly_fee, total_value, currency, status, confidence, provenance, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'needs_review',$11,$12::jsonb,$13::jsonb)`,
          [
            disclosureId, parsed.ticker, parsed.exchange, parsed.issuerName, parsed.kind,
            a?.startDate ?? null, a?.termMonths ?? null, a?.monthlyFee ?? null,
            a?.totalValue ?? null, a?.currency ?? null, parsed.confidence,
            JSON.stringify(a?.provenance ?? {}),
            JSON.stringify([...(a?.notes ?? []), 'No provider could be read from this release.']),
          ],
        );
      }
    }

    // A termination or an expiry retires the earlier contract with the same
    // provider, which is what makes "active contract count" mean anything.
    if (parsed.kind === 'termination' && parsed.ticker) {
      for (const a of parsed.agreements) {
        if (!a.providerName) continue;
        await this.q(
          `UPDATE ir_agreements SET status = 'terminated', updated_at = now()
           WHERE ticker = $1 AND provider_slug = $2 AND status = 'active' AND (start_date IS NULL OR start_date < COALESCE($3::date, now()::date))`,
          [parsed.ticker, firmSlug(a.providerName), a.startDate],
        );
      }
    }
    return { agreements: n, needsReview };
  }

  private async upsertFirm(slug: string, name: string, _kind: string, seen: string | Date | null) {
    // On ingest this is an ISO string off the RSS feed; on a re-parse it is a
    // Date handed back by the driver from `ir_disclosures.published_at`.
    // Assuming the string form crashed the first production re-parse with
    // "seen.slice is not a function".
    const day = toDay(seen);
    await this.q(
      `INSERT INTO ir_firms (slug, name, first_seen, last_seen)
       VALUES ($1,$2,$3,$3)
       ON CONFLICT (slug) DO UPDATE SET
         last_seen = GREATEST(COALESCE(ir_firms.last_seen, EXCLUDED.last_seen), EXCLUDED.last_seen),
         first_seen = LEAST(COALESCE(ir_firms.first_seen, EXCLUDED.first_seen), EXCLUDED.first_seen),
         aliases = CASE WHEN ir_firms.name = EXCLUDED.name THEN ir_firms.aliases
                        ELSE (ir_firms.aliases || to_jsonb(EXCLUDED.name)) END,
         updated_at = now()`,
      [slug, name, day],
    );
  }

  // ── Model fallback ─────────────────────────────────────────────────────

  private client(): Anthropic | null {
    if (this.anthropic !== undefined) return this.anthropic;
    this.anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
    if (!this.anthropic) this.log.warn('ANTHROPIC_API_KEY unset — low-confidence parses go straight to review.');
    return this.anthropic;
  }

  /**
   * Read the fields the patterns could not, and ONLY those.
   *
   * Deliberately narrow: the model is asked to extract, never to judge, and
   * every field it returns is stamped `llm` in provenance so a reviewer (and
   * the B2B feed) can see which numbers came from a model. A field the
   * deterministic parser already found is kept — a reproducible read beats a
   * generated one, and it keeps the two honest about disagreeing.
   */
  private async llmParse(
    title: string,
    text: string,
    base: ParsedDisclosure,
  ): Promise<ParsedDisclosure | null> {
    const client = this.client();
    if (!client) return null;
    const tool = {
      name: 'record_agreements',
      description: 'Record the investor-relations / promotional agreements disclosed in this news release.',
      input_schema: {
        type: 'object' as const,
        properties: {
          ticker: { type: ['string', 'null'], description: 'Canadian exchange ticker, no exchange prefix.' },
          exchange: { type: ['string', 'null'], enum: ['TSXV', 'CSE', 'TSX', 'NEO', null] },
          issuerName: { type: ['string', 'null'] },
          kind: { type: 'string', enum: ['new', 'amendment', 'extension', 'termination'] },
          agreements: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                providerName: { type: ['string', 'null'], description: 'The IR/marketing firm or person retained.' },
                startDate: { type: ['string', 'null'], description: 'yyyy-mm-dd' },
                endDate: { type: ['string', 'null'], description: 'yyyy-mm-dd' },
                termMonths: { type: ['number', 'null'] },
                monthlyFee: { type: ['number', 'null'], description: 'Cash fee per month, number only.' },
                totalValue: { type: ['number', 'null'], description: 'Total contract cash value, number only.' },
                currency: { type: ['string', 'null'], enum: ['CAD', 'USD', 'EUR', 'GBP', 'AUD', null] },
                optionsGranted: {
                  type: ['number', 'null'],
                  description:
                    'Stock options granted TO THIS PROVIDER as compensation. 0 if the release says none. Never count option grants to directors, officers or other consultants.',
                },
                optionStrike: { type: ['number', 'null'] },
                armsLength: { type: ['boolean', 'null'] },
              },
              required: ['providerName'],
            },
          },
        },
        required: ['agreements'],
      },
    };

    try {
      const res = await client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 2000,
        system:
          'You extract contract facts from Canadian venture-exchange news releases disclosing investor relations, promotional or market-making agreements under TSXV Policy 3.4. Report only what the release states. Never estimate, never infer a fee that is not written down, and return null for anything absent. If one release discloses several providers, return one entry per provider.',
        tools: [tool],
        tool_choice: { type: 'tool', name: 'record_agreements' },
        messages: [{ role: 'user', content: `HEADLINE: ${title}\n\nRELEASE:\n${text.slice(0, 24_000)}` }],
      });
      const block = res.content.find((b: any) => b.type === 'tool_use') as any;
      if (!block?.input) return null;
      return mergeLlm(base, block.input);
    } catch (e: any) {
      this.log.warn(`llm parse failed: ${e?.message || e}`);
      return null;
    }
  }

  /**
   * Re-read every stored release with the current parser.
   *
   * §2.3 keeps the raw disclosure text alongside the parsed fields, and this
   * is what that is for: a parser improvement otherwise only ever reaches
   * releases published after it shipped, leaving everything already stored
   * wrong for good. Nothing is re-fetched — the wires are not touched at all —
   * and the upsert path is the same one ingestion uses, so a hand-reviewed row
   * still wins over a re-read.
   */
  async reparse(limit = 500): Promise<{ disclosures: number; agreements: number }> {
    await this.ensureTables();
    // Read the ids first and the bodies one at a time. Selecting every
    // `raw_text` in one go put the whole corpus in memory and the backend hit
    // the V8 heap limit on the first production run — these are full press
    // releases, and there is no reason for more than one to be resident.
    const ids: any[] = await this.q(
      `SELECT id FROM ir_disclosures ORDER BY id LIMIT $1`,
      [Math.min(Math.max(limit, 1), 5000)],
    );
    let agreements = 0;
    let read = 0;
    for (const { id } of ids) {
      const r = (
        await this.q(
          `SELECT id, source_url, headline, published_at, raw_text FROM ir_disclosures WHERE id = $1`,
          [id],
        )
      )?.[0];
      if (!r?.raw_text) continue;
      read++;
      const parsed = parseDisclosure(r.headline, r.raw_text);
      const res = await this.store(
        r.source_url,
        { title: r.headline, publishedAt: toDay(r.published_at) },
        r.raw_text,
        parsed,
      );
      agreements += res.agreements;
    }
    // Re-parsing is not enough on its own. Where the new parse cannot read an
    // issuer name at all, the upsert keeps the one already stored — which on
    // production meant Nord Precious Metals kept the wire furniture through a
    // re-parse that was working correctly. So run the names already in the
    // table through the same cleaner and repair them in place.
    const names: any[] = await this.q(
      `SELECT DISTINCT issuer_name FROM ir_agreements WHERE issuer_name IS NOT NULL`,
    );
    for (const { issuer_name } of names) {
      const cleaned = cleanIssuerName(issuer_name);
      if (!cleaned || cleaned === issuer_name) continue;
      await this.q(`UPDATE ir_agreements SET issuer_name = $1 WHERE issuer_name = $2`, [cleaned, issuer_name]);
      await this.q(`UPDATE ir_disclosures SET issuer_name = $1 WHERE issuer_name = $2`, [cleaned, issuer_name]);
      await this.q(`UPDATE ir_issuers SET name = $1, updated_at = now() WHERE name = $2`, [cleaned, issuer_name]);
    }

    // A re-parse can find providers, and therefore tickers, the old parser
    // missed, so give those issuers a row before refreshing names.
    await this.resolveIssuers();
    // Issuer names live on ir_issuers, which is only refreshed weekly, so a
    // re-parse that corrects a name would otherwise not reach the page.
    await this.q(
      `UPDATE ir_issuers i SET name = best.n, updated_at = now()
         FROM (SELECT ticker,
                      (array_agg(issuer_name ORDER BY length(issuer_name) DESC NULLS LAST))[1] AS n
                 FROM ir_agreements WHERE ticker IS NOT NULL GROUP BY ticker) best
        WHERE i.ticker = best.ticker AND best.n IS NOT NULL AND best.n IS DISTINCT FROM i.name`,
    );
    await this.rescore();
    await this.perf.refresh();
    return { disclosures: read, agreements };
  }

  // ── Issuer resolution ──────────────────────────────────────────────────

  /**
   * TSXV/CSE venture issuers are not in the US `companies` table, so Promoter
   * Score keeps its own issuer row. FMP carries most venture names under a
   * suffixed symbol (`FOBI.V`, `XYZ.CN`), and the smallest ones it does not
   * carry at all — DNO.V returned nothing on the very first release we parsed.
   * A missing market cap is recorded as missing; spend/market cap is then null
   * and the score is computed from the metrics that do exist rather than
   * silently treating an unknown cap as zero.
   */
  async resolveIssuers(max = 60): Promise<number> {
    await this.ensureTables();
    // One row per ticker, carrying the BEST issuer name we have seen for it —
    // the longest non-null. A plain DISTINCT returned whichever row Postgres
    // felt like, which on production meant tickers whose issuer name was null
    // on one wire and present on another came back nameless.
    const rows: any[] = await this.q(
      `SELECT a.ticker,
              max(a.exchange) AS exchange,
              (array_agg(a.issuer_name ORDER BY length(a.issuer_name) DESC NULLS LAST))[1] AS issuer_name
         FROM ir_agreements a
         LEFT JOIN ir_issuers i ON i.ticker = a.ticker
        WHERE a.ticker IS NOT NULL
          AND (i.ticker IS NULL OR i.resolved_at < now() - interval '7 days')
        GROUP BY a.ticker
        LIMIT $1`,
      [max],
    );
    let n = 0;
    for (const r of rows) {
      const suffixes = r.exchange === 'CSE' ? ['.CN', '.V', '.TO', '.NE'] : ['.V', '.TO', '.CN', '.NE'];
      let hit: any = null;
      let sym: string | null = null;
      for (const s of suffixes) {
        const candidate = `${r.ticker}${s}`;
        const profile = await this.fmp.getCompanyProfile(candidate).catch(() => null);
        if (profile && (profile.companyName || profile.marketCap)) {
          hit = profile;
          sym = candidate;
          break;
        }
      }
      await this.q(
        `INSERT INTO ir_issuers (ticker, exchange, name, fmp_symbol, market_cap, currency, sector, industry, resolved_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), now())
         ON CONFLICT (ticker) DO UPDATE SET
           exchange = EXCLUDED.exchange,
           name = COALESCE(EXCLUDED.name, ir_issuers.name),
           fmp_symbol = COALESCE(EXCLUDED.fmp_symbol, ir_issuers.fmp_symbol),
           market_cap = COALESCE(EXCLUDED.market_cap, ir_issuers.market_cap),
           currency = COALESCE(EXCLUDED.currency, ir_issuers.currency),
           sector = COALESCE(EXCLUDED.sector, ir_issuers.sector),
           industry = COALESCE(EXCLUDED.industry, ir_issuers.industry),
           resolved_at = now(), updated_at = now()`,
        [
          r.ticker,
          r.exchange,
          hit?.companyName ?? r.issuer_name ?? null,
          sym,
          hit?.marketCap ?? null,
          hit?.currency ?? null,
          hit?.sector ?? null,
          hit?.industry ?? null,
        ],
      );
      n++;
    }
    return n;
  }

  // ── Scoring (§2.4) ─────────────────────────────────────────────────────

  /**
   * Per issuer per quarter:
   *   spend               sum of active contract cash fees in the quarter, CAD
   *   qoq change          % vs prior quarter (new/ended contracts flagged)
   *   spend / market cap  the core comparable, in basis points
   *   options notional    count x strike, the dilution angle
   *   active contracts    concurrent providers
   *   Promoter Score      composite percentile rank vs SECTOR peers
   *
   * A contract contributes fee x (months it overlaps the quarter), so a
   * three-month engagement starting mid-quarter does not read as a full
   * quarter of spend.
   */
  async rescore(quarters = 8): Promise<number> {
    await this.ensureTables();
    const weights = await this.getWeights();
    const qs = recentQuarters(quarters);
    let written = 0;

    for (const qtr of qs) {
      const { start, end } = quarterBounds(qtr);
      const rows: any[] = await this.q(
        `SELECT a.ticker,
                COALESCE(i.sector, 'Unclassified') AS sector,
                i.market_cap::float8 AS market_cap,
                a.monthly_fee_cad::float8 AS monthly_fee_cad,
                a.total_value_cad::float8 AS total_value_cad,
                a.term_months, a.start_date, a.end_date, a.status,
                a.options_granted, a.option_strike::float8 AS option_strike
           FROM ir_agreements a
           LEFT JOIN ir_issuers i ON i.ticker = a.ticker
          WHERE a.ticker IS NOT NULL
            AND a.status <> 'rejected'
            AND a.provider_slug IS NOT NULL
            AND COALESCE(a.start_date, '1900-01-01'::date) <= $1::date`,
        // Only the quarter END is a parameter here. Passing the quarter label
        // as an unused $1 made Postgres refuse the statement outright
        // ("could not determine data type of parameter $1") — it cannot infer
        // a type for a placeholder that never appears in the query.
        [end],
      );

      const byTicker = new Map<string, any>();
      for (const r of rows) {
        const months = monthsOverlapping(r.start_date, r.end_date, r.term_months, start, end);
        if (months <= 0) continue;
        const monthly = r.monthly_fee_cad ?? (r.total_value_cad && r.term_months ? r.total_value_cad / r.term_months : null);
        const acc = byTicker.get(r.ticker) ?? {
          ticker: r.ticker,
          sector: r.sector,
          marketCap: r.market_cap,
          spend: 0,
          active: 0,
          newCount: 0,
          ended: 0,
          optionsNotional: 0,
          sawFee: false,
        };
        acc.active += 1;
        if (monthly != null) {
          acc.spend += monthly * months;
          acc.sawFee = true;
        }
        if (r.start_date && r.start_date >= start && r.start_date <= end) acc.newCount += 1;
        const finish = contractEnd(r.start_date, r.end_date, r.term_months);
        if (finish && finish >= start && finish <= end) acc.ended += 1;
        if (r.options_granted && r.option_strike) acc.optionsNotional += r.options_granted * r.option_strike;
        byTicker.set(r.ticker, acc);
      }
      if (!byTicker.size) continue;

      // Prior quarter spend, for the QoQ leg.
      const prevQ = shiftQuarter(qtr, -1);
      const prior = new Map<string, number>(
        ((await this.q(`SELECT ticker, spend_cad::float8 AS s FROM promoter_scores WHERE quarter = $1`, [prevQ])) as any[])
          .map((r) => [r.ticker, r.s]),
      );

      const list = [...byTicker.values()].map((a) => {
        const priorSpend = prior.get(a.ticker) ?? null;
        const qoq = priorSpend != null && priorSpend > 0 ? (a.spend - priorSpend) / priorSpend : null;
        const perMcap = a.marketCap && a.marketCap > 0 ? (a.spend / a.marketCap) * 10_000 : null;
        return { ...a, priorSpend, qoq, perMcap };
      });

      // Percentile rank within the sector, per metric. Sectors with too few
      // issuers to rank against fall back to the whole quarter's cohort —
      // ranking one issuer against itself would hand it a 100.
      const bySector = new Map<string, typeof list>();
      for (const r of list) {
        const arr = bySector.get(r.sector) ?? [];
        arr.push(r);
        bySector.set(r.sector, arr);
      }
      const MIN_COHORT = 5;

      for (const r of list) {
        const cohort = (bySector.get(r.sector)?.length ?? 0) >= MIN_COHORT ? bySector.get(r.sector)! : list;
        const components = {
          spend: pctRank(cohort.map((x) => x.spend), r.spend),
          perMcap: r.perMcap == null ? null : pctRank(cohort.map((x) => x.perMcap).filter((v) => v != null) as number[], r.perMcap),
          qoq: r.qoq == null ? null : pctRank(cohort.map((x) => x.qoq).filter((v) => v != null) as number[], r.qoq),
          options: pctRank(cohort.map((x) => x.optionsNotional), r.optionsNotional),
          contracts: pctRank(cohort.map((x) => x.active), r.active),
        };
        // Drop the weight of any component we have no value for and
        // renormalise, so an issuer FMP has no market cap for is ranked on
        // what it does have instead of being pushed down by a missing leg.
        let num = 0;
        let den = 0;
        for (const [k, w] of Object.entries(weights) as Array<[keyof PromoterWeights, number]>) {
          const v = (components as any)[k];
          if (v == null) continue;
          num += v * w;
          den += w;
        }
        const score = den > 0 ? Math.round((num / den) * 100) / 100 : null;

        await this.q(
          `INSERT INTO promoter_scores
             (ticker, quarter, spend_cad, prior_spend_cad, qoq_change, spend_per_mcap_bps,
              options_notional_cad, active_contracts, new_contracts, ended_contracts, sector, score, components, computed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb, now())
           ON CONFLICT (ticker, quarter) DO UPDATE SET
             spend_cad = EXCLUDED.spend_cad, prior_spend_cad = EXCLUDED.prior_spend_cad,
             qoq_change = EXCLUDED.qoq_change, spend_per_mcap_bps = EXCLUDED.spend_per_mcap_bps,
             options_notional_cad = EXCLUDED.options_notional_cad,
             active_contracts = EXCLUDED.active_contracts, new_contracts = EXCLUDED.new_contracts,
             ended_contracts = EXCLUDED.ended_contracts, sector = EXCLUDED.sector,
             score = EXCLUDED.score, components = EXCLUDED.components, computed_at = now()`,
          [
            r.ticker, qtr, round2(r.spend), r.priorSpend == null ? null : round2(r.priorSpend),
            r.qoq, r.perMcap, round2(r.optionsNotional), r.active, r.newCount, r.ended,
            r.sector, score, JSON.stringify(components),
          ],
        );
        written++;
      }
    }
    return written;
  }

  // ── Reads (§2.5) ───────────────────────────────────────────────────────

  /** The ranking page: most-promoted stocks. */
  async ranking(opts: { quarter?: string; sector?: string; sort?: string; limit?: number } = {}) {
    await this.ensureTables();
    const quarter = opts.quarter && /^\d{4}-Q[1-4]$/.test(opts.quarter) ? opts.quarter : currentQuarter();
    const sort =
      opts.sort === 'spend' ? 's.spend_cad'
      : opts.sort === 'perMcap' ? 's.spend_per_mcap_bps'
      : opts.sort === 'contracts' ? 's.active_contracts'
      : opts.sort === 'perf' ? 'perf.perf_now'
      : 's.score';
    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 250);
    const rows: any[] = await this.q(
      `SELECT s.ticker, s.quarter, s.score, s.spend_cad::float8 AS spend, s.prior_spend_cad::float8 AS prior,
              s.qoq_change, s.spend_per_mcap_bps, s.active_contracts, s.new_contracts, s.ended_contracts,
              s.sector, s.components,
              i.name, i.exchange, i.market_cap::float8 AS market_cap, i.fmp_symbol,
              perf.perf_now, perf.perf_90d, perf.start_date AS perf_start, perf.note AS perf_note,
              perf.currency AS perf_currency
         FROM promoter_scores s
         LEFT JOIN ir_issuers i ON i.ticker = s.ticker
         -- Stock performance since the issuer's FIRST priced engagement began
         -- (George 2026-09-15: "how the stock has performed post engagement").
         -- One row per issuer: the earliest contract that has a price, else
         -- the earliest unpriced one so its note can say why there is no figure.
         LEFT JOIN LATERAL (
           SELECT p.perf_now, p.perf_90d, p.start_date, p.note, p.currency
             FROM ir_contract_perf p
             JOIN ir_agreements a ON a.id = p.agreement_id
            WHERE a.ticker = s.ticker AND a.status <> 'rejected' AND a.provider_slug IS NOT NULL
            ORDER BY (p.perf_now IS NULL), p.start_date ASC
            LIMIT 1
         ) perf ON true
        WHERE s.quarter = $1 AND ($2::text IS NULL OR s.sector = $2)
        ORDER BY ${sort} DESC NULLS LAST
        LIMIT $3`,
      [quarter, opts.sector || null, limit],
    );
    const sectors: any[] = await this.q(
      `SELECT sector, count(*)::int AS n FROM promoter_scores WHERE quarter = $1 GROUP BY sector ORDER BY n DESC`,
      [quarter],
    );
    return {
      quarter,
      quarters: await this.availableQuarters(),
      sectors: sectors.map((r) => ({ sector: r.sector, count: r.n })),
      rows: rows.map(shapeRankRow),
      weights: await this.getWeights(),
    };
  }

  /** The per-issuer module on the stock report page. */
  async issuer(tickerRaw: string) {
    await this.ensureTables();
    const ticker = String(tickerRaw || '').toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 16);
    if (!ticker) return null;
    const issuer = (await this.q(`SELECT * FROM ir_issuers WHERE ticker = $1`, [ticker]))?.[0] ?? null;
    const contracts: any[] = await this.q(
      `SELECT a.id, a.provider_name, a.provider_slug, a.start_date, a.end_date, a.term_months,
              a.monthly_fee::float8 AS monthly_fee, a.total_value::float8 AS total_value, a.currency,
              a.monthly_fee_cad::float8 AS monthly_fee_cad, a.total_value_cad::float8 AS total_value_cad,
              a.options_granted, a.option_strike::float8 AS option_strike, a.no_security_compensation,
              a.arms_length, a.status, a.kind, a.confidence, a.provenance, a.reviewed_at,
              d.source_url, d.headline, d.published_at,
              p.perf_30d, p.perf_90d, p.perf_now, p.start_price::float8 AS start_price,
              p.price_now::float8 AS price_now, p.note AS perf_note
         FROM ir_agreements a JOIN ir_disclosures d ON d.id = a.disclosure_id
         LEFT JOIN ir_contract_perf p ON p.agreement_id = a.id
        WHERE a.ticker = $1 AND a.status <> 'rejected' AND a.provider_slug IS NOT NULL
        ORDER BY COALESCE(a.start_date, d.published_at::date) DESC NULLS LAST`,
      [ticker],
    );
    const history: any[] = await this.q(
      `SELECT quarter, spend_cad::float8 AS spend, score, active_contracts, spend_per_mcap_bps, qoq_change
         FROM promoter_scores WHERE ticker = $1 ORDER BY quarter`,
      [ticker],
    );
    // An issuer row alone is not a page. `resolveIssuers` creates one for any
    // ticker we have seen, including tickers whose only disclosure is still
    // held for review — answering 200 with an empty shell would render a
    // company panel claiming zero agreements when the truth is "not read yet".
    if (!contracts.length) return null;
    return {
      ticker,
      issuer: issuer
        ? {
            name: issuer.name,
            exchange: issuer.exchange,
            marketCap: issuer.market_cap == null ? null : Number(issuer.market_cap),
            sector: issuer.sector,
            fmpSymbol: issuer.fmp_symbol,
          }
        : null,
      current: history.length ? history[history.length - 1] : null,
      history,
      contracts: contracts.map(shapeContract),
    };
  }

  /**
   * Top IR Promoters (George 2026-09-16, paygated dataset): IR and promotional
   * firms ranked by what their clients' stocks did after the engagement began
   * — median post-engagement return and median trade-volume growth, from
   * ir_contract_perf. One row per firm, only firms with at least one priced
   * campaign. The Promoter Performance score is the average percentile rank of
   * the two medians among ranked firms (return only, when no client has a
   * volume baseline), so it is a relative standing on this list, not a return.
   * Small samples are the norm on this dataset, so the campaign count travels
   * with every row and the page shows it.
   */
  async topPromoters(opts: { minCampaigns?: number; limit?: number } = {}) {
    await this.ensureTables();
    await this.perf.ensureTable();
    const minCampaigns = Math.min(Math.max(Number(opts.minCampaigns) || 1, 1), 50);
    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
    const rows: any[] = await this.q(
      `SELECT f.slug, f.name, f.website, f.country,
              count(a.id)::int                                AS campaigns,
              count(DISTINCT a.ticker)::int                   AS issuers,
              count(p.perf_90d)::int                          AS priced_90,
              count(p.perf_now)::int                          AS priced_now,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY p.perf_90d)  AS med_90,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY p.perf_now)  AS med_now,
              avg(CASE WHEN p.perf_90d > 0 THEN 1.0 WHEN p.perf_90d IS NOT NULL THEN 0.0 END) AS hit_90,
              count(COALESCE(p.vol_growth_90, p.vol_growth_30))::int   AS vol_n,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(p.vol_growth_90, p.vol_growth_30)) AS med_vol,
              min(a.start_date)                               AS first_start,
              max(a.start_date)                               AS latest_start,
              sum(a.monthly_fee_cad)::float8                  AS monthly_book_cad,
              array_agg(DISTINCT a.ticker ORDER BY a.ticker)  AS tickers
         FROM ir_firms f
         JOIN ir_agreements a ON a.provider_slug = f.slug AND a.status <> 'rejected'
         LEFT JOIN ir_contract_perf p ON p.agreement_id = a.id
        GROUP BY f.slug, f.name, f.website, f.country
       HAVING count(p.perf_now) > 0 AND count(a.id) >= $1
        ORDER BY count(a.id) DESC`,
      [minCampaigns],
    );
    const firms = rows.map((r) => {
      const med90 = r.med_90 == null ? null : Number(r.med_90);
      const medNow = r.med_now == null ? null : Number(r.med_now);
      return {
        slug: r.slug,
        name: r.name,
        website: r.website ?? null,
        country: r.country ?? null,
        campaigns: r.campaigns,
        issuers: r.issuers,
        pricedCampaigns: r.priced_now,
        priced90: r.priced_90,
        // The ranking return: the 90-day median where a 90-day window has
        // elapsed for at least one campaign, else the since-start median.
        postReturn: med90 ?? medNow,
        postReturnWindow: med90 != null ? ('90d' as const) : ('since-start' as const),
        medianReturn90d: med90,
        medianReturnSinceStart: medNow,
        winRate90d: r.hit_90 == null ? null : Number(r.hit_90),
        volumeCampaigns: r.vol_n,
        medianVolumeGrowth: r.med_vol == null ? null : Number(r.med_vol),
        firstStart: r.first_start,
        latestStart: r.latest_start,
        monthlyBookCad: r.monthly_book_cad == null ? null : round2(r.monthly_book_cad),
        tickers: (r.tickers || []).filter(Boolean),
        score: null as number | null,
        rank: 0,
      };
    });
    const pctRank = (vals: Array<number | null>) => {
      const sorted = vals.filter((v): v is number => v != null).sort((a, b) => a - b);
      return (v: number | null) => {
        if (v == null || !sorted.length) return null;
        if (sorted.length === 1) return 1;
        // Share of ranked firms at or below this value; ties share a rank.
        let below = 0;
        for (const x of sorted) if (x < v) below++;
        return below / (sorted.length - 1);
      };
    };
    const rRet = pctRank(firms.map((f) => f.postReturn));
    const rVol = pctRank(firms.map((f) => f.medianVolumeGrowth));
    for (const f of firms) {
      const a = rRet(f.postReturn);
      const b = rVol(f.medianVolumeGrowth);
      const blended = a == null ? null : b == null ? a : 0.6 * a + 0.4 * b;
      f.score = blended == null ? null : Math.round(blended * 100);
    }
    firms.sort(
      (x, y) =>
        (y.score ?? -1) - (x.score ?? -1) ||
        (y.postReturn ?? -Infinity) - (x.postReturn ?? -Infinity) ||
        y.campaigns - x.campaigns,
    );
    firms.forEach((f, i) => (f.rank = i + 1));
    return {
      asOf: new Date().toISOString(),
      minCampaigns,
      total: firms.length,
      weights: { postReturn: 0.6, volumeGrowth: 0.4 },
      firms: firms.slice(0, limit),
    };
  }

  /** §2.3: the canonical IR-firm table "itself becomes the B2B lead list". */
  async firms(opts: { limit?: number; search?: string } = {}) {
    await this.ensureTables();
    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
    const rows: any[] = await this.q(
      `SELECT f.slug, f.name, f.first_seen, f.last_seen,
              count(a.id)::int AS agreements,
              count(DISTINCT a.ticker)::int AS issuers,
              count(DISTINCT a.ticker) FILTER (WHERE a.status = 'active')::int AS active_issuers,
              sum(a.monthly_fee_cad)::float8 AS monthly_book_cad,
              max(a.start_date) AS latest_start
         FROM ir_firms f
         LEFT JOIN ir_agreements a ON a.provider_slug = f.slug AND a.status <> 'rejected'
        WHERE ($1::text IS NULL OR f.name ILIKE '%' || $1 || '%')
        GROUP BY f.slug, f.name, f.first_seen, f.last_seen
        ORDER BY agreements DESC, f.name
        LIMIT $2`,
      [opts.search || null, limit],
    );
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      agreements: r.agreements,
      issuers: r.issuers,
      activeIssuers: r.active_issuers,
      monthlyBookCad: r.monthly_book_cad == null ? null : round2(r.monthly_book_cad),
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      latestStart: r.latest_start,
    }));
  }

  /** Full agreement table — the sellable feed (§2.5). */
  async exportRows(limit = 5000): Promise<any[]> {
    await this.ensureTables();
    return this.q(
      `SELECT a.ticker, a.exchange, a.issuer_name, a.provider_name, a.provider_slug, a.kind, a.status,
              a.start_date, a.end_date, a.term_months, a.currency,
              a.monthly_fee::float8 AS monthly_fee, a.total_value::float8 AS total_value,
              a.monthly_fee_cad::float8 AS monthly_fee_cad, a.total_value_cad::float8 AS total_value_cad,
              a.options_granted, a.option_strike::float8 AS option_strike, a.arms_length,
              a.confidence, a.reviewed_at, d.published_at, d.source_url
         FROM ir_agreements a JOIN ir_disclosures d ON d.id = a.disclosure_id
        WHERE a.status <> 'rejected' AND a.provider_slug IS NOT NULL
        ORDER BY COALESCE(a.start_date, d.published_at::date) DESC NULLS LAST
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 20_000)],
    );
  }

  // ── Admin review queue (§2.5) ──────────────────────────────────────────

  async reviewQueue(limit = 50): Promise<ReviewRow[]> {
    await this.ensureTables();
    const rows: any[] = await this.q(
      `SELECT a.id, a.ticker, a.issuer_name, a.provider_name, a.start_date, a.end_date, a.term_months,
              a.monthly_fee::float8 AS monthly_fee, a.total_value::float8 AS total_value, a.currency,
              a.options_granted, a.option_strike::float8 AS option_strike, a.arms_length,
              a.confidence, a.provenance, a.notes, d.headline, d.source_url, d.published_at
         FROM ir_agreements a JOIN ir_disclosures d ON d.id = a.disclosure_id
        WHERE a.reviewed_at IS NULL AND a.confidence < $1
        ORDER BY d.published_at DESC NULLS LAST
        LIMIT $2`,
      [REVIEW_THRESHOLD, Math.min(Math.max(limit, 1), 200)],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      ticker: r.ticker,
      issuerName: r.issuer_name,
      providerName: r.provider_name,
      headline: r.headline,
      sourceUrl: r.source_url,
      publishedAt: r.published_at,
      confidence: r.confidence,
      notes: r.notes ?? [],
      provenance: r.provenance ?? {},
      fields: {
        startDate: r.start_date,
        endDate: r.end_date,
        termMonths: r.term_months,
        monthlyFee: r.monthly_fee,
        totalValue: r.total_value,
        currency: r.currency,
        optionsGranted: r.options_granted,
        optionStrike: r.option_strike,
        armsLength: r.arms_length,
      },
    }));
  }

  /** Correct a row by hand. Every change is written to `ir_audit` first —
   *  §2.5 wants an audit trail because IR firms will dispute the numbers. */
  async correct(id: number, patch: Record<string, any>, actor: string, reason?: string) {
    await this.ensureTables();
    const before = (await this.q(`SELECT * FROM ir_agreements WHERE id = $1`, [id]))?.[0];
    if (!before) return null;

    const allowed = [
      'provider_name', 'start_date', 'end_date', 'term_months', 'monthly_fee', 'total_value',
      'currency', 'options_granted', 'option_strike', 'shares_granted', 'arms_length', 'status', 'kind',
    ];
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(patch)) {
      const col = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      if (!allowed.includes(col)) continue;
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    }
    if (patch.providerName) {
      const slug = firmSlug(String(patch.providerName));
      vals.push(slug);
      sets.push(`provider_slug = $${vals.length}`);
      await this.upsertFirm(slug, String(patch.providerName), before.kind, before.start_date);
      // Naming the counterparty is what turns a held-back disclosure into a
      // contract the public surfaces and the scores can use.
      if (!before.provider_slug && !patch.status) {
        vals.push(before.kind === 'termination' ? 'terminated' : 'active');
        sets.push(`status = $${vals.length}`);
      }
    }
    // Money edits must keep the CAD columns — every aggregate reads those.
    const currency = patch.currency ?? before.currency;
    if (patch.monthlyFee !== undefined) {
      vals.push(patch.monthlyFee == null ? null : round2(Number(patch.monthlyFee) * fxToCad(currency)));
      sets.push(`monthly_fee_cad = $${vals.length}`);
    }
    if (patch.totalValue !== undefined) {
      vals.push(patch.totalValue == null ? null : round2(Number(patch.totalValue) * fxToCad(currency)));
      sets.push(`total_value_cad = $${vals.length}`);
    }
    if (!sets.length) return { ok: false, reason: 'no editable fields in patch' };

    vals.push(actor);
    sets.push(`reviewed_by = $${vals.length}`);
    sets.push(`reviewed_at = now()`, `confidence = 1`, `updated_at = now()`);
    vals.push(id);

    await this.q(
      `INSERT INTO ir_audit (agreement_id, actor, action, before, after, reason)
       VALUES ($1, $2, 'correct', $3::jsonb, $4::jsonb, $5)`,
      [id, actor, JSON.stringify(before), JSON.stringify(patch), reason ?? null],
    );
    await this.q(`UPDATE ir_agreements SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    await this.rescore(4);
    return { ok: true };
  }

  async audit(agreementId?: number, limit = 100) {
    await this.ensureTables();
    return this.q(
      `SELECT id, agreement_id, actor, action, reason, at FROM ir_audit
        WHERE ($1::bigint IS NULL OR agreement_id = $1)
        ORDER BY at DESC LIMIT $2`,
      [agreementId ?? null, Math.min(Math.max(limit, 1), 500)],
    );
  }

  async status() {
    await this.ensureTables();
    const [counts] = await this.q(
      `SELECT (SELECT count(*)::int FROM ir_disclosures) AS disclosures,
              (SELECT count(*)::int FROM ir_agreements) AS agreements,
              (SELECT count(*)::int FROM ir_agreements WHERE status = 'active') AS active,
              (SELECT count(*)::int FROM ir_agreements WHERE reviewed_at IS NULL AND confidence < ${REVIEW_THRESHOLD}) AS review,
              (SELECT count(*)::int FROM ir_firms) AS firms,
              (SELECT count(*)::int FROM ir_issuers) AS issuers,
              (SELECT count(*)::int FROM ir_issuers WHERE market_cap IS NULL) AS issuers_without_mcap,
              (SELECT max(fetched_at) FROM ir_disclosures) AS last_fetch`,
    );
    return {
      ...counts,
      ingestRunning: this.ingesting,
      weights: await this.getWeights(),
      discovery: this.discovery.status(),
      reviewThreshold: REVIEW_THRESHOLD,
    };
  }

  private async availableQuarters(): Promise<string[]> {
    const rows: any[] = await this.q(`SELECT DISTINCT quarter FROM promoter_scores ORDER BY quarter DESC LIMIT 12`);
    return rows.map((r) => r.quarter);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

/** yyyy-mm-dd from a string, a Date, or nothing. */
function toDay(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Canonical firm key. "JBouma Consulting Ltd." and "JBOUMA CONSULTING LTD"
 *  are the same lead, and the B2B list is worthless if they are two rows. */
export function firmSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(?:inc|incorporated|ltd|limited|llc|llp|lp|corp|corporation|co|gmbh|ag|plc|pty|sa)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

/**
 * Static CAD conversion.
 *
 * Deliberately not a live FX call: §2.4 compares spend across quarters and
 * issuers, and a rate that moves between rescores would make last quarter's
 * number change every night for no disclosed reason. These are contract
 * values, not market values. When George wants dated FX this becomes a table.
 */
const FX_TO_CAD: Record<string, number> = { CAD: 1, USD: 1.37, EUR: 1.48, GBP: 1.73, AUD: 0.9 };
export function fxToCad(currency: string | null | undefined): number {
  return FX_TO_CAD[String(currency || 'CAD').toUpperCase()] ?? 1;
}

function statusFor(kind: string): string {
  return kind === 'termination' ? 'terminated' : 'active';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function currentQuarter(d = new Date()): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export function recentQuarters(n: number, from = new Date()): string[] {
  const out: string[] = [];
  let q = currentQuarter(from);
  for (let i = 0; i < n; i++) {
    out.push(q);
    q = shiftQuarter(q, -1);
  }
  return out.reverse();
}

export function shiftQuarter(q: string, by: number): string {
  const [y, qq] = q.split('-Q').map(Number);
  let idx = y * 4 + (qq - 1) + by;
  return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
}

export function quarterBounds(q: string): { start: string; end: string } {
  const [y, qq] = q.split('-Q').map(Number);
  const m0 = (qq - 1) * 3;
  const start = new Date(Date.UTC(y, m0, 1));
  const end = new Date(Date.UTC(y, m0 + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function contractEnd(
  start: string | Date | null,
  end: string | Date | null,
  termMonths: number | null,
): string | null {
  if (end) return iso(end);
  if (!start || !termMonths) return null;
  const d = new Date(iso(start)!);
  d.setUTCMonth(d.getUTCMonth() + termMonths);
  return d.toISOString().slice(0, 10);
}

/** How many months of a contract fall inside [qStart, qEnd]. A contract with
 *  no stated end is treated as running to its term, and one with neither is
 *  assumed to run from its start for a single month — never forever, which
 *  would let one undated row inflate every future quarter. */
export function monthsOverlapping(
  start: string | Date | null,
  end: string | Date | null,
  termMonths: number | null,
  qStart: string,
  qEnd: string,
): number {
  const s = start ? iso(start)! : qStart;
  const e = contractEnd(start, end, termMonths) ?? addMonths(s, 1);
  const from = s > qStart ? s : qStart;
  const to = e < qEnd ? e : qEnd;
  if (from > to) return 0;
  const days = (Date.parse(to) - Date.parse(from)) / DAY + 1;
  return Math.max(0, Math.min(3, days / 30.44));
}

function addMonths(isoDate: string, n: number): string {
  const d = new Date(isoDate);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

function iso(v: string | Date): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** Percentile rank of `v` inside `arr`, 0–100. Ties share the midpoint, so a
 *  field of issuers that all spent nothing does not hand one of them a 100. */
export function pctRank(arr: number[], v: number): number {
  const xs = arr.filter((x) => typeof x === 'number' && isFinite(x));
  if (!xs.length) return 0;
  let below = 0;
  let equal = 0;
  for (const x of xs) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return Math.round(((below + equal / 2) / xs.length) * 10000) / 100;
}

function shapeRankRow(r: any) {
  return {
    ticker: r.ticker,
    name: r.name,
    exchange: r.exchange,
    sector: r.sector,
    score: r.score,
    spendCad: r.spend == null ? null : round2(r.spend),
    priorSpendCad: r.prior == null ? null : round2(r.prior),
    qoqChange: r.qoq_change,
    spendPerMcapBps: r.spend_per_mcap_bps,
    activeContracts: r.active_contracts,
    newContracts: r.new_contracts,
    endedContracts: r.ended_contracts,
    marketCap: r.market_cap,
    components: r.components,
    // Post-engagement share performance, as a fraction (0.42 = +42%).
    perfSinceStart: r.perf_now == null ? null : Number(r.perf_now),
    perf90d: r.perf_90d == null ? null : Number(r.perf_90d),
    perfStartDate: r.perf_start ?? null,
    perfNote: r.perf_note ?? null,
  };
}

function shapeContract(r: any) {
  return {
    id: Number(r.id),
    providerName: r.provider_name,
    providerSlug: r.provider_slug,
    startDate: r.start_date,
    endDate: r.end_date,
    termMonths: r.term_months,
    monthlyFee: r.monthly_fee,
    totalValue: r.total_value,
    currency: r.currency,
    monthlyFeeCad: r.monthly_fee_cad,
    totalValueCad: r.total_value_cad,
    optionsGranted: r.options_granted == null ? null : Number(r.options_granted),
    optionStrike: r.option_strike,
    noSecurityCompensation: r.no_security_compensation,
    armsLength: r.arms_length,
    status: r.status,
    kind: r.kind,
    confidence: r.confidence,
    reviewed: !!r.reviewed_at,
    provenance: r.provenance ?? {},
    source: { url: r.source_url, headline: r.headline, publishedAt: r.published_at },
    // §2.6's framing, expressed as a figure rather than an adjective: what the
    // share price did after this contract began.
    performance: {
      startPrice: r.start_price ?? null,
      priceNow: r.price_now ?? null,
      pct30d: r.perf_30d ?? null,
      pct90d: r.perf_90d ?? null,
      pctToDate: r.perf_now ?? null,
      note: r.perf_note ?? null,
    },
  };
}

/** Take the model's answer only where the deterministic parser found nothing,
 *  and stamp every borrowed field `llm` in provenance. */
function mergeLlm(base: ParsedDisclosure, out: any): ParsedDisclosure {
  const merged: ParsedDisclosure = {
    ...base,
    ticker: base.ticker ?? (typeof out.ticker === 'string' ? out.ticker.toUpperCase() : null),
    exchange: base.exchange ?? (out.exchange ?? null),
    issuerName: base.issuerName ?? (out.issuerName ?? null),
    kind: base.kind !== 'new' ? base.kind : out.kind ?? base.kind,
    agreements: [],
    notes: [...base.notes],
  };
  const llmAgreements: any[] = Array.isArray(out.agreements) ? out.agreements : [];

  const take = (a: ParsedAgreement | null, l: any): ParsedAgreement => {
    const seed: ParsedAgreement = a ?? {
      providerName: null, providerShort: null, startDate: null, endDate: null, termMonths: null,
      monthlyFee: null, totalValue: null, currency: null, optionsGranted: null, optionStrike: null,
      sharesGranted: null, noSecurityCompensation: false, armsLength: null, confidence: 0,
      provenance: {}, notes: [],
    };
    const next = { ...seed, provenance: { ...seed.provenance }, notes: [...seed.notes] };
    const fields: Array<keyof ParsedAgreement> = [
      'providerName', 'startDate', 'endDate', 'termMonths', 'monthlyFee',
      'totalValue', 'currency', 'optionsGranted', 'optionStrike', 'armsLength',
    ];
    for (const f of fields) {
      if (next[f] == null && l?.[f] != null) {
        (next as any)[f] = l[f];
        next.provenance[f] = 'llm';
      }
    }
    // A model-assisted row is never auto-accepted at full confidence: it is
    // good enough to publish a provisional number and short enough of proof to
    // stay in the reviewer's queue.
    next.confidence = Math.max(next.confidence, next.providerName && (next.monthlyFee != null || next.totalValue != null) ? 0.6 : 0.4);
    return next;
  };

  if (llmAgreements.length) {
    // Pair by provider where we can, otherwise by position.
    for (const [i, l] of llmAgreements.entries()) {
      const match =
        base.agreements.find(
          (a) => a.providerName && l.providerName && firmSlug(a.providerName) === firmSlug(String(l.providerName)),
        ) ?? base.agreements[i] ?? null;
      merged.agreements.push(take(match, l));
    }
  } else {
    merged.agreements = base.agreements;
  }
  merged.confidence = merged.agreements.length
    ? Math.min(...merged.agreements.map((a) => a.confidence), merged.ticker ? 1 : 0.3)
    : base.confidence;
  merged.notes.push('Fields marked "llm" in provenance were read by a model, not by the pattern parser.');
  return merged;
}

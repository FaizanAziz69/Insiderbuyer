import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { createHash, randomUUID } from 'crypto';
import { Company } from '../entities/company.entity';
import { InsiderRole } from '../entities/insider-transaction.entity';
import { FmpService } from '../fmp/fmp.service';

/**
 * GERMAN INSIDER TRANSACTIONS — BaFin Directors' Dealings (Art. 19 MAR).
 *
 * Developer Project Brief (Aug 24 2026) §5.1 / §11: the Insider Bubbles
 * "Germany" filter means XETRA / Frankfurt listings with insider-equivalent
 * disclosure. George confirmed 2026-08-28: real German insider data, updated
 * like the SEC pipeline.
 *
 * Source: BaFin's public managers'-transactions database — no login, no key,
 * no cost. The issuer-mode CSV export carries issuer, BaFin-ID, ISIN, the
 * notifying person, position, instrument, Buy/Sell, average price (EUR),
 * aggregated volume (EUR), notification/transaction dates and venue. The
 * database only holds the trailing 12 months, so we persist everything.
 *
 * Rows land in the SAME tables as Form 4 (companies + insider_transactions),
 * so bubbles, data articles, the trades feed and company pages pick them up
 * with no special casing:
 *   companies.cik        = "DE-" + BaFin issuer ID         (e.g. DE-40001244)
 *   companies.ticker     = FMP symbol for the ISIN         (e.g. SAP.DE)
 *   companies.exchange   = "DE"  (what the Exchanges filter keys on)
 *   transactionCode      = P (Buy) / S (Sell); other natures are skipped
 *   pricePerShare        = EUR — the same currency as the .DE quote, so
 *                          price-vs-insider-price comparisons stay right
 *   totalValue           = USD at the day's EURUSD, so $ thresholds and
 *                          rankings compare like-for-like with U.S. rows
 *   sharesBought         = volume ÷ price
 *   accessionNumber      = "BAFIN-" + sha1 of the row (BaFin has no public id)
 *   filingUrl            = BaFin database search for the issuer's ISIN
 */

const BASE = 'https://portal.mvp.bafin.de/database/DealingsInfo';
/** zeitraum: 1 = today, 2 = ~30 days, 3 = the full 12-month database. */
type Zeitraum = 1 | 2 | 3;
/** Same keys the original (capped, letter-sliced) BaFin ingest used, so the
 *  Exchanges filter (`exchange = 'DE'`) and the 71 issuers already in prod
 *  carry straight over instead of duplicating. */
const EXCHANGE = 'DE';
const CIK_PREFIX = 'DE-';
/** Legacy accession pattern: B<bafinId>-<yyyymmdd>-<hash>, values in EUR. */
const LEGACY_ACC = "^B[0-9]+-[0-9]{8}-";
const ACC_PREFIX = 'BAFIN-';

interface CsvRow {
  issuer: string;
  bafinId: string;
  isin: string;
  person: string;
  position: string;
  instrument: string;
  nature: string;
  avgPrice: number | null; // EUR
  volume: number | null; // EUR
  notified: string | null; // yyyy-mm-dd
  traded: string | null; // yyyy-mm-dd
  venue: string;
  activation: string;
}

/** "65.000,00 EUR" → 65000; "178,30 EUR" → 178.3 */
function deNumber(v: string): number | null {
  const m = String(v || '').replace(/\s/g, '').match(/^-?[\d.]+(,\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
/** "26/08/2026" → "2026-08-26" */
function deDate(v: string): string | null {
  const m = String(v || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
/** "Utz, Herr Dr. Werner" → "Werner Utz"; companies stay as they are. */
function personName(v: string): string {
  const s = String(v || '').trim();
  const i = s.indexOf(',');
  if (i < 0) return s;
  const surname = s.slice(0, i).trim();
  const given = s
    .slice(i + 1)
    .replace(/\b(Herr|Frau|Dr\.|Prof\.|Dipl\.-[A-Za-z.]+|MBA|LL\.M\.)\s*/g, '')
    .trim();
  return given ? `${given} ${surname}` : surname;
}
function roleOf(position: string): { role: InsiderRole; title: string } {
  const p = String(position || '').toLowerCase();
  if (/supervisory/.test(p)) return { role: 'Director', title: 'Supervisory Board' };
  if (/management board|managing director|executive/.test(p)) return { role: 'Other', title: 'Management Board' };
  if (/closely associated/.test(p)) return { role: 'Other', title: 'Closely associated person' };
  return { role: 'Other', title: position || 'Other' };
}

/** Minimal RFC-4180-ish parser for BaFin's ';' CSV (fields may be quoted). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ';') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
  }
  return rows;
}

@Injectable()
export class DeInsidersService implements OnModuleInit {
  private readonly logger = new Logger(DeInsidersService.name);
  private readonly http: AxiosInstance;
  private tablesReady = false;
  private running = false;
  private lastRun: { at: string; zeitraum: Zeitraum; rows: number; inserted: number; skipped: number; unresolvedIsins: number; error: string | null } | null = null;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
  ) {
    this.http = axios.create({
      timeout: 60_000,
      responseType: 'text',
      // BaFin emits a multi-line Permissions-Policy header that Node's strict
      // parser rejects ("Invalid header value char") — same workaround as the
      // legacy bafin.client.ts.
      insecureHTTPParser: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InsiderBuying/1.0)', Accept: 'text/csv,text/html;q=0.9,*/*;q=0.8' },
      maxRedirects: 5,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTables();
    } catch (e: any) {
      this.logger.warn(`de-insiders init failed: ${e?.message || e}`);
    }
    // First fill: the whole 12-month database once, a couple of minutes after boot.
    if (!process.env.VERCEL) setTimeout(() => void this.backfillIfEmpty().catch(() => undefined), 120_000);
  }

  /** Like the SEC pipeline: intraday. BaFin publishes notifications during the
   *  German business day; every 2 hours 05:00–19:00 UTC on weekdays we pull
   *  the 30-day window (≈200 rows) so late activations are caught too. */
  @Cron('0 5-19/2 * * 1-5')
  async intraday(): Promise<void> {
    if (process.env.VERCEL) return;
    await this.ingest(2).catch((e) => this.logger.warn(`de-insiders intraday failed: ${e?.message || e}`));
  }

  /** Weekly full re-read: the database keeps 12 months, so this also restores
   *  anything a transient failure missed. Sunday 03:00 UTC. */
  @Cron('0 3 * * 0')
  async weekly(): Promise<void> {
    if (process.env.VERCEL) return;
    await this.ingest(3).catch((e) => this.logger.warn(`de-insiders weekly failed: ${e?.message || e}`));
  }

  /* ------------------------------------------------------------ schema */

  private async ensureTables(): Promise<void> {
    if (this.tablesReady) return;
    await this.companies.query(`CREATE TABLE IF NOT EXISTS isin_symbols (
      isin        text PRIMARY KEY,
      symbol      text,
      name        text,
      exchange    text,
      currency    text,
      checked_at  timestamptz NOT NULL DEFAULT now()
    )`);
    this.tablesReady = true;
  }

  /* ------------------------------------------------------------- fetch */

  private csvUrl(z: Zeitraum): string {
    // The export link BaFin renders after an issuer-mode search; the odd
    // "6578706f7274" key is hex for "export", d-…-e=1 selects CSV.
    return (
      `${BASE}/sucheForm.do?meldepflichtigerName=&zeitraum=${z}&d-4000784-e=1&emittentButton=Search+for+issuer` +
      `&emittentName=&zeitraumVon=&emittentIsin=&6578706f7274=1&locale=en_GB&zeitraumBis=`
    );
  }

  private async fetchRows(z: Zeitraum): Promise<CsvRow[]> {
    const { data } = await this.http.get<string>(this.csvUrl(z));
    if (typeof data !== 'string' || /<html/i.test(data.slice(0, 200))) throw new Error('BaFin returned HTML instead of CSV (export link changed?)');
    const table = parseCsv(data);
    if (table.length < 1) return [];
    const header = table[0].map((h) => h.trim().toLowerCase());
    const col = (re: RegExp) => header.findIndex((h) => re.test(h));
    const ix = {
      issuer: col(/^issuer/),
      bafinId: col(/bafin/),
      isin: col(/^isin/),
      person: col(/parties subject|notification requirement/),
      position: col(/position/),
      instrument: col(/instrument/),
      nature: col(/nature/),
      price: col(/price/),
      volume: col(/volume/),
      notified: col(/date of notification/),
      traded: col(/date of transaction/),
      venue: col(/place/),
      activation: col(/activation/),
    };
    for (const [k, v] of Object.entries(ix)) if (v < 0) throw new Error(`BaFin CSV: column "${k}" not found (header: ${header.join(' | ')})`);
    const g = (r: string[], i: number) => (r[i] ?? '').trim();
    return table.slice(1).map((r) => ({
      issuer: g(r, ix.issuer),
      bafinId: g(r, ix.bafinId),
      isin: g(r, ix.isin).toUpperCase(),
      person: g(r, ix.person),
      position: g(r, ix.position),
      instrument: g(r, ix.instrument),
      nature: g(r, ix.nature),
      avgPrice: deNumber(g(r, ix.price)),
      volume: deNumber(g(r, ix.volume)),
      notified: deDate(g(r, ix.notified)),
      traded: deDate(g(r, ix.traded)),
      venue: g(r, ix.venue),
      activation: g(r, ix.activation),
    }));
  }

  /* ------------------------------------------------------- resolution */

  /** ISIN → tradeable symbol via FMP, cached (misses re-checked weekly). */
  private async resolveIsins(isins: string[]): Promise<Map<string, { symbol: string | null; name: string | null }>> {
    const out = new Map<string, { symbol: string | null; name: string | null }>();
    const uniq = Array.from(new Set(isins.filter(Boolean)));
    if (!uniq.length) return out;
    const cached: Array<{ isin: string; symbol: string | null; name: string | null; checked_at: string }> = await this.companies.query(
      `SELECT isin, symbol, name, checked_at FROM isin_symbols WHERE isin = ANY($1)`,
      [uniq],
    );
    const fresh = new Set<string>();
    for (const c of cached) {
      const stale = !c.symbol && Date.now() - new Date(c.checked_at).getTime() > 7 * 86_400_000;
      if (!stale) {
        out.set(c.isin, { symbol: c.symbol, name: c.name });
        fresh.add(c.isin);
      }
    }
    const todo = uniq.filter((i) => !fresh.has(i));
    for (const isin of todo) {
      const hits = await this.fmp.searchIsin(isin);
      // Prefer the XETRA line (.DE), then any German venue, then whatever FMP has.
      const pick =
        hits.find((h) => /\.DE$/i.test(h.symbol)) ||
        hits.find((h) => /\.(F|DU|MU|SG|HM|BE|HA)$/i.test(h.symbol)) ||
        hits.find((h) => /xetra|frankfurt|germany|deutsche/i.test(`${h.exchange} ${h.exchangeFullName}`)) ||
        hits[0] ||
        null;
      await this.companies.query(
        `INSERT INTO isin_symbols (isin, symbol, name, exchange, currency, checked_at) VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (isin) DO UPDATE SET symbol = EXCLUDED.symbol, name = EXCLUDED.name, exchange = EXCLUDED.exchange, currency = EXCLUDED.currency, checked_at = now()`,
        [isin, pick?.symbol ?? null, pick?.name ?? null, pick?.exchange ?? null, pick?.currency ?? null],
      );
      out.set(isin, { symbol: pick?.symbol ?? null, name: pick?.name ?? null });
    }
    return out;
  }

  private async eurUsd(): Promise<number> {
    const q = await this.fmp.getQuotesBatch(['EURUSD']);
    const px = Number(q.get('EURUSD')?.price);
    if (Number.isFinite(px) && px > 0.5 && px < 2) return px;
    this.logger.warn('EURUSD quote unavailable — using 1.08 fallback for this run');
    return 1.08;
  }

  /* ------------------------------------------------------------ ingest */

  async backfillIfEmpty(): Promise<void> {
    const [row] = await this.companies.query(`SELECT COUNT(*)::int AS n FROM insider_transactions WHERE "accessionNumber" LIKE '${ACC_PREFIX}%'`);
    if (Number(row?.n) > 0) {
      await this.ingest(2);
      return;
    }
    await this.ingest(3);
  }

  async ingest(z: Zeitraum): Promise<NonNullable<DeInsidersService['lastRun']>> {
    if (this.running) return this.lastRun ?? { at: new Date().toISOString(), zeitraum: z, rows: 0, inserted: 0, skipped: 0, unresolvedIsins: 0, error: 'already running' };
    this.running = true;
    const run = { at: new Date().toISOString(), zeitraum: z, rows: 0, inserted: 0, skipped: 0, unresolvedIsins: 0, error: null as string | null };
    try {
      await this.ensureTables();
      const rows = await this.fetchRows(z);
      run.rows = rows.length;

      // Only real share trades: buys and sells of the issuer's shares.
      const usable = rows.filter(
        (r) =>
          /^share/i.test(r.instrument) &&
          /^(buy|sell)/i.test(r.nature) &&
          r.avgPrice !== null &&
          r.avgPrice > 0 &&
          r.volume !== null &&
          r.volume > 0 &&
          !!r.traded &&
          !!r.bafinId &&
          !!r.isin,
      );
      run.skipped = rows.length - usable.length;

      const isinMap = await this.resolveIsins(usable.map((r) => r.isin));
      const fx = await this.eurUsd();

      // Companies: one per BaFin issuer id.
      const byIssuer = new Map<string, CsvRow>();
      for (const r of usable) if (!byIssuer.has(r.bafinId)) byIssuer.set(r.bafinId, r);
      const companyIds = new Map<string, string>();
      for (const [bafinId, r] of byIssuer) {
        const cik = `${CIK_PREFIX}${bafinId}`.slice(0, 16);
        const sym = isinMap.get(r.isin)?.symbol ?? null;
        if (!sym) run.unresolvedIsins++;
        const [c] = await this.companies.query(
          `INSERT INTO companies (id, cik, ticker, name, exchange, "mdaDocsAnalyzed", "updatedAt")
           VALUES ($5, $1, $2, $3, $4, 0, now())
           ON CONFLICT (cik) DO UPDATE SET
             ticker = COALESCE(companies.ticker, EXCLUDED.ticker),
             name = CASE WHEN companies.name = '' THEN EXCLUDED.name ELSE companies.name END,
             exchange = EXCLUDED.exchange,
             "updatedAt" = now()
           RETURNING id`,
          [cik, sym ? sym.toUpperCase().slice(0, 16) : null, r.issuer.slice(0, 255), EXCHANGE, randomUUID()],
        );
        companyIds.set(bafinId, c.id);
      }

      // Transactions: idempotent on the row hash.
      for (const r of usable) {
        const companyId = companyIds.get(r.bafinId);
        if (!companyId) continue;
        const hash = createHash('sha1')
          .update([r.bafinId, r.person, r.traded, r.nature, r.avgPrice, r.volume, r.activation].join('|'))
          .digest('hex');
        const acc = `${ACC_PREFIX}${hash}`.slice(0, 64);
        const code = /^buy/i.test(r.nature) ? 'P' : 'S';
        const { role, title } = roleOf(r.position);
        const shares = r.volume! / r.avgPrice!;
        const totalUsd = r.volume! * fx;
        const filingUrl = `${BASE}/sucheForm.do?emittentIsin=${encodeURIComponent(r.isin)}&zeitraum=3&emittentButton=Search+for+issuer&locale=en_GB`;
        // The original ingest stored the same trades under a different
        // accession scheme; match on the economics so nothing doubles up.
        const dup = await this.companies.query(
          `SELECT 1 FROM insider_transactions
           WHERE company_id = $1 AND "transactionDate" = $2 AND "transactionCode" = $3
             AND ABS("pricePerShare" - $4) < 0.005 AND ABS("sharesBought" - $5) < 0.5
             AND "accessionNumber" <> $6 LIMIT 1`,
          [companyId, r.traded, code, r.avgPrice, shares, acc],
        );
        if (Array.isArray(dup) && dup.length) continue;
        const res = await this.companies.query(
          `INSERT INTO insider_transactions
             (id, company_id, "insiderName", "insiderCik", role, "rawTitle", "insiderCity", "insiderState", "insiderCountry",
              "transactionDate", "transactionCode", "acquiredDisposed", "plannedBuy", "sharesBought", "pricePerShare", "totalValue",
              "previousHoldings", "postHoldings", "accessionNumber", "lineNumber", "filingUrl", "createdAt")
           VALUES ($13, $1, $2, NULL, $3, $4, NULL, NULL, 'Germany',
                   $5, $6, $7, false, $8, $9, $10, NULL, NULL, $11, 0, $12, now())
           ON CONFLICT ("accessionNumber", "lineNumber") DO NOTHING
           RETURNING id`,
          [companyId, personName(r.person).slice(0, 255), role, `${title} · ${r.venue}`.slice(0, 255), r.traded, code, code === 'P' ? 'A' : 'D', shares, r.avgPrice, totalUsd, acc, filingUrl, randomUUID()],
        );
        // TypeORM's query() hands back the RETURNING rows: 1 = inserted, 0 = duplicate.
        if (Array.isArray(res) && res.length) run.inserted++;
      }
      // Legacy rows kept totalValue in EUR (= shares × price exactly). Convert
      // once so $ thresholds and rankings compare like-for-like; after the
      // update the equality no longer holds, which makes this idempotent.
      await this.companies.query(
        `UPDATE insider_transactions SET "totalValue" = "totalValue" * $1
         WHERE "accessionNumber" ~ $2
           AND ABS("totalValue" - "sharesBought" * "pricePerShare") < 0.01 * "totalValue"`,
        [fx, LEGACY_ACC],
      );

      await this.enrichCompanies();
      this.logger.log(`de-insiders zeitraum=${z}: ${run.rows} rows, ${usable.length} usable, ${run.inserted} new, ${run.unresolvedIsins} unresolved ISINs, EURUSD ${fx}`);
    } catch (e: any) {
      run.error = String(e?.message || e);
      this.logger.warn(`de-insiders ingest failed: ${run.error}`);
    } finally {
      this.running = false;
      this.lastRun = run;
    }
    return run;
  }

  /** Sector / industry / price / market cap for German issuers that have none
   *  yet (FMP profile on the .DE symbol), a bounded batch per run. */
  private async enrichCompanies(limit = 40): Promise<void> {
    const rows: Array<{ id: string; ticker: string }> = await this.companies.query(
      `SELECT id, ticker FROM companies
       WHERE exchange = $1 AND ticker IS NOT NULL AND (sector IS NULL OR "lastPrice" IS NULL)
       ORDER BY "updatedAt" DESC LIMIT $2`,
      [EXCHANGE, limit],
    );
    for (const r of rows) {
      const p = await this.fmp.getCompanyProfile(r.ticker).catch(() => null);
      if (!p) continue;
      await this.companies.query(
        `UPDATE companies SET sector = COALESCE(sector, $2), industry = COALESCE(industry, $3),
           "lastPrice" = COALESCE($4, "lastPrice"), "marketCap" = COALESCE($5, "marketCap"), "updatedAt" = now()
         WHERE id = $1`,
        [r.id, p.sector || null, p.industry || null, Number(p.price) || null, Number(p.marketCap || p.mktCap) ? Math.round(Number(p.marketCap || p.mktCap)) : null],
      );
    }
  }

  /* -------------------------------------------------------------- read */

  async status(): Promise<unknown> {
    await this.ensureTables();
    const [t] = await this.companies.query(
      `SELECT COUNT(*)::int AS transactions, COUNT(DISTINCT company_id)::int AS issuers,
              COUNT(*) FILTER (WHERE "transactionCode" = 'P')::int AS buys,
              COUNT(*) FILTER (WHERE "transactionCode" = 'S')::int AS sells,
              MAX("transactionDate")::text AS latest_trade, MAX("createdAt") AS latest_ingest
       FROM insider_transactions WHERE "accessionNumber" LIKE '${ACC_PREFIX}%'`,
    );
    const [all] = await this.companies.query(
      `SELECT COUNT(*)::int AS "allGermanTransactions", COUNT(*) FILTER (WHERE t."accessionNumber" ~ $1)::int AS "legacyRows",
              COUNT(DISTINCT c.id)::int AS "germanIssuers", COUNT(DISTINCT c.id) FILTER (WHERE c.ticker IS NOT NULL)::int AS "withTicker"
       FROM insider_transactions t JOIN companies c ON c.id = t.company_id WHERE c.exchange = $2`,
      [LEGACY_ACC, EXCHANGE],
    );
    const [i] = await this.companies.query(`SELECT COUNT(*)::int AS n, COUNT(symbol)::int AS resolved FROM isin_symbols`);
    return {
      source: 'BaFin Directors’ Dealings database (Art. 19 MAR), public, free',
      ...t,
      ...all,
      isins: i?.n ?? 0,
      isinsResolved: i?.resolved ?? 0,
      crons: { intraday: '0 5-19/2 * * 1-5 (UTC, 30-day window)', weekly: '0 3 * * 0 (full 12-month re-read)' },
      lastRun: this.lastRun,
      running: this.running,
    };
  }

  async recent(limit = 50): Promise<unknown[]> {
    return this.companies.query(
      `SELECT c.ticker, c.name AS issuer, t."insiderName" AS insider, t."rawTitle" AS title, t."transactionCode" AS code,
              t."transactionDate"::text AS date, t."sharesBought"::float8 AS shares, t."pricePerShare"::float8 AS "priceEur",
              t."totalValue"::float8 AS "valueUsd", t."filingUrl"
       FROM insider_transactions t JOIN companies c ON c.id = t.company_id
       WHERE t."accessionNumber" LIKE '${ACC_PREFIX}%'
       ORDER BY t."transactionDate" DESC, t."createdAt" DESC LIMIT $1`,
      [Math.min(Math.max(1, limit), 500)],
    );
  }
}

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { ProcessedFiling } from '../entities/processed-filing.entity';
import { normalizeRole } from '../common/role.util';
import { deriveCountry, cleanCity } from '../common/country.util';
import { SecClient } from './sec.client';
import { QuoteClient } from './quote.client';
import { BafinClient, BafinDealing } from './bafin.client';
import { IqsService } from '../iqs/iqs.service';
import { MdaSentimentService } from '../iqs/mda-sentiment.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { FmpService } from '../fmp/fmp.service';

/** Ceiling for a plausible per-share price. BRK-A (~$700k) is the priciest
 *  real stock ever, so anything above this is a Form 4 parse artifact. */
const MAX_PLAUSIBLE_PRICE = 1_000_000;

/** Company names from filings occasionally carry literal escape artifacts
 *  ("Protagenic Therapeutics, Inc.\\new") or control characters — strip them
 *  so they never reach the UI or article copy. */
function sanitizeName(raw: string): string {
  return (raw || '')
    .replace(/\\[nrt]?/g, ' ') // literal backslash escapes → space
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

@Injectable()
export class IngestionService implements OnModuleInit {
  private readonly logger = new Logger(IngestionService.name);
  private running = false;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(InsiderTransaction) private readonly txRepo: Repository<InsiderTransaction>,
    @InjectRepository(ProcessedFiling) private readonly processedRepo: Repository<ProcessedFiling>,
    private readonly sec: SecClient,
    private readonly quote: QuoteClient,
    private readonly bafin: BafinClient,
    private readonly iqs: IqsService,
    private readonly marketStats: MarketStatsService,
    private readonly mda: MdaSentimentService,
    @Optional() private readonly fmp?: FmpService,
  ) {}

  async onModuleInit() {
    if ((process.env.INGEST_ON_BOOT || 'true') !== 'true') return;
    setTimeout(() => this.runIngestion(30).catch((e) => this.logger.error(e?.message || e)), 2000);
  }

  @Cron(process.env.INGEST_CRON || '0 */6 * * *')
  async scheduled() {
    await this.runIngestion(3);
  }

  /** One-time backfill: rewrite legacy folder-index filing URLs to the exact
   *  XSL-rendered Form 4 document URL, so the table's filing link opens the
   *  actual Form 4. Deduped by accession; rate-limited for SEC. */
  async backfillFilingUrls(batch = 120): Promise<{ scanned: number; updated: number }> {
    const filings = await this.txRepo
      .createQueryBuilder('t')
      .select('t.accessionNumber', 'acc')
      .addSelect('MIN(t.filingUrl)', 'url')
      .where("t.filingUrl LIKE '%/'")
      .groupBy('t.accessionNumber')
      .limit(batch)
      .getRawMany<{ acc: string; url: string }>();
    let updated = 0;
    for (const f of filings) {
      const m = (f.url || '').match(/\/data\/(\d+)\//);
      if (!m || !f.acc) continue;
      const doc = await this.sec.resolveForm4DocUrl(m[1], f.acc);
      if (doc) {
        await this.txRepo.update({ accessionNumber: f.acc }, { filingUrl: doc });
        updated++;
      }
      await new Promise((res) => setTimeout(res, 120)); // ~8 req/s, SEC-friendly
    }
    this.logger.log(`Filing-URL backfill: ${updated}/${filings.length} filings updated`);
    return { scanned: filings.length, updated };
  }

  async runIngestion(daysBack = 7): Promise<{ filings: number; transactions: number; companies: number }> {
    if (this.running) return { filings: 0, transactions: 0, companies: 0 };
    this.running = true;
    const deadline = Date.now() + 50000;
    const summary = { filings: 0, transactions: 0, companies: 0 };
    try {
      this.logger.log(`Fetching SEC Form 4 filings (${daysBack}d back)...`);
      const filings = await this.sec.searchRecentForm4(daysBack, 8000);
      summary.filings = filings.length;
      this.logger.log(`Found ${filings.length} Form 4 filings`);

      const seenCompanies = new Set<string>();

      for (const f of filings) {
        if (Date.now() > deadline) {
          this.logger.warn('Deadline reached, stopping early');
          break;
        }
        if (!f.cik || !f.accessionNo) continue;

        const alreadyProcessed = await this.processedRepo.findOne({
          where: { accessionNumber: f.accessionNo },
        });
        if (alreadyProcessed) continue;

        try {
          const xml = await this.sec.fetchForm4Xml(f.cik, f.accessionNo, f.primaryDoc);
          if (!xml) {
            await this.processedRepo.save(
              this.processedRepo.create({ accessionNumber: f.accessionNo, qualifyingTransactions: 0 }),
            );
            continue;
          }
          const parsed = this.sec.parseForm4(xml);
          if (!parsed || !parsed.transactions.length) {
            await this.processedRepo.save(
              this.processedRepo.create({ accessionNumber: f.accessionNo, qualifyingTransactions: 0 }),
            );
            continue;
          }

          const issuerCik = parsed.issuerCik || f.cik;
          const issuerName = sanitizeName(parsed.issuerName || f.companyName || '') || 'Unknown';
          const issuerTicker = parsed.issuerTicker || f.ticker || null;

          let company = await this.companies.findOne({ where: { cik: issuerCik } });
          if (!company) {
            company = this.companies.create({
              cik: issuerCik,
              ticker: issuerTicker,
              name: issuerName,
            });
            company = await this.companies.save(company);
          } else {
            let dirty = false;
            if (issuerTicker && !company.ticker) {
              company.ticker = issuerTicker;
              dirty = true;
            }
            if (issuerName && (!company.name || company.name === 'Unknown')) {
              company.name = issuerName;
              dirty = true;
            }
            if (dirty) await this.companies.save(company);
          }

          seenCompanies.add(company.id);
          // Link to the XSL-RENDERED Form 4 (human-readable HTML), not the raw
          // XML doc or the folder index. SEC renders via the xslF345X05/ path.
          const primaryDoc = f.primaryDoc
            ? f.primaryDoc.startsWith('xsl')
              ? f.primaryDoc
              : `xslF345X05/${f.primaryDoc}`
            : null;
          const filingUrl = primaryDoc
            ? this.sec.buildFilingDocUrl(issuerCik, f.accessionNo, primaryDoc)
            : this.sec.buildFilingIndexUrl(issuerCik, f.accessionNo);

          const insiderCity = cleanCity(parsed.ownerCity);
          const insiderState = parsed.ownerState;
          const insiderCountry = deriveCountry(parsed.ownerState, parsed.ownerStateDescription);

          let qualifying = 0;
          for (let i = 0; i < parsed.transactions.length; i++) {
            const p = parsed.transactions[i];
            // Data-quality guard: a price above ~$1M/share (BRK-A, the priciest
            // real stock, is ~$700k) is a Form 4 XML parse artifact — skip it
            // so garbage like "$40,000,000/share → $1600T" never gets stored.
            if (
              !Number.isFinite(p.pricePerShare) ||
              p.pricePerShare > MAX_PLAUSIBLE_PRICE ||
              !Number.isFinite(p.sharesBought) ||
              p.sharesBought < 0
            ) {
              continue;
            }
            const role = normalizeRole(p.rawTitle, p.isDirector, p.isOfficer);
            const totalValue = p.sharesBought * p.pricePerShare;
            // Acquisitions reduce to post − shares; disposals held MORE before
            // the transaction. Keyed off the filing's acquired/disposed flag
            // rather than the code, since J can be either.
            const disposed = p.acquiredDisposed === 'D';
            const previousHoldings = disposed
              ? p.postHoldings + p.sharesBought
              : Math.max(0, p.postHoldings - p.sharesBought);
            await this.txRepo.save(
              this.txRepo.create({
                companyId: company.id,
                insiderName: p.insiderName,
                insiderCik: p.reportingOwnerCik ?? null,
                role,
                rawTitle: p.rawTitle,
                insiderCity,
                insiderState,
                insiderCountry,
                transactionDate: new Date(p.transactionDate),
                transactionCode: p.transactionCode,
                acquiredDisposed: p.acquiredDisposed,
                plannedBuy: p.plannedBuy === true,
                sharesBought: p.sharesBought,
                pricePerShare: p.pricePerShare,
                totalValue,
                previousHoldings,
                postHoldings: p.postHoldings,
                accessionNumber: f.accessionNo,
                lineNumber: i,
                filingUrl,
              }),
            );
            qualifying++;
            summary.transactions++;
          }

          await this.processedRepo.save(
            this.processedRepo.create({
              accessionNumber: f.accessionNo,
              qualifyingTransactions: qualifying,
            }),
          );
        } catch (err: any) {
          this.logger.warn(`Filing ${f.accessionNo}: ${err?.message || err}`);
        }
        await this.delay(80);
      }

      summary.companies = seenCompanies.size;
      this.logger.log(`Enriching ${seenCompanies.size} companies from SEC companyfacts...`);
      for (const companyId of seenCompanies) {
        const company = await this.companies.findOne({ where: { id: companyId } });
        if (!company) continue;

        const facts = await this.quote.fetchSecFacts(company.cik);
        if (facts?.sicDescription) company.sector = facts.sicDescription;

        // Dilution component (IQ v2): trailing-12-month share-count growth.
        if (facts?.sharesOutstanding && facts?.sharesOutstandingYearAgo && facts.sharesOutstandingYearAgo > 0) {
          company.dilutionPctTtm =
            +(facts.sharesOutstanding / facts.sharesOutstandingYearAgo - 1).toFixed(6);
        }
        // §2G denominator — persist the REAL share count for the scorer.
        if (facts?.sharesOutstanding) {
          company.sharesOutstanding = Math.round(Number(facts.sharesOutstanding));
        }

        const latestTx = await this.txRepo
          .createQueryBuilder('t')
          .where('t.company_id = :id', { id: company.id })
          .orderBy('t.transactionDate', 'DESC')
          .limit(1)
          .getOne();
        if (latestTx) company.lastPrice = Number(latestTx.pricePerShare);

        // Market cap source of truth: FMP profile (live, validated) first;
        // the shares × last-Form-4-price product is only the fallback, and
        // only when the share count is plausible. A cap that disagrees with
        // price × sharesOutstanding by >25% is quarantined (logged, not
        // written) — that combination produced CHWY's cap of $1,949.
        const fmpProfile = company.ticker
          ? await this.fmp?.getCompanyProfile(company.ticker).catch(() => null)
          : null;
        if (fmpProfile?.marketCap && fmpProfile.marketCap > 0) {
          company.marketCap = String(Math.round(fmpProfile.marketCap));
          if (fmpProfile.price && fmpProfile.price > 0) {
            company.lastPrice = fmpProfile.price;
          }
        } else if (
          facts?.sharesOutstanding &&
          facts.sharesOutstanding >= 100_000 &&
          company.lastPrice
        ) {
          const mc = Math.round(Number(facts.sharesOutstanding) * Number(company.lastPrice));
          if (mc > 0) company.marketCap = String(mc);
        }
        const capNum = Number(company.marketCap) || 0;
        const shs = Number(company.sharesOutstanding) || 0;
        const px = Number(company.lastPrice) || 0;
        if (capNum > 0 && shs > 0 && px > 0) {
          const implied = shs * px;
          if (Math.abs(capNum - implied) / capNum > 0.25 && capNum < 1_000_000) {
            this.logger.warn(
              `Quarantining implausible market cap for ${company.ticker || company.cik}: ` +
                `stored ${capNum} vs implied ${Math.round(implied)}`,
            );
            company.marketCap = null as unknown as string;
          }
        }
        // Canonical sector/industry for the sector-sentiment mapper — FMP's
        // GICS-style strings resolve where raw SIC descriptions don't.
        if (fmpProfile?.sector && !company.sector) company.sector = fmpProfile.sector;
        if (fmpProfile?.industry && !company.industry) company.industry = fmpProfile.industry;

        await this.companies.save(company);
        await this.delay(150);
      }

      // Keep German (BaFin) data fresh incrementally: each daily cron ingests
      // a rotating ~4-letter slice so the whole A–Z is covered over ~7 days
      // without ever blowing the 60s serverless budget. Deduped, so overlap is
      // cheap. Wrapped so a BaFin hiccup never aborts the SEC cron. rescore is
      // false here — the recalculateAll() below scores US + German together.
      if ((process.env.GERMAN_INGEST || 'true') === 'true') {
        try {
          const slices = ['ABCD', 'EFGH', 'IJKL', 'MNOP', 'QRST', 'UVWX', 'YZ'];
          const dayIdx = new Date().getUTCDate() % slices.length;
          await this.ingestGermanDealings({ letters: slices[dayIdx], rescore: false });
        } catch (e: any) {
          this.logger.warn(`German cron slice failed: ${e?.message || e}`);
        }
      }

      // IQ v2 slow-component backfills — a bounded slice each run so the whole
      // universe converges over days without a big one-time LLM/SEC burn.
      // Both are idempotent (onlyMissing) and never abort the cron on error.
      try {
        await this.backfillMdaSentiment({ limit: 40, onlyMissing: true });
      } catch (e: any) {
        this.logger.warn(`MD&A cron slice failed: ${e?.message || e}`);
      }
      try {
        await this.backfillDilution({ limit: 200, onlyMissing: true });
      } catch (e: any) {
        this.logger.warn(`Dilution cron slice failed: ${e?.message || e}`);
      }
      try {
        await this.repairCompanyFacts({ limit: 200 });
      } catch (e: any) {
        this.logger.warn(`Company-facts repair slice failed: ${e?.message || e}`);
      }

      this.logger.log(`Computing IQS scores...`);
      await this.iqs.recalculateAll();
      this.logger.log(`Ingestion done: ${JSON.stringify(summary)}`);
      return summary;
    } finally {
      this.running = false;
    }
  }

  /** One-time backfill of insider filing location (city/state/country) onto
   *  transactions ingested before those columns existed. Re-fetches each
   *  distinct Form 4 and updates all its rows. */
  async backfillLocations(): Promise<{ filings: number; updated: number }> {
    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select('t."accessionNumber"', 'acc')
      .addSelect('t.company_id', 'cid')
      .where('t."insiderCountry" IS NULL')
      .groupBy('t."accessionNumber"')
      .addGroupBy('t.company_id')
      .getRawMany<{ acc: string; cid: string }>();

    let filings = 0;
    let updated = 0;
    for (const r of rows) {
      const company = await this.companies.findOne({ where: { id: r.cid } });
      if (!company) continue;
      try {
        const xml = await this.sec.fetchForm4Xml(company.cik, r.acc, '');
        if (!xml) continue;
        const parsed = this.sec.parseForm4(xml);
        if (!parsed) continue;
        filings++;
        const res = await this.txRepo.update(
          { accessionNumber: r.acc },
          {
            insiderCity: cleanCity(parsed.ownerCity),
            insiderState: parsed.ownerState,
            insiderCountry: deriveCountry(parsed.ownerState, parsed.ownerStateDescription),
          },
        );
        updated += res.affected || 0;
      } catch (err: any) {
        this.logger.warn(`Backfill ${r.acc}: ${err?.message || err}`);
      }
      await this.delay(120);
    }
    this.logger.log(`Location backfill: ${updated} rows across ${filings} filings.`);
    return { filings, updated };
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── German (BaFin Directors' Dealings) ingestion ───────────────────────
  // Free, machine-readable MAR Art. 19 managers'-transactions data. Written
  // into the SAME companies + insider_transactions tables as SEC Form 4, so
  // the source-agnostic scoring engine ranks German issuers alongside US ones.
  // Companies are tagged exchange='DE'; the "Exchanges" filter keys off that.

  /** Map BaFin "Nature of transaction" → our P (buy) / S (sell) code, or null
   *  to skip (grants, exercises, pledges — not directional open-market trades
   *  we can score honestly). */
  private mapNature(nature: string): 'P' | 'S' | null {
    const n = (nature || '').toLowerCase();
    if (/(buy|purchase|acquisition|subscription)/.test(n)) return 'P';
    if (/(sell|sale|disposal)/.test(n)) return 'S';
    return null;
  }

  /** Map BaFin "Position / status" → our InsiderRole. We can't tell CEO/CFO
   *  from the category, so executives map to 'Other' (honest) and the
   *  supervisory board to 'Director'. */
  private mapRole(position: string): 'Director' | 'Other' {
    return /supervis/i.test(position || '') ? 'Director' : 'Other';
  }

  private shortHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /** Resolve an ISIN to its Yahoo German listing symbol (prefer Xetra .DE,
   *  then other German venues). Cached per run. */
  private async resolveGermanTicker(
    isin: string,
    cache: Map<string, string | null>,
  ): Promise<string | null> {
    if (cache.has(isin)) return cache.get(isin)!;
    let ticker: string | null = null;
    try {
      const results = await this.marketStats.searchSymbols(isin, 15);
      // Reject ISIN-as-symbol results (e.g. "DE000A460Q50.SG") — an ISIN is
      // not a ticker, and storing one breaks every quote/profile lookup.
      const isIsin = (sym: string) => /^[A-Z]{2}[A-Z0-9]{9,10}\./i.test(sym);
      const de = results.find((r) => /\.DE$/i.test(r.symbol) && !isIsin(r.symbol));
      const other = results.find(
        (r) => /\.(F|MU|SG|DU|BE|HM|HA|STU)$/i.test(r.symbol) && !isIsin(r.symbol),
      );
      ticker = de?.symbol || other?.symbol || null;
    } catch {
      ticker = null;
    }
    cache.set(isin, ticker);
    return ticker;
  }

  /** Pull BaFin directors' dealings, keep the top issuers by directional buy
   *  volume, resolve tickers, and upsert companies + transactions. Optionally
   *  rescores everything at the end so German stocks get an IQS immediately. */
  async ingestGermanDealings(opts?: {
    maxIssuers?: number;
    letters?: string;
    rescore?: boolean;
  }): Promise<{
    issuers: number;
    companies: number;
    transactions: number;
    skippedNoTicker: number;
  }> {
    const maxIssuers = opts?.maxIssuers ?? 120;
    const letters = opts?.letters || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    this.logger.log(`German (BaFin) ingestion: fetching directors' dealings [${letters}]…`);
    const rows = await this.bafin.fetchAllDealings(letters);
    this.logger.log(`BaFin: ${rows.length} total dealings fetched.`);

    // Group by ISIN; only directional, priced share trades are scoreable.
    const byIsin = new Map<string, BafinDealing[]>();
    for (const r of rows) {
      if (!this.mapNature(r.nature)) continue;
      if (!(r.avgPrice > 0) || !(r.volumeEur > 0)) continue;
      const arr = byIsin.get(r.isin) || [];
      arr.push(r);
      byIsin.set(r.isin, arr);
    }

    // Rank issuers by total directional EUR volume and cap the universe.
    const ranked = Array.from(byIsin.entries())
      .map(([isin, ds]) => ({
        isin,
        ds,
        vol: ds.reduce((s, d) => s + d.volumeEur, 0),
      }))
      .sort((a, b) => b.vol - a.vol);
    const selected = ranked.slice(0, maxIssuers);
    if (ranked.length > selected.length) {
      this.logger.log(
        `BaFin: capping to top ${selected.length}/${ranked.length} issuers by buy volume.`,
      );
    }

    const tickerCache = new Map<string, string | null>();
    let companiesTouched = 0;
    let txInserted = 0;
    let skippedNoTicker = 0;

    for (const { isin, ds } of selected) {
      const head = ds[0];
      const ticker = await this.resolveGermanTicker(isin, tickerCache);
      if (!ticker) {
        skippedNoTicker++;
        continue;
      }
      const cik = `DE-${head.bafinId}`.slice(0, 16);

      let company = await this.companies.findOne({ where: { cik } });
      if (!company) {
        company = this.companies.create({
          cik,
          ticker,
          name: sanitizeName(head.issuer),
          exchange: 'DE',
        });
        company = await this.companies.save(company);
      } else {
        let dirty = false;
        if (company.ticker !== ticker) {
          company.ticker = ticker;
          dirty = true;
        }
        if (company.exchange !== 'DE') {
          company.exchange = 'DE';
          dirty = true;
        }
        if (dirty) await this.companies.save(company);
      }
      companiesTouched++;

      // Existing accession numbers for this company — dedupe re-ingestion.
      const existing = new Set(
        (
          await this.txRepo
            .createQueryBuilder('t')
            .select('t.accessionNumber', 'acc')
            .where('t.company_id = :id', { id: company.id })
            .getRawMany<{ acc: string }>()
        ).map((r) => r.acc),
      );

      const filingUrl = `https://portal.mvp.bafin.de/database/DealingsInfo/sucheForm.do?locale=en_GB&emittentName=${encodeURIComponent(head.issuer)}`;

      for (const d of ds) {
        const code = this.mapNature(d.nature);
        if (!code || !d.transactionDate) continue;
        const shares = d.avgPrice > 0 ? d.volumeEur / d.avgPrice : 0;
        if (!(shares > 0)) continue;
        const acc = `B${d.bafinId}-${d.transactionDate.replace(/-/g, '')}-${this.shortHash(
          `${d.insiderName}|${d.volumeEur}|${d.nature}|${d.avgPrice}`,
        )}`.slice(0, 64);
        if (existing.has(acc)) continue;
        existing.add(acc);
        await this.txRepo.save(
          this.txRepo.create({
            companyId: company.id,
            insiderName: d.insiderName || 'Undisclosed',
            role: this.mapRole(d.position),
            rawTitle: d.position || null,
            insiderCity: null,
            insiderState: null,
            insiderCountry: 'Germany',
            transactionDate: new Date(d.transactionDate),
            transactionCode: code,
            sharesBought: shares,
            pricePerShare: d.avgPrice,
            totalValue: d.volumeEur,
            previousHoldings: null,
            postHoldings: null,
            accessionNumber: acc,
            lineNumber: 0,
            filingUrl,
          }),
        );
        txInserted++;
      }
    }

    // Set sector / price / market cap from Yahoo for the German tickers so
    // lists render real data even before the full rescore.
    try {
      const tickers = Array.from(
        new Set(
          selected
            .map((s) => tickerCache.get(s.isin))
            .filter((t): t is string => !!t),
        ),
      );
      if (tickers.length) {
        const [quotes, profiles] = await Promise.all([
          this.marketStats.getQuoteBatch(tickers),
          // Real sector/industry for .DE tickers (v7 quote omits it).
          this.marketStats.getCompanyProfiles(tickers),
        ]);
        const deCompanies = await this.companies.find({ where: { exchange: 'DE' } });
        for (const c of deCompanies) {
          const sym = c.ticker ? c.ticker.toUpperCase() : '';
          const q = sym ? quotes.get(sym) : null;
          const prof = sym ? profiles.get(sym) : null;
          let dirty = false;
          // Broad sector for display/heatmap; industry (finer) for list rules.
          const sector = prof?.sector || q?.sector || null;
          if (sector && c.sector !== sector) {
            c.sector = sector;
            dirty = true;
          }
          if (prof?.industry && c.industry !== prof.industry) {
            c.industry = prof.industry;
            dirty = true;
          }
          if (!q) {
            if (dirty) await this.companies.save(c);
            continue;
          }
          if (q.price > 0 && Number(c.lastPrice) !== q.price) {
            c.lastPrice = q.price;
            dirty = true;
          }
          if (q.marketCap && q.marketCap > 0) {
            const mc = String(Math.round(q.marketCap));
            if (c.marketCap !== mc) {
              c.marketCap = mc as unknown as string;
              dirty = true;
            }
          }
          if (dirty) await this.companies.save(c);
        }
      }
    } catch (e: any) {
      this.logger.warn(`German market-data backfill failed: ${e?.message || e}`);
    }

    this.logger.log(
      `German ingestion done: ${companiesTouched} companies, ${txInserted} transactions (${skippedNoTicker} issuers skipped — no Yahoo ticker).`,
    );

    // Rescore only when explicitly asked — chunked serverless calls should
    // rescore once at the end (via POST /iqs/recalculate) to fit the 60s budget.
    if (opts?.rescore === true) {
      this.logger.log('Rescoring after German ingestion…');
      await this.iqs.recalculateAll();
    }

    return {
      issuers: selected.length,
      companies: companiesTouched,
      transactions: txInserted,
      skippedNoTicker,
    };
  }

  /** Backfill sector + industry for already-ingested German companies (from
   *  Yahoo assetProfile). Idempotent and chunk-friendly — processes companies
   *  still missing a sector first so repeated calls converge. */
  async backfillGermanProfiles(opts?: {
    limit?: number;
    onlyMissing?: boolean;
  }): Promise<{ scanned: number; updated: number; remaining: number }> {
    const onlyMissing = opts?.onlyMissing !== false;
    const all = await this.companies.find({ where: { exchange: 'DE' } });
    const pending = onlyMissing ? all.filter((c) => !c.sector) : all;
    const batch = pending.slice(0, opts?.limit ?? 60);
    const tickers = batch.map((c) => c.ticker).filter((t): t is string => !!t);
    if (!tickers.length) {
      return { scanned: 0, updated: 0, remaining: pending.length };
    }
    const profiles = await this.marketStats.getCompanyProfiles(tickers);
    let updated = 0;
    for (const c of batch) {
      const prof = c.ticker ? profiles.get(c.ticker.toUpperCase()) : null;
      if (!prof) continue;
      let dirty = false;
      if (prof.sector && c.sector !== prof.sector) {
        c.sector = prof.sector;
        dirty = true;
      }
      if (prof.industry && c.industry !== prof.industry) {
        c.industry = prof.industry;
        dirty = true;
      }
      if (dirty) {
        await this.companies.save(c);
        updated++;
      }
    }
    return {
      scanned: batch.length,
      updated,
      remaining: Math.max(0, pending.length - batch.length),
    };
  }

  /** One-off cleanup: delete insider-transaction rows with an implausible
   *  per-share price (Form 4 parse artifacts, e.g. "$40,000,000/share" that
   *  produced the "$1600T bought" bug). Returns how many were removed. */
  async cleanupBadTransactions(): Promise<{ deleted: number }> {
    const res = await this.txRepo
      .createQueryBuilder()
      .delete()
      .where('"pricePerShare" > :max', { max: MAX_PLAUSIBLE_PRICE })
      .execute();
    const deleted = res.affected ?? 0;
    this.logger.log(`Cleanup: deleted ${deleted} transactions with implausible price.`);
    return { deleted };
  }

  /** Backfill trailing-12-month dilution (IQ v2 component 5) onto scored US
   *  companies from SEC XBRL. Chunk-friendly / idempotent. */
  async backfillDilution(opts?: {
    limit?: number;
    onlyMissing?: boolean;
  }): Promise<{ scanned: number; updated: number; remaining: number }> {
    const onlyMissing = opts?.onlyMissing !== false;
    const scored = await this.companies
      .createQueryBuilder('c')
      .innerJoin('iqs_scores', 's', 's.company_id = c.id')
      .where('c.exchange = :ex', { ex: 'US' })
      .getMany();
    const pending = onlyMissing ? scored.filter((c) => c.dilutionPctTtm == null) : scored;
    const batch = pending.slice(0, opts?.limit ?? 40);
    let updated = 0;
    for (const c of batch) {
      try {
        // FMP-first (annual weighted-average diluted shares, last two fiscal
        // years) — the SEC-XBRL year-ago derivation rarely has a usable
        // datapoint and left dilution null on ~100% of scored names.
        let dirty = false;
        if (c.ticker && this.fmp?.enabled) {
          const dil = await this.fmp.getDilutionTtm(c.ticker);
          if (dil != null) {
            c.dilutionPctTtm = +dil.toFixed(6);
            dirty = true;
          }
          if (!c.sharesOutstanding) {
            const shs = await this.fmp.getSharesOutstanding(c.ticker);
            if (shs && shs >= 100_000) {
              c.sharesOutstanding = Math.round(shs);
              dirty = true;
            }
          }
        }
        if (!dirty) {
          const facts = await this.quote.fetchSecFacts(c.cik);
          if (facts?.sharesOutstanding && facts?.sharesOutstandingYearAgo && facts.sharesOutstandingYearAgo > 0) {
            c.dilutionPctTtm = +(facts.sharesOutstanding / facts.sharesOutstandingYearAgo - 1).toFixed(6);
            c.sharesOutstanding = Math.round(Number(facts.sharesOutstanding));
            dirty = true;
          }
        }
        if (dirty) {
          await this.companies.save(c);
          updated++;
        }
      } catch {
        /* both sources unavailable — skip */
      }
    }
    return {
      scanned: batch.length,
      updated,
      remaining: Math.max(0, pending.length - batch.length),
    };
  }

  /** Repair company reference facts from FMP: quarantined/implausible market
   *  caps, missing sector/industry, missing shares outstanding. Bounded slice
   *  per run; targets scored companies first (they're user-visible). */
  async repairCompanyFacts(opts?: {
    limit?: number;
  }): Promise<{ scanned: number; capFixed: number; sectorFixed: number; sharesFixed: number }> {
    const out = { scanned: 0, capFixed: 0, sectorFixed: 0, sharesFixed: 0 };
    if (!this.fmp?.enabled) return out;
    const scored = await this.companies
      .createQueryBuilder('c')
      .innerJoin('iqs_scores', 's', 's.company_id = c.id')
      .where('c.ticker IS NOT NULL')
      .getMany();
    const needy = scored.filter((c) => {
      const cap = Number(c.marketCap) || 0;
      const px = Number(c.lastPrice) || 0;
      const shs = Number(c.sharesOutstanding) || 0;
      const capSuspect =
        cap <= 0 ||
        cap < 1_000_000 || // no listed company is worth under $1M
        (shs > 0 && px > 0 && Math.abs(cap - shs * px) / cap > 0.5);
      return capSuspect || !c.sector || shs <= 0;
    });
    const batch = needy.slice(0, opts?.limit ?? 200);
    for (const c of batch) {
      out.scanned++;
      try {
        const prof = await this.fmp.getCompanyProfile(c.ticker!);
        let dirty = false;
        if (prof?.marketCap && prof.marketCap > 0) {
          const next = String(Math.round(prof.marketCap));
          if (c.marketCap !== next) {
            c.marketCap = next;
            out.capFixed++;
            dirty = true;
          }
          if (prof.price && prof.price > 0 && Number(c.lastPrice) !== prof.price) {
            c.lastPrice = prof.price;
            dirty = true;
          }
        }
        if (!c.sector && prof?.sector) {
          c.sector = prof.sector;
          out.sectorFixed++;
          dirty = true;
        }
        if (!c.industry && prof?.industry) {
          c.industry = prof.industry;
          dirty = true;
        }
        if (!(Number(c.sharesOutstanding) > 0)) {
          const shs = await this.fmp.getSharesOutstanding(c.ticker!);
          if (shs && shs >= 100_000) {
            c.sharesOutstanding = Math.round(shs);
            out.sharesFixed++;
            dirty = true;
          }
        }
        if (dirty) await this.companies.save(c);
      } catch {
        /* per-company failure never aborts the slice */
      }
    }
    return out;
  }

  /** Backfill MD&A / communications sentiment (IQ v2 component 3) onto
   *  companies. LLM + SEC calls are too slow for the scoring loop, so this runs
   *  as a chunked batch that stores company.mdaSentiment. Prioritises companies
   *  that currently have a score (i.e. appear in rankings) and no MD&A yet. */
  async backfillMdaSentiment(opts?: {
    limit?: number;
    onlyMissing?: boolean;
  }): Promise<{ scanned: number; updated: number; remaining: number }> {
    const onlyMissing = opts?.onlyMissing !== false;
    // Only score companies that have qualifying buys (a current IQS row) — no
    // point spending LLM calls on names that never rank.
    const scored = await this.companies
      .createQueryBuilder('c')
      .innerJoin('iqs_scores', 's', 's.company_id = c.id')
      .where('c.exchange = :ex', { ex: 'US' })
      .getMany();
    const pending = onlyMissing ? scored.filter((c) => c.mdaSentiment == null) : scored;
    const batch = pending.slice(0, opts?.limit ?? 12);
    let updated = 0;
    for (const c of batch) {
      try {
        const r = await this.mda.computeForCompany(c.cik, c.ticker, c.name);
        if (r.score != null) {
          c.mdaSentiment = r.score;
          c.mdaDocsAnalyzed = r.docsAnalyzed;
          await this.companies.save(c);
          updated++;
        }
      } catch (e: any) {
        this.logger.debug?.(`MD&A backfill failed for ${c.ticker}: ${e?.message || e}`);
      }
    }
    return {
      scanned: batch.length,
      updated,
      remaining: Math.max(0, pending.length - batch.length),
    };
  }
}

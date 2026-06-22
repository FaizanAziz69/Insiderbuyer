import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
import { IqsService } from '../iqs/iqs.service';

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
    private readonly iqs: IqsService,
  ) {}

  async onModuleInit() {
    if ((process.env.INGEST_ON_BOOT || 'true') !== 'true') return;
    setTimeout(() => this.runIngestion(30).catch((e) => this.logger.error(e?.message || e)), 2000);
  }

  @Cron(process.env.INGEST_CRON || '0 */6 * * *')
  async scheduled() {
    await this.runIngestion(3);
  }

  async runIngestion(daysBack = 7): Promise<{ filings: number; transactions: number; companies: number }> {
    if (this.running) return { filings: 0, transactions: 0, companies: 0 };
    this.running = true;
    const deadline = Date.now() + 50000;
    const summary = { filings: 0, transactions: 0, companies: 0 };
    try {
      this.logger.log(`Fetching SEC Form 4 filings (${daysBack}d back)...`);
      const filings = await this.sec.searchRecentForm4(daysBack, 4000);
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
          const issuerName = parsed.issuerName || f.companyName || 'Unknown';
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
          const filingUrl = this.sec.buildFilingIndexUrl(issuerCik, f.accessionNo);

          const insiderCity = cleanCity(parsed.ownerCity);
          const insiderState = parsed.ownerState;
          const insiderCountry = deriveCountry(parsed.ownerState, parsed.ownerStateDescription);

          let qualifying = 0;
          for (let i = 0; i < parsed.transactions.length; i++) {
            const p = parsed.transactions[i];
            const role = normalizeRole(p.rawTitle, p.isDirector, p.isOfficer);
            const totalValue = p.sharesBought * p.pricePerShare;
            // Buys reduce to post − shares; sells held MORE before disposing.
            const previousHoldings =
              p.transactionCode === 'S'
                ? p.postHoldings + p.sharesBought
                : Math.max(0, p.postHoldings - p.sharesBought);
            await this.txRepo.save(
              this.txRepo.create({
                companyId: company.id,
                insiderName: p.insiderName,
                role,
                rawTitle: p.rawTitle,
                insiderCity,
                insiderState,
                insiderCountry,
                transactionDate: new Date(p.transactionDate),
                transactionCode: p.transactionCode,
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

        const latestTx = await this.txRepo
          .createQueryBuilder('t')
          .where('t.company_id = :id', { id: company.id })
          .orderBy('t.transactionDate', 'DESC')
          .limit(1)
          .getOne();
        if (latestTx) company.lastPrice = Number(latestTx.pricePerShare);

        if (facts?.sharesOutstanding && company.lastPrice) {
          const mc = Math.round(Number(facts.sharesOutstanding) * Number(company.lastPrice));
          company.marketCap = String(mc);
        }

        await this.companies.save(company);
        await this.delay(150);
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
}

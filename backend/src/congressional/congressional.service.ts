import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CongressionalTransaction } from '../entities/congressional-transaction.entity';
import { CONGRESS_SEED } from './congressional-seed';
import { PhotosService } from './photos.service';

@Injectable()
export class CongressionalService implements OnModuleInit {
  private readonly logger = new Logger(CongressionalService.name);

  constructor(
    @InjectRepository(CongressionalTransaction)
    private readonly repo: Repository<CongressionalTransaction>,
    private readonly photos: PhotosService,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.repo.count();
      if (count === 0) {
        this.logger.log(`Seeding ${CONGRESS_SEED.length} congressional disclosures…`);
        await this.repo.save(
          CONGRESS_SEED.map((r) => ({
            politicianName: r.politicianName,
            chamber: r.chamber === 'Senate' ? 'Senate' : 'House',
            party: r.party,
            ticker: r.ticker,
            companyName: r.companyName,
            action: r.action,
            amountMin: r.amountMin,
            amountMax: r.amountMax,
            transactionDate: new Date(r.transactionDate),
            reportedDate: new Date(r.reportedDate),
            source: 'sample-seed',
          })) as any,
        );
        this.logger.log('Congressional seed complete.');
      }
      // Backfill photos for any rows missing them — async, swallow errors per-row.
      void this.backfillPhotos();
    } catch (err: any) {
      this.logger.warn(`Skipped seeding congressional trades: ${err?.message || err}`);
    }
  }

  private async backfillPhotos() {
    try {
      const missing = await this.repo.find({
        where: { photoUrl: IsNull() },
      });
      const seenName = new Set<string>();
      for (const row of missing) {
        if (seenName.has(row.politicianName)) continue;
        seenName.add(row.politicianName);
        const url = await this.photos.getPhoto(row.politicianName);
        await this.repo.update(
          { politicianName: row.politicianName },
          { photoUrl: url },
        );
      }
      this.logger.log(
        `Photo backfill complete for ${seenName.size} unique politicians.`,
      );
    } catch (err: any) {
      this.logger.warn(`Photo backfill error: ${err?.message || err}`);
    }
  }

  async list(opts: {
    ticker?: string;
    politician?: string;
    chamber?: 'House' | 'Senate';
    days?: number;
    limit?: number;
  }) {
    const qb = this.repo.createQueryBuilder('t').orderBy('t.transactionDate', 'DESC');
    if (opts.ticker) qb.andWhere('UPPER(t.ticker) = UPPER(:ticker)', { ticker: opts.ticker });
    if (opts.politician)
      qb.andWhere('t.politicianName ILIKE :p', { p: `%${opts.politician}%` });
    if (opts.chamber) qb.andWhere('t.chamber = :chamber', { chamber: opts.chamber });
    if (opts.days && opts.days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - opts.days);
      qb.andWhere('t.transactionDate >= :since', { since });
    }
    qb.limit(opts.limit ?? 100);
    return qb.getMany();
  }

  async byTicker(ticker: string) {
    return this.repo.find({
      where: { ticker: ticker.toUpperCase() },
      order: { transactionDate: 'DESC' },
      take: 50,
    });
  }
}

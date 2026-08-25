import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WatchlistItem } from '../entities/watchlist-item.entity';

/** Server-side watchlist. Tickers are stored upper-cased and de-duplicated. */
@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(WatchlistItem)
    private readonly repo: Repository<WatchlistItem>,
  ) {}

  private clean(t: string): string {
    return (t || '').trim().toUpperCase().slice(0, 16);
  }

  async list(userId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => r.ticker);
  }

  async add(userId: string, tickerRaw: string): Promise<string[]> {
    const ticker = this.clean(tickerRaw);
    if (ticker) {
      // Concurrent adds of the same ticker race on the unique index; the row
      // already existing is the outcome we wanted either way.
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(WatchlistItem)
        .values({ userId, ticker })
        .orIgnore()
        .execute();
    }
    return this.list(userId);
  }

  async remove(userId: string, tickerRaw: string): Promise<string[]> {
    const ticker = this.clean(tickerRaw);
    if (ticker) await this.repo.delete({ userId, ticker });
    return this.list(userId);
  }

  /**
   * Merge a browser's local list into the account's — used the first time a
   * visitor signs in, so the list they built while signed out is not lost.
   * A merge only ever adds; nothing is removed from the account.
   */
  async merge(userId: string, tickers: string[]): Promise<string[]> {
    const values = Array.from(
      new Set((tickers || []).map((t) => this.clean(t)).filter(Boolean)),
    ).map((ticker) => ({ userId, ticker }));
    if (values.length) {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(WatchlistItem)
        .values(values)
        .orIgnore()
        .execute();
    }
    return this.list(userId);
  }

  /** Every watched ticker, grouped by user — what the alert sweep iterates. */
  async allByUser(): Promise<Map<string, string[]>> {
    const rows = await this.repo.find();
    const out = new Map<string, string[]>();
    for (const r of rows) {
      const list = out.get(r.userId) || [];
      list.push(r.ticker);
      out.set(r.userId, list);
    }
    return out;
  }
}

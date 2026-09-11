import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PressOrder } from '../entities/press-order.entity';
import { VizEntity } from '../entities/visualizer.entity';

/**
 * §8 editorial firewall: "any company that is a paid IR client carries a
 * disclosure badge (is_client flag lives in the schema from day one)".
 *
 * George was asked for the client list and answered plainly: "I don't have an
 * IR client list — that's something that you would need to go and find and
 * figure out how to do it." So it is derived from the only authoritative record
 * of who has paid us: `press_order`. A company that bought a press package is a
 * paid client of this site, and that fact is already in our own database, which
 * makes the badge self-maintaining — a new order badges the company on the next
 * refresh without anyone remembering to update a list.
 *
 * `viz_entity.isClient` is the manual override on top, for a client
 * relationship that never went through the press checkout (an advertiser, a
 * retainer). Set through the admin route; nothing automated clears it.
 */
@Injectable()
export class IrClientService {
  private readonly logger = new Logger(IrClientService.name);
  private cache: { at: number; set: Set<string> } | null = null;
  private readonly TTL = 10 * 60_000;

  constructor(
    @InjectRepository(PressOrder) private readonly orders: Repository<PressOrder>,
    @InjectRepository(VizEntity) private readonly entities: Repository<VizEntity>,
  ) {}

  /** Every ticker we are commercially engaged with, upper-cased. */
  async clientTickers(): Promise<Set<string>> {
    if (this.cache && Date.now() - this.cache.at < this.TTL) return this.cache.set;
    const set = new Set<string>();
    try {
      // Any order past checkout counts: money has changed hands at 'received',
      // and the disclosure obligation starts there, not at publication.
      const rows = await this.orders.find({ select: ['ticker', 'status'] });
      for (const r of rows) {
        if (r.ticker) set.add(r.ticker.trim().toUpperCase());
      }
      const manual = await this.entities.find({ where: { isClient: true } });
      for (const e of manual) if (e.ticker) set.add(e.ticker.toUpperCase());
    } catch (e) {
      this.logger.warn(`client list: ${(e as Error).message}`);
    }
    this.cache = { at: Date.now(), set };
    return set;
  }

  async isClient(ticker: string | null | undefined): Promise<boolean> {
    if (!ticker) return false;
    return (await this.clientTickers()).has(ticker.trim().toUpperCase());
  }

  /** Admin override — a relationship that never went through checkout. */
  async setClient(tickerRaw: string, isClient: boolean, name?: string): Promise<VizEntity> {
    const ticker = tickerRaw.trim().toUpperCase();
    const id = `ticker:${ticker}`;
    let row = await this.entities.findOne({ where: { id } });
    if (!row) {
      row = this.entities.create({ id, name: name ?? ticker, ticker, isPublic: true });
    }
    row.isClient = isClient;
    if (name) row.name = name;
    await this.entities.save(row);
    this.cache = null;
    return row;
  }

  async list(): Promise<{ tickers: string[]; manual: VizEntity[] }> {
    return {
      tickers: [...(await this.clientTickers())].sort(),
      manual: await this.entities.find({ where: { isClient: true } }),
    };
  }
}

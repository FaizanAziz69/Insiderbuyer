import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Trailing-twelve-month P/E per symbol, refreshed in bulk from FMP's
 *  `ratios-ttm-bulk` feed.
 *
 *  Why a table: the per-symbol `ratios-ttm` endpoint takes ONE symbol per
 *  request (`?symbol=AAPL,MSFT` returns zero rows) and `batch-quote` carries no
 *  `pe` field, so filling a 500-row table on the request path needs 500 HTTP
 *  calls against a ~10s gateway limit — which is why the P/E column rendered
 *  em-dashes for roughly three of every four rows. `ratios-ttm-bulk` returns
 *  every symbol in ONE call instead, so the fetch moves off the request path
 *  and the tables read a single indexed query.
 *
 *  Only symbols in the screener universe are stored: the raw feed carries
 *  ~71k symbols worldwide and we render a few thousand US names, so filtering
 *  first keeps both the table and the write volume small. */
@Entity('pe_ratio_cache')
export class PeRatioCache {
  @PrimaryColumn({ type: 'varchar', length: 12 })
  symbol!: string;

  /** Trailing P/E. Stored as written by the feed — negatives included, so the
   *  read path (not the writer) decides how a loss-making company renders.
   *  numeric → string in TypeORM. */
  @Column({ type: 'numeric', precision: 18, scale: 6 })
  peRatio!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}

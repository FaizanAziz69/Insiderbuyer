import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StrategiesService } from './strategies.service';
import { StrategyDataService } from './strategy-data.service';

/**
 * §6: "Nightly recompute and cache; detail pages render from materializations."
 *
 * Supporting data first, then the library — a strategy materialized against a
 * stale S&P 500 list or missing pay data is a strategy that quietly picked the
 * wrong names, and it would look exactly like one that picked the right ones.
 */
@Injectable()
export class StrategiesCron {
  private readonly log = new Logger(StrategiesCron.name);

  constructor(
    private readonly svc: StrategiesService,
    private readonly data: StrategyDataService,
  ) {}

  @Cron('20 4 * * *')
  async nightly(): Promise<void> {
    try {
      await this.data.refreshSp500();
      await this.data.refreshExecComp();
      await this.svc.runAll();
    } catch (e: any) {
      this.log.warn(`nightly strategy recompute failed: ${e?.message || e}`);
    }
  }

  /**
   * Lobbying is quarterly, so it is swept weekly rather than nightly — the
   * answer does not change between Tuesdays, and each sweep pages the Senate's
   * whole quarter.
   */
  /**
   * Lobbying, a slice at a time.
   *
   * The Senate caps page_size at 25, so one quarter is roughly 2,600 pages at
   * about three seconds each — two and a half hours, which no request survives.
   * The sweep stores its cursor per filing type, so this advances it nightly
   * and the quarter completes over several days rather than not at all.
   *
   * Strategy 3 needs two quarters per company before it can rank a change, so
   * it reports no result until enough has accumulated. That is the honest state
   * and it is what the card says.
   */
  @Cron('50 4 * * *')
  async nightlyLobbying(): Promise<void> {
    const now = new Date();
    const y = now.getUTCFullYear();
    const q = Math.floor(now.getUTCMonth() / 3);
    const periods = ['first_quarter', 'second_quarter', 'third_quarter', 'fourth_quarter'];
    // This quarter and the previous one — a late filing for last quarter is
    // still arriving while this one is open.
    const targets: Array<[number, string]> = [
      [y, periods[q]],
      [q === 0 ? y - 1 : y, periods[(q + 3) % 4]],
    ];
    for (const [year, period] of targets) {
      try {
        const r = await this.data.refreshLobbying(year, period, { maxPages: 150 });
        this.log.log(
          `lobbying ${year}-${period}: ${r.pages} pages this run, ${r.matched} matched${r.complete ? ' (complete)' : ''}`,
        );
      } catch (e: any) {
        this.log.warn(`lobbying sweep ${year}-${period} failed: ${e?.message || e}`);
      }
    }
  }
}

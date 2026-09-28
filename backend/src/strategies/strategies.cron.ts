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
  @Cron('50 4 * * 1')
  async weeklyLobbying(): Promise<void> {
    const now = new Date();
    const y = now.getUTCFullYear();
    const q = Math.floor(now.getUTCMonth() / 3);
    const periods = ['first_quarter', 'second_quarter', 'third_quarter', 'fourth_quarter'];
    try {
      // This quarter and the one before it: a late filing for last quarter is
      // still arriving while this one is open.
      await this.data.refreshLobbying(y, periods[q]);
      await this.data.refreshLobbying(q === 0 ? y - 1 : y, periods[(q + 3) % 4]);
    } catch (e: any) {
      this.log.warn(`weekly lobbying sweep failed: ${e?.message || e}`);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CqsService } from './cqs.service';

/**
 * CQS is a dated score, not a stored fact: C7 decays from the transaction date,
 * so a row computed yesterday is wrong today even if no new filing arrived.
 * Without this the index freezes at whatever day someone last hit the admin
 * endpoint by hand.
 *
 * 06:10 runs after the congress-trades nightly (05:40), which is what refreshes
 * the flags and disclosures this score reads.
 */
@Injectable()
export class CqsCronService {
  private readonly log = new Logger(CqsCronService.name);

  constructor(private readonly cqs: CqsService) {}

  @Cron('10 6 * * *')
  async daily() {
    try {
      const r = await this.cqs.recalculateAll();
      this.log.log(
        `CQS daily: ${r.computed} scored of ${r.considered} tickers, ${r.excluded} excluded.`,
      );
    } catch (e: any) {
      this.log.error(`CQS daily failed: ${e?.message}`);
    }
  }
}

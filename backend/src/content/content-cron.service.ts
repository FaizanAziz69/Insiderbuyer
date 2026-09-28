import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContentService } from './content.service';

@Injectable()
export class ContentCronService implements OnModuleInit {
  private readonly logger = new Logger(ContentCronService.name);

  constructor(private readonly content: ContentService) {}

  /** On boot, run the refresh once after a 30s delay — this guarantees the
   *  site has fresh content the first time it's deployed, without blocking
   *  the boot sequence. */
  async onModuleInit() {
    if (process.env.CONTENT_GEN_ON_BOOT === 'false') return;
    setTimeout(() => {
      this.refresh().catch((err) =>
        this.logger.error(`Boot-time content refresh failed: ${err.message}`),
      );
    }, 30_000);
  }

  /**
   * The Popular Articles rail: one rotating topic roundup a day.
   *
   * Separate from the refresh below because that one is gated by
   * `content_generation_off`, which George set on 2026-08-28 to stop the bulk
   * engine and which should keep stopping it. This is one article, with its own
   * switch — and without it the rail had been showing the same September 18th
   * piece for ten days, because `topic-roundup` is the only kind it claims and
   * the daily desk does not make one.
   *
   * At 06:40, after the desk has run, so the two never compete for the LLM.
   */
  @Cron('40 6 * * *')
  async topicRail() {
    const r = await this.content.generateDailyTopicRail();
    this.logger.log(`Topic rail: ${JSON.stringify(r)}`);
    return r;
  }

  /** Daily at 06:15 server time — fresh content for morning visitors. */
  @Cron('15 6 * * *')
  async refresh() {
    this.logger.log('Starting daily content refresh…');
    const result = await this.content.runDailyRefresh();
    this.logger.log(
      `Daily refresh result: generated=${result.generated} skipped=${result.skipped} errors=${result.errors.length}`,
    );
    if (result.errors.length) {
      for (const e of result.errors) this.logger.warn(`refresh error: ${e}`);
    }
    return result;
  }
}

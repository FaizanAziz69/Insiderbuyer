import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../../common/admin-token.guard';
import { DailyDeskService } from './daily-desk.service';

/**
 * Admin surface for the daily desk.
 *
 * `POST /daily-desk/run` with `{ publish: false }` is how a batch is inspected
 * before the cron is ever armed: it researches, writes and renders the covers
 * for real, and simply does not touch blog_posts.
 */
@Controller('daily-desk')
export class DailyDeskController {
  constructor(private readonly desk: DailyDeskService) {}

  @Post('run')
  @UseGuards(AdminTokenGuard)
  async run(@Body() body?: { publish?: boolean; limit?: number; draft?: boolean }) {
    return this.desk.run({
      publish: body?.publish === true,
      limit: body?.limit,
      draft: body?.draft === true,
    });
  }

  @Get('status')
  @UseGuards(AdminTokenGuard)
  async status() {
    return this.desk.status();
  }
}

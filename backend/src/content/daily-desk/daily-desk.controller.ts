import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../../common/admin-token.guard';
import { CoverService } from './cover.service';
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
  constructor(
    private readonly desk: DailyDeskService,
    private readonly cover: CoverService,
  ) {}

  @Post('run')
  @UseGuards(AdminTokenGuard)
  async run(@Body() body?: { publish?: boolean; limit?: number; draft?: boolean }) {
    return this.desk.run({
      publish: body?.publish === true,
      limit: body?.limit,
      draft: body?.draft === true,
    });
  }

  /**
   * Render ONE cover, without researching or writing anything.
   *
   * Cover art is the part of the desk the client iterates on — the no-person
   * treatment changed on George's note of 2026-09-25 — and the only way to
   * judge a prompt change was to run a whole batch. This renders a single
   * image into the same editorial-thumbs folder, in the same format, so a
   * change can be looked at before it ships on an article.
   *
   * Omit `personName` and `personRef` to exercise the anonymous-figure branch.
   */
  @Post('cover')
  @UseGuards(AdminTokenGuard)
  async makeCover(
    @Body()
    body: {
      name: string;
      scene: string;
      grade: string;
      halo?: string;
      personName?: string;
      personContext?: string;
      personRef?: string;
    },
  ) {
    if (!body?.name || !body?.scene || !body?.grade) {
      return { error: 'name, scene and grade are required' };
    }
    const out = await this.cover.generate({
      name: body.name,
      scene: body.scene,
      grade: body.grade,
      halo: body.halo,
      personName: body.personName ?? null,
      personContext: body.personContext ?? null,
      personRef: body.personRef ?? null,
    });
    return out ?? { error: 'cover generation failed — see logs' };
  }

  @Get('status')
  @UseGuards(AdminTokenGuard)
  async status() {
    return this.desk.status();
  }
}

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../common/admin-token.guard';
import { StoryDeskService } from './story-desk.service';

/**
 * Editorial Playbook v2 §2 Layer 3 — the human decision surface.
 *
 * Everything here is internal editorial tooling, so it all sits behind
 * `AdminTokenGuard`: the briefing exposes which companies we are about to
 * write about before we write about it, which is not public information.
 */
@Controller('story-desk')
@UseGuards(AdminTokenGuard)
export class StoryDeskController {
  constructor(private readonly desk: StoryDeskService) {}

  /** The last few days of briefings, newest run first, pitches ordered by
   *  priority within a run. */
  @Get('briefing')
  briefing(@Query('days') days?: string) {
    const n = Math.min(30, Math.max(1, Number(days) || 3));
    return this.desk.briefing(n);
  }

  /** Run discovery now — the same path the 07:00/13:00 ET crons take. */
  @Post('run')
  run() {
    return this.desk.run();
  }

  /** Writer's disposition: writing | published | passed | open. */
  @Post('pitch/:id/status')
  setStatus(
    @Param('id') id: string,
    @Body() body: { status: 'open' | 'writing' | 'published' | 'passed'; slug?: string },
  ) {
    return this.desk.setStatus(id, body.status, body.slug ?? null);
  }

  /** Stop or resume the scheduled runs without a deploy. */
  @Post('runs')
  setRuns(@Query('on') on?: string) {
    return this.desk.setRuns(on !== '0' && on !== 'false');
  }
}

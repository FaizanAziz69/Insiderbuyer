import { Controller, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CqsService } from './cqs.service';
import { AdminTokenGuard } from '../common/admin-token.guard';

/** Brief v9 §8: the standing frame travels with the payload, so no surface can drop it. */
const LEGAL_FRAME =
  'Congress Quality Score measures the strength of a disclosed, lawful trading signal from ' +
  'Periodic Transaction Reports filed under the STOCK Act. Dollar figures are estimates: PTRs ' +
  'report ranges, not amounts. Nothing here implies impropriety.';

@Controller('cqs')
export class CqsController {
  constructor(private readonly cqsService: CqsService) {}

  @Get('leaderboard')
  @Header('Cache-Control', 'public, max-age=300')
  async leaderboard(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sector') sector?: string,
    @Query('party') party?: string,
    @Query('grade') grade?: string,
    @Query('minScore') minScore?: string,
    @Query('overlap') overlap?: string,
    @Query('search') search?: string,
  ) {
    const res = await this.cqsService.getLeaderboard({
      limit: limit ? Number(limit) : 100,
      offset: offset ? Number(offset) : 0,
      sector,
      party,
      grade,
      minScore: minScore ? Number(minScore) : undefined,
      overlapOnly: overlap === '1' || overlap === 'true',
      search,
    });
    return { ...res, windowDays: 90, frame: LEGAL_FRAME };
  }

  @Get('ticker/:ticker')
  @Header('Cache-Control', 'public, max-age=300')
  async ticker(@Param('ticker') ticker: string) {
    const score = await this.cqsService.getByTicker(ticker);
    return { ticker: ticker.toUpperCase(), score, frame: LEGAL_FRAME };
  }

  @Get('status')
  @UseGuards(AdminTokenGuard)
  async status() {
    return this.cqsService.status();
  }

  @Post('admin/recalculate')
  @UseGuards(AdminTokenGuard)
  async recalculate(@Query('asOf') asOf?: string) {
    return this.cqsService.recalculateAll(asOf);
  }
}

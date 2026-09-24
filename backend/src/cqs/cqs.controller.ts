import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CqsService } from './cqs.service';
import { AdminTokenGuard } from '../common/admin-token.guard';

@Controller('cqs')
export class CqsController {
  constructor(private readonly cqsService: CqsService) {}

  /**
   * Flagship CQS Index Leaderboard payload.
   */
  @Get('leaderboard')
  @Header('Cache-Control', 'public, max-age=300')
  async leaderboard(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sector') sector?: string,
    @Query('party') party?: string,
    @Query('minScore') minScore?: string,
    @Query('search') search?: string,
  ) {
    const res = await this.cqsService.getLeaderboard({
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
      sector,
      party,
      minScore: minScore ? Number(minScore) : undefined,
      search,
    });
    return {
      rows: res.rows,
      total: res.total,
      frame: 'Information based on public disclosures (STOCK Act PTRs). Not financial advice or proof of wrongdoing.',
    };
  }

  /**
   * Detailed CQS score card for a single ticker.
   */
  @Get('ticker/:ticker')
  @Header('Cache-Control', 'public, max-age=300')
  async ticker(@Param('ticker') ticker: string) {
    const score = await this.cqsService.getByTicker(ticker);
    return {
      ticker: ticker.toUpperCase(),
      score,
    };
  }

  /**
   * Admin trigger to run CQS recalculation.
   */
  @Post('admin/recalculate')
  @UseGuards(AdminTokenGuard)
  async recalculate(@Query('asOf') asOf?: string) {
    return this.cqsService.recalculateAll(asOf);
  }
}

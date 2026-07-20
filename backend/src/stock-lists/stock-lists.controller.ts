import { Controller, Get, Param, Query } from '@nestjs/common';
import { StockListsService } from './stock-lists.service';

@Controller('stock-lists')
export class StockListsController {
  constructor(private readonly svc: StockListsService) {}

  @Get()
  async index() {
    return { lists: await this.svc.getIndex() };
  }

  // Static route declared before the ':slug' param route so it isn't captured
  // as a slug. Returns the sector ranking (not a stock list).
  @Get('hot-sectors')
  async hotSectors() {
    return this.svc.getHotSectors();
  }

  @Get(':slug')
  async detail(
    @Param('slug') slug: string,
    @Query('country') country?: string,
    @Query('exchange') exchange?: string,
    @Query('sector') sector?: string,
    @Query('minMarketCap') minMc?: string,
    @Query('maxMarketCap') maxMc?: string,
    @Query('minIqs') minIqs?: string,
    @Query('sentiment') sentiment?: string,
    @Query('analystConsensus') analystConsensus?: string,
  ) {
    const detail = await this.svc.getDetail(slug, {
      country: country || undefined,
      exchange: exchange || undefined,
      sector: sector || undefined,
      minMarketCap: minMc ? Number(minMc) : undefined,
      maxMarketCap: maxMc ? Number(maxMc) : undefined,
      minIqs: minIqs ? Number(minIqs) : undefined,
      sentiment: sentiment || undefined,
      analystConsensus: analystConsensus || undefined,
    });
    if (!detail) return { error: 'Unknown list' };
    return detail;
  }
}

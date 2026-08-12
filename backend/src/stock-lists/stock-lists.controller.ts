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
    // OPTIONAL page window. Omitted = the whole list, exactly as before;
    // `total` always reports the full count. Lets a client page the big lists
    // (penny-stocks ships 1,000 rows in one response) instead of taking the
    // whole payload in a single ~10s-budget request.
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
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
      limit: limit && Number(limit) > 0 ? Number(limit) : undefined,
      offset: offset && Number(offset) > 0 ? Number(offset) : undefined,
    });
    if (!detail) return { error: 'Unknown list' };
    return detail;
  }
}

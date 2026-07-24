import { Controller, Get, Query } from '@nestjs/common';
import { CompanyCivicService } from './company-civic.service';

@Controller('company-civic')
export class CompanyCivicController {
  constructor(private readonly svc: CompanyCivicService) {}

  /** Quarterly federal contract $ awarded to a company (USAspending.gov). */
  @Get('contracts')
  async contracts(@Query('name') name?: string) {
    if (!name) return { quarters: [] };
    return { quarters: await this.svc.getGovernmentContracts(name) };
  }

  /** Quarterly corporate lobbying spend (Senate LDA; needs LDA_API_KEY). */
  @Get('lobbying')
  async lobbying(@Query('name') name?: string) {
    if (!name) return { quarters: [], enabled: this.svc.lobbyingEnabled };
    return { quarters: await this.svc.getLobbying(name), enabled: this.svc.lobbyingEnabled };
  }

  /** Revenue by segment + geography from the latest 10-Q/10-K (SEC EDGAR). */
  @Get('revenue-segments')
  async revenueSegments(@Query('ticker') ticker?: string) {
    if (!ticker) return { segments: [], geography: [], total: null, asOf: null, form: null };
    return this.svc.getRevenueBreakdown(ticker);
  }

  /** Recently reported institutional positions (SEC 13F filings). */
  @Get('whale-activity')
  async whaleActivity(@Query('name') name?: string, @Query('ticker') ticker?: string) {
    if (!name || !ticker) return { holdings: [] };
    return { holdings: await this.svc.getWhaleActivity(name, ticker) };
  }

  /** Full institutional ownership page: stock owners + PUT/CALL derivative
   *  owners from recent 13F filings. */
  @Get('institutions')
  async institutions(@Query('name') name?: string, @Query('ticker') ticker?: string) {
    if (!name || !ticker) return { holdings: [], derivatives: [] };
    return this.svc.getInstitutions(name, ticker);
  }
}

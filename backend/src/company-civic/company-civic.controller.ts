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
}

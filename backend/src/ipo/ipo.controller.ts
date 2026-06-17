import { Controller, Get } from '@nestjs/common';
import { IpoService } from './ipo.service';

@Controller('ipo')
export class IpoController {
  constructor(private readonly svc: IpoService) {}

  @Get('calendar')
  async calendar() {
    return { rows: await this.svc.getCalendar() };
  }
}

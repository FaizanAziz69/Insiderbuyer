import { Controller, Get } from '@nestjs/common';
import { IndicesService } from './indices.service';

@Controller('indices')
export class IndicesController {
  constructor(private readonly svc: IndicesService) {}

  @Get()
  async list() {
    const quotes = await this.svc.getQuotes();
    return { quotes };
  }
}

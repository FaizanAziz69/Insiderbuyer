import { Body, Controller, Get, Post } from '@nestjs/common';
import { IngestionService } from './ingestion.service';

@Controller('ingest')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post()
  async run(@Body() body: { daysBack?: number }) {
    return this.ingestion.runIngestion(body?.daysBack ?? 7);
  }

  @Get('cron')
  async cron() {
    return this.ingestion.runIngestion(2);
  }
}

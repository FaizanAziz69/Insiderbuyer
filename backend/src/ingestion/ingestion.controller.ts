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

  /** Backfill insider filing location onto older transactions. */
  @Post('backfill-locations')
  async backfillLocations() {
    return this.ingestion.backfillLocations();
  }

  /** Backfill exact Form 4 document URLs onto older transactions. */
  @Post('backfill-filing-urls')
  async backfillFilingUrls() {
    return this.ingestion.backfillFilingUrls();
  }

  /** Ingest German (BaFin) directors' dealings. Chunk the A–Z sweep with
   *  `letters` (e.g. "ABCDE") to fit the 60s serverless budget; rescore once at
   *  the end via POST /iqs/recalculate (or pass rescore:true on the last call).
   *  Body: { letters?: string, maxIssuers?: number, rescore?: boolean }. */
  @Post('german')
  async german(
    @Body() body: { letters?: string; maxIssuers?: number; rescore?: boolean },
  ) {
    return this.ingestion.ingestGermanDealings({
      letters: body?.letters,
      maxIssuers: body?.maxIssuers,
      rescore: body?.rescore,
    });
  }
}

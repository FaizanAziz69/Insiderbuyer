import { Body, Controller, Get, Post } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { CongressionalService } from '../congressional/congressional.service';

@Controller('ingest')
export class IngestionController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly congressional: CongressionalService,
  ) {}

  @Post()
  async run(@Body() body: { daysBack?: number }) {
    return this.ingestion.runIngestion(body?.daysBack ?? 7);
  }

  @Get('cron')
  async cron() {
    // Accumulate the day's congressional disclosures first — it's 2 FMP calls
    // and must not be skipped when SEC ingestion runs long.
    let congress: unknown = null;
    try {
      congress = await this.congressional.refresh();
    } catch (e: any) {
      congress = { error: String(e?.message || e) };
    }
    const ingest = await this.ingestion.runIngestion(2);
    return { congress, ingest };
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

  /** Backfill sector + industry for already-ingested German companies (Yahoo
   *  assetProfile). Call repeatedly until `remaining` hits 0.
   *  Body: { limit?: number, onlyMissing?: boolean }. */
  @Post('german-profiles')
  async germanProfiles(
    @Body() body: { limit?: number; onlyMissing?: boolean },
  ) {
    return this.ingestion.backfillGermanProfiles({
      limit: body?.limit,
      onlyMissing: body?.onlyMissing,
    });
  }

  /** Backfill MD&A / communications sentiment (IQ Score v2 component 3) onto
   *  scored companies. LLM + SEC calls — chunk it; call until remaining = 0,
   *  then rescore. Body: { limit?: number, onlyMissing?: boolean }. */
  @Post('mda-sentiment')
  async mdaSentiment(@Body() body: { limit?: number; onlyMissing?: boolean }) {
    return this.ingestion.backfillMdaSentiment({
      limit: body?.limit,
      onlyMissing: body?.onlyMissing,
    });
  }

  /** Backfill trailing-12-month dilution (IQ v2 component 5) from SEC XBRL onto
   *  scored companies. Chunk until remaining = 0, then rescore. */
  @Post('dilution')
  async dilution(@Body() body: { limit?: number; onlyMissing?: boolean }) {
    return this.ingestion.backfillDilution({
      limit: body?.limit,
      onlyMissing: body?.onlyMissing,
    });
  }

  /** One-off: delete insider transactions with an implausible per-share price
   *  (parse artifacts behind the "$1600T bought" bug). Rescore afterwards. */
  @Post('cleanup-bad-trades')
  async cleanupBadTrades() {
    return this.ingestion.cleanupBadTransactions();
  }
}
